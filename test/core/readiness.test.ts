import { describe, it, expect } from "vitest";
import { fc, propertyConfig } from "@/test/property";
import {
  applyTaskCompletion,
  READINESS_MIN,
  READINESS_MAX,
} from "@/lib/core/readiness";

describe("applyTaskCompletion — unit examples", () => {
  it("increases the score by the task weight", () => {
    expect(applyTaskCompletion(62, 5)).toBe(67);
  });

  it("clamps the result at 100", () => {
    expect(applyTaskCompletion(98, 10)).toBe(100);
  });

  it("returns an integer when weight is fractional", () => {
    const result = applyTaskCompletion(62, 4.6);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(67);
  });

  it("never drops below the input score on a completion", () => {
    expect(applyTaskCompletion(50, 0)).toBe(50);
  });
});

describe("Feature: mariposa, Property 9: Readiness score stays an integer within [0, 100]", () => {
  // Validates: Requirements 1.4, 5.4
  it("for any starting score in [0,100] and any sequence of non-negative-weight completions, the result is an integer, never decreases on a completion, and stays within [0,100]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: READINESS_MIN, max: READINESS_MAX }),
        // A sequence of completions, each with an arbitrary non-negative weight.
        fc.array(fc.nat({ max: 1000 }), { minLength: 0, maxLength: 50 }),
        (startScore, weights) => {
          let score = startScore;
          for (const weight of weights) {
            const next = applyTaskCompletion(score, weight);

            // Integer.
            expect(Number.isInteger(next)).toBe(true);
            // Never decreases on a completion.
            expect(next).toBeGreaterThanOrEqual(score);
            // Stays within [0, 100] inclusive.
            expect(next).toBeGreaterThanOrEqual(READINESS_MIN);
            expect(next).toBeLessThanOrEqual(READINESS_MAX);

            score = next;
          }
        },
      ),
      propertyConfig(),
    );
  });
});
