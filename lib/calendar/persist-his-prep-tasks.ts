import { computeTryingWindow, TryingWindowInputError } from "@/lib/core/trying-window";
import { getCouple, getSeedCouple, getTasks, saveTasks } from "@/lib/db";
import type { HerProfile } from "@/lib/types";

import type { Task } from "@/lib/types";

import { deriveHisPrepTasks } from "./partner-prep";

export function hisPrepTaskPrefix(coupleId: string): string {
  return `task_${coupleId}_his_prep_`;
}

export function hasHisPrepTasks(coupleId: string, tasks: Task[]): boolean {
  const prefix = hisPrepTaskPrefix(coupleId);
  return tasks.some((task) => task.id.startsWith(prefix));
}

export function tryingWindowInputFromCouple(couple: { herProfile: HerProfile }) {
  return {
    lastPeriodStart: couple.herProfile.last_period_start ?? "",
    cycleLengthMin: couple.herProfile.cycle_length_min ?? 0,
    cycleLengthMax: couple.herProfile.cycle_length_max ?? 0,
    ovulationConfirmed: couple.herProfile.mid_luteal_progesterone != null,
  };
}

export interface PersistHisPrepTasksResult {
  tasksAdded: number;
  skipped: boolean;
}

export interface PersistHisPrepTasksDeps {
  getCouple: typeof getCouple;
  getTasks: typeof getTasks;
  saveTasks: typeof saveTasks;
}

const defaultDeps: PersistHisPrepTasksDeps = {
  getCouple,
  getTasks,
  saveTasks,
};

/**
 * Merge His-column prep tasks derived from her trying window. Replaces any prior
 * his-prep tasks with the same stable ids so the Tasks tab stays in sync.
 */
export async function persistHisPrepTasks(
  coupleId: string,
  deps: PersistHisPrepTasksDeps = defaultDeps,
): Promise<PersistHisPrepTasksResult> {
  const couple = (await deps.getCouple(coupleId)) ?? (await getSeedCouple());

  try {
    computeTryingWindow(tryingWindowInputFromCouple(couple));
  } catch (err) {
    if (err instanceof TryingWindowInputError) {
      return { tasksAdded: 0, skipped: true };
    }
    throw err;
  }

  const prefix = hisPrepTaskPrefix(coupleId);
  const existing = await deps.getTasks(coupleId);
  const retained = existing.filter((task) => !task.id.startsWith(prefix));
  const hisTasks = deriveHisPrepTasks(coupleId);
  const alreadyPresent =
    hisTasks.length > 0 &&
    hisTasks.every((task) => existing.some((entry) => entry.id === task.id));

  if (alreadyPresent) {
    return { tasksAdded: 0, skipped: false };
  }

  await deps.saveTasks(coupleId, [...retained, ...hisTasks]);
  return { tasksAdded: hisTasks.length, skipped: false };
}
