import {
  getCalendarEvents,
  getCallRecords,
  getCouple,
  getTasks,
} from "@/lib/db";
import { buildSeedCouple, SEED_COUPLE_ID } from "@/lib/db/seed";
import type { CallRecord, CoupleWorkspace } from "@/lib/db/types";
import { INSURANCE_FLOW_CALL_ID_SUFFIX } from "@/lib/orkes/persist-insurance-flow";
import type { CallRecord as DomainCallRecord } from "@/lib/types";

function toWorkspaceCallRecord(record: DomainCallRecord): CallRecord {
  return {
    id: record.id,
    couple_id: record.couple_id,
    call_type: record.call_type,
    transcript: record.transcript,
    extracted_result: (record.extracted_result ?? null) as unknown as Record<
      string,
      unknown
    > | null,
    used_fallback: record.used_fallback,
    unresolved_fields: record.unresolved_fields,
  };
}

export function hasPersistedInsuranceCall(records: CallRecord[]): boolean {
  return records.some(
    (record) =>
      record.call_type === "insurance" &&
      record.extracted_result &&
      Object.keys(record.extracted_result).length > 0,
  );
}

export function hasMariposaInsuranceCallRecord(
  coupleId: string,
  records: CallRecord[],
): boolean {
  const expectedId = `call_${coupleId}_${INSURANCE_FLOW_CALL_ID_SUFFIX}`;
  return records.some((record) => record.id === expectedId);
}

/**
 * Build a summary-ready workspace by overlaying persisted workflow outputs onto
 * the seed couple fixture.
 */
export async function loadWorkspaceForSummary(
  coupleId: string = SEED_COUPLE_ID,
): Promise<CoupleWorkspace> {
  const workspace = buildSeedCouple();
  const [persistedCouple, callRecords, calendarEvents, tasks] = await Promise.all([
    getCouple(coupleId),
    getCallRecords(coupleId),
    getCalendarEvents(coupleId),
    getTasks(coupleId),
  ]);

  return {
    ...workspace,
    couple: persistedCouple
      ? {
          ...workspace.couple,
          ...persistedCouple.couple,
        }
      : workspace.couple,
    herProfile: persistedCouple
      ? {
          ...workspace.herProfile,
          ...persistedCouple.herProfile,
        }
      : workspace.herProfile,
    himProfile: persistedCouple
      ? {
          ...workspace.himProfile,
          ...persistedCouple.himProfile,
        }
      : workspace.himProfile,
    callRecords: callRecords.map(toWorkspaceCallRecord),
    calendarEvents:
      calendarEvents.length > 0 ? calendarEvents : workspace.calendarEvents,
    tasks: tasks.length > 0 ? tasks : workspace.tasks,
  };
}
