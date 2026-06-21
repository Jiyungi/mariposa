// ===========================================================================
// Property test (fast-check + Vitest) — Person B, Task 10.4
//   Property 21: Parallel branches both complete before the workflow proceeds
//   past a fan-in.
//
//   *For any* timing of the two branches in a fan-out pair
//   (analyze-her/analyze-his, and insurance-call/clinic-call), the step
//   following the fan-in does not start until BOTH branches have completed.
//
//   Strategy: inject a custom `runStep` (StepRunner) into runMariposaWorkflow that
//   delays each of the four parallel-pair branch bodies by a fast-check-chosen
//   number of microtask ticks, so the two branches in a pair finish in an
//   arbitrary relative order. A monotonic counter records the START and END
//   sequence of every step body. The oracle then asserts the post-fan-in step
//   starts strictly after both of its branches ended, for any delay pattern.
//
//   The agent + persistence dependencies are fully mocked (no network / no
//   Inngest server); `getCouple` uses the real in-memory data layer for
//   couple_001 so the rules core runs against the true seed.
//
// Validates: Requirements 7.2, 7.3
// ===========================================================================

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

import {
  runMariposaWorkflow,
  defaultWorkflowDeps,
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

/** The four parallel-pair branch step keys (the two fan-out pairs, Req 7.2/7.3). */
const PARALLEL_STEPS = [
  "analyze-her",
  "analyze-his",
  "insurance-call",
  "clinic-call",
] as const;
type ParallelStep = (typeof PARALLEL_STEPS)[number];

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

/** Resolve after `n` microtask ticks — a queueMicrotask/await loop. Yielding a
 *  tick at a time lets two concurrently-started branches interleave so the one
 *  with fewer ticks ends first, regardless of which started first. */
async function waitTicks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }
}

interface StepMark {
  start: number;
  end: number;
}

interface Harness {
  deps: Partial<WorkflowDeps>;
  /** Monotonic START/END sequence numbers per step key. */
  marks: Map<string, StepMark>;
}

/**
 * Build a fully-mocked dependency set whose `runStep` delays each parallel-pair
 * branch body by `delays[step]` microtask ticks and records the monotonic
 * START/END sequence of every step. `getCouple` is the real in-memory seed.
 */
function buildHarness(delays: Record<ParallelStep, number>): Harness {
  const marks = new Map<string, StepMark>();
  const seq = { value: 0 };
  const calendarStore: CalendarEvent[] = [];

  const isParallel = (name: string): name is ParallelStep =>
    (PARALLEL_STEPS as readonly string[]).includes(name);

  const runStep: StepRunner = async (name, body) => {
    const startSeq = seq.value++;
    // Delay parallel-pair branches by their generated tick count so the two
    // branches of a pair settle in arbitrary relative order.
    if (isParallel(name)) {
      await waitTicks(delays[name]);
    }
    const result = await body();
    const endSeq = seq.value++;
    marks.set(name, { start: startSeq, end: endSeq });
    return result;
  };

  const runInsuranceCall = vi.fn(
    async (): Promise<CallOutput<InsuranceResult>> => makeInsuranceOutput(),
  );
  const runClinicCall = vi.fn(
    async (): Promise<CallOutput<ClinicResult>> => makeClinicOutput(),
  );
  const applyClinicWriteBack = vi.fn(
    async (coupleId: string): Promise<ClinicWriteBackResult> => {
      const calendarEvent = makeConsultEvent(coupleId);
      calendarStore.push(calendarEvent);
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

  const awaitBookingApproval = vi.fn(
    async (): Promise<ApprovalOutcome> => ({ approved: true, timedOut: false }),
  );
  const sleep = vi.fn(async (): Promise<void> => {});
  const emitCallCompleted = vi.fn(async (): Promise<void> => {});
  const emitCheckinDue = vi.fn(
    async (coupleId: string, delayToken: string): Promise<CheckinResult> => {
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

  // defaultWorkflowDeps() is merged inside runMariposaWorkflow; reference it here
  // only to keep the import meaningful for readers of the harness.
  void defaultWorkflowDeps;

  return { deps, marks };
}

// ===========================================================================

describe("Feature: mariposa, Property 21: Parallel branches both complete before the workflow proceeds past a fan-in", () => {
  it("the step after each fan-in starts only after BOTH branches ended, for any branch timing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          "analyze-her": fc.nat({ max: 12 }),
          "analyze-his": fc.nat({ max: 12 }),
          "insurance-call": fc.nat({ max: 12 }),
          "clinic-call": fc.nat({ max: 12 }),
        }),
        async (delays) => {
          const { deps, marks } = buildHarness(delays);

          const { run } = await runMariposaWorkflow(COUPLE_ID, deps);

          const mark = (name: string): StepMark => {
            const m = marks.get(name);
            expect(m, `step "${name}" should have run`).toBeDefined();
            return m as StepMark;
          };

          // --- Oracle 1: fan-in join ordering (Req 7.2, 7.3) ---------------
          // analyze fan-in: compute-trying-window must START after BOTH
          // analyze branches ENDED.
          const herEnd = mark("analyze-her").end;
          const hisEnd = mark("analyze-his").end;
          const computeStart = mark("compute-trying-window").start;
          expect(computeStart).toBeGreaterThan(herEnd);
          expect(computeStart).toBeGreaterThan(hisEnd);

          // calls fan-in: finalize-booking (the next runStep step past the
          // approval gate) must START after BOTH call branches ENDED.
          const insuranceEnd = mark("insurance-call").end;
          const clinicEnd = mark("clinic-call").end;
          const finalizeStart = mark("finalize-booking").start;
          expect(finalizeStart).toBeGreaterThan(insuranceEnd);
          expect(finalizeStart).toBeGreaterThan(clinicEnd);

          // --- Oracle 2: both branches completed and the run completed -----
          const status = (name: string) =>
            run.steps.find((s) => s.name === name)?.status;
          for (const name of PARALLEL_STEPS) {
            expect(status(name)).toBe("completed");
          }
          expect(run.status).toBe("completed");
        },
      ),
      { numRuns: 150 },
    );
  });
});
