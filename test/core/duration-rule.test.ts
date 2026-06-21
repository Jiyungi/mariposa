import { describe, it, expect } from "vitest";
import { fc, propertyConfig } from "@/test/property";
import { checkDurationRule } from "@/lib/core/duration-rule";
import { DURATION_RULE } from "@/lib/reference/duration-rule";

describe("checkDurationRule — unit examples", () => {
  it("uses the 12-month threshold for the seed couple (Maya, age 33)", () => {
    const result = checkDurationRule({
      femaleAge: 33,
      monthsTrying: 8,
      redFlags: ["irregular cycles", "borderline semen analysis"],
    });
    // Req 7.6: 12-month threshold (age < 35), early evaluation due to red flags.
    expect(result.thresholdMonths).toBe(12);
    expect(result.recommendEarlyEvaluation).toBe(true);
    expect(result.redFlags).toEqual([
      "irregular cycles",
      "borderline semen analysis",
    ]);
  });

  it("uses the 6-month threshold at exactly age 35", () => {
    const result = checkDurationRule({
      femaleAge: 35,
      monthsTrying: 0,
      redFlags: [],
    });
    expect(result.thresholdMonths).toBe(6);
  });

  it("recommends early evaluation once months trying meets the threshold", () => {
    const result = checkDurationRule({
      femaleAge: 30,
      monthsTrying: 12,
      redFlags: [],
    });
    expect(result.recommendEarlyEvaluation).toBe(true);
  });

  it("does not recommend early evaluation below threshold with no red flags", () => {
    const result = checkDurationRule({
      femaleAge: 30,
      monthsTrying: 5,
      redFlags: [],
    });
    expect(result.recommendEarlyEvaluation).toBe(false);
  });
});

describe("Feature: mariposa, Property 13: Duration threshold by age", () => {
  // Validates: Requirements 7.4
  it("threshold is 12 months iff age < 35, otherwise 6 months", () => {
    fc.assert(
      fc.property(
        // Cover a wide range of ages, including negatives and the boundary.
        fc.integer({ min: -10, max: 120 }),
        fc.integer({ min: 0, max: 240 }),
        fc.array(fc.string()),
        (femaleAge, monthsTrying, redFlags) => {
          const { thresholdMonths } = checkDurationRule({
            femaleAge,
            monthsTrying,
            redFlags,
          });
          if (femaleAge < DURATION_RULE.ageThreshold) {
            expect(thresholdMonths).toBe(DURATION_RULE.under35Months);
          } else {
            expect(thresholdMonths).toBe(DURATION_RULE.atLeast35Months);
          }
        },
      ),
      propertyConfig(),
    );
  });
});

describe("Feature: mariposa, Property 14: Red flags force early evaluation", () => {
  // Validates: Requirements 7.5
  it("any input with at least one red flag recommends early evaluation regardless of months trying or threshold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 120 }),
        fc.integer({ min: 0, max: 240 }),
        // At least one red flag.
        fc.array(fc.string(), { minLength: 1 }),
        (femaleAge, monthsTrying, redFlags) => {
          const result = checkDurationRule({
            femaleAge,
            monthsTrying,
            redFlags,
          });
          expect(result.recommendEarlyEvaluation).toBe(true);
        },
      ),
      propertyConfig(),
    );
  });
});
