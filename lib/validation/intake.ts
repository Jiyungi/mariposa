/**
 * Intake validation schemas (Req 2).
 *
 * Zod schemas for the Her, His, and Together intake forms. Field names and
 * value bounds mirror `/reference-data/sample-couple.md` exactly (Req 2.5).
 *
 * Enforcement:
 *  - Enumerations: `semen_analysis_status`, `policy_holder`, `coverage_status`
 *    (Req 2.3, 2.4).
 *  - Reference-range numeric bounds (Req 2.7): out-of-range clinical values are
 *    rejected with an error that names the field and its expected range
 *    (Req 2.8). The range set lives in `lib/reference/intake-ranges.ts`.
 *  - In-range values are accepted (Req 2.2).
 *
 * NOTE (grounding, Req 12): WHO 2021 lower limits are flagging thresholds for
 * the Missing-Data detector (Req 4.5), NOT intake-rejection bounds — the seed
 * couple's below-WHO semen values must be accepted and stored (Req 11.3). See
 * the design note in `lib/reference/intake-ranges.ts`.
 */
import { z } from "zod";
import {
  CLINICAL_FIELD_RANGES,
  type ClinicalFieldRange,
  type NumericRange,
} from "@/lib/reference/intake-ranges";

// ---------------------------------------------------------------------------
// Error-message helpers (single source shared with the property test)
// ---------------------------------------------------------------------------

/**
 * Build the error message for an out-of-range clinical field. The message names
 * the field and its expected range (Req 2.8), e.g.
 * `"avg_cycle_length must be between 45 and 60 days"` or
 * `"volume_ml must be at least 0 mL"`.
 */
export function rangeErrorMessage(field: string, range: NumericRange): string {
  const unit = range.unit ? ` ${range.unit}` : "";
  if (range.max === undefined) {
    return `${field} must be at least ${range.min}${unit}`;
  }
  return `${field} must be between ${range.min} and ${range.max}${unit}`;
}

/** Look up a clinical field's range entry by its leaf name. */
function rangeFor(field: string): ClinicalFieldRange {
  const entry = CLINICAL_FIELD_RANGES.find((e) => e.field === field);
  if (!entry) {
    throw new Error(`No clinical range registered for field "${field}"`);
  }
  return entry;
}

/**
 * A Zod number constrained to a registered clinical reference range, producing
 * a field+range error message on violation (Req 2.8).
 */
function clinicalNumber(field: string): z.ZodNumber {
  const range = rangeFor(field);
  const message = rangeErrorMessage(field, range);
  let schema = z
    .number({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a number`,
    })
    .min(range.min, { message });
  if (range.max !== undefined) {
    schema = schema.max(range.max, { message });
  }
  if (range.integer) {
    schema = schema.int({ message: `${field} must be a whole number` });
  }
  return schema;
}

/** A nullable lab value: a non-negative number or `null` (MISSING per Req 1.8). */
const nullableLab = z.number().nonnegative().nullable();

/** ISO calendar date string (YYYY-MM-DD). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be in YYYY-MM-DD format" });

// ---------------------------------------------------------------------------
// Enumerations (Req 2.3, 2.4)
// ---------------------------------------------------------------------------

/** `semen_analysis_status` — sample-couple.md (`semen_analysis_status: completed`). */
export const semenAnalysisStatusEnum = z.enum([
  "not_started",
  "in_progress",
  "completed",
]);

/** `policy_holder` — sample-couple.md (`policy_holder: him`). */
export const policyHolderEnum = z.enum(["her", "him"]);

/**
 * Coverage-known status — sample-couple.md (`coverage_status: partial_unconfirmed`),
 * Req 2.4 ("coverage known status as one of confirmed, partial_unconfirmed, or
 * unconfirmed"). The field name mirrors sample-couple.md (`coverage_status`).
 */
export const coverageStatusEnum = z.enum([
  "confirmed",
  "partial_unconfirmed",
  "unconfirmed",
]);
/** Alias matching the requirement's "coverage_known" terminology. */
export const coverageKnownEnum = coverageStatusEnum;

// ---------------------------------------------------------------------------
// Her intake (Req 2.1, 2.2) — mirrors `her_profile` + member age in sample-couple.md
// ---------------------------------------------------------------------------

const herLabsSchema = z.object({
  amh: nullableLab,
  tsh: nullableLab,
  day3_fsh: nullableLab,
  day3_estradiol: nullableLab,
  mid_luteal_progesterone: nullableLab,
  prolactin: nullableLab,
});

export const herIntakeSchema = z.object({
  age: z.number().int().positive(),
  last_period_start: isoDate,
  avg_cycle_length: clinicalNumber("avg_cycle_length"),
  cycle_length_min: z.number().int().positive(),
  cycle_length_max: z.number().int().positive(),
  cycle_regular: z.boolean(),
  months_trying: z.number().int().nonnegative(),
  conditions: z.array(z.string()),
  prior_meds: z.array(z.string()),
  ovulation_tracking: z.string(),
  prior_pregnancies: z.number().int().nonnegative(),
  labs: herLabsSchema.optional(),
});

// ---------------------------------------------------------------------------
// His intake (Req 2.1, 2.3) — mirrors `him_profile` + member age
// ---------------------------------------------------------------------------

const semenResultsSchema = z.object({
  volume_ml: clinicalNumber("volume_ml"),
  concentration_million_ml: clinicalNumber("concentration_million_ml"),
  total_count_million: clinicalNumber("total_count_million"),
  progressive_motility_pct: clinicalNumber("progressive_motility_pct"),
  total_motility_pct: clinicalNumber("total_motility_pct"),
  morphology_normal_pct: clinicalNumber("morphology_normal_pct"),
  vitality_pct: clinicalNumber("vitality_pct"),
  ph: clinicalNumber("ph"),
});

const lifestyleSchema = z.object({
  smoking: z.boolean(),
  alcohol: z.string(),
  heat_exposure: z.boolean(),
  sleep: z.string(),
  stress: z.string(),
  bmi: z.number().positive(),
  supplements: z.boolean(),
});

const medicalHistorySchema = z.object({
  surgeries: z.string(),
  varicocele: z.string(),
  medications: z.string(),
  prior_children: z.number().int().nonnegative(),
});

export const hisIntakeSchema = z.object({
  age: z.number().int().positive(),
  semen_analysis_status: semenAnalysisStatusEnum,
  semen_analysis_date: isoDate.optional(),
  semen_results: semenResultsSchema.optional(),
  lifestyle: lifestyleSchema.optional(),
  medical_history: medicalHistorySchema.optional(),
  readiness_score: clinicalNumber("readiness_score").optional(),
});

// ---------------------------------------------------------------------------
// Together intake (Req 2.1, 2.4) — mirrors couple + insurance in sample-couple.md
// ---------------------------------------------------------------------------

const insuranceSchema = z.object({
  provider: z.string(),
  plan_type: z.string().optional(),
  member_id: z.string(),
  group_number: z.string(),
  policy_holder: policyHolderEnum,
  coverage_status: coverageStatusEnum,
});

export const togetherIntakeSchema = z.object({
  goal: z.string(),
  top_concern: z.string(),
  trying_since_months: z.number().int().nonnegative().optional(),
  insurance: insuranceSchema,
});

// ---------------------------------------------------------------------------
// Combined intake
// ---------------------------------------------------------------------------

export const intakeSchema = z.object({
  her: herIntakeSchema,
  his: hisIntakeSchema,
  together: togetherIntakeSchema,
});

export type HerIntake = z.infer<typeof herIntakeSchema>;
export type HisIntake = z.infer<typeof hisIntakeSchema>;
export type TogetherIntake = z.infer<typeof togetherIntakeSchema>;
export type Intake = z.infer<typeof intakeSchema>;

// ---------------------------------------------------------------------------
// Validation helper — returns parsed data or structured field+range errors
// ---------------------------------------------------------------------------

/** A single structured validation issue naming the field and the message. */
export interface FieldIssue {
  /** Dotted path to the offending field, e.g. `"semen_results.ph"`. */
  field: string;
  /** Human-readable message; for clinical fields it names the field + range. */
  message: string;
}

/** Result of a structured intake validation. */
export type IntakeValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FieldIssue[] };

/**
 * Validate `input` against `schema`, returning either the parsed data or a list
 * of structured field+message errors (Req 2.8). The prior value is never
 * mutated — callers retain it on failure.
 */
export function safeValidate<T>(
  schema: z.ZodType<T>,
  input: unknown,
): IntakeValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.length ? issue.path.join(".") : "(root)",
      message: issue.message,
    })),
  };
}

export const validateHerIntake = (input: unknown) =>
  safeValidate(herIntakeSchema, input);
export const validateHisIntake = (input: unknown) =>
  safeValidate(hisIntakeSchema, input);
export const validateTogetherIntake = (input: unknown) =>
  safeValidate(togetherIntakeSchema, input);
export const validateIntake = (input: unknown) =>
  safeValidate(intakeSchema, input);

export { CLINICAL_FIELD_RANGES };
