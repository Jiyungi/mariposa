// ===========================================================================
// Seed_Couple "Maya & Daniel" fixture (couple_001) — the only couple in the app.
// SOURCE (verbatim): reference-data/sample-couple.md
// Seed couple profile values. `null` represents a MISSING clinical
// value so the detector / UI can flag it.
// SINGLE SOURCE OF TRUTH — no seed clinical literal lives elsewhere.
// ===========================================================================

import type {
  AuthPacket,
  Couple,
  HerProfile,
  HimProfile,
  Member,
} from "@/lib/types";

// --- Couple (Together data) — sample-couple.md "## Couple" ------------------
export const SEED_COUPLE: Couple = {
  id: "couple_001",
  display_name: "Maya & Daniel",
  trying_since_months: 8,
  goal: "Understand our timing, get the right tests, and enter care prepared",
  top_concern: "We're not sure if we're missing tests or wasting time",
  insurance_provider: "Pacific Crest Health", // fictional
  plan_type: "PPO",
  member_id: "PCH-0000-1234", // fake placeholder
  group_number: "GRP-558823", // fake placeholder
  policy_holder: "him",
  coverage_status: "partial_unconfirmed",
};

// --- Members — sample-couple.md "member:" blocks ----------------------------
export const SEED_MEMBER_HER: Member = {
  id: "member_her_001",
  couple_id: "couple_001",
  role: "her",
  name: "Maya",
  age: 33,
  dob: "1992-09-14", // fictional
};

export const SEED_MEMBER_HIM: Member = {
  id: "member_him_001",
  couple_id: "couple_001",
  role: "him",
  name: "Daniel",
  age: 35,
  dob: "1990-11-02", // fictional
};

export const SEED_MEMBERS: Member[] = [SEED_MEMBER_HER, SEED_MEMBER_HIM];

// --- Her profile "Maya" — sample-couple.md "her_profile:" -------------------
export const SEED_HER_PROFILE: HerProfile = {
  couple_id: "couple_001",
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
  amh: 1.6, // ng/mL, normal
  tsh: 2.1, // normal
  day3_fsh: null, // MISSING
  day3_estradiol: null, // MISSING
  mid_luteal_progesterone: null, // MISSING - can't confirm ovulation
  prolactin: null, // MISSING
};

// --- His profile "Daniel" — sample-couple.md "him_profile:" -----------------
export const SEED_HIM_PROFILE: HimProfile = {
  couple_id: "couple_001",
  semen_analysis_status: "completed",
  semen_analysis_date: "2026-05-20",
  volume_ml: 2.1,
  concentration_million_ml: 14, // below WHO 16 -> flag
  total_count_million: 29, // below WHO 39 -> flag
  progressive_motility_pct: 28, // below WHO 30 -> flag
  total_motility_pct: 44, // normal
  morphology_normal_pct: 3, // below WHO 4 -> flag
  vitality_pct: 60, // normal
  ph: 7.4,
  lifestyle: {
    smoking: false,
    alcohol: "moderate",
    heat_exposure: true, // frequent sauna -> flag
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
  readiness_score: 62, // out of 100, improves as tasks complete
};

// --- Convenience aggregate fixture ------------------------------------------
export interface SeedCoupleFixture {
  couple: Couple;
  members: Member[];
  herProfile: HerProfile;
  himProfile: HimProfile;
}

export const SEED_COUPLE_FIXTURE: SeedCoupleFixture = {
  couple: SEED_COUPLE,
  members: SEED_MEMBERS,
  herProfile: SEED_HER_PROFILE,
  himProfile: SEED_HIM_PROFILE,
};

// --- Authorization packet for the Voice_Agent (policy holder = him) ---------
// Derived from sample-couple.md insurance block + call-scripts.md packet.
export const SEED_AUTH_PACKET: AuthPacket = {
  couple_id: "couple_001",
  member_id: "PCH-0000-1234",
  dob: "1990-11-02", // policy holder (Daniel) dob
  provider: "Pacific Crest Health",
  plan_type: "PPO",
  group_number: "GRP-558823",
  policy_holder: "him",
};

// --- Derived outputs the app should produce — sample-couple.md --------------
// Encoded for traceability/grounding (computed for real by lib/core/*).
export const SEED_DERIVED = {
  tryingWindow: {
    fertileWindowStart: "2026-06-27", // June 27
    fertileWindowEnd: "2026-07-18", // July 18, 2026
    minOvulation: "2026-07-02", // priority July 2
    maxOvulation: "2026-07-17", // July 17, 2026
    confidence: "Low",
    reasons: ["irregular cycle", "ovulation not confirmed", "wide cycle range"],
  },
  durationRule: {
    thresholdMonths: 12, // Maya is 33 (< 35) -> 12-month threshold
    monthsTrying: 8,
    recommendEarlyEvaluation: true, // red flags: irregular cycles + borderline semen analysis
  },
} as const;
