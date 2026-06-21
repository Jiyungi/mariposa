// ===========================================================================
// Integration test (example-based) — Task 10.2
//   Workflow orchestration for the Mariposa EVENT-DRIVEN REACTIVE GRAPH.
//
// With the Grok/Voice agent fully MOCKED (no network, no Inngest server), this
// asserts the reactive-graph guarantees of runMariposaWorkflow:
//
//   1. FAN-OUT / FAN-IN (Req 7.2, 7.3): analyze-her | analyze-his run
//      concurrently and JOIN before compute-trying-window; insurance-call |
//      clinic-call run concurrently and JOIN before the approval gate. Each
//      finished call emits `call.completed` exactly once (Req 7.10).
//   2. STATUS TRANSITIONS incl. "paused" (Req 7.5, 17.4): every persisted
//      snapshot status is within {pending,running,completed,failed,paused};
//      sequential steps go pending→running→completed, the Approval_Gate goes
//      pending→running→paused→completed, ending in a completed run.
//   3. APPROVAL GATE (Req 17): default auto-approve finalizes + writes the
//      June 25 event; an injected timeout leaves the appointment pending with
//      approvalState "expired" and does NOT finalize.
//   4. IDEMPOTENT FINALIZE (Req 17.3): repeated approvals / finalize calls
//      produce exactly one booking + one 2026-06-25 calendar event.
//   5. SCHEDULED CHECK-IN (Req 18): the check-in creates the His re-test task.
//   6. FAILURE HALTING (Req 7.6): a failing insurance call halts the run; the
//      fan-in never proceeds (finalize / check-in / summary stay pending).
//
// A seventh sanity check reproduces the Seed_Couple (couple_001) derived
// outputs (Req 7.9 / 3.2-3.4) using the real rules core with only the agent
// mocked.
//
// Validates: Requirements 7, 17, 18, 19
// ===========================================================================

import { describe, it, expect, vi } from "vitest";

import {
  runMariposaWorkflow,
  stepFinalizeBooking,
  defaultWorkflowDeps,
  WORKFLOW_STEPS,
  BRANCH_GROUPS,
  MariposaWorkflowError,
  type ApprovalOutcome,
  type CheckinResult,
  type StepRunner,
  type WorkflowDeps,
} from "@/lib/inngest/workflow";
import { getCouple as realGetCouple } from "@/lib/db";
import type { Summary } from "@/lib/db";
import type { ClinicWriteBackResult } from "@/lib/agent";
import { CLINIC_RESULT, INSURANCE_RESULT } from "@/lib/reference";
import type {
  CalendarEvent,
  CallOutput,
  CallType,
  ClinicResult,
  InsuranceResult,
  Task,
  TryingWindow,
  WorkflowRun,
  WorkflowStepStatus,
} from "@/lib/types";

const VALID_STATUSES: readonly WorkflowStepStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "paused",
] as const;

// --- Deterministic mocked agent outputs (no network) ------------------------

function makeInsuranceOutput(): CallOutput<InsuranceResult> {
  return { transcript: [], result: INSURANCE_RESULT, usedFallback: true };
}

function makeClinicOutput(): CallOutput<ClinicResult> {
  return { transcript: [], result: CLINIC_RESULT, usedFallback: true };
}

function makeConsultEvent(coupleId: string): CalendarEvent {
  return {
    id: `event_${coupleId}_consult`,
    couple_id: coupleId,
    type: CLINIC_RESULT.calendar_event.type,
    title: `Fertility consult — ${CLINIC_RESULT.booked.clinic}`,
    date: CLINIC_RESULT.calendar_event.date, // 2026-06-25
    time: CLINIC_RESULT.calendar_event.time,
    description: "mocked",
  };
}

// --- Test harness: build injectable deps with recording spies ---------------

interface Harness {
  deps: Partial<WorkflowDeps>;
  /** start:/end: markers in the order the runStep runner observed them. */
  events: string[];
  /** Names of the agent dependencies invoked, in call order. */
  callOrder: string[];
  /** Deep-cloned snapshots of every saveWorkflowRun call. */
  snapshots: WorkflowRun[];
  /** Shared calendar store (consult events written by finalize). */
  calendarStore: CalendarEvent[];
  /** (coupleId, callType) for every emitCallCompleted invocation. */
  callCompleted: Array<{ coupleId: string; callType: CallType }>;
  runInsuranceCall: ReturnType<typeof vi.fn>;
  runClinicCall: ReturnType<typeof vi.fn>;
  applyClinicWriteBack: ReturnType<typeof vi.fn>;
  emitCheckinDue: ReturnType<typeof vi.fn>;
}

/**
 * Build a fully-mocked dependency set. `getCouple` uses the real in-memory data
 * layer (couple_001) so the rules core runs against the true seed; everything
 * else is a recording spy. `overrides` lets a test swap a single dependency to
 * inject a failure / timeout / shared store.
 */
function buildHarness(overrides: Partial<WorkflowDeps> = {}): Harness {
  const events: string[] = [];
  const callOrder: string[] = [];
  const snapshots: WorkflowRun[] = [];
  const calendarStore: CalendarEvent[] = [];
  const callCompleted: Array<{ coupleId: string; callType: CallType }> = [];

  const runStep: StepRunner = async (name, body) => {
    events.push(`start:${name}`);
    const result = await body();
    events.push(`end:${name}`);
    return result;
  };

  const runInsuranceCall = vi.fn(async (): Promise<CallOutput<InsuranceResult>> => {
    callOrder.push("insurance");
    return makeInsuranceOutput();
  });
  const runClinicCall = vi.fn(async (): Promise<CallOutput<ClinicResult>> => {
    callOrder.push("clinic");
    return makeClinicOutput();
  });
  const applyClinicWriteBack = vi.fn(
    async (coupleId: string): Promise<ClinicWriteBackResult> => {
      callOrder.push("writeBack");
      const calendarEvent = makeConsultEvent(coupleId);
      calendarStore.push(calendarEvent);
      const summary: Summary = { couple_id: coupleId, sections: {} };
      return { tasks: [], calendarEvent, summary };
    },
  );

  const saveWorkflowRun = vi.fn(async (run: WorkflowRun): Promise<WorkflowRun> => {
    snapshots.push(structuredClone(run));
    return run;
  });
  const saveTryingWindow = vi.fn(async (w: TryingWindow): Promise<TryingWindow> => w);
  const saveTasks = vi.fn(async (_id: string, items: Task[]): Promise<Task[]> => items);
  const getCalendarEvents = vi.fn(
    async (): Promise<CalendarEvent[]> => calendarStore.map((e) => structuredClone(e)),
  );

  const awaitBookingApproval = vi.fn(
    async (): Promise<ApprovalOutcome> => ({ approved: true, timedOut: false }),
  );
  const sleep = vi.fn(async (): Promise<void> => {});
  const emitCallCompleted = vi.fn(
    async (coupleId: string, callType: CallType): Promise<void> => {
      callCompleted.push({ coupleId, callType });
    },
  );
  const emitCheckinDue = vi.fn(
    async (coupleId: string, delayToken: string, existing: Task[]): Promise<CheckinResult> => {
      const task: Task = {
        id: `task_${coupleId}_checkin_retest`,
        couple_id: coupleId,
        column: "him",
        title: "Re-test semen analysis / review lifestyle progress",
        completed: false,
        weight: 5,
        source_call_record_id: null,
      };
      void existing;
      return {
        task,
        reminder: null,
        checkIn: {
          id: `checkin_${coupleId}`,
          couple_id: coupleId,
          delay_token: delayToken,
          horizon_label: "approximately 10–12 weeks",
          task_id: task.id,
          status: "due",
        },
      };
    },
  );

  const deps: Partial<WorkflowDeps> = {
    getCouple: realGetCouple,
    runStep,
    runInsuranceCall,
    runClinicCall,
    applyClinicWriteBack,
    saveWorkflowRun,
    saveTryingWindow,
    saveTasks,
    getCalendarEvents,
    awaitBookingApproval,
    sleep,
    emitCallCompleted,
    emitCheckinDue,
    ...overrides,
  };

  return {
    deps,
    events,
    callOrder,
    snapshots,
    calendarStore,
    callCompleted,
    runInsuranceCall,
    runClinicCall,
    applyClinicWriteBack,
    emitCheckinDue,
  };
}

const startIdx = (events: string[], name: string) => events.indexOf(`start:${name}`);
const endIdx = (events: string[], name: string) => events.indexOf(`end:${name}`);

// ===========================================================================
// 1. FAN-OUT / FAN-IN (Req 7.2, 7.3, 7.10)
// ===========================================================================

describe("reactive graph — fan-out / fan-in (Req 7.2, 7.3, 7.10)", () => {
  it("runs both branch-pairs concurrently, joins before proceeding, and completes", async () => {
    const h = buildHarness();

    const { run, context } = await runMariposaWorkflow("couple_001", h.deps);

    // Every step except the (non-runStep) approval gate executed via runStep.
    const started = h.events
      .filter((e) => e.startsWith("start:"))
      .map((e) => e.slice("start:".length));
    expect(new Set(started)).toEqual(
      new Set(WORKFLOW_STEPS.filter((s) => s !== "approval-gate")),
    );

    // analyze-her | analyze-his: both started before either ended (concurrent),
    // and BOTH ended before compute-trying-window started (fan-in/join).
    const sHer = startIdx(h.events, "analyze-her");
    const sHis = startIdx(h.events, "analyze-his");
    const eHer = endIdx(h.events, "analyze-her");
    const eHis = endIdx(h.events, "analyze-his");
    expect(Math.max(sHer, sHis)).toBeLessThan(Math.min(eHer, eHis));
    expect(Math.max(eHer, eHis)).toBeLessThan(startIdx(h.events, "compute-trying-window"));

    // The sequential backbone runs in order between the two joins.
    expect(startIdx(h.events, "compute-trying-window")).toBeLessThan(
      startIdx(h.events, "detect-missing-data"),
    );
    expect(startIdx(h.events, "detect-missing-data")).toBeLessThan(
      startIdx(h.events, "check-duration-rule"),
    );
    expect(startIdx(h.events, "check-duration-rule")).toBeLessThan(
      startIdx(h.events, "generate-tasks"),
    );

    // insurance-call | clinic-call: both started before either ended, and BOTH
    // ended before finalize-booking started (the gate sits between, no marker).
    const sIns = startIdx(h.events, "insurance-call");
    const sCli = startIdx(h.events, "clinic-call");
    const eIns = endIdx(h.events, "insurance-call");
    const eCli = endIdx(h.events, "clinic-call");
    expect(startIdx(h.events, "generate-tasks")).toBeLessThan(Math.min(sIns, sCli));
    expect(Math.max(sIns, sCli)).toBeLessThan(Math.min(eIns, eCli));
    expect(Math.max(eIns, eCli)).toBeLessThan(startIdx(h.events, "finalize-booking"));

    // call.completed emitted exactly once per call (Req 7.10).
    expect(h.callCompleted).toHaveLength(2);
    expect(h.callCompleted.map((c) => c.callType).sort()).toEqual(["clinic", "insurance"]);

    // The branch-pairs are tagged with a shared branchGroup (Req 7.4).
    const byName = Object.fromEntries(run.steps.map((s) => [s.name, s]));
    expect(byName["analyze-her"].branchGroup).toBe("analyze");
    expect(byName["analyze-his"].branchGroup).toBe("analyze");
    expect(byName["insurance-call"].branchGroup).toBe("calls");
    expect(byName["clinic-call"].branchGroup).toBe("calls");
    expect(byName["compute-trying-window"].branchGroup).toBeUndefined();
    // BRANCH_GROUPS is the source of truth for the tagging.
    expect(BRANCH_GROUPS["analyze-her"]).toBe("analyze");
    expect(BRANCH_GROUPS["insurance-call"]).toBe("calls");

    // Run completed with all 12 steps completed in WORKFLOW_STEPS order.
    expect(run.status).toBe("completed");
    expect(run.steps.map((s) => s.name)).toEqual([...WORKFLOW_STEPS]);
    expect(run.steps.every((s) => s.status === "completed")).toBe(true);
    expect(context.summary).toBeDefined();

    // Scheduled Check_In created the His re-test task (Req 18.4).
    expect(context.checkIn).toBeDefined();
    expect(
      context.tasks?.some(
        (t) => t.column === "him" && t.title.includes("Re-test semen analysis"),
      ),
    ).toBe(true);
  });
});

// ===========================================================================
// 2. STATUS TRANSITIONS incl. "paused" (Req 7.5, 17.4)
// ===========================================================================

describe("reactive graph — status transitions incl. paused (Req 7.5, 17.4)", () => {
  it("progresses each step within the enum; the approval gate reports paused", async () => {
    const h = buildHarness();

    const { run } = await runMariposaWorkflow("couple_001", h.deps);

    expect(h.snapshots.length).toBeGreaterThan(0);

    // Every status in every snapshot is a member of the enum.
    for (const snap of h.snapshots) {
      for (const step of snap.steps) {
        expect(VALID_STATUSES).toContain(step.status);
      }
      expect(VALID_STATUSES).toContain(snap.status as WorkflowStepStatus);
    }

    const gateIndex = WORKFLOW_STEPS.indexOf("approval-gate");

    for (let i = 0; i < WORKFLOW_STEPS.length; i++) {
      const distinctInOrder: WorkflowStepStatus[] = [];
      for (const snap of h.snapshots) {
        const status = snap.steps[i].status;
        if (distinctInOrder[distinctInOrder.length - 1] !== status) {
          distinctInOrder.push(status);
        }
      }
      if (i === gateIndex) {
        // The Approval_Gate is the only step that reports paused.
        expect(distinctInOrder).toEqual(["pending", "running", "paused", "completed"]);
      } else {
        expect(distinctInOrder).toEqual(["pending", "running", "completed"]);
      }
    }

    // No non-gate step ever reported paused.
    for (const snap of h.snapshots) {
      snap.steps.forEach((s, i) => {
        if (i !== gateIndex) expect(s.status).not.toBe("paused");
      });
    }

    const finalSnap = h.snapshots[h.snapshots.length - 1];
    expect(finalSnap.status).toBe("completed");
    expect(finalSnap.approvalState).toBe("approved");
    expect(run.status).toBe("completed");
  });
});

// ===========================================================================
// 3. APPROVAL GATE — timeout keeps pending, no finalize (Req 17.4, 17.5)
// ===========================================================================

describe("reactive graph — approval gate timeout (Req 17.5)", () => {
  it("on wait-expiry keeps the appointment pending, sets expired, and does NOT finalize", async () => {
    const timeoutApproval = vi.fn(
      async (): Promise<ApprovalOutcome> => ({ approved: false, timedOut: true }),
    );
    const h = buildHarness({ awaitBookingApproval: timeoutApproval });

    const { run, context } = await runMariposaWorkflow("couple_001", h.deps);

    // Run is left paused at the gate; approvalState is expired (Req 17.5).
    expect(run.status).toBe("paused");
    expect(run.approvalState).toBe("expired");
    expect(context.approval?.state).toBe("expired");
    expect(context.approval?.needsApproval).toBe(true);
    expect(context.approval?.timedOut).toBe(true);

    const byName = Object.fromEntries(run.steps.map((s) => [s.name, s]));
    expect(byName["approval-gate"].status).toBe("paused");

    // The post-gate steps never ran: appointment stays pending (Req 17.4, 8.6).
    expect(byName["finalize-booking"].status).toBe("pending");
    expect(byName["schedule-checkin"].status).toBe("pending");
    expect(byName["build-doctor-summary"].status).toBe("pending");

    // No booking finalized: no write-back, no booked summary, no check-in.
    expect(h.applyClinicWriteBack).not.toHaveBeenCalled();
    expect(h.emitCheckinDue).not.toHaveBeenCalled();
    expect(context.calls).toBeUndefined();
    expect(context.summary).toBeUndefined();
    expect(context.checkIn).toBeUndefined();

    // Both calls still completed before the gate (Req 17.1).
    expect(context.insuranceOutput).toBeDefined();
    expect(context.clinicOutput).toBeDefined();
  });
});

// ===========================================================================
// 4. IDEMPOTENT FINALIZE — never double-book (Req 17.3)
// ===========================================================================

describe("reactive graph — idempotent finalize (Req 17.3)", () => {
  it("repeated approvals / finalize calls produce exactly one booking + one Jun 25 event", async () => {
    const h = buildHarness();

    // First approved run: finalize writes the single consult booking.
    const first = await runMariposaWorkflow("couple_001", h.deps);
    expect(first.run.status).toBe("completed");
    expect(h.applyClinicWriteBack).toHaveBeenCalledTimes(1);

    // In-run duplicate: calling finalize again on the same context is a no-op.
    const fullDeps: WorkflowDeps = { ...defaultWorkflowDeps(), ...h.deps };
    await stepFinalizeBooking(first.context, fullDeps);
    expect(h.applyClinicWriteBack).toHaveBeenCalledTimes(1);

    // Duplicate approval as a second run sharing the calendar store: finalize
    // sees the existing 2026-06-25 consult and reuses it (no second write-back).
    const second = await runMariposaWorkflow("couple_001", h.deps);
    expect(second.run.status).toBe("completed");
    expect(h.applyClinicWriteBack).toHaveBeenCalledTimes(1);

    // Exactly one booking + one 2026-06-25 calendar event.
    const consults = h.calendarStore.filter((e) => e.date === "2026-06-25");
    expect(consults).toHaveLength(1);

    // The reused booking still surfaces the Jun 25 appointment.
    expect(second.context.calls?.writeBack.calendarEvent.date).toBe("2026-06-25");
  });
});

// ===========================================================================
// 5. FAILURE HALTING — a failing call halts the run (Req 7.6)
// ===========================================================================

describe("reactive graph — failure halting (Req 7.6)", () => {
  it("a failing insurance call halts at insurance-call; the fan-in never proceeds", async () => {
    const failingInsurance = vi.fn(async (): Promise<CallOutput<InsuranceResult>> => {
      throw new Error("Grok Voice unavailable");
    });
    const h = buildHarness({ runInsuranceCall: failingInsurance });

    const failedIndex = WORKFLOW_STEPS.indexOf("insurance-call");
    const failedStepNumber = failedIndex + 1;

    let error: unknown;
    try {
      await runMariposaWorkflow("couple_001", h.deps);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(MariposaWorkflowError);
    const fwErr = error as MariposaWorkflowError;
    expect(fwErr.step).toBe(failedStepNumber);
    expect(fwErr.stepName).toBe("insurance-call");

    const finalSnap = h.snapshots[h.snapshots.length - 1];
    expect(finalSnap.status).toBe("failed");
    expect(finalSnap.failedStep).toBe(failedStepNumber);

    const failedStep = finalSnap.steps[failedIndex];
    expect(failedStep.status).toBe("failed");
    expect(failedStep.error).toBeTruthy();

    // The fan-in never proceeded: gate + finalize + check-in + summary stayed
    // pending, and the booking write-back was never reached.
    const byName = Object.fromEntries(finalSnap.steps.map((s) => [s.name, s]));
    expect(byName["approval-gate"].status).toBe("pending");
    expect(byName["finalize-booking"].status).toBe("pending");
    expect(byName["schedule-checkin"].status).toBe("pending");
    expect(byName["build-doctor-summary"].status).toBe("pending");
    expect(h.applyClinicWriteBack).not.toHaveBeenCalled();
    expect(h.emitCheckinDue).not.toHaveBeenCalled();
  });

  it("halts at analyze-her when getCouple returns null (both analyze branches fail)", async () => {
    const nullCouple = vi.fn(async () => null);
    const h = buildHarness({ getCouple: nullCouple });

    let error: unknown;
    try {
      await runMariposaWorkflow("couple_001", h.deps);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(MariposaWorkflowError);
    const fwErr = error as MariposaWorkflowError;
    expect(fwErr.step).toBe(1);
    expect(fwErr.stepName).toBe("analyze-her");

    const finalSnap = h.snapshots[h.snapshots.length - 1];
    expect(finalSnap.status).toBe("failed");
    expect(finalSnap.failedStep).toBe(1);
    expect(finalSnap.steps[0].status).toBe("failed");

    // Every step from compute-trying-window onward stayed pending.
    for (let i = 2; i < WORKFLOW_STEPS.length; i++) {
      expect(finalSnap.steps[i].status).toBe("pending");
    }

    // No agent call was ever invoked.
    expect(h.runInsuranceCall).not.toHaveBeenCalled();
    expect(h.runClinicCall).not.toHaveBeenCalled();
    expect(h.applyClinicWriteBack).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 6. SEED REPRODUCTION sanity (Req 7.9 / 3.2-3.4)
// ===========================================================================

describe("reactive graph — seed reproduction sanity (Req 7.9)", () => {
  it("reproduces the Seed_Couple duration rule and trying window", async () => {
    const h = buildHarness();

    const { context } = await runMariposaWorkflow("couple_001", h.deps);

    // Trying-duration rule: Maya is 33 (< 35) -> 12-month threshold, and red
    // flags (irregular cycles + borderline semen) force early evaluation.
    expect(context.duration).toBeDefined();
    expect(context.duration?.thresholdMonths).toBe(12);
    expect(context.duration?.recommendEarlyEvaluation).toBe(true);

    // Trying window: Jun 27 – Jul 18 2026, priority Jul 2 – Jul 17, confidence Low.
    expect(context.window).toBeDefined();
    expect(context.window?.fertileWindowStart).toBe("2026-06-27");
    expect(context.window?.fertileWindowEnd).toBe("2026-07-18");
    expect(context.window?.minOvulation).toBe("2026-07-02");
    expect(context.window?.maxOvulation).toBe("2026-07-17");
    expect(context.window?.confidence).toBe("Low");
  });
});
