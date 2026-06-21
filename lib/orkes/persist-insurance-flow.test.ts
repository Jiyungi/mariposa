import { describe, expect, it, vi } from "vitest";

import { INSURANCE_RESULT } from "@/lib/reference";
import type { PersistInsuranceFlowInput } from "@/lib/orkes/persist-insurance-flow";
import {
  INSURANCE_FLOW_CALL_ID_SUFFIX,
  persistInsuranceFlowResult,
} from "@/lib/orkes/persist-insurance-flow";
import type { CallRecord, Task } from "@/lib/types";

function sampleFlow(): PersistInsuranceFlowInput {
  return {
    coupleId: "couple_001",
    transcript: [{ speaker: "agent", text: "Hello" }],
    insuranceResult: INSURANCE_RESULT,
    fallbackFlags: {
      deterministicTranscript: true,
      deterministicModel: true,
    },
  };
}

describe("persistInsuranceFlowResult()", () => {
  it("persists the call record, follow-up tasks, and summary refresh", async () => {
    const savedRecords: CallRecord[] = [];
    const savedTasks: Task[] = [];

    const result = await persistInsuranceFlowResult(sampleFlow(), {
      getTasks: vi.fn(async () => []),
      saveTasks: vi.fn(async (_coupleId, tasks) => {
        savedTasks.push(...tasks);
        return tasks;
      }),
      saveCallRecord: vi.fn(async (record) => {
        savedRecords.push(record);
        return record;
      }),
      refreshDoctorSummaryFromCall: vi.fn(async () => ({
        couple_id: "couple_001",
        sections: {},
      })),
    });

    expect(result).toEqual({
      callRecordId: `call_couple_001_${INSURANCE_FLOW_CALL_ID_SUFFIX}`,
      tasksAdded: INSURANCE_RESULT.follow_up_tasks.length,
      summaryUpdated: true,
    });
    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0]?.used_fallback).toBe(true);
    expect(savedTasks).toHaveLength(INSURANCE_RESULT.follow_up_tasks.length);
    expect(savedTasks.every((task) => task.column === "together")).toBe(true);
  });

  it("replaces prior mariposa insurance-flow tasks on re-run", async () => {
    const prefix = `task_couple_001_mariposa_insurance_flow_`;
    const existing: Task[] = [
      {
        id: `${prefix}0`,
        couple_id: "couple_001",
        column: "together",
        title: "Old task",
        completed: false,
        weight: 0,
        source_call_record_id: null,
      },
      {
        id: "task_couple_001_prep_0",
        couple_id: "couple_001",
        column: "her",
        title: "Keep me",
        completed: false,
        weight: 0,
        source_call_record_id: null,
      },
    ];

    let savedTasks: Task[] = [];
    await persistInsuranceFlowResult(sampleFlow(), {
      getTasks: vi.fn(async () => existing),
      saveTasks: vi.fn(async (_coupleId, tasks) => {
        savedTasks = tasks;
        return tasks;
      }),
      saveCallRecord: vi.fn(async (record) => record),
      refreshDoctorSummaryFromCall: vi.fn(async () => ({
        couple_id: "couple_001",
        sections: {},
      })),
    });

    expect(savedTasks.some((task) => task.id === `${prefix}0`)).toBe(true);
    expect(savedTasks.some((task) => task.title === "Old task")).toBe(false);
    expect(savedTasks.some((task) => task.title === "Keep me")).toBe(true);
  });
});
