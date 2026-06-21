import { describe, expect, it } from "vitest";

import { computeTryingWindow } from "@/lib/core/trying-window";
import {
  deriveHisPrepReminders,
  deriveHisPrepTasks,
} from "@/lib/calendar/partner-prep";

const seedCycle = {
  lastPeriodStart: "2026-06-01",
  cycleLengthMin: 26,
  cycleLengthMax: 35,
  ovulationConfirmed: false,
};

describe("deriveHisPrepReminders()", () => {
  it("anchors husband prep reminders to her trying window dates", () => {
    const window = computeTryingWindow(seedCycle);
    const reminders = deriveHisPrepReminders(window);

    expect(reminders).toHaveLength(3);
    expect(reminders.every((item) => item.column === "him")).toBe(true);
    expect(reminders.map((item) => item.date)).toEqual([
      window.fertileWindowStart,
      expect.any(String),
      window.minOvulation,
    ]);
    expect(reminders[0].title).toMatch(/lifestyle prep/i);
    expect(reminders[2].title).toMatch(/priority days/i);
  });
});

describe("deriveHisPrepTasks()", () => {
  it("returns display-only His-column tasks for the calendar", () => {
    const tasks = deriveHisPrepTasks("couple_001");
    expect(tasks.every((task) => task.column === "him")).toBe(true);
    expect(tasks.some((task) => task.title.includes("semen analysis"))).toBe(true);
  });
});
