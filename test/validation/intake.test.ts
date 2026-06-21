import { describe, it, expect } from "vitest";
import { fc, propertyConfig } from "@/test/property";
import {
  validateHerIntake,
  validateHisIntake,
  validateTogetherIntake,
  validateIntake,
  rangeErrorMessage,
  CLINICAL_FIELD_RANGES,
} from "@/lib/validation/intake";
import type { ClinicalFieldRange } from "@/lib/reference/intake-ranges";

// ---------------------------------------------------------------------------
// Valid base fixtures — the seed couple "Maya & Daniel" (sample-couple.md).
// Field names and values mirror the reference file exactly.
// ---------------------------------------------------------------------------

const validHer = {
  age: 33,
  last_period_start: "2026-06-01",
  avg_cycle_length: 52, // range 45-60
  cycle_length_min: 45,
  cycle_length_max: 60,
  cycle_regular: false,
  months_trying: 8,
  conditions: ["suspected PCOS (not confirmed)"],
  prior_meds: ["letrozole 2.5 mg (2026-03, 1 cycle)"],
  ovulation_tracking: "app only, no LH/progesterone confirmation",
  prior_pregnancies: 0,
  labs: {
    amh: 1.6,
    tsh: 2.1,
    day3_fsh: null,
    day3_estradiol: null,
    mid_luteal_progesterone: null,
    prolactin: null,
  },
};

const validHis = {
  age: 35,
  semen_analysis_status: "completed" as const,
  semen_analysis_date: "2026-05-20",
  semen_results: {
    volume_ml: 2.1,
    concentration_million_ml: 14, // below WHO 16 — accepted, flagged downstream
    total_count_million: 29, // below WHO 39 — accepted, flagged downstream
    progressive_motility_pct: 28, // below WHO 30 — accepted, flagged downstream
    total_motility_pct: 44,
    morphology_normal_pct: 3, // below WHO 4 — accepted, flagged downstream
    vitality_pct: 60,
    ph: 7.4,
  },
  lifestyle: {
    smoking: false,
    alcohol: "moderate",
    heat_exposure: true,
    sleep: "ok",
    stress: "high",
    bmi: 27,
    supplements: false,
  },
  medical_history: {
    surgeries: "none",
    varicocele: "unknown",
    medications: "none",
    prior_children: 0,
  },
  readiness_score: 62,
};

const validTogether = {
  goal: "Understand our timing, get the right tests, and enter care prepared",
  top_concern: "We're not sure if we're missing tests or wasting time",
  trying_since_months: 8,
  insurance: {
    provider: "Pacific Crest Health",
    plan_type: "PPO",
    member_id: "PCH-0000-1234",
    group_number: "GRP-558823",
    policy_holder: "him" as const,
    coverage_status: "partial_unconfirmed" as const,
  },
};

// ---------------------------------------------------------------------------
// Unit examples
// ---------------------------------------------------------------------------

describe("intake validation — unit examples", () => {
  it("accepts a valid Maya/Daniel/Together intake (Req 2.2)", () => {
    const result = validateIntake({
      her: validHer,
      his: validHis,
      together: validTogether,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-range cycle length with a field+range message (Req 2.8)", () => {
    const result = validateHerIntake({ ...validHer, avg_cycle_length: 30 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.errors.find((e) => e.field === "avg_cycle_length");
    expect(issue).toBeDefined();
    expect(issue!.message).toBe("avg_cycle_length must be between 45 and 60 days");
    expect(issue!.message).toContain("avg_cycle_length");
    expect(issue!.message).toContain("45");
    expect(issue!.message).toContain("60");
  });

  it("accepts below-WHO semen values (seed couple) — WHO limits flag, not reject (Req 4.5, 11.3)", () => {
    // Daniel's concentration 14 < WHO 16 must still be accepted by intake.
    const result = validateHisIntake(validHis);
    expect(result.success).toBe(true);
  });

  it("rejects an impossible percentage (>100) with a field+range message (Req 2.8)", () => {
    const result = validateHisIntake({
      ...validHis,
      semen_results: { ...validHis.semen_results, progressive_motility_pct: 140 },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.errors.find(
      (e) => e.field === "semen_results.progressive_motility_pct",
    );
    expect(issue).toBeDefined();
    expect(issue!.message).toBe(
      "progressive_motility_pct must be between 0 and 100 %",
    );
  });

  it("rejects an invalid coverage_status enum (Req 2.4)", () => {
    const result = validateTogetherIntake({
      ...validTogether,
      insurance: { ...validTogether.insurance, coverage_status: "maybe" },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.field === "insurance.coverage_status")).toBe(
      true,
    );
  });

  it("rejects an invalid policy_holder enum (Req 2.4)", () => {
    const result = validateTogetherIntake({
      ...validTogether,
      insurance: { ...validTogether.insurance, policy_holder: "both" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid semen_analysis_status enum (Req 2.3)", () => {
    const result = validateHisIntake({
      ...validHis,
      semen_analysis_status: "done",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 11: Intake validation rejects out-of-range values
// ---------------------------------------------------------------------------

/** Clone a base partner object and override one (possibly nested) field. */
function cloneWithOverride(
  base: Record<string, unknown>,
  path: string[],
  value: number,
): Record<string, unknown> {
  const copy = structuredClone(base);
  let node: Record<string, unknown> = copy;
  for (let i = 0; i < path.length - 1; i++) {
    node = node[path[i]] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
  return copy;
}

/** An arbitrary that produces in-range values for a clinical field. */
function inRangeArb(r: ClinicalFieldRange): fc.Arbitrary<number> {
  if (r.integer) {
    return fc.integer({ min: r.min, max: r.max ?? r.min + 1000 });
  }
  return fc.double({
    min: r.min,
    max: r.max ?? 1e6,
    noNaN: true,
    noDefaultInfinity: true,
  });
}

/** An arbitrary that produces out-of-range values for a clinical field. */
function outOfRangeArb(r: ClinicalFieldRange): fc.Arbitrary<number> {
  const below = r.integer
    ? fc.integer({ min: r.min - 1000, max: r.min - 1 })
    : fc
        .double({
          min: r.min - 1000,
          max: r.min,
          maxExcluded: true,
          noNaN: true,
          noDefaultInfinity: true,
        })
        // Exclude -0, which equals the inclusive minimum (0) and is in range.
        .filter((v) => v < r.min);
  if (r.max === undefined) return below;
  const max = r.max;
  const above = r.integer
    ? fc.integer({ min: max + 1, max: max + 1000 })
    : fc.double({
        min: max,
        max: max + 1000,
        minExcluded: true,
        noNaN: true,
        noDefaultInfinity: true,
      });
  return fc.oneof(below, above);
}

function validatorFor(partner: "her" | "his") {
  return partner === "her" ? validateHerIntake : validateHisIntake;
}

function baseFor(partner: "her" | "his"): Record<string, unknown> {
  return partner === "her" ? validHer : validHis;
}

describe("Feature: mariposa, Property 11: Intake validation rejects out-of-range values", () => {
  // Validates: Requirements 2.7, 2.8

  for (const r of CLINICAL_FIELD_RANGES) {
    const dotted = r.path.join(".");
    const expectedMessage = rangeErrorMessage(r.field, r);

    it(`rejects out-of-range ${dotted} with a message naming the field and its range`, () => {
      fc.assert(
        fc.property(outOfRangeArb(r), (value) => {
          const input = cloneWithOverride(baseFor(r.partner), r.path, value);
          const result = validatorFor(r.partner)(input);
          expect(result.success).toBe(false);
          if (result.success) return;
          const issue = result.errors.find((e) => e.field === dotted);
          expect(issue).toBeDefined();
          // Error names the field and its expected range (Req 2.8).
          expect(issue!.message).toBe(expectedMessage);
          expect(issue!.message).toContain(r.field);
          expect(issue!.message).toContain(String(r.min));
          if (r.max !== undefined) {
            expect(issue!.message).toContain(String(r.max));
          }
        }),
        propertyConfig(),
      );
    });

    it(`accepts in-range ${dotted}`, () => {
      fc.assert(
        fc.property(inRangeArb(r), (value) => {
          const input = cloneWithOverride(baseFor(r.partner), r.path, value);
          const result = validatorFor(r.partner)(input);
          expect(result.success).toBe(true);
        }),
        propertyConfig(),
      );
    });
  }
});
