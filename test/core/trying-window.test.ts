import { describe, expect, it } from "vitest";
import { fc, propertyConfig } from "@/test/property";
import {
  computeTryingWindow,
  TryingWindowInputError,
  type TryingWindowInput,
} from "@/lib/core/trying-window";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD string to a UTC epoch-ms value for date arithmetic in assertions. */
function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

/** Whole-day difference between two YYYY-MM-DD dates (b - a). */
function dayDiff(a: string, b: string): number {
  return Math.round((isoToUtcMs(b) - isoToUtcMs(a)) / MS_PER_DAY);
}

/**
 * fast-check arbitrary for a valid ISO date string (YYYY-MM-DD) within a sane
 * calendar range, generated via UTC epoch-day so it is always a real calendar date.
 */
const validIsoDate = fc
  .integer({
    // 2000-01-01 .. 2035-12-31 (in whole days since the unix epoch)
    min: Math.round(Date.parse("2000-01-01T00:00:00.000Z") / MS_PER_DAY),
    max: Math.round(Date.parse("2035-12-31T00:00:00.000Z") / MS_PER_DAY),
  })
  .map((days) => new Date(days * MS_PER_DAY).toISOString().slice(0, 10));

/** Arbitrary producing a valid female input with cycleLengthMin <= cycleLengthMax. */
const validInput = fc
  .record({
    lastPeriodStart: validIsoDate,
    a: fc.integer({ min: 0, max: 120 }),
    b: fc.integer({ min: 0, max: 120 }),
    ovulationConfirmed: fc.boolean(),
  })
  .map(({ lastPeriodStart, a, b, ovulationConfirmed }) => ({
    lastPeriodStart,
    cycleLengthMin: Math.min(a, b),
    cycleLengthMax: Math.max(a, b),
    ovulationConfirmed,
  }));

describe("computeTryingWindow", () => {
  it("Feature: mariposa, Property 1: trying-window algebraic relationships hold for any valid input", () => {
    // Validates: Requirements 3.1
    fc.assert(
      fc.property(validInput, (input) => {
        const out = computeTryingWindow(input);

        // minOvulation = lastPeriodStart + cycleLengthMin - 14
        expect(dayDiff(input.lastPeriodStart, out.minOvulation)).toBe(
          input.cycleLengthMin - 14,
        );
        // maxOvulation = lastPeriodStart + cycleLengthMax - 14
        expect(dayDiff(input.lastPeriodStart, out.maxOvulation)).toBe(
          input.cycleLengthMax - 14,
        );
        // fertileWindowStart = minOvulation - 5
        expect(dayDiff(out.minOvulation, out.fertileWindowStart)).toBe(-5);
        // fertileWindowEnd = maxOvulation + 1
        expect(dayDiff(out.maxOvulation, out.fertileWindowEnd)).toBe(1);
      }),
      propertyConfig(),
    );
  });

  it('Feature: mariposa, Property 2: confidence is exactly "Low" with the exact reasons when unconfirmed and range > 7', () => {
    // Validates: Requirements 3.4, 3.5
    const unconfirmedWideInput = fc
      .record({
        lastPeriodStart: validIsoDate,
        cycleLengthMin: fc.integer({ min: 0, max: 100 }),
        // ensure max - min > 7
        extra: fc.integer({ min: 8, max: 60 }),
      })
      .map(({ lastPeriodStart, cycleLengthMin, extra }) => ({
        lastPeriodStart,
        cycleLengthMin,
        cycleLengthMax: cycleLengthMin + extra,
        ovulationConfirmed: false,
      }));

    fc.assert(
      fc.property(unconfirmedWideInput, (input) => {
        const out = computeTryingWindow(input);
        expect(out.confidence).toBe("Low");
        expect(out.reasons).toEqual([
          "irregular cycle",
          "ovulation not confirmed",
          "wide cycle range",
        ]);
      }),
      propertyConfig(),
    );
  });

  it("Feature: mariposa, Property 3: output is identical regardless of any male data (male data is not even a parameter)", () => {
    // Validates: Requirements 3.6
    // Arbitrary male-shaped junk fields attached alongside a fixed female input.
    const maleNoise = fc.record({
      concentration_million_ml: fc.integer({ min: 0, max: 300 }),
      progressive_motility_pct: fc.integer({ min: 0, max: 100 }),
      morphology_normal_pct: fc.integer({ min: 0, max: 100 }),
      heat_exposure: fc.boolean(),
      stress: fc.constantFrom("low", "moderate", "high"),
      bmi: fc.integer({ min: 15, max: 45 }),
      readiness_score: fc.integer({ min: 0, max: 100 }),
    });

    fc.assert(
      fc.property(validInput, maleNoise, maleNoise, (female, maleA, maleB) => {
        // The function signature accepts only the female fields; the spread male
        // noise is structurally ignored and cannot reach the computation.
        const outA = computeTryingWindow({
          ...maleA,
          ...female,
        } as TryingWindowInput);
        const outB = computeTryingWindow({
          ...maleB,
          ...female,
        } as TryingWindowInput);
        const outBaseline = computeTryingWindow(female);

        expect(outA).toEqual(outBaseline);
        expect(outB).toEqual(outBaseline);
      }),
      propertyConfig(),
    );
  });

  it("Feature: mariposa, Property 4: throws TryingWindowInputError for missing/invalid required fields", () => {
    // Validates: Requirements 3.7
    // Generators for each invalid-input shape.
    const missingLastPeriod = fc.record({
      lastPeriodStart: fc.constantFrom("", "not-a-date", "2026-13-40", "06/01/2026"),
      cycleLengthMin: fc.integer({ min: 0, max: 60 }),
      cycleLengthMax: fc.integer({ min: 60, max: 120 }),
      ovulationConfirmed: fc.boolean(),
    });

    const negativeCycle = fc
      .record({
        lastPeriodStart: validIsoDate,
        neg: fc.integer({ min: -120, max: -1 }),
        other: fc.integer({ min: 0, max: 120 }),
        whichMin: fc.boolean(),
        ovulationConfirmed: fc.boolean(),
      })
      .map(({ lastPeriodStart, neg, other, whichMin, ovulationConfirmed }) => ({
        lastPeriodStart,
        cycleLengthMin: whichMin ? neg : other,
        cycleLengthMax: whichMin ? other : neg,
        ovulationConfirmed,
      }));

    const minGreaterThanMax = fc
      .record({
        lastPeriodStart: validIsoDate,
        cycleLengthMax: fc.integer({ min: 0, max: 60 }),
        extra: fc.integer({ min: 1, max: 60 }),
        ovulationConfirmed: fc.boolean(),
      })
      .map(({ lastPeriodStart, cycleLengthMax, extra, ovulationConfirmed }) => ({
        lastPeriodStart,
        cycleLengthMin: cycleLengthMax + extra,
        cycleLengthMax,
        ovulationConfirmed,
      }));

    const invalidInput = fc.oneof(
      missingLastPeriod,
      negativeCycle,
      minGreaterThanMax,
    );

    fc.assert(
      fc.property(invalidInput, (input) => {
        expect(() =>
          computeTryingWindow(input as TryingWindowInput),
        ).toThrow(TryingWindowInputError);
      }),
      propertyConfig(),
    );
  });

  it("Feature: mariposa, seed-couple worked example produces the exact reference dates and Low confidence", () => {
    // Requirements: 3.2, 3.3, 3.4 — seed couple Maya (sample-couple.md / cycle-fertility-reference.md)
    const seedInput: TryingWindowInput = {
      lastPeriodStart: "2026-06-01",
      cycleLengthMin: 45,
      cycleLengthMax: 60,
      ovulationConfirmed: false,
    };

    const out = computeTryingWindow(seedInput);

    // Estimated trying window: June 27 – July 18, 2026
    expect(out.fertileWindowStart).toBe("2026-06-27");
    expect(out.fertileWindowEnd).toBe("2026-07-18");
    // Priority days: July 2 – July 17, 2026
    expect(out.minOvulation).toBe("2026-07-02");
    expect(out.maxOvulation).toBe("2026-07-17");
    // Confidence Low with the three exact reasons
    expect(out.confidence).toBe("Low");
    expect(out.reasons).toEqual([
      "irregular cycle",
      "ovulation not confirmed",
      "wide cycle range",
    ]);
  });

  it("does not mutate its input", () => {
    const input: TryingWindowInput = {
      lastPeriodStart: "2026-06-01",
      cycleLengthMin: 45,
      cycleLengthMax: 60,
      ovulationConfirmed: false,
    };
    const snapshot = { ...input };
    computeTryingWindow(input);
    expect(input).toEqual(snapshot);
  });
});
