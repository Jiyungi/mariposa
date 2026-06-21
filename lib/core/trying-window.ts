/**
 * Trying-Window Engine (Req 3) — `lib/core/trying-window.ts`
 *
 * Pure, deterministic implementation of the irregular-cycle algorithm defined in
 * `/reference-data/cycle-fertility-reference.md`. It computes the estimated fertile
 * window, the priority (min/max ovulation) days, and a confidence label from ONLY
 * the female partner's inputs. Male data is intentionally absent from the signature
 * (Req 3.6): ovulation timing must never depend on male data.
 *
 * The function performs no I/O and does not mutate its input. On missing/invalid
 * required input it throws a typed `TryingWindowInputError` and writes nothing, so
 * the caller's prior state is preserved (Req 3.7).
 */

export interface TryingWindowInput {
  /** ISO date string (YYYY-MM-DD) of the first day of the last period. */
  lastPeriodStart: string;
  /** Shortest observed cycle length, in days. */
  cycleLengthMin: number;
  /** Longest observed cycle length, in days. */
  cycleLengthMax: number;
  /** True when a mid-luteal progesterone OR LH confirmation is present. */
  ovulationConfirmed: boolean;
}

export interface TryingWindowOutput {
  /** ISO date string (YYYY-MM-DD): start of the estimated fertile window. */
  fertileWindowStart: string;
  /** ISO date string (YYYY-MM-DD): end of the estimated fertile window. */
  fertileWindowEnd: string;
  /** ISO date string (YYYY-MM-DD): earliest likely ovulation (priority day start). */
  minOvulation: string;
  /** ISO date string (YYYY-MM-DD): latest likely ovulation (priority day end). */
  maxOvulation: string;
  /** Confidence label for the estimate. */
  confidence: "Low" | "Moderate" | "High";
  /** Human-readable reasons supporting the confidence label. */
  reasons: string[];
}

/**
 * Typed error thrown when a required trying-window input is missing or invalid.
 * Exported so callers can distinguish input errors and preserve prior state.
 */
export class TryingWindowInputError extends Error {
  /** Name of the offending field, when a single field is at fault. */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "TryingWindowInputError";
    this.field = field;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, TryingWindowInputError.prototype);
  }
}

/**
 * Threshold (in days) above which the difference between the longest and shortest
 * cycle is considered a "wide" range. Sourced from cycle-fertility-reference.md:
 * irregular = varies > 7 days between cycles.
 */
const WIDE_RANGE_THRESHOLD_DAYS = 7;

/** Number of days the luteal phase is assumed to last (ovulation ≈ 14 days before next period). */
const LUTEAL_PHASE_DAYS = 14;

/** The fertile window opens 5 days before the earliest likely ovulation. */
const FERTILE_WINDOW_LEAD_DAYS = 5;

/** The fertile window closes 1 day after the latest likely ovulation. */
const FERTILE_WINDOW_TRAIL_DAYS = 1;

/** Exact low-confidence reasons (Req 3.5). Order and strings are part of the contract. */
const LOW_CONFIDENCE_REASONS = [
  "irregular cycle",
  "ovulation not confirmed",
  "wide cycle range",
] as const;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a strict `YYYY-MM-DD` ISO date string into a UTC epoch-day count.
 * Throws TryingWindowInputError on malformed or non-calendar dates.
 */
function parseIsoDateToUtcMs(value: string): number {
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms)) {
    throw new TryingWindowInputError(
      `lastPeriodStart is not a valid calendar date: "${value}"`,
      "lastPeriodStart",
    );
  }
  // Guard against JS Date normalization (e.g. 2026-02-30 -> March). Round-trip
  // the parsed value back to an ISO date and require it to match the input.
  const roundTrip = new Date(ms).toISOString().slice(0, 10);
  if (roundTrip !== value) {
    throw new TryingWindowInputError(
      `lastPeriodStart is not a valid calendar date: "${value}"`,
      "lastPeriodStart",
    );
  }
  return ms;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Add a whole number of days to a UTC epoch-ms value and format as YYYY-MM-DD. */
function addDaysIso(baseMs: number, days: number): string {
  return new Date(baseMs + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Validate a cycle length: must be a finite, non-negative number. */
function validateCycleLength(value: number, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TryingWindowInputError(`${field} must be a finite number`, field);
  }
  if (value < 0) {
    throw new TryingWindowInputError(`${field} must not be negative`, field);
  }
}

/**
 * Compute the trying window, priority ovulation days, and confidence label from
 * the female partner's cycle inputs. Pure: no I/O, does not mutate `input`.
 *
 * @throws {TryingWindowInputError} when a required input is missing or invalid.
 */
export function computeTryingWindow(
  input: TryingWindowInput,
): TryingWindowOutput {
  if (input == null || typeof input !== "object") {
    throw new TryingWindowInputError("input is required");
  }

  const { lastPeriodStart, cycleLengthMin, cycleLengthMax, ovulationConfirmed } =
    input;

  if (
    typeof lastPeriodStart !== "string" ||
    lastPeriodStart.length === 0 ||
    !ISO_DATE_PATTERN.test(lastPeriodStart)
  ) {
    throw new TryingWindowInputError(
      "lastPeriodStart is required and must be an ISO date string (YYYY-MM-DD)",
      "lastPeriodStart",
    );
  }

  validateCycleLength(cycleLengthMin, "cycleLengthMin");
  validateCycleLength(cycleLengthMax, "cycleLengthMax");

  if (cycleLengthMin > cycleLengthMax) {
    throw new TryingWindowInputError(
      "cycleLengthMin must be less than or equal to cycleLengthMax",
      "cycleLengthMin",
    );
  }

  const baseMs = parseIsoDateToUtcMs(lastPeriodStart);

  // Irregular-cycle algorithm (cycle-fertility-reference.md):
  //   minOvulation       = lastPeriodStart + cycleLengthMin - 14
  //   maxOvulation       = lastPeriodStart + cycleLengthMax - 14
  //   fertileWindowStart = minOvulation - 5
  //   fertileWindowEnd   = maxOvulation + 1
  const minOvulationOffset = cycleLengthMin - LUTEAL_PHASE_DAYS;
  const maxOvulationOffset = cycleLengthMax - LUTEAL_PHASE_DAYS;

  const minOvulation = addDaysIso(baseMs, minOvulationOffset);
  const maxOvulation = addDaysIso(baseMs, maxOvulationOffset);
  const fertileWindowStart = addDaysIso(
    baseMs,
    minOvulationOffset - FERTILE_WINDOW_LEAD_DAYS,
  );
  const fertileWindowEnd = addDaysIso(
    baseMs,
    maxOvulationOffset + FERTILE_WINDOW_TRAIL_DAYS,
  );

  const range = cycleLengthMax - cycleLengthMin;
  const isWideRange = range > WIDE_RANGE_THRESHOLD_DAYS;

  let confidence: TryingWindowOutput["confidence"];
  let reasons: string[];

  if (!ovulationConfirmed && isWideRange) {
    // Req 3.4 / 3.5: unconfirmed ovulation + wide range => Low with exact reasons.
    confidence = "Low";
    reasons = [...LOW_CONFIDENCE_REASONS];
  } else if (ovulationConfirmed && !isWideRange) {
    // Confirmed ovulation and a narrow, consistent range is the strongest case.
    confidence = "High";
    reasons = ["ovulation confirmed", "narrow cycle range"];
  } else {
    // Exactly one weakening factor is present => Moderate. Report only the
    // factor that actually applies so the reason set never overlaps the Low set.
    confidence = "Moderate";
    reasons = isWideRange ? ["wide cycle range"] : ["ovulation not confirmed"];
  }

  return {
    fertileWindowStart,
    fertileWindowEnd,
    minOvulation,
    maxOvulation,
    confidence,
    reasons,
  };
}
