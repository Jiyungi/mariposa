import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/lib/types";
import { deriveHisPrepTasks } from "@/lib/calendar/partner-prep";
import {
  hisPrepTaskPrefix,
  persistHisPrepTasks,
} from "@/lib/calendar/persist-his-prep-tasks";

describe("persistHisPrepTasks()", () => {
  it("merges his prep tasks without removing unrelated tasks", async () => {
    const existing: Task[] = [
      {
        id: "task_couple_001_other",
        couple_id: "couple_001",
        column: "together",
        title: "Keep insurance card handy",
        completed: false,
        weight: 0,
        source_call_record_id: null,
      },
    ];
    const saved: Task[][] = [];

    await persistHisPrepTasks("couple_001", {
      getCouple: vi.fn(async () => null),
      getTasks: vi.fn(async () => existing),
      saveTasks: vi.fn(async (_coupleId, tasks) => {
        saved.push(tasks);
        return tasks;
      }),
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].some((task) => task.id.startsWith(hisPrepTaskPrefix("couple_001")))).toBe(
      true,
    );
    expect(saved[0].some((task) => task.id === "task_couple_001_other")).toBe(true);
    expect(saved[0].filter((task) => task.column === "him")).toHaveLength(3);
  });

  it("is idempotent when his prep tasks are already stored", async () => {
    const existing = deriveHisPrepTasks("couple_001");
    const saveTasks = vi.fn(async (_coupleId, tasks) => tasks);

    const first = await persistHisPrepTasks("couple_001", {
      getCouple: vi.fn(async () => null),
      getTasks: vi.fn(async () => existing),
      saveTasks,
    });
    const second = await persistHisPrepTasks("couple_001", {
      getCouple: vi.fn(async () => null),
      getTasks: vi.fn(async () => existing),
      saveTasks,
    });

    expect(first.tasksAdded).toBe(0);
    expect(second.tasksAdded).toBe(0);
    expect(saveTasks).not.toHaveBeenCalled();
  });
});
