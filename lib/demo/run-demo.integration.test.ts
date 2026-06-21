// ===========================================================================
// Integration test (example-based) — Task 19.2
//   End-to-end demo path: intake → workflow → window/missing-data → calls →
//   her/his/together tasks + Jun 25 consult → doctor summary.
//
// With NO XAI_API_KEY / GROK_API_KEY configured, the live Grok Voice path is
// unavailable, so the simulated insurance + clinic calls TRANSPARENTLY fall
// through to the deterministic Mock_Fallback (Req 16.3). `runDemoPath` drives
// the same reactive-graph pipeline the Inngest function wraps and returns the
// full set of demo artifacts, which this test asserts complete + correct:
//
//   1. run completed, all reactive-graph steps completed (auto-approved gate).
//   2. trying window: Jun 27 – Jul 18 2026, priority Jul 2 – Jul 17, Low.
//   3. flags: missing labs + borderline semen + unverified insurance.
//   4. tasks: non-empty, cover her/him/together, each with exactly one column.
//   5. calendar event dated 2026-06-25 (the booked consult).
//   6. doctor summary present with window, missing data, coverage, appointment
//      (Jun 25), bring-list.
//   7. usedFallback === true (live failure transparently used Mock_Fallback).
//
// Plus determinism: running the demo twice yields identical core artifacts.
//
// Validates: Requirements 16.1, 16.3
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runDemoPath } from "@/lib/demo/run-demo";
import { WORKFLOW_STEPS } from "@/lib/inngest";
import type { TaskColumn } from "@/lib/types";

// Ensure the Mock_Fallback path runs deterministically: no live Grok key set.
let savedXai: string | undefined;
let savedGrok: string | undefined;

beforeEach(() => {
  savedXai = process.env.XAI_API_KEY;
  savedGrok = process.env.GROK_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.GROK_API_KEY;
});

afterEach(() => {
  if (savedXai === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = savedXai;
  if (savedGrok === undefined) delete process.env.GROK_API_KEY;
  else process.env.GROK_API_KEY = savedGrok;
});

describe("demo path end-to-end (Req 16.1, 16.3)", () => {
  it("completes intake → workflow → window/missing-data → calls → tasks + Jun 25 consult → summary", async () => {
    const result = await runDemoPath("couple_001");

    // --- 1. Workflow ran end to end: completed with all steps completed.
    expect(result.run.status).toBe("completed");
    expect(result.run.steps).toHaveLength(WORKFLOW_STEPS.length);
    expect(result.run.steps.map((s) => s.name)).toEqual([...WORKFLOW_STEPS]);
    expect(result.run.steps.every((s) => s.status === "completed")).toBe(true);
    expect(result.run.failedStep).toBeUndefined();

    // --- 2. Trying window (Req 16.1 / 3.2–3.4): Jun 27 – Jul 18, Jul 2 – Jul 17, Low.
    expect(result.window.fertileWindowStart).toBe("2026-06-27");
    expect(result.window.fertileWindowEnd).toBe("2026-07-18");
    expect(result.window.minOvulation).toBe("2026-07-02");
    expect(result.window.maxOvulation).toBe("2026-07-17");
    expect(result.window.confidence).toBe("Low");

    // --- 3. Flags: missing labs + borderline semen + unverified insurance.
    expect(result.flags.length).toBeGreaterThan(0);

    const flagIds = result.flags.map((f) => f.id);
    // Missing female labs (Maya's day-3 panel + mid-luteal progesterone + prolactin).
    expect(flagIds).toContain("day3_fsh");
    expect(flagIds).toContain("day3_estradiol");
    expect(flagIds).toContain("mid_luteal_progesterone");
    expect(flagIds).toContain("prolactin");

    // Borderline semen parameters (Daniel's analysis below WHO 2021 limits).
    const borderline = result.flags.filter((f) => f.kind === "borderline");
    expect(borderline.length).toBeGreaterThan(0);
    expect(borderline.every((f) => f.source.includes("semen"))).toBe(true);

    // Unverified insurance coverage (coverage_status is not "confirmed").
    const unverified = result.flags.filter((f) => f.kind === "unverified");
    expect(unverified.length).toBeGreaterThan(0);
    expect(flagIds).toContain("insurance_coverage");

    // All three flag kinds are present.
    const kinds = new Set(result.flags.map((f) => f.kind));
    expect(kinds.has("missing")).toBe(true);
    expect(kinds.has("borderline")).toBe(true);
    expect(kinds.has("unverified")).toBe(true);

    // --- 4. Tasks: non-empty, cover all three columns, each exactly one column.
    expect(result.tasks.length).toBeGreaterThan(0);
    const validColumns: TaskColumn[] = ["her", "him", "together"];
    const columnsSeen = new Set<TaskColumn>();
    for (const task of result.tasks) {
      expect(validColumns).toContain(task.column);
      columnsSeen.add(task.column);
    }
    expect(columnsSeen.has("her")).toBe(true);
    expect(columnsSeen.has("him")).toBe(true);
    expect(columnsSeen.has("together")).toBe(true);

    // --- 5. Calendar event: the booked Jun 25, 2026 consult.
    expect(result.calendarEvent.date).toBe("2026-06-25");

    // --- 6. Doctor summary present with the expected sections.
    expect(result.summary).toBeDefined();
    expect(result.summary.couple_id).toBe("couple_001");
    // Trying window carried into the summary.
    expect(result.summary.trying_window.fertileWindowStart).toBe("2026-06-27");
    expect(result.summary.trying_window.fertileWindowEnd).toBe("2026-07-18");
    // Missing data carried into the summary.
    expect(result.summary.missing_data.length).toBe(result.flags.length);
    // Coverage facts present.
    expect(result.summary.coverage).toBeDefined();
    expect(result.summary.coverage.facts).toBeDefined();
    // Appointment is the booked Jun 25 consult (not "pending").
    expect(result.summary.appointment).not.toBe("pending");
    expect(
      typeof result.summary.appointment === "object" &&
        result.summary.appointment.date,
    ).toBe("2026-06-25");
    // Bring-list present and non-empty.
    expect(Array.isArray(result.summary.bring_list)).toBe(true);
    expect(result.summary.bring_list.length).toBeGreaterThan(0);

    // --- 7. Live call failed transparently -> deterministic Mock_Fallback used.
    expect(result.usedFallback).toBe(true);
  });

  it("is deterministic: two runs yield the same window/flags/calendar/summary core values", async () => {
    const first = await runDemoPath("couple_001");
    const second = await runDemoPath("couple_001");

    // Trying window is identical.
    expect(second.window).toEqual(first.window);

    // Flags are identical (same kinds/ids/order).
    expect(second.flags).toEqual(first.flags);

    // Calendar event core (date/time/type) is identical.
    expect(second.calendarEvent.date).toBe(first.calendarEvent.date);
    expect(second.calendarEvent.time).toBe(first.calendarEvent.time);
    expect(second.calendarEvent.type).toBe(first.calendarEvent.type);

    // Doctor summary core values are identical.
    expect(second.summary.trying_window).toEqual(first.summary.trying_window);
    expect(second.summary.missing_data).toEqual(first.summary.missing_data);
    expect(second.summary.appointment).toEqual(first.summary.appointment);
    expect(second.summary.bring_list).toEqual(first.summary.bring_list);
    expect(second.summary.coverage).toEqual(first.summary.coverage);

    // Both runs used the deterministic Mock_Fallback.
    expect(first.usedFallback).toBe(true);
    expect(second.usedFallback).toBe(true);
  });
});
