import { describe, it, expect } from "vitest";
import {
  buildSeedCouple,
  SeedLoadError,
  SEED_COUPLE_ID,
  SEED_SOURCE,
  type SeedSource,
} from "@/lib/db/seed";
import type { CoupleWorkspace } from "@/lib/db/types";

/**
 * Smoke test for seed population (Req 11.1, 11.2).
 *
 * Asserts the seed builder populates `couple_001` with all eight entity shapes
 * and the exact Maya & Daniel values from `sample-couple.md`, and that a
 * missing/unparseable seed throws a load error and returns no partial object
 * (Req 1.6, 1.7).
 */

describe("seed: buildSeedCouple", () => {
  const ws: CoupleWorkspace = buildSeedCouple();

  it("populates all eight entity shapes for couple_001", () => {
    // The eight design entities are all present on the workspace aggregate.
    expect(Object.keys(ws).sort()).toEqual(
      [
        "calendarEvents",
        "callRecords",
        "couple",
        "herProfile",
        "himProfile",
        "members",
        "tasks",
        "tryingWindows",
      ].sort(),
    );

    expect(ws.couple.id).toBe(SEED_COUPLE_ID);
    expect(ws.members).toHaveLength(2);
    expect(ws.herProfile.couple_id).toBe(SEED_COUPLE_ID);
    expect(ws.himProfile.couple_id).toBe(SEED_COUPLE_ID);
    expect(ws.tryingWindows).toHaveLength(1);
    // Downstream entities start empty (filled by the agent/workflow).
    expect(Array.isArray(ws.tasks)).toBe(true);
    expect(Array.isArray(ws.calendarEvents)).toBe(true);
    expect(Array.isArray(ws.callRecords)).toBe(true);
  });

  it("seeds the exact couple + insurance values", () => {
    expect(ws.couple).toMatchObject({
      id: "couple_001",
      display_name: "Maya & Daniel",
      trying_since_months: 8,
      goal: "Understand our timing, get the right tests, and enter care prepared",
      top_concern: "We're not sure if we're missing tests or wasting time",
      insurance_provider: "Pacific Crest Health",
      plan_type: "PPO",
      member_id: "PCH-0000-1234",
      group_number: "GRP-558823",
      policy_holder: "him",
      coverage_status: "partial_unconfirmed",
    });
  });

  it("seeds Maya's profile with exact values and MISSING (null) labs", () => {
    const maya = ws.members.find((m) => m.role === "her");
    expect(maya).toMatchObject({ name: "Maya", age: 33, dob: "1992-09-14" });

    expect(ws.herProfile).toMatchObject({
      last_period_start: "2026-06-01",
      avg_cycle_length: 52,
      cycle_length_min: 45,
      cycle_length_max: 60,
      cycle_regular: false,
      months_trying: 8,
      conditions: ["suspected PCOS (not confirmed)"],
      prior_meds: ["letrozole 2.5 mg (2026-03, 1 cycle)"],
      ovulation_tracking: "app only, no LH/progesterone confirmation",
      prior_pregnancies: 0,
      amh: 1.6,
      tsh: 2.1,
    });

    // MISSING labs are stored as null, never substituted (Req 1.8).
    expect(ws.herProfile.day3_fsh).toBeNull();
    expect(ws.herProfile.day3_estradiol).toBeNull();
    expect(ws.herProfile.mid_luteal_progesterone).toBeNull();
    expect(ws.herProfile.prolactin).toBeNull();
  });

  it("seeds Daniel's profile with exact semen, lifestyle, and readiness values", () => {
    const daniel = ws.members.find((m) => m.role === "him");
    expect(daniel).toMatchObject({ name: "Daniel", age: 35, dob: "1990-11-02" });

    expect(ws.himProfile).toMatchObject({
      semen_analysis_status: "completed",
      semen_analysis_date: "2026-05-20",
      volume_ml: 2.1,
      concentration_million_ml: 14,
      total_count_million: 29,
      progressive_motility_pct: 28,
      total_motility_pct: 44,
      morphology_normal_pct: 3,
      vitality_pct: 60,
      ph: 7.4,
      readiness_score: 62,
    });

    expect(ws.himProfile.lifestyle).toMatchObject({
      smoking: false,
      alcohol: "moderate",
      heat_exposure: true,
      sleep: "ok",
      stress: "high",
      bmi: 27,
      supplements: false,
    });
  });

  it("seeds the derived trying window verbatim (Jun 27 – Jul 18; priority Jul 2 – Jul 17; Low)", () => {
    expect(ws.tryingWindows[0]).toMatchObject({
      couple_id: "couple_001",
      fertile_window_start: "2026-06-27",
      fertile_window_end: "2026-07-18",
      min_ovulation: "2026-07-02",
      max_ovulation: "2026-07-17",
      confidence: "Low",
      reasons: ["irregular cycle", "ovulation not confirmed", "wide cycle range"],
    });
  });
});

describe("seed: buildSeedCouple rejects missing/unparseable input (Req 1.6, 1.7)", () => {
  function clone(): SeedSource {
    return JSON.parse(JSON.stringify(SEED_SOURCE)) as SeedSource;
  }

  it("throws SeedLoadError when a required field is missing", () => {
    const bad = clone();
    // @ts-expect-error intentionally remove a required field
    delete bad.her.last_period_start;
    expect(() => buildSeedCouple(bad)).toThrow(SeedLoadError);
  });

  it("throws SeedLoadError when a field is unparseable (wrong type)", () => {
    const bad = clone();
    // @ts-expect-error intentionally corrupt a numeric field
    bad.him.readiness_score = "sixty-two";
    expect(() => buildSeedCouple(bad)).toThrow(SeedLoadError);
  });

  it("does not return a partial object on failure", () => {
    const bad = clone();
    // @ts-expect-error corrupt the insurance block
    bad.couple.insurance = null;
    let result: unknown = "unset";
    try {
      result = buildSeedCouple(bad);
    } catch {
      result = "threw";
    }
    expect(result).toBe("threw");
  });

  it("accepts a valid null MISSING lab value without throwing", () => {
    const ok = clone();
    ok.her.labs.day3_fsh = null;
    expect(() => buildSeedCouple(ok)).not.toThrow();
  });
});
