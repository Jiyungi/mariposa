import { DURATION_RULE } from "@/lib/reference/duration-rule";

/**
 * Trying-Duration Rule (Req 7.4–7.6).
 *
 * Pure function: given the female partner's age, months trying, and any
 * red-flag conditions, decide the age-based evaluation threshold and whether
 * early evaluation should be recommended.
 *
 * Thresholds and red-flag override are grounded in
 * reference-data/cycle-fertility-reference.md ("When to seek evaluation").
 */

/** Threshold value in months — either the under-35 or the 35+ window. */
export type ThresholdMonths =
  | typeof DURATION_RULE.under35Months
  | typeof DURATION_RULE.atLeast35Months;

export interface DurationInput {
  /** Female partner age in years. */
  femaleAge: number;
  /** Number of months the couple has been trying. */
  monthsTrying: number;
  /**
   * Red-flag conditions (e.g. irregular/absent periods, known PCOS or
   * endometriosis, prior pelvic surgery, known male factor). Any non-empty
   * entry forces early evaluation regardless of the age-based threshold.
   */
  redFlags: string[];
}

export interface DurationResult {
  /** 12 months when femaleAge < 35, else 6 months (Req 7.4). */
  thresholdMonths: ThresholdMonths;
  /**
   * True when any red flag is present (Req 7.5), OR when monthsTrying has
   * reached the age-based threshold (Req 7.4).
   */
  recommendEarlyEvaluation: boolean;
  /** The red flags echoed through unchanged. */
  redFlags: string[];
}

/**
 * Apply the Trying-Duration Rule.
 *
 * - femaleAge < 35 → 12-month threshold; femaleAge >= 35 → 6-month threshold.
 * - Any red flag forces `recommendEarlyEvaluation = true` regardless of months
 *   trying or the threshold.
 * - Absent red flags, early evaluation is recommended once monthsTrying meets
 *   or exceeds the threshold.
 */
export function checkDurationRule(input: DurationInput): DurationResult {
  const { femaleAge, monthsTrying, redFlags } = input;

  const thresholdMonths: ThresholdMonths =
    femaleAge < DURATION_RULE.ageThreshold
      ? DURATION_RULE.under35Months
      : DURATION_RULE.atLeast35Months;

  const hasRedFlag = redFlags.length > 0;
  const recommendEarlyEvaluation =
    hasRedFlag || monthsTrying >= thresholdMonths;

  return {
    thresholdMonths,
    recommendEarlyEvaluation,
    // Echo the red flags through unchanged.
    redFlags: [...redFlags],
  };
}
