/**
 * Seed loader for the single Seed_Couple "Maya & Daniel" (Req 11.2, 11.3, 1.6).
 *
 * Every value here is sourced verbatim from
 * `/reference-data/sample-couple.md`. Nothing clinical is invented (Req 12).
 * `null` is stored for every value marked MISSING in the reference file so the
 * Missing-Data detector and the UI flag it (Req 1.8).
 *
 * The fixture is produced by a pure in-memory builder (`buildSeedCouple`) that
 * validates its raw source and throws `SeedLoadError` on any missing or
 * unparseable field, returning NO partial object (Req 1.6, 1.7). The DB-writing
 * loader (`loadSeedCouple`) builds the fixture and upserts it. Splitting the two
 * lets the builder be unit-tested without a live database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertCoupleWorkspace } from "@/lib/db/queries";
import type {
  CoupleWorkspace,
  CoverageStatus,
  HimLifestyle,
  HimMedicalHistory,
  PolicyHolder,
  SemenAnalysisStatus,
  Confidence,
} from "@/lib/db/types";

/** The seed couple's stable identifier. */
export const SEED_COUPLE_ID = "couple_001";

// Stable UUIDs so re-seeding is idempotent and tests are deterministic.
const MAYA_MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const DANIEL_MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const SEED_TRYING_WINDOW_ID = "33333333-3333-4333-8333-333333333333";

/** Error thrown when the seed source is missing or cannot be parsed (Req 1.7). */
export class SeedLoadError extends Error {
  /** Name of the offending field, when a single field is at fault. */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "SeedLoadError";
    this.field = field;
    Object.setPrototypeOf(this, SeedLoadError.prototype);
  }
}

/**
 * Raw seed source — a faithful, machine-shaped transcription of the YAML blocks
 * in `sample-couple.md`. `null` marks MISSING values exactly as the reference
 * file does. This is the input `buildSeedCouple` validates and parses.
 */
export interface SeedSource {
  couple: {
    id: string;
    display_name: string;
    trying_since_months: number;
    goal: string;
    top_concern: string;
    insurance: {
      provider: string;
      plan_type: string;
      member_id: string;
      group_number: string;
      policy_holder: PolicyHolder;
      coverage_status: CoverageStatus;
    };
  };
  her: {
    name: string;
    age: number;
    dob: string;
    last_period_start: string;
    avg_cycle_length: number;
    cycle_length_min: number;
    cycle_length_max: number;
    cycle_regular: boolean;
    months_trying: number;
    conditions: string[];
    prior_meds: string[];
    ovulation_tracking: string;
    prior_pregnancies: number;
    labs: {
      amh: number | null;
      tsh: number | null;
      day3_fsh: number | null;
      day3_estradiol: number | null;
      mid_luteal_progesterone: number | null;
      prolactin: number | null;
    };
  };
  him: {
    name: string;
    age: number;
    dob: string;
    semen_analysis_status: SemenAnalysisStatus;
    semen_analysis_date: string;
    semen_results: {
      volume_ml: number | null;
      concentration_million_ml: number | null;
      total_count_million: number | null;
      progressive_motility_pct: number | null;
      total_motility_pct: number | null;
      morphology_normal_pct: number | null;
      vitality_pct: number | null;
      ph: number | null;
    };
    lifestyle: HimLifestyle;
    medical_history: HimMedicalHistory;
    readiness_score: number;
  };
  /** Derived trying window, transcribed verbatim from the reference file. */
  trying_window: {
    fertile_window_start: string;
    fertile_window_end: string;
    min_ovulation: string;
    max_ovulation: string;
    confidence: Confidence;
    reasons: string[];
  };
}

/**
 * The canonical seed source for Maya & Daniel, transcribed verbatim from
 * `sample-couple.md` (Couple, Her profile, His profile, and the derived
 * trying-window outputs). `null` === MISSING.
 */
export const SEED_SOURCE: SeedSource = {
  couple: {
    id: SEED_COUPLE_ID,
    display_name: "Maya & Daniel",
    trying_since_months: 8,
    goal: "Understand our timing, get the right tests, and enter care prepared",
    top_concern: "We're not sure if we're missing tests or wasting time",
    insurance: {
      provider: "Pacific Crest Health",
      plan_type: "PPO",
      member_id: "PCH-0000-1234",
      group_number: "GRP-558823",
      policy_holder: "him",
      coverage_status: "partial_unconfirmed",
    },
  },
  her: {
    name: "Maya",
    age: 33,
    dob: "1992-09-14",
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
    labs: {
      amh: 1.6,
      tsh: 2.1,
      day3_fsh: null, // MISSING
      day3_estradiol: null, // MISSING
      mid_luteal_progesterone: null, // MISSING — can't confirm ovulation
      prolactin: null, // MISSING
    },
  },
  him: {
    name: "Daniel",
    age: 35,
    dob: "1990-11-02",
    semen_analysis_status: "completed",
    semen_analysis_date: "2026-05-20",
    semen_results: {
      volume_ml: 2.1,
      concentration_million_ml: 14, // below WHO 16 -> flag
      total_count_million: 29, // below WHO 39 -> flag
      progressive_motility_pct: 28, // below WHO 30 -> flag
      total_motility_pct: 44, // normal
      morphology_normal_pct: 3, // below WHO 4 -> flag
      vitality_pct: 60, // normal
      ph: 7.4,
    },
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
    readiness_score: 62, // out of 100
  },
  trying_window: {
    // sample-couple.md "Derived outputs": June 27 – July 18, 2026;
    // priority July 2 – July 17, 2026; confidence Low.
    fertile_window_start: "2026-06-27",
    fertile_window_end: "2026-07-18",
    min_ovulation: "2026-07-02",
    max_ovulation: "2026-07-17",
    confidence: "Low",
    reasons: ["irregular cycle", "ovulation not confirmed", "wide cycle range"],
  },
};

// ---------------------------------------------------------------------------
// Validation helpers — throw SeedLoadError on missing/unparseable input.
// ---------------------------------------------------------------------------

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SeedLoadError(`seed field "${field}" is missing or not an object`, field);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SeedLoadError(`seed field "${field}" is missing or not a string`, field);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SeedLoadError(`seed field "${field}" is missing or not a finite number`, field);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new SeedLoadError(`seed field "${field}" is missing or not a boolean`, field);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new SeedLoadError(`seed field "${field}" is missing or not a string array`, field);
  }
  return value as string[];
}

/**
 * A nullable number: `null` is a valid MISSING value, but any other non-number
 * is unparseable. Preserves `null` exactly (Req 1.8, Property 20).
 */
function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requireNumber(value, field);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireIsoDate(value: unknown, field: string): string {
  const s = requireString(value, field);
  if (!ISO_DATE.test(s)) {
    throw new SeedLoadError(`seed field "${field}" is not an ISO date (YYYY-MM-DD): "${s}"`, field);
  }
  return s;
}

/**
 * Build the seed workspace from a raw source, validating every field. Throws
 * `SeedLoadError` (and returns NO partial object) if anything is missing or
 * unparseable (Req 1.6, 1.7). Pure: performs no I/O.
 */
export function buildSeedCouple(source: SeedSource = SEED_SOURCE): CoupleWorkspace {
  const root = requireObject(source, "seed");

  // --- Couple ---
  const c = requireObject(root.couple, "couple");
  const ins = requireObject(c.insurance, "couple.insurance");
  const coupleId = requireString(c.id, "couple.id");

  const couple: CoupleWorkspace["couple"] = {
    id: coupleId,
    display_name: requireString(c.display_name, "couple.display_name"),
    trying_since_months: requireNumber(c.trying_since_months, "couple.trying_since_months"),
    goal: requireString(c.goal, "couple.goal"),
    top_concern: requireString(c.top_concern, "couple.top_concern"),
    insurance_provider: requireString(ins.provider, "couple.insurance.provider"),
    plan_type: requireString(ins.plan_type, "couple.insurance.plan_type"),
    member_id: requireString(ins.member_id, "couple.insurance.member_id"),
    group_number: requireString(ins.group_number, "couple.insurance.group_number"),
    policy_holder: requireString(ins.policy_holder, "couple.insurance.policy_holder") as PolicyHolder,
    coverage_status: requireString(ins.coverage_status, "couple.insurance.coverage_status") as CoverageStatus,
  };

  // --- Her profile + member ---
  const her = requireObject(root.her, "her");
  const herLabs = requireObject(her.labs, "her.labs");

  const herProfile: CoupleWorkspace["herProfile"] = {
    couple_id: coupleId,
    last_period_start: requireIsoDate(her.last_period_start, "her.last_period_start"),
    avg_cycle_length: requireNumber(her.avg_cycle_length, "her.avg_cycle_length"),
    cycle_length_min: requireNumber(her.cycle_length_min, "her.cycle_length_min"),
    cycle_length_max: requireNumber(her.cycle_length_max, "her.cycle_length_max"),
    cycle_regular: requireBoolean(her.cycle_regular, "her.cycle_regular"),
    months_trying: requireNumber(her.months_trying, "her.months_trying"),
    conditions: requireStringArray(her.conditions, "her.conditions"),
    prior_meds: requireStringArray(her.prior_meds, "her.prior_meds"),
    ovulation_tracking: requireString(her.ovulation_tracking, "her.ovulation_tracking"),
    prior_pregnancies: requireNumber(her.prior_pregnancies, "her.prior_pregnancies"),
    amh: nullableNumber(herLabs.amh, "her.labs.amh"),
    tsh: nullableNumber(herLabs.tsh, "her.labs.tsh"),
    day3_fsh: nullableNumber(herLabs.day3_fsh, "her.labs.day3_fsh"),
    day3_estradiol: nullableNumber(herLabs.day3_estradiol, "her.labs.day3_estradiol"),
    mid_luteal_progesterone: nullableNumber(
      herLabs.mid_luteal_progesterone,
      "her.labs.mid_luteal_progesterone",
    ),
    prolactin: nullableNumber(herLabs.prolactin, "her.labs.prolactin"),
  };

  // --- Him profile + member ---
  const him = requireObject(root.him, "him");
  const semen = requireObject(him.semen_results, "him.semen_results");
  const lifestyle = requireObject(him.lifestyle, "him.lifestyle");
  const history = requireObject(him.medical_history, "him.medical_history");

  const himProfile: CoupleWorkspace["himProfile"] = {
    couple_id: coupleId,
    semen_analysis_status: requireString(
      him.semen_analysis_status,
      "him.semen_analysis_status",
    ) as SemenAnalysisStatus,
    semen_analysis_date: requireIsoDate(him.semen_analysis_date, "him.semen_analysis_date"),
    volume_ml: nullableNumber(semen.volume_ml, "him.semen_results.volume_ml"),
    concentration_million_ml: nullableNumber(
      semen.concentration_million_ml,
      "him.semen_results.concentration_million_ml",
    ),
    total_count_million: nullableNumber(
      semen.total_count_million,
      "him.semen_results.total_count_million",
    ),
    progressive_motility_pct: nullableNumber(
      semen.progressive_motility_pct,
      "him.semen_results.progressive_motility_pct",
    ),
    total_motility_pct: nullableNumber(
      semen.total_motility_pct,
      "him.semen_results.total_motility_pct",
    ),
    morphology_normal_pct: nullableNumber(
      semen.morphology_normal_pct,
      "him.semen_results.morphology_normal_pct",
    ),
    vitality_pct: nullableNumber(semen.vitality_pct, "him.semen_results.vitality_pct"),
    ph: nullableNumber(semen.ph, "him.semen_results.ph"),
    lifestyle: {
      smoking: requireBoolean(lifestyle.smoking, "him.lifestyle.smoking"),
      alcohol: requireString(lifestyle.alcohol, "him.lifestyle.alcohol"),
      heat_exposure: requireBoolean(lifestyle.heat_exposure, "him.lifestyle.heat_exposure"),
      sleep: requireString(lifestyle.sleep, "him.lifestyle.sleep"),
      stress: requireString(lifestyle.stress, "him.lifestyle.stress"),
      bmi: requireNumber(lifestyle.bmi, "him.lifestyle.bmi"),
      supplements: requireBoolean(lifestyle.supplements, "him.lifestyle.supplements"),
    },
    medical_history: {
      surgeries: requireString(history.surgeries, "him.medical_history.surgeries"),
      varicocele: requireString(history.varicocele, "him.medical_history.varicocele"),
      medications: requireString(history.medications, "him.medical_history.medications"),
      prior_children: requireNumber(history.prior_children, "him.medical_history.prior_children"),
    },
    readiness_score: requireNumber(him.readiness_score, "him.readiness_score"),
  };

  const members: CoupleWorkspace["members"] = [
    {
      id: MAYA_MEMBER_ID,
      couple_id: coupleId,
      role: "her",
      name: requireString(her.name, "her.name"),
      age: requireNumber(her.age, "her.age"),
      dob: requireIsoDate(her.dob, "her.dob"),
    },
    {
      id: DANIEL_MEMBER_ID,
      couple_id: coupleId,
      role: "him",
      name: requireString(him.name, "him.name"),
      age: requireNumber(him.age, "him.age"),
      dob: requireIsoDate(him.dob, "him.dob"),
    },
  ];

  // --- Derived trying window (verbatim from the reference file) ---
  const tw = requireObject(root.trying_window, "trying_window");
  const tryingWindows: CoupleWorkspace["tryingWindows"] = [
    {
      id: SEED_TRYING_WINDOW_ID,
      couple_id: coupleId,
      fertile_window_start: requireIsoDate(
        tw.fertile_window_start,
        "trying_window.fertile_window_start",
      ),
      fertile_window_end: requireIsoDate(tw.fertile_window_end, "trying_window.fertile_window_end"),
      min_ovulation: requireIsoDate(tw.min_ovulation, "trying_window.min_ovulation"),
      max_ovulation: requireIsoDate(tw.max_ovulation, "trying_window.max_ovulation"),
      confidence: requireString(tw.confidence, "trying_window.confidence") as Confidence,
      reasons: requireStringArray(tw.reasons, "trying_window.reasons"),
    },
  ];

  return {
    couple,
    members,
    herProfile,
    himProfile,
    tryingWindows,
    // Tasks, calendar events, and call records are produced downstream by the
    // agent + workflow (Req 5, 6, 10); the seed starts them empty.
    tasks: [],
    calendarEvents: [],
    callRecords: [],
  };
}

/**
 * Build the seed fixture and write it to Supabase (upsert, idempotent). The
 * build step throws `SeedLoadError` on bad input before any write occurs, so a
 * malformed seed never produces a partial database (Req 1.6, 1.7).
 */
export async function loadSeedCouple(
  client: SupabaseClient,
  source: SeedSource = SEED_SOURCE,
): Promise<CoupleWorkspace> {
  const workspace = buildSeedCouple(source);
  await upsertCoupleWorkspace(client, workspace);
  return workspace;
}
