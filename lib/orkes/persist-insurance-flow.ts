import {
  getTasks,
  saveCallRecord,
  saveTasks,
} from "@/lib/db";
import { refreshDoctorSummaryFromCall } from "@/lib/inngest/workflow";
import type { InsuranceResult, Task, Turn } from "@/lib/types";

export const INSURANCE_FLOW_CALL_ID_SUFFIX = "mariposa_insurance_flow" as const;

export interface PersistInsuranceFlowInput {
  coupleId: string;
  transcript: Turn[];
  insuranceResult: InsuranceResult;
  fallbackFlags: {
    deterministicTranscript: boolean;
    deterministicModel: boolean;
  };
}

export interface PersistInsuranceFlowResult {
  callRecordId: string;
  tasksAdded: number;
  summaryUpdated: boolean;
}

export interface PersistInsuranceFlowDeps {
  getTasks: typeof getTasks;
  saveTasks: typeof saveTasks;
  saveCallRecord: typeof saveCallRecord;
  refreshDoctorSummaryFromCall: typeof refreshDoctorSummaryFromCall;
}

const defaultDeps: PersistInsuranceFlowDeps = {
  getTasks,
  saveTasks,
  saveCallRecord,
  refreshDoctorSummaryFromCall,
};

function callRecordId(coupleId: string): string {
  return `call_${coupleId}_${INSURANCE_FLOW_CALL_ID_SUFFIX}`;
}

function taskIdPrefix(coupleId: string): string {
  return `task_${coupleId}_${INSURANCE_FLOW_CALL_ID_SUFFIX}_`;
}

export function mariposaInsuranceFlowTaskPrefix(coupleId: string): string {
  return taskIdPrefix(coupleId);
}

export function hasMariposaInsuranceFlowTasks(
  coupleId: string,
  tasks: Task[],
): boolean {
  const prefix = taskIdPrefix(coupleId);
  return tasks.some((task) => task.id.startsWith(prefix));
}

function buildInsuranceFollowUpTasks(
  coupleId: string,
  flow: PersistInsuranceFlowInput,
  sourceCallRecordId: string,
): Task[] {
  return flow.insuranceResult.follow_up_tasks.map((title, index) => ({
    id: `${taskIdPrefix(coupleId)}${index}`,
    couple_id: coupleId,
    column: "together",
    title,
    completed: false,
    weight: 0,
    source_call_record_id: sourceCallRecordId,
  }));
}

export async function persistInsuranceFlowResult(
  flow: PersistInsuranceFlowInput,
  deps: PersistInsuranceFlowDeps = defaultDeps,
): Promise<PersistInsuranceFlowResult> {
  const recordId = callRecordId(flow.coupleId);
  const usedFallback =
    flow.fallbackFlags.deterministicTranscript ||
    flow.fallbackFlags.deterministicModel;

  await deps.saveCallRecord({
    id: recordId,
    couple_id: flow.coupleId,
    call_type: "insurance",
    transcript: flow.transcript,
    extracted_result: flow.insuranceResult,
    used_fallback: usedFallback,
    unresolved_fields: [],
  });

  const prefix = taskIdPrefix(flow.coupleId);
  const existingTasks = await deps.getTasks(flow.coupleId);
  const retainedTasks = existingTasks.filter((task) => !task.id.startsWith(prefix));
  const followUpTasks = buildInsuranceFollowUpTasks(
    flow.coupleId,
    flow,
    recordId,
  );

  await deps.saveTasks(flow.coupleId, [...retainedTasks, ...followUpTasks]);
  await deps.refreshDoctorSummaryFromCall(
    flow.coupleId,
    "insurance",
    flow.insuranceResult,
  );

  return {
    callRecordId: recordId,
    tasksAdded: followUpTasks.length,
    summaryUpdated: true,
  };
}
