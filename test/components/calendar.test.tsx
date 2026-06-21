import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import fc from "fast-check";

import { CalendarView } from "@/components/mariposa/CalendarView";
import {
  computeTryingWindow,
  type TryingWindowInput,
} from "@/lib/core/trying-window";

/*
  Task 16.2 — Property 25: Calendar dates equal engine output.

  For any Trying_Window_Engine output, the calendar's displayed trying-window
  and priority-day dates equal that output exactly; and after the engine
  updates (a new input), the displayed dates match the NEW output.

  The exact ISO dates are read from the WindowBar's data attributes so the
  assertion is on the engine's own date strings, independent of human
  formatting. Validates: Requirements 10.3, 10.4.
*/

afterEach(cleanup);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Generate a valid `TryingWindowInput`:
 *  - an ISO date that always round-trips (built from an epoch-day offset),
 *  - cycleLengthMin ≤ cycleLengthMax, both finite and non-negative.
 * This is exactly the input space the engine accepts, so every generated case
 * produces a defined output (no thrown errors).
 */
const validInputArb: fc.Arbitrary<TryingWindowInput> = fc
  .record({
    epochDay: fc.integer({ min: 0, max: 60000 }), // 1970-01-01 .. ~2134
    cycleLengthMin: fc.integer({ min: 14, max: 120 }),
    delta: fc.integer({ min: 0, max: 80 }),
    ovulationConfirmed: fc.boolean(),
  })
  .map(({ epochDay, cycleLengthMin, delta, ovulationConfirmed }) => ({
    lastPeriodStart: new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10),
    cycleLengthMin,
    cycleLengthMax: cycleLengthMin + delta,
    ovulationConfirmed,
  }));

/** Read the four displayed dates straight off the rendered window bar. */
function displayedDates(container: HTMLElement) {
  const bar = container.querySelector("[data-testid='cal-window-bar']");
  if (!bar) throw new Error("window bar not rendered");
  return {
    fertileWindowStart: bar.getAttribute("data-fertile-start"),
    fertileWindowEnd: bar.getAttribute("data-fertile-end"),
    minOvulation: bar.getAttribute("data-priority-start"),
    maxOvulation: bar.getAttribute("data-priority-end"),
  };
}

describe("Feature: mariposa, Property 25: Calendar dates equal engine output", () => {
  it("displays exactly the engine's window/priority dates, and matches the new output after the engine updates", () => {
    fc.assert(
      fc.property(validInputArb, validInputArb, (first, second) => {
        // Initial render: displayed dates equal the engine output for `first`.
        const { container, rerender } = render(<CalendarView cycle={first} />);
        const expectedFirst = computeTryingWindow(first);
        expect(displayedDates(container)).toEqual({
          fertileWindowStart: expectedFirst.fertileWindowStart,
          fertileWindowEnd: expectedFirst.fertileWindowEnd,
          minOvulation: expectedFirst.minOvulation,
          maxOvulation: expectedFirst.maxOvulation,
        });

        // Engine updates with a new input: displayed dates track the new output.
        rerender(<CalendarView cycle={second} />);
        const expectedSecond = computeTryingWindow(second);
        expect(displayedDates(container)).toEqual({
          fertileWindowStart: expectedSecond.fertileWindowStart,
          fertileWindowEnd: expectedSecond.fertileWindowEnd,
          minOvulation: expectedSecond.minOvulation,
          maxOvulation: expectedSecond.maxOvulation,
        });

        cleanup();
      }),
    );
  }, 30000);

  it("renders a month grid and husband prep reminders for the seed cycle", () => {
    const { container, getByText, getAllByText } = render(
      <CalendarView cycle={seedCycle} coupleId="couple_001" />,
    );
    expect(container.querySelector("[data-testid='cal-month-grid']")).toBeTruthy();
    expect(getByText(/His prep this cycle/i)).toBeInTheDocument();
    expect(getAllByText(/His lifestyle prep block begins/i).length).toBeGreaterThan(0);
  });
});

const seedCycle = {
  lastPeriodStart: "2026-06-01",
  cycleLengthMin: 26,
  cycleLengthMax: 35,
  ovulationConfirmed: false,
};
