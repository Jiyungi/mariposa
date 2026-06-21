// ===========================================================================
// Voice Agent public API (lib/agent/index.ts)
//   — Req 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9, 15.5
//
// The single interface the Inngest workflow (Task 10) calls. Each call:
//   1. Loads the authorization packet fields before any call (Req 6.1).
//   2. Tries Grok Voice (xAI sponsor), then optional AgentPhone; on failure falls
//      through to the deterministic Mock_Fallback and sets usedFallback
//      accordingly (Req 6.7, 15.5).
//   3. Returns a chronological agent/responder transcript + a structured result
//      conforming to the call-type schema (Req 6.4).
//
// Identity-withholding (Req 6.8), medical-decision declines (Req 6.9), the exact
// 10/7 question order (Req 6.2, 6.3), and determinism (Req 6.7) are all enforced
// inside the pure Mock_Fallback (./mock-fallback). The clinic write-back I/O
// (Req 6.6) is kept OUT of the pure fallback and exposed here as
// applyClinicWriteBack so Property 17 holds for the fallback itself.
// ===========================================================================

import {
  saveCalendarEvent,
  saveCallRecord,
  saveSummary,
  saveTasks,
  type Summary,
} from "@/lib/db";
import { CALL_WRITEBACK_STEPS } from "@/lib/reference";
import type {
  AuthPacket,
  CalendarEvent,
  CallOutput,
  CallRecord,
  ClinicResult,
  InsuranceResult,
  Task,
  TaskColumn,
} from "@/lib/types";

import { mockClinicCall, mockInsuranceCall } from "./mock-fallback";
import { tryLiveClinicCall, tryLiveInsuranceCall } from "./live";

export {
  formatDobSpoken,
  mockClinicCall,
  mockInsuranceCall,
  simulateConversation,
} from "./mock-fallback";
export type {
  ConversationOutput,
  ResponderKind,
  ScriptStep,
} from "./mock-fallback";
export { LiveVoiceUnavailableError } from "./errors";
export {
  isLiveVoiceConfigured,
  resolveGrokApiKey,
  tryLiveClinicCall,
  tryLiveInsuranceCall,
} from "./live";
export {
  createGrokVoiceEphemeralToken,
  runGrokVoiceSession,
} from "./grok-voice";
export {
  DeepgramVoiceUnavailableError,
  parseDeepgramTranscript,
  runDeepgramInsuranceSession,
} from "./deepgram-voice";
export { nextQuestion, objectivesSatisfied } from "./turn-policy";
export type { TurnContext } from "./turn-policy";
export {
  isAgentPhoneEnabled,
  parseAgentPhoneTranscript,
  resolveAgentPhoneConfig,
} from "./agentphone";
export { buildAgentPhoneCallPrompt } from "./prompts";

// ---------------------------------------------------------------------------
// Public call interface (live-first, Mock_Fallback on failure) — Req 6.7
// ---------------------------------------------------------------------------

/**
 * Run the insurance verification call. The authorization packet is loaded before
 * any call (Req 6.1). Tries the live Grok Voice path; on any failure falls
 * through to the deterministic Mock_Fallback (usedFallback = true).
 */
export async function runInsuranceCall(
  packet: AuthPacket,
): Promise<CallOutput<InsuranceResult>> {
  try {
    return await tryLiveInsuranceCall(packet);
  } catch {
    return mockInsuranceCall(packet);
  }
}

/**
 * Run the clinic booking call. The authorization packet is loaded before any
 * call (Req 6.1). Tries the live Grok Voice path; on any failure falls through
 * to the deterministic Mock_Fallback (usedFallback = true).
 *
 * This function is PURE with respect to data (no persistence). Use
 * applyClinicWriteBack to persist the tasks, the Jun 25 calendar event, and the
 * summary (Req 6.6).
 */
export async function runClinicCall(
  packet: AuthPacket,
): Promise<CallOutput<ClinicResult>> {
  try {
    return await tryLiveClinicCall(packet);
  } catch {
    return mockClinicCall(packet);
  }
}

// ---------------------------------------------------------------------------
// Clinic write-back (I/O) — Req 6.6
// ---------------------------------------------------------------------------

/** The minimal data-layer surface the clinic write-back needs (injectable). */
export interface ClinicWriteBackDb {
  saveTasks: (coupleId: string, items: Task[]) => Promise<Task[]>;
  saveCalendarEvent: (event: CalendarEvent) => Promise<CalendarEvent>;
  saveCallRecord: (record: CallRecord) => Promise<CallRecord>;
  saveSummary: (summary: Summary) => Promise<Summary>;
}

const defaultDb: ClinicWriteBackDb = {
  saveTasks,
  saveCalendarEvent,
  saveCallRecord,
  saveSummary,
};

/** Result of persisting the clinic call's write-back. */
export interface ClinicWriteBackResult {
  tasks: Task[];
  calendarEvent: CalendarEvent;
  summary: Summary;
}

/** Default per-column weights for readiness scoring (his track tasks weigh in). */
const TASK_WEIGHT: Record<TaskColumn, number> = {
  her: 0,
  him: 5,
  together: 0,
};

/** Build persistable Task rows from a clinic result's her/his/together tasks. */
function buildClinicTasks(
  coupleId: string,
  clinicResult: ClinicResult,
  insuranceResult: InsuranceResult,
  callRecordId: string | null,
): Task[] {
  const tasks: Task[] = [];
  const columns: TaskColumn[] = ["her", "him", "together"];

  for (const column of columns) {
    clinicResult.tasks[column].forEach((title, i) => {
      tasks.push({
        id: `task_${coupleId}_${column}_${i}`,
        couple_id: coupleId,
        column,
        title,
        completed: false,
        weight: TASK_WEIGHT[column],
        source_call_record_id: callRecordId,
      });
    });
  }

  // Insurance is shared couple data -> "together" follow-up tasks (Req 6.2).
  insuranceResult.follow_up_tasks.forEach((title, i) => {
    tasks.push({
      id: `task_${coupleId}_insurance_${i}`,
      couple_id: coupleId,
      column: "together",
      title,
      completed: false,
      weight: TASK_WEIGHT.together,
      source_call_record_id: callRecordId,
    });
  });

  return tasks;
}

/**
 * Persist the clinic call's write-back (Req 6.6): the her/his/together tasks, a
 * calendar event dated 2026-06-25, and a summary containing the coverage facts,
 * the appointment, and the bring-list. Optionally records both call transcripts.
 *
 * Kept separate from the pure Mock_Fallback so determinism (Property 17) holds
 * for the fallback itself. The data layer is injectable for testing.
 */
export async function applyClinicWriteBack(
  coupleId: string,
  insuranceResult: InsuranceResult,
  clinicOutput: CallOutput<ClinicResult>,
  db: ClinicWriteBackDb = defaultDb,
  insuranceOutput?: CallOutput<InsuranceResult>,
): Promise<ClinicWriteBackResult> {
  const clinicResult = clinicOutput.result;

  // 1. Persist call records (traceability) and capture the clinic record id.
  let clinicCallRecordId: string | null = null;
  if (insuranceOutput) {
    await db.saveCallRecord({
      id: `call_${coupleId}_insurance`,
      couple_id: coupleId,
      call_type: "insurance",
      transcript: insuranceOutput.transcript,
      extracted_result: insuranceOutput.result,
      used_fallback: insuranceOutput.usedFallback,
      unresolved_fields: [],
    });
  }
  const clinicRecord = await db.saveCallRecord({
    id: `call_${coupleId}_clinic`,
    couple_id: coupleId,
    call_type: "clinic",
    transcript: clinicOutput.transcript,
    extracted_result: clinicResult,
    used_fallback: clinicOutput.usedFallback,
    unresolved_fields: [],
  });
  clinicCallRecordId = clinicRecord.id;

  // 2. Write back the her/his/together tasks (Req 6.6).
  const tasks = buildClinicTasks(
    coupleId,
    clinicResult,
    insuranceResult,
    clinicCallRecordId,
  );
  const savedTasks = await db.saveTasks(coupleId, tasks);

  // 3. Write back the calendar event dated 2026-06-25 (Req 6.6).
  const calendarEvent: CalendarEvent = {
    id: `event_${coupleId}_consult`,
    couple_id: coupleId,
    type: clinicResult.calendar_event.type,
    title: `Fertility consult — ${clinicResult.booked.clinic}`,
    date: clinicResult.calendar_event.date, // 2026-06-25
    time: clinicResult.calendar_event.time,
    description:
      `${clinicResult.booked.mode} consult at ${clinicResult.booked.clinic}. ` +
      `Bring: ${clinicResult.bring_list.join(", ")}.`,
  };
  const savedEvent = await db.saveCalendarEvent(calendarEvent);

  // 4. Write back the summary: coverage facts + appointment + bring-list (Req 6.6).
  const summary: Summary = {
    couple_id: coupleId,
    sections: {
      coverage: {
        diagnostic_covered: insuranceResult.diagnostic_covered,
        semen_analysis_covered: insuranceResult.semen_analysis_covered,
        hormone_labs_covered: insuranceResult.hormone_labs_covered,
        prior_auth_required_for: insuranceResult.prior_auth_required_for,
        in_network_lab: insuranceResult.in_network_lab,
        deductible: insuranceResult.deductible,
        coinsurance_pct: insuranceResult.coinsurance_pct,
        oop_max: insuranceResult.oop_max,
        referral_required: insuranceResult.referral_required,
        coverage_status: "verified (partial)", // CALL_WRITEBACK_STEPS step 4
      },
      appointment: clinicResult.booked,
      bring_list: clinicResult.bring_list,
      writeback_steps: CALL_WRITEBACK_STEPS,
    },
  };
  const savedSummary = await db.saveSummary(summary);

  return { tasks: savedTasks, calendarEvent: savedEvent, summary: savedSummary };
}
