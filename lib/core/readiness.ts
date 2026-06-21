/**
 * Readiness-Score logic (Req 1.4, 5.4).
 *
 * The male partner's Readiness_Score is an integer in [0, 100] that improves
 * as male-track tasks are completed (sample-couple.md seeds Daniel at 62).
 */

/** Inclusive lower/upper bounds for the Readiness_Score. */
export const READINESS_MIN = 0;
export const READINESS_MAX = 100;

/**
 * Apply a single male-track task completion to the Readiness_Score.
 *
 * Completing a task increases the score by `taskWeight`, and the result is
 * rounded to an integer and clamped to the inclusive range [0, 100].
 *
 * Behavior notes:
 * - `taskWeight` is expected to be >= 0; a completion never decreases the
 *   score. To guarantee this even if a negative weight is passed, the result
 *   is floored at the (clamped) input score — so the returned value is never
 *   below where the score started.
 * - The input score is first clamped/rounded into a valid integer baseline so
 *   the function is total over any numeric input.
 *
 * @param score      Current Readiness_Score.
 * @param taskWeight Amount the completed task adds (assumed non-negative).
 * @returns Integer Readiness_Score within [0, 100], never below the input.
 */
export function applyTaskCompletion(score: number, taskWeight: number): number {
  // Establish an integer baseline within [0, 100] from the current score.
  const baseline = clampScore(Math.round(score));

  // A completion adds weight; round to an integer and clamp into range.
  const increased = clampScore(Math.round(baseline + taskWeight));

  // A completion must never decrease the score: floor at the baseline.
  return Math.max(baseline, increased);
}

/** Clamp a value into the inclusive Readiness_Score range [0, 100]. */
function clampScore(value: number): number {
  if (value < READINESS_MIN) return READINESS_MIN;
  if (value > READINESS_MAX) return READINESS_MAX;
  return value;
}
