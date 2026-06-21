// ===========================================================================
// Property test — Feature: mariposa, Property 23: Appointment stays pending until
//   approval or timeout.
//
//   "For any Approval_Gate outcome, the clinic appointment is reported `pending`
//    while the run is paused awaiting approval; it remains `pending` (with a
//    'needs approval' state) if the wait expires before approval; and it is
//    finalized only after `couple.booking.approved` is received."
//
// Validates: Requirements 17.4, 17.5, 8.6
//
// Strategy: fast-check chooses ONE of the two terminal Approval_Gate outcomes
// per run — approved ({ approved:true, timedOut:false }) or expired
// ({ approved:false, timedOut:true }). The chosen outcome is injected via
// awaitBookingApproval. That same hook also OBSERVES the run AT the moment it
// pauses (before any approval is delivered) so we can assert the appointment is
// reported pending WHILE the gate is paused — for BOTH outcomes.
//
// Oracle — for ANY outcome:
//   * paused-while-awaiting (both): at the instant awaitBookingApproval is
//     invoked, the approval-gate step is "paused", run.status "paused",
//     run.approvalState "awaiting", ctx.approval.state "awaiting" — i.e. the
//     appointment has NOT been finalized yet.
//   * approved => finalizes: gate step "completed", run.approvalState
//     "approved", finalize-booking "completed", context.finalized true, the
//     built summary appointment is NOT "pending", and exactly ONE 2026-06-25
//     calendar event exists.
//   * timedOut => stays pending: gate step "paused", run.approvalState
//     "expired", finalize-booking NOT run (status "pending"),
//     applyClinicWriteBack NOT called, NO 2026-06-25 event created, and a
//     "needs approval" state is surfaced (context.approval.needsApproval true).
//
// The agent / Grok / Voice / Inngest layers are fully mocked (no network);
// getCouple uses the real in-memory seed couple_001.
// ===========================================================================

import { describe, test, expect, vi } from "vitest";
import fc from "fast-check";

import {
  runMariposaWorkflow,
  BOOKING_DATE,
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
} from "@/lib/types";

const COUPLE_ID = "couple_001";

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
    date: CLINIC_RESULT.calendar_event.date, // 2026-06-25 (== BOOKING_DATE)
    time: CLINIC_RESULT.calendar_event.time,
    description: "mocked",
  };
}

// --- The two terminal Approval_Gate outcomes (Req 17.4 / 17.5) --------------

const APPROVED: ApprovalOutcome = { approved: true, timedOut: false };
const EXPIRED: ApprovalOutcome = { approved: false, timedOut: true };

/** Snapshot of the run/context captured AT the pause (before approval). */
interface PauseObservation {
  gateStatus: string | undefined;
  runStatus: string;
  approvalState: string | undefined;
}

interface Harness {
  deps: Partial<WorkflowDeps>;
  calendarStore: CalendarEvent[];
  applyClinicWriteBack: ReturnType<typeof vi.fn>;
  /** Captured by awaitBookingApproval the moment the run pauses. */
  pauseObservation: { value: PauseObservation | null };
}

function gateStep(run: WorkflowRun) {
  return run.steps.find((s) => s.name === "approval-gate");
}

function finalizeStep(run: WorkflowRun) {
  return run.steps.find((s) => s.name === "finalize-booking");
}

/**
 * Build a dependency set with a SHARED in-memory calendar store + a counted
 * applyClinicWriteBack spy, and an awaitBookingApproval that (a) observes the
 * paused run and (b) returns the fast-check-chosen outcome.
 */
function buildHarness(outcome: ApprovalOutcome): Harness {
  const calendarStore: CalendarEvent[] = [];
  const pauseObservation: { value: PauseObservation | null } = { value: null };

  const runStep: StepRunner = async (_name, body) => body();

  const runInsuranceCall = vi.fn(
    async (): Promise<CallOutput<InsuranceResult>> => makeInsuranceOutput(),
  );
  const runClinicCall = vi.fn(
    async (): Promise<CallOutput<ClinicResult>> => makeClinicOutput(),
  );

  const applyClinicWriteBack = vi.fn(
    async (coupleId: string): Promise<ClinicWriteBackResult> => {
      const calendarEvent = makeConsultEvent(coupleId);
      calendarStore.push(calendarEvent); // the single real booking write
      const summary: Summary = { couple_id: coupleId, sections: {} };
      return { tasks: [], calendarEvent, summary };
    },
  );

  const saveWorkflowRun = vi.fn(async (run: WorkflowRun): Promise<WorkflowRun> => run);
  const saveTryingWindow = vi.fn(async (w: TryingWindow): Promise<TryingWindow> => w);
  const saveTasks = vi.fn(async (_id: string, items: Task[]): Promise<Task[]> => items);

  const getCalendarEvents = vi.fn(
    async (): Promise<CalendarEvent[]> => calendarStore.map((e) => structuredClone(e)),
  );

  // Observe the run AT the pause (gate is "paused", nothing finalized yet),
  // then resolve with the chosen terminal outcome.
  const awaitBookingApproval = vi.fn(
    async (run: WorkflowRun): Promise<ApprovalOutcome> => {
      pauseObservation.value = {
        gateStatus: gateStep(run)?.status,
        runStatus: run.status,
        approvalState: run.approvalState,
      };
      return outcome;
    },
  );

  const sleep = vi.fn(async (): Promise<void> => {});
  const emitCallCompleted = vi.fn(
    async (_coupleId: string, _callType: CallType): Promise<void> => {},
  );
  const emitCheckinDue = vi.fn(
    async (
      coupleId: string,
      delayToken: string,
      _existing: Task[],
    ): Promise<CheckinResult> => {
      const task: Task = {
        id: `task_${coupleId}_checkin_retest`,
        couple_id: coupleId,
        column: "him",
        title: "Re-test semen analysis / review lifestyle progress",
        completed: false,
        weight: 5,
        source_call_record_id: null,
      };
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
  };

  return { deps, calendarStore, applyClinicWriteBack, pauseObservation };
}

// ===========================================================================
// Property 23 — Appointment stays pending until approval or timeout
// ===========================================================================

describe("Feature: mariposa, Property 23: Appointment stays pending until approval or timeout", () => {
  test("any gate outcome: pending while paused; finalized iff approved, else stays pending", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<ApprovalOutcome>(APPROVED, EXPIRED),
        async (outcome) => {
          const h = buildHarness(outcome);
          const { run, context } = await runMariposaWorkflow(COUPLE_ID, h.deps);

          // --- BOTH outcomes: appointment was pending WHILE the gate paused.
          // awaitBookingApproval ran (the run reached the gate and paused).
          expect(h.deps.awaitBookingApproval).toHaveBeenCalledTimes(1);
          const paused = h.pauseObservation.value;
          expect(paused).not.toBeNull();
          expect(paused?.gateStatus).toBe("paused");
          expect(paused?.runStatus).toBe("paused");
          expect(paused?.approvalState).toBe("awaiting");
          // Nothing was finalized at the moment of pausing.
          // (finalize only runs after approval is delivered.)

          if (outcome.approved && !outcome.timedOut) {
            // --- APPROVED: the run finalizes the booking.
            expect(gateStep(run)?.status).toBe("completed");
            expect(run.approvalState).toBe("approved");
            expect(finalizeStep(run)?.status).toBe("completed");
            expect(context.finalized).toBe(true);
            expect(run.status).toBe("completed");

            // The booking write happened and the appointment is NOT pending.
            expect(h.applyClinicWriteBack).toHaveBeenCalledTimes(1);
            expect(context.summary?.appointment).not.toBe("pending");

            // Exactly one 2026-06-25 calendar event exists.
            const consults = h.calendarStore.filter((e) => e.date === BOOKING_DATE);
            expect(consults).toHaveLength(1);
          } else {
            // --- TIMED OUT: the appointment stays PENDING.
            expect(gateStep(run)?.status).toBe("paused");
            expect(run.approvalState).toBe("expired");
            expect(run.status).toBe("paused");

            // finalize-booking did NOT run.
            expect(finalizeStep(run)?.status).toBe("pending");
            expect(context.finalized).toBeFalsy();
            expect(context.calls).toBeUndefined();
            // No doctor summary built => appointment never resolved off pending.
            expect(context.summary).toBeUndefined();

            // No booking write, no 2026-06-25 event created.
            expect(h.applyClinicWriteBack).not.toHaveBeenCalled();
            const consults = h.calendarStore.filter((e) => e.date === BOOKING_DATE);
            expect(consults).toHaveLength(0);

            // A "needs approval" state is surfaced (Req 17.5).
            expect(context.approval?.needsApproval).toBe(true);
            expect(context.approval?.state).toBe("expired");
            expect(context.approval?.timedOut).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
