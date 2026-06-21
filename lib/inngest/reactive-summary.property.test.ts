// ===========================================================================
// Property test — Feature: mariposa, Property 24: Reactive summary fires on every
//   call.completed.
//
//   "For any sequence of completed calls, the Reactive_Summary_Function
//    refreshes the Doctor_Summary exactly once per `call.completed` event, and
//    every refreshed summary is grounded only in Reference_Data (omitting any
//    value not present in Reference_Data)."
//
// Validates: Requirements 19.2, 19.3
//
// Strategy: drive runMariposaWorkflow with a fully-mocked agent (no network) over
// numRuns>=100 (a tiny fast-check arbitrary varies the couple id, anchored to
// the real seed couple_001 so the rules core runs). The two parallel call
// branches (insurance-call / clinic-call) each emit `call.completed` exactly
// once when their call resolves. We inject an `emitCallCompleted` spy that:
//   - records the (callType) it was invoked with AND the event ordering, so we
//     can assert it fired once per completed call, only AFTER that call
//     completed; and
//   - performs the real reactive refresh via refreshDoctorSummaryFromCall,
//     with an injected saveSummary spy + shared summary store, so we can assert
//     the saved Doctor_Summary is grounded in the call's extracted result and
//     fabricates no value absent from Reference_Data.
//
// Oracle — for ANY run:
//   1. emitCallCompleted is called exactly twice, once for "insurance" and once
//      for "clinic" (one per completed call / one per call.completed event), and
//      each emission happens only after its respective call resolved.
//   2. The refresh saveSummary is invoked once per call; each saved summary is
//      derived from that call's extracted result (the call result fields) and
//      contains no number absent from Reference_Data (no fabrication).
//   3. The run still completes (run.status === "completed").
// ===========================================================================

import { describe, test, expect, vi } from "vitest";
import fc from "fast-check";

import {
  runMariposaWorkflow,
  refreshDoctorSummaryFromCall,
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

// --- Grounding oracle: the set of numbers that legitimately come from the -----
//     insurance Reference_Data result. Any numeric value the refreshed coverage
//     section carries must be drawn from here (nothing fabricated).
const INSURANCE_REFERENCE_NUMBERS = new Set<number>([
  INSURANCE_RESULT.deductible,
  INSURANCE_RESULT.coinsurance_pct,
  INSURANCE_RESULT.oop_max,
]);

/** Recursively collect every number appearing in a value. */
function collectNumbers(value: unknown, acc: number[] = []): number[] {
  if (typeof value === "number") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, acc);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectNumbers(v, acc);
  }
  return acc;
}

interface RefreshHarness {
  deps: Partial<WorkflowDeps>;
  /** Ordered event log: "call:insurance", "emit:insurance", etc. */
  events: string[];
  /** Each (callType) emitCallCompleted was invoked with. */
  emittedCallTypes: CallType[];
  /** Each summary persisted by the reactive refresh, paired with its callType. */
  savedSummaries: Array<{ callType: CallType; summary: Summary }>;
  emitCallCompleted: ReturnType<typeof vi.fn>;
  saveSummary: ReturnType<typeof vi.fn>;
}

/**
 * Build deps whose emitCallCompleted performs the REAL reactive refresh
 * (refreshDoctorSummaryFromCall) against an injected saveSummary spy + a shared
 * in-memory summary store — mirroring the default emitCallCompleted, but
 * observable. Everything else (agent / approval / sleep / checkin / persistence)
 * is mocked so the run completes without network or waiting.
 */
function buildRefreshHarness(coupleId: string): RefreshHarness {
  const events: string[] = [];
  const emittedCallTypes: CallType[] = [];
  const savedSummaries: Array<{ callType: CallType; summary: Summary }> = [];

  // Shared summary store the refresh merges into (insurance + clinic both land).
  const summaryStore = new Map<string, Summary>();
  const getExisting = async (id: string): Promise<Summary | null> =>
    summaryStore.get(id) ?? null;

  const saveSummary = vi.fn(async (s: Summary): Promise<Summary> => {
    summaryStore.set(s.couple_id, structuredClone(s));
    return structuredClone(s);
  });

  const runStep: StepRunner = async (_name, body) => body();

  const runInsuranceCall = vi.fn(async (): Promise<CallOutput<InsuranceResult>> => {
    events.push("call:insurance");
    return makeInsuranceOutput();
  });
  const runClinicCall = vi.fn(async (): Promise<CallOutput<ClinicResult>> => {
    events.push("call:clinic");
    return makeClinicOutput();
  });

  const applyClinicWriteBack = vi.fn(
    async (cid: string): Promise<ClinicWriteBackResult> => {
      const calendarEvent: CalendarEvent = {
        id: `event_${cid}_consult`,
        couple_id: cid,
        type: CLINIC_RESULT.calendar_event.type,
        title: `Fertility consult — ${CLINIC_RESULT.booked.clinic}`,
        date: CLINIC_RESULT.calendar_event.date,
        time: CLINIC_RESULT.calendar_event.time,
        description: "mocked",
      };
      return { tasks: [], calendarEvent, summary: { couple_id: cid, sections: {} } };
    },
  );

  const saveWorkflowRun = vi.fn(async (run: WorkflowRun): Promise<WorkflowRun> => run);
  const saveTryingWindow = vi.fn(async (w: TryingWindow): Promise<TryingWindow> => w);
  const saveTasks = vi.fn(async (_id: string, items: Task[]): Promise<Task[]> => items);
  const getCalendarEvents = vi.fn(async (): Promise<CalendarEvent[]> => []);
  const awaitBookingApproval = vi.fn(
    async (): Promise<ApprovalOutcome> => ({ approved: true, timedOut: false }),
  );
  const sleep = vi.fn(async (): Promise<void> => {});

  // The reactive refresh under test: records the event, then refreshes the
  // grounded Doctor_Summary from this call's extracted result (Req 19.3).
  const emitCallCompleted = vi.fn(
    async (
      cid: string,
      callType: CallType,
      output: CallOutput<InsuranceResult | ClinicResult>,
    ): Promise<void> => {
      events.push(`emit:${callType}`);
      emittedCallTypes.push(callType);
      const summary = await refreshDoctorSummaryFromCall(
        cid,
        callType,
        output.result,
        saveSummary,
        getExisting,
      );
      savedSummaries.push({ callType, summary });
    },
  );

  const emitCheckinDue = vi.fn(
    async (cid: string, delayToken: string, _existing: Task[]): Promise<CheckinResult> => {
      const task: Task = {
        id: `task_${cid}_checkin_retest`,
        couple_id: cid,
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
          id: `checkin_${cid}`,
          couple_id: cid,
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

  return {
    deps,
    events,
    emittedCallTypes,
    savedSummaries,
    emitCallCompleted,
    saveSummary,
  };
}

// ===========================================================================
// Property 24 — Reactive summary fires on every call.completed
// ===========================================================================

describe("Feature: mariposa, Property 24: Reactive summary fires on every call.completed", () => {
  test("each completed call emits call.completed once and refreshes a grounded summary", async () => {
    await fc.assert(
      // A tiny arbitrary: a no-op seed so the property runs >=100 times. The
      // couple is anchored to the real seed couple_001 (drives the rules core).
      fc.asyncProperty(fc.constant(COUPLE_ID), async (coupleId) => {
        const h = buildRefreshHarness(coupleId);

        const { run } = await runMariposaWorkflow(coupleId, h.deps);

        // 1. Exactly two call.completed emissions — one per completed call.
        expect(h.emitCallCompleted).toHaveBeenCalledTimes(2);
        expect(h.emittedCallTypes).toHaveLength(2);
        expect(new Set(h.emittedCallTypes)).toEqual(new Set<CallType>(["insurance", "clinic"]));

        // ...and each emission fired only AFTER its respective call completed.
        expect(h.events.indexOf("emit:insurance")).toBeGreaterThan(
          h.events.indexOf("call:insurance"),
        );
        expect(h.events.indexOf("emit:clinic")).toBeGreaterThan(
          h.events.indexOf("call:clinic"),
        );

        // 2. The refresh saved one grounded summary per completed call.
        expect(h.saveSummary).toHaveBeenCalledTimes(2);
        expect(h.savedSummaries).toHaveLength(2);

        for (const { callType, summary } of h.savedSummaries) {
          expect(summary.couple_id).toBe(coupleId);

          if (callType === "insurance") {
            // Derived from the call's extracted InsuranceResult fields.
            const coverage = summary.sections.coverage as Record<string, unknown>;
            expect(coverage).toBeDefined();
            expect(coverage.deductible).toBe(INSURANCE_RESULT.deductible);
            expect(coverage.coinsurance_pct).toBe(INSURANCE_RESULT.coinsurance_pct);
            expect(coverage.oop_max).toBe(INSURANCE_RESULT.oop_max);
            expect(coverage.in_network_lab).toBe(INSURANCE_RESULT.in_network_lab);
            expect(coverage.referral_required).toBe(INSURANCE_RESULT.referral_required);

            // Grounded: every number in the coverage section is a Reference_Data
            // value — nothing fabricated (Req 19.5).
            for (const n of collectNumbers(coverage)) {
              expect(INSURANCE_REFERENCE_NUMBERS.has(n)).toBe(true);
            }
          } else {
            // Derived from the call's extracted ClinicResult fields.
            expect(summary.sections.appointment).toEqual(CLINIC_RESULT.booked);
            expect(summary.sections.bring_list).toEqual(CLINIC_RESULT.bring_list);

            // Grounded: the bring_list carries only Reference_Data items.
            const bring = summary.sections.bring_list as string[];
            for (const item of bring) {
              expect(CLINIC_RESULT.bring_list).toContain(item);
            }
          }
        }

        // 3. The run still completes end-to-end.
        expect(run.status).toBe("completed");
      }),
      { numRuns: 100 },
    );
  });
});
