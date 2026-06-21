// ===========================================================================
// Unit test (example-based) — Task 9.6
//   Question order + clinic write-back.
//
//   - Insurance call asks the 10 insurance questions in the EXACT reference
//     order (Req 6.2).
//   - Clinic call asks the 7 clinic questions in the EXACT reference order
//     (Req 6.3).
//   - The clinic write-back persists the her/his/together tasks (plus insurance
//     follow-ups as "together"), a calendar event dated 2026-06-25, and a
//     summary containing the coverage facts + appointment + bring-list (Req 6.6).
//
// Validates: Requirements 6.2, 6.3, 6.6
//
// Deterministic — no fast-check needed. Uses the deterministic Mock_Fallback
// (live path may be unavailable in CI) and an in-memory mock
// ClinicWriteBackDb so no real persistence occurs.
// ===========================================================================

import { describe, it, expect, vi } from "vitest";

import {
  applyClinicWriteBack,
  mockClinicCall,
  mockInsuranceCall,
  type ClinicWriteBackDb,
} from "@/lib/agent";
import type { Summary } from "@/lib/db";
import {
  CLINIC_CALL_QUESTIONS,
  INSURANCE_QUESTIONS,
  INSURANCE_RESULT,
  SEED_AUTH_PACKET,
} from "@/lib/reference";
import type {
  CalendarEvent,
  CallRecord,
  Task,
  TaskColumn,
  Turn,
} from "@/lib/types";

// The complete, closed set of valid task columns (lib/types.ts → TaskColumn).
const VALID_COLUMNS: readonly TaskColumn[] = ["her", "him", "together"] as const;

/**
 * Extract, in order, the agent turns whose text is one of the known question
 * strings. This yields the subsequence of question turns from the full
 * transcript (skipping the opening, identity disclosure, booking, and closing
 * agent turns, plus every responder turn).
 */
function questionTurnsInOrder(
  transcript: Turn[],
  questions: readonly string[],
): string[] {
  const questionSet = new Set<string>(questions);
  return transcript
    .filter((turn) => turn.speaker === "agent" && questionSet.has(turn.text))
    .map((turn) => turn.text);
}

describe("Voice Agent — insurance question order (Req 6.2)", () => {
  it("asks the 10 insurance questions in the exact reference order", () => {
    const { transcript } = mockInsuranceCall(SEED_AUTH_PACKET);

    const asked = questionTurnsInOrder(transcript, INSURANCE_QUESTIONS);

    // Exactly 10 question turns, in the exact reference order.
    expect(asked).toHaveLength(10);
    expect(asked).toEqual([...INSURANCE_QUESTIONS]);
  });
});

describe("Voice Agent — clinic question order (Req 6.3)", () => {
  it("asks the 7 clinic questions in the exact reference order", () => {
    const { transcript } = mockClinicCall(SEED_AUTH_PACKET);

    const asked = questionTurnsInOrder(transcript, CLINIC_CALL_QUESTIONS);

    // Exactly 7 question turns, in the exact reference order.
    expect(asked).toHaveLength(7);
    expect(asked).toEqual([...CLINIC_CALL_QUESTIONS]);
  });
});

describe("Voice Agent — clinic write-back (Req 6.6)", () => {
  /** Build a fresh in-memory mock ClinicWriteBackDb with spies on every method. */
  function buildMockDb() {
    const saveTasks = vi.fn(
      async (_coupleId: string, items: Task[]): Promise<Task[]> => items,
    );
    const saveCalendarEvent = vi.fn(
      async (event: CalendarEvent): Promise<CalendarEvent> => event,
    );
    const saveCallRecord = vi.fn(
      async (record: CallRecord): Promise<CallRecord> => record,
    );
    const saveSummary = vi.fn(
      async (summary: Summary): Promise<Summary> => summary,
    );

    const db: ClinicWriteBackDb = {
      saveTasks,
      saveCalendarEvent,
      saveCallRecord,
      saveSummary,
    };

    return { db, saveTasks, saveCalendarEvent, saveCallRecord, saveSummary };
  }

  it("saves a calendar event dated 2026-06-25", async () => {
    const { db, saveCalendarEvent } = buildMockDb();
    const clinicOutput = mockClinicCall(SEED_AUTH_PACKET);
    const insuranceOutput = mockInsuranceCall(SEED_AUTH_PACKET);

    await applyClinicWriteBack(
      "couple_001",
      INSURANCE_RESULT,
      clinicOutput,
      db,
      insuranceOutput,
    );

    expect(saveCalendarEvent).toHaveBeenCalledTimes(1);
    const savedEvent = saveCalendarEvent.mock.calls[0][0];
    expect(savedEvent.date).toBe("2026-06-25");
    expect(savedEvent.couple_id).toBe("couple_001");
  });

  it("saves tasks covering her/his/together columns, with insurance follow-ups as together", async () => {
    const { db, saveTasks } = buildMockDb();
    const clinicOutput = mockClinicCall(SEED_AUTH_PACKET);
    const insuranceOutput = mockInsuranceCall(SEED_AUTH_PACKET);

    await applyClinicWriteBack(
      "couple_001",
      INSURANCE_RESULT,
      clinicOutput,
      db,
      insuranceOutput,
    );

    expect(saveTasks).toHaveBeenCalledTimes(1);
    const [coupleId, savedTasks] = saveTasks.mock.calls[0];
    expect(coupleId).toBe("couple_001");

    // All three columns are represented.
    const columns = new Set(savedTasks.map((t) => t.column));
    expect(columns.has("her")).toBe(true);
    expect(columns.has("him")).toBe(true);
    expect(columns.has("together")).toBe(true);

    // The clinic result's her/his/together tasks are all present.
    const clinicTasks = clinicOutput.result.tasks;
    for (const title of clinicTasks.her) {
      expect(savedTasks.some((t) => t.column === "her" && t.title === title)).toBe(true);
    }
    for (const title of clinicTasks.him) {
      expect(savedTasks.some((t) => t.column === "him" && t.title === title)).toBe(true);
    }
    for (const title of clinicTasks.together) {
      expect(savedTasks.some((t) => t.column === "together" && t.title === title)).toBe(true);
    }

    // Insurance follow-ups are written back as "together" tasks.
    for (const title of INSURANCE_RESULT.follow_up_tasks) {
      expect(savedTasks.some((t) => t.column === "together" && t.title === title)).toBe(true);
    }

    // Every saved task carries exactly one valid column value.
    for (const task of savedTasks) {
      const memberships = VALID_COLUMNS.filter((c) => c === task.column);
      expect(memberships).toHaveLength(1);
    }
  });

  it("saves a summary containing coverage facts, the appointment, and the bring-list", async () => {
    const { db, saveSummary } = buildMockDb();
    const clinicOutput = mockClinicCall(SEED_AUTH_PACKET);
    const insuranceOutput = mockInsuranceCall(SEED_AUTH_PACKET);

    await applyClinicWriteBack(
      "couple_001",
      INSURANCE_RESULT,
      clinicOutput,
      db,
      insuranceOutput,
    );

    expect(saveSummary).toHaveBeenCalledTimes(1);
    const savedSummary = saveSummary.mock.calls[0][0];
    expect(savedSummary.couple_id).toBe("couple_001");

    const sections = savedSummary.sections as {
      coverage: Record<string, unknown>;
      appointment: { date: string; time: string; mode: string; clinic: string };
      bring_list: string[];
    };

    // Coverage facts (grounded in the insurance result).
    expect(sections.coverage).toBeDefined();
    expect(sections.coverage.diagnostic_covered).toBe(INSURANCE_RESULT.diagnostic_covered);
    expect(sections.coverage.semen_analysis_covered).toBe(INSURANCE_RESULT.semen_analysis_covered);
    expect(sections.coverage.in_network_lab).toBe(INSURANCE_RESULT.in_network_lab);
    expect(sections.coverage.deductible).toBe(INSURANCE_RESULT.deductible);

    // Appointment matches the booked clinic slot (Jun 25).
    expect(sections.appointment).toEqual(clinicOutput.result.booked);
    expect(sections.appointment.date).toBe("2026-06-25");

    // Bring-list matches the clinic result's bring-list.
    expect(sections.bring_list).toEqual(clinicOutput.result.bring_list);
  });

  it("records both call transcripts when the insurance output is provided", async () => {
    const { db, saveCallRecord } = buildMockDb();
    const clinicOutput = mockClinicCall(SEED_AUTH_PACKET);
    const insuranceOutput = mockInsuranceCall(SEED_AUTH_PACKET);

    await applyClinicWriteBack(
      "couple_001",
      INSURANCE_RESULT,
      clinicOutput,
      db,
      insuranceOutput,
    );

    // One insurance record + one clinic record.
    expect(saveCallRecord).toHaveBeenCalledTimes(2);
    const callTypes = saveCallRecord.mock.calls.map((c) => c[0].call_type);
    expect(callTypes).toContain("insurance");
    expect(callTypes).toContain("clinic");
  });
});
