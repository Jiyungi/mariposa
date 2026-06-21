import * as React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { fc, propertyConfig } from "../property";
import {
  reduceCompletion,
  initialCompletionState,
  IntakeCompletionGuard,
  REQUIRED_PARTS,
  type IntakePart,
  type IntakeUpdate,
} from "@/lib/intake/completion";
import { IntakeForm } from "@/components/mariposa/IntakeForm";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Property 12: Intake completion event fires exactly once
// ---------------------------------------------------------------------------

/** Arbitrary single intake update over the three parts. */
const updateArb: fc.Arbitrary<IntakeUpdate> = fc.record({
  part: fc.constantFrom<IntakePart>("her", "his", "together"),
  valid: fc.boolean(),
});

/** Arbitrary sequence of updates, valid/invalid/partial in any order. */
const sequenceArb: fc.Arbitrary<IntakeUpdate[]> = fc.array(updateArb, {
  maxLength: 40,
});

/**
 * Independent ground truth: the index of the FIRST update after which every
 * required part is simultaneously valid, or -1 if that never happens.
 */
function firstAllValidIndex(updates: IntakeUpdate[]): number {
  const valid: Record<IntakePart, boolean> = {
    her: false,
    his: false,
    together: false,
  };
  for (let i = 0; i < updates.length; i++) {
    valid[updates[i].part] = updates[i].valid;
    if (REQUIRED_PARTS.every((p) => valid[p])) return i;
  }
  return -1;
}

describe("Feature: mariposa, Property 12: Intake completion event fires exactly once", () => {
  // **Validates: Requirements 2.6**

  it("emits exactly once, only after all parts are complete and valid (never before, never twice)", () => {
    fc.assert(
      fc.property(sequenceArb, (updates) => {
        let state = initialCompletionState();
        const emitIndices: number[] = [];

        updates.forEach((update, i) => {
          const result = reduceCompletion(state, update);
          state = result.state;
          if (result.emit) emitIndices.push(i);
        });

        const expectedIndex = firstAllValidIndex(updates);

        // Never twice.
        expect(emitIndices.length).toBeLessThanOrEqual(1);

        if (expectedIndex === -1) {
          // Never all-valid → never emitted (never before).
          expect(emitIndices).toHaveLength(0);
          expect(state.emitted).toBe(false);
        } else {
          // Emitted exactly once, on the first all-valid update.
          expect(emitIndices).toEqual([expectedIndex]);
          expect(state.emitted).toBe(true);
        }
      }),
      propertyConfig(),
    );
  });

  it("the guard invokes its emitter at most once across any sequence", () => {
    fc.assert(
      fc.property(sequenceArb, (updates) => {
        const emit = vi.fn();
        const guard = new IntakeCompletionGuard(emit);
        for (const update of updates) guard.update(update);

        const expected = firstAllValidIndex(updates) === -1 ? 0 : 1;
        expect(emit).toHaveBeenCalledTimes(expected);
        expect(guard.hasEmitted).toBe(expected === 1);
      }),
      propertyConfig(),
    );
  });

  it("does not re-fire once latched, even after a part goes invalid and valid again", () => {
    const emit = vi.fn();
    const guard = new IntakeCompletionGuard(emit);
    guard.update({ part: "her", valid: true });
    guard.update({ part: "his", valid: true });
    guard.update({ part: "together", valid: true }); // fires here
    expect(emit).toHaveBeenCalledTimes(1);

    guard.update({ part: "her", valid: false });
    guard.update({ part: "her", valid: true }); // would be "all valid" again
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Render unit test: inline field+range error on an invalid entry (Req 2.8)
// ---------------------------------------------------------------------------

describe("IntakeForm — inline validation (Task 13.1, Req 2.8)", () => {
  it("rejects an out-of-range cycle length and shows a field+range error while retaining the prior value", () => {
    render(<IntakeForm />);

    // Her is the default active section; its cycle-length field is visible.
    const input = screen.getByLabelText("Average cycle length") as HTMLInputElement;
    expect(input.value).toBe("52"); // prefilled from the seed couple

    // Enter an out-of-range value (45–60 days) and commit on blur.
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.blur(input);

    // The error names the field and its expected range (Req 2.8).
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(
      "avg_cycle_length must be between 45 and 60 days",
    );

    // The invalid value is rejected; the prior value is retained.
    expect(input.value).toBe("52");
  });

  it("accepts an in-range cycle length with no error", () => {
    render(<IntakeForm />);
    const input = screen.getByLabelText("Average cycle length") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(input.value).toBe("50");
  });

  it("auto-populates intake fields from a Deepgram voice draft", () => {
    render(
      <IntakeForm
        voiceDraft={{
          her: {
            age: 34,
            months_trying: 10,
            cycle_regular: true,
            avg_cycle_length: 50,
          },
          his: { semen_analysis_status: "in_progress" },
          together: {
            goal: "Complete fertility testing",
            top_concern: "Insurance and cost clarity",
            insurance_provider: "Pacific Crest Health",
          },
        }}
      />,
    );

    expect(screen.getAllByLabelText("Age")[0]).toHaveValue(34);
    expect(screen.getByLabelText("Months trying")).toHaveValue(10);
    expect(screen.getByLabelText("Average cycle length")).toHaveValue(50);
    expect(screen.getByLabelText("Cycle is regular")).toBeChecked();

    fireEvent.click(screen.getByRole("tab", { name: /His/i }));
    expect(screen.getByLabelText("Analysis status")).toHaveValue("in_progress");

    fireEvent.click(screen.getByRole("tab", { name: /Together/i }));
    expect(screen.getByLabelText("Goal")).toHaveValue("Complete fertility testing");
    expect(screen.getByLabelText("Top concern")).toHaveValue(
      "Insurance and cost clarity",
    );
    expect(screen.getByLabelText("Provider")).toHaveValue("Pacific Crest Health");
  });
});
