import { describe, it, expect } from "vitest";
import { fc, propertyConfig } from "../property";
import {
  detectMissingData,
  type MissingDataInput,
  type DataFlag,
} from "@/lib/core/missing-data";
import { WHO_2021, type Who2021Key } from "@/lib/reference/who-2021";

const SEMEN_KEYS = Object.keys(WHO_2021) as Who2021Key[];
const FEMALE_LAB_IDS = [
  "day3_fsh",
  "day3_estradiol",
  "mid_luteal_progesterone",
  "prolactin",
] as const;

/** Nullable lab value: a non-negative number or null (MISSING). */
const nullableLab = (): fc.Arbitrary<number | null> =>
  fc.option(fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }), {
    nil: null,
  });

/** Semen record keyed exactly as the WHO 2021 limits; values straddle the limits. */
const semenArb = (): fc.Arbitrary<Record<Who2021Key, number | null>> =>
  fc.record(
    SEMEN_KEYS.reduce(
      (acc, key) => {
        acc[key] = nullableLab();
        return acc;
      },
      {} as Record<Who2021Key, fc.Arbitrary<number | null>>,
    ),
  );

/** Coverage status: "confirmed" plus a variety of non-confirmed strings. */
const coverageArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant("confirmed"),
    fc.constantFrom("partial_unconfirmed", "unconfirmed", "pending", "", "Confirmed"),
    fc.string(),
  );

const inputArb = (): fc.Arbitrary<MissingDataInput> =>
  fc.record({
    day3_fsh: nullableLab(),
    day3_estradiol: nullableLab(),
    mid_luteal_progesterone: nullableLab(),
    prolactin: nullableLab(),
    semen: semenArb(),
    coverage_status: coverageArb(),
  });

const findById = (flags: DataFlag[], id: string): DataFlag | undefined =>
  flags.find((f) => f.id === id);

describe("detectMissingData", () => {
  it("Feature: mariposa, Property 5: missing labs are flagged with grounded explanations", () => {
    // Validates: Requirements 4.2, 4.3, 4.4
    fc.assert(
      fc.property(inputArb(), (input) => {
        const flags = detectMissingData(input);
        for (const id of FEMALE_LAB_IDS) {
          const flag = findById(flags, id);
          if (input[id] === null) {
            expect(flag).toBeDefined();
            expect(flag!.kind).toBe("missing");
            expect(flag!.explanation.trim().length).toBeGreaterThan(0);
          } else {
            expect(flag).toBeUndefined();
          }
        }
      }),
      propertyConfig(),
    );
  });

  it("Feature: mariposa, Property 6: semen parameters flagged borderline iff below WHO 2021 limit", () => {
    // Validates: Requirements 4.5
    fc.assert(
      fc.property(inputArb(), (input) => {
        const flags = detectMissingData(input);
        for (const key of SEMEN_KEYS) {
          const value = input.semen[key];
          const flag = findById(flags, key);
          const expectedBorderline = value !== null && value < WHO_2021[key];
          if (expectedBorderline) {
            expect(flag).toBeDefined();
            expect(flag!.kind).toBe("borderline");
            expect(flag!.explanation.trim().length).toBeGreaterThan(0);
            // Grounded recommendation per semen-analysis-reference.md.
            expect(flag!.explanation).toContain("2–7 days");
          } else {
            expect(flag).toBeUndefined();
          }
        }
      }),
      propertyConfig(),
    );
  });

  it("Feature: mariposa, Property 7: insurance flagged unverified iff coverage_status is not confirmed", () => {
    // Validates: Requirements 4.6
    fc.assert(
      fc.property(inputArb(), (input) => {
        const flags = detectMissingData(input);
        const flag = findById(flags, "insurance_coverage");
        if (input.coverage_status !== "confirmed") {
          expect(flag).toBeDefined();
          expect(flag!.kind).toBe("unverified");
          expect(flag!.explanation.trim().length).toBeGreaterThan(0);
        } else {
          expect(flag).toBeUndefined();
        }
      }),
      propertyConfig(),
    );
  });

  it("Feature: mariposa, Property 8: checklist completeness — exactly the produced flags, each once, none spurious", () => {
    // Validates: Requirements 4.1, 4.7
    fc.assert(
      fc.property(inputArb(), (input) => {
        const flags = detectMissingData(input);

        // Every flag has a non-empty explanation and a source.
        for (const flag of flags) {
          expect(flag.explanation.trim().length).toBeGreaterThan(0);
          expect(flag.source.trim().length).toBeGreaterThan(0);
        }

        // Each flagged item appears exactly once (unique ids).
        const ids = flags.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);

        // Reconstruct the exact set of ids that SHOULD be flagged from the rules.
        const expected = new Set<string>();
        for (const id of FEMALE_LAB_IDS) {
          if (input[id] === null) expected.add(id);
        }
        for (const key of SEMEN_KEYS) {
          const value = input.semen[key];
          if (value !== null && value < WHO_2021[key]) expected.add(key);
        }
        if (input.coverage_status !== "confirmed") expected.add("insurance_coverage");

        // No spurious flags, and no expected flag is missing.
        expect(new Set(ids)).toEqual(expected);
      }),
      propertyConfig(),
    );
  });

  it("flags the seed couple's missing labs, borderline semen, and unverified coverage", () => {
    // Grounded example from female-hormone-reference.md, semen-analysis-reference.md,
    // and insurance-coverage-data.md (sample seed couple "Maya & Daniel").
    const seed: MissingDataInput = {
      day3_fsh: null,
      day3_estradiol: null,
      mid_luteal_progesterone: null,
      prolactin: null,
      semen: {
        semenVolumeMl: 2.1,
        concentrationMillionMl: 14, // below 16
        totalSpermMillion: 29, // below 39
        totalMotilityPct: 44,
        progressiveMotilityPct: 28, // below 30
        vitalityPct: 60,
        normalMorphologyPct: 3, // below 4
        phMin: 7.4,
      },
      coverage_status: "partial_unconfirmed",
    };

    const flags = detectMissingData(seed);
    const byId = Object.fromEntries(flags.map((f) => [f.id, f]));

    // Four missing female labs.
    for (const id of FEMALE_LAB_IDS) {
      expect(byId[id]?.kind).toBe("missing");
    }
    // Four borderline semen parameters.
    expect(byId["concentrationMillionMl"]?.kind).toBe("borderline");
    expect(byId["totalSpermMillion"]?.kind).toBe("borderline");
    expect(byId["progressiveMotilityPct"]?.kind).toBe("borderline");
    expect(byId["normalMorphologyPct"]?.kind).toBe("borderline");
    // Normal semen parameters are not flagged.
    expect(byId["semenVolumeMl"]).toBeUndefined();
    expect(byId["totalMotilityPct"]).toBeUndefined();
    expect(byId["vitalityPct"]).toBeUndefined();
    expect(byId["phMin"]).toBeUndefined();
    // Unverified insurance.
    expect(byId["insurance_coverage"]?.kind).toBe("unverified");

    expect(flags).toHaveLength(9);
  });

  it("produces no flags when all data is present and within range and coverage is confirmed", () => {
    const complete: MissingDataInput = {
      day3_fsh: 8,
      day3_estradiol: 40,
      mid_luteal_progesterone: 12,
      prolactin: 15,
      semen: {
        semenVolumeMl: 2.1,
        concentrationMillionMl: 20,
        totalSpermMillion: 50,
        totalMotilityPct: 50,
        progressiveMotilityPct: 35,
        vitalityPct: 60,
        normalMorphologyPct: 5,
        phMin: 7.4,
      },
      coverage_status: "confirmed",
    };
    expect(detectMissingData(complete)).toEqual([]);
  });

  it("treats a semen value exactly at the WHO limit as within range (not borderline)", () => {
    const atLimit: MissingDataInput = {
      day3_fsh: 8,
      day3_estradiol: 40,
      mid_luteal_progesterone: 12,
      prolactin: 15,
      semen: {
        semenVolumeMl: WHO_2021.semenVolumeMl,
        concentrationMillionMl: WHO_2021.concentrationMillionMl,
        totalSpermMillion: WHO_2021.totalSpermMillion,
        totalMotilityPct: WHO_2021.totalMotilityPct,
        progressiveMotilityPct: WHO_2021.progressiveMotilityPct,
        vitalityPct: WHO_2021.vitalityPct,
        normalMorphologyPct: WHO_2021.normalMorphologyPct,
        phMin: WHO_2021.phMin,
      },
      coverage_status: "confirmed",
    };
    expect(detectMissingData(atLimit)).toEqual([]);
  });
});
