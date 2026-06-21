// ===========================================================================
// Property test — Feature: mariposa, Property 22: Approval resume is idempotent
//   and never double-books.
//
//   "For any number of `couple.booking.approved` deliveries to a paused run
//    (one or more), the same run resumes and finalizes exactly one booking and
//    exactly one June 25 calendar event (no double-booking)."
//
// Validates: Requirements 17.3
//
// Strategy: generate N >= 1 approval deliveries with fast-check (fc.integer
// 1..5). All deliveries target the SAME couple and share ONE in-memory calendar
// store + ONE applyClinicWriteBack spy. We simulate N duplicate
// `couple.booking.approved` deliveries by injecting an awaitBookingApproval that
// always returns { approved: true } and re-running runMariposaWorkflow N times
// against the shared deps (each re-run is a duplicate resume/finalize attempt).
//
// Oracle — for ANY N, count the bookings that were actually created:
//   1. applyClinicWriteBack (the real booking write) is invoked exactly ONCE;
//      every later delivery hits the persisted idempotency guard, finds the
//      existing 2026-06-25 consult event, and reuses it.
//   2. The shared calendar store holds exactly ONE 2026-06-25 consult event.
//   3. Every delivery still completes the run with the booking finalized
//      (run.status "completed", a writeBack with the Jun 25 calendarEvent).
//
// The agent / Grok / Voice / Inngest layers are fully mocked (no network).
// ===========================================================================

import { describe, test, expect, vi } from "vitest";
import fc from "fast-check";

import {
  runMariposaWorkflow,
  defaultWorkflowDeps,
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

// --- Shared harness: one calendar store + one write-back spy ----------------

interface SharedHarness {
  deps: Partial<WorkflowDeps>;
  /** Shared persisted calendar store, read by getCalendarEvents. */
  calendarStore: CalendarEvent[];
  /** Counts REAL booking writes (the non-idempotent path). */
  applyClinicWriteBack: ReturnType<typeof vi.fn>;
}

/**
 * Build a dependency set with a SHARED in-memory calendar store and a
 * SHARED applyClinicWriteBack spy so multiple runs (== duplicate approval
 * deliveries) can be counted against one persisted booking surface.
 *
 * - getCouple uses the real in-memory seed (couple_001) so the rules core runs.
 * - getCalendarEvents reads the shared store -> the persisted idempotency guard
 *   in stepFinalizeBooking can see the existing Jun 25 consult.
 * - applyClinicWriteBack appends to the store AND is counted: it must run at
 *   most once across all duplicate deliveries.
 * - awaitBookingApproval always approves (every delivery is an approval).
 */
function buildSharedHarness(): SharedHarness {
  const calendarStore: CalendarEvent[] = [];

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

  // Reads the SHARED store so finalize's persisted idempotency guard works.
  const getCalendarEvents = vi.fn(
    async (): Promise<CalendarEvent[]> => calendarStore.map((e) => structuredClone(e)),
  );

  const awaitBookingApproval = vi.fn(
    async (): Promise<ApprovalOutcome> => ({ approved: true, timedOut: false }),
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

  return { deps, calendarStore, applyClinicWriteBack };
}

// ===========================================================================
// Property 22 — Approval resume is idempotent and never double-books
// ===========================================================================

describe("Feature: mariposa, Property 22: Approval resume is idempotent and never double-books", () => {
  test("any N>=1 approval deliveries finalize exactly one booking + one Jun 25 event", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (deliveries) => {
        const h = buildSharedHarness();

        // Deliver `couple.booking.approved` N times to the SAME couple, all
        // sharing the calendar store + write-back spy. Each delivery resumes
        // the run and attempts to finalize the booking.
        const results = [];
        for (let i = 0; i < deliveries; i++) {
          results.push(await runMariposaWorkflow(COUPLE_ID, h.deps));
        }

        // 1. No double-book: the real booking write happened at most once...
        expect(h.applyClinicWriteBack).toHaveBeenCalledTimes(1);

        // ...and exactly one 2026-06-25 consult event exists, regardless of N.
        const consults = h.calendarStore.filter((e) => e.date === BOOKING_DATE);
        expect(consults).toHaveLength(1);

        // 2. Every delivery still completed with the booking finalized.
        for (const { run, context } of results) {
          expect(run.status).toBe("completed");
          expect(context.finalized).toBe(true);
          expect(context.calls?.writeBack.calendarEvent.date).toBe(BOOKING_DATE);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("a single in-process run that re-finalizes is also idempotent (in-run guard)", async () => {
    // Sanity anchor: even a duplicate finalize within one run must not write a
    // second booking. defaultWorkflowDeps auto-approves; we re-run finalize via
    // a second delivery sharing the same store.
    const h = buildSharedHarness();
    const fullDeps: WorkflowDeps = { ...defaultWorkflowDeps(), ...h.deps };

    const first = await runMariposaWorkflow(COUPLE_ID, fullDeps);
    const second = await runMariposaWorkflow(COUPLE_ID, fullDeps);

    expect(first.run.status).toBe("completed");
    expect(second.run.status).toBe("completed");
    expect(h.applyClinicWriteBack).toHaveBeenCalledTimes(1);
    expect(h.calendarStore.filter((e) => e.date === BOOKING_DATE)).toHaveLength(1);
  });
});
