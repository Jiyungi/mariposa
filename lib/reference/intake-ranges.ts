/**
 * Numeric reference ranges enforced by the intake validation schemas
 * (`lib/validation/intake.ts`), Req 2.2 / 2.3 / 2.7 / 2.8.
 *
 * Every literal here is grounded in `/reference-data/` — nothing clinical is
 * invented (Req 12.1, 12.3):
 *
 *  - Cycle-length range 45–60 days: `sample-couple.md`
 *    (`avg_cycle_length: 52 # range 45-60`, `cycle_length_min: 45`,
 *    `cycle_length_max: 60`) and requirements.md Req 2.2
 *    ("average cycle length within the range 45 to 60 days").
 *  - WHO 2021 lower reference limits: `semen-analysis-reference.md`
 *    (re-used from `lib/reference/who-2021.ts`).
 *  - Readiness score 0–100: `sample-couple.md` (`readiness_score: 62 # out of 100`)
 *    and Req 1.4 / 5.4.
 *  - Percentage scale 0–100 and pH scale 0–14 are definitional (the meaning of a
 *    percentage / the pH scale), not fabricated clinical cutoffs.
 *
 * IMPORTANT DESIGN NOTE — WHO limits are flagging thresholds, NOT rejection
 * bounds. The seed couple's real semen values (e.g. concentration 14 < WHO 16,
 * morphology 3 < WHO 4) are BELOW the WHO lower limits yet must be ACCEPTED and
 * STORED exactly (Req 11.3) so the Missing-Data detector can flag them as
 * borderline (Req 4.5). If the intake schema rejected below-WHO values, that
 * borderline-data feature could never receive data. Therefore the intake schema
 * rejects only physiologically impossible values (negative counts/volumes,
 * percentages outside 0–100, pH outside 0–14, cycle length outside 45–60), and
 * exposes the WHO limits separately for the downstream flagging layer.
 */
import { WHO_2021 } from "@/lib/reference/who-2021";

/** A closed/half-open numeric reference range used for intake rejection. */
export interface NumericRange {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. Omitted means "no defined upper bound". */
  max?: number;
  /** Human unit appended to error messages (e.g. "days", "%"). */
  unit?: string;
}

/** Cycle length reference range — sample-couple.md / Req 2.2. */
export const CYCLE_LENGTH_RANGE: NumericRange = { min: 45, max: 60, unit: "days" };

/** Percentage scale (definitional). */
export const PERCENT_RANGE: NumericRange = { min: 0, max: 100, unit: "%" };

/** pH scale (definitional). */
export const PH_RANGE: NumericRange = { min: 0, max: 14 };

/** Readiness score range — sample-couple.md (out of 100) / Req 1.4, 5.4. */
export const READINESS_RANGE: NumericRange = { min: 0, max: 100 };

/** Non-negative count/volume (no fabricated upper clinical bound). */
const NONNEGATIVE: NumericRange = { min: 0 };

/**
 * WHO 2021 lower reference limits mapped to the intake field they describe.
 * Used by the downstream Missing-Data detector to flag below-limit values as
 * borderline (Req 4.5). NOT used to reject intake values — see the design note
 * above. Source: `semen-analysis-reference.md` via `lib/reference/who-2021.ts`.
 */
export const WHO_REFERENCE_BY_FIELD = {
  volume_ml: WHO_2021.semenVolumeMl,
  concentration_million_ml: WHO_2021.concentrationMillionMl,
  total_count_million: WHO_2021.totalSpermMillion,
  total_motility_pct: WHO_2021.totalMotilityPct,
  progressive_motility_pct: WHO_2021.progressiveMotilityPct,
  vitality_pct: WHO_2021.vitalityPct,
  morphology_normal_pct: WHO_2021.normalMorphologyPct,
  ph: WHO_2021.phMin,
} as const;

/**
 * A clinical intake field that has a defined reference range and is therefore
 * rejected when out of range, with an error naming the field and its range
 * (Req 2.7, 2.8 / Property 11).
 */
export interface ClinicalFieldRange extends NumericRange {
  /** Leaf field name, used verbatim in error messages (mirrors sample-couple.md). */
  field: string;
  /** Which partner schema the field belongs to. */
  partner: "her" | "his";
  /** Full path within that partner's schema (for nested objects). */
  path: string[];
  /** Whether the field is constrained to integers. */
  integer: boolean;
}

/**
 * The registry of clinical fields with reference ranges enforced by the intake
 * schemas. Single source of truth shared by the schema builders and the
 * property test so messages and bounds never drift.
 */
export const CLINICAL_FIELD_RANGES: ClinicalFieldRange[] = [
  // Her — cycle length (sample-couple.md / Req 2.2)
  {
    field: "avg_cycle_length",
    partner: "her",
    path: ["avg_cycle_length"],
    integer: true,
    ...CYCLE_LENGTH_RANGE,
  },
  // His — semen analysis parameters (physiological ranges; WHO limits flag, not reject)
  { field: "volume_ml", partner: "his", path: ["semen_results", "volume_ml"], integer: false, ...NONNEGATIVE, unit: "mL" },
  { field: "concentration_million_ml", partner: "his", path: ["semen_results", "concentration_million_ml"], integer: false, ...NONNEGATIVE },
  { field: "total_count_million", partner: "his", path: ["semen_results", "total_count_million"], integer: false, ...NONNEGATIVE },
  { field: "progressive_motility_pct", partner: "his", path: ["semen_results", "progressive_motility_pct"], integer: false, ...PERCENT_RANGE },
  { field: "total_motility_pct", partner: "his", path: ["semen_results", "total_motility_pct"], integer: false, ...PERCENT_RANGE },
  { field: "morphology_normal_pct", partner: "his", path: ["semen_results", "morphology_normal_pct"], integer: false, ...PERCENT_RANGE },
  { field: "vitality_pct", partner: "his", path: ["semen_results", "vitality_pct"], integer: false, ...PERCENT_RANGE },
  { field: "ph", partner: "his", path: ["semen_results", "ph"], integer: false, ...PH_RANGE },
  // His — readiness score (sample-couple.md / Req 1.4, 5.4)
  { field: "readiness_score", partner: "his", path: ["readiness_score"], integer: true, ...READINESS_RANGE },
];
