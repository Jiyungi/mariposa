// ===========================================================================
// Property test — Feature: mariposa, Property 21: Summary and chat are grounded
// in Reference_Data (CHAT half).
//
//   "For any couple data, every clinical value and citation appearing in a chat
//    answer traces to a source within Reference_Data; any value absent from
//    Reference_Data is reported as unavailable with no substitute (chat)."
//
// Validates: Requirements 9.4, 12.1, 12.3   (chat half of Property 21)
//
// SCOPE NOTE — SUMMARY HALF (Requirements 8.3, 8.4):
//   Property 21 also covers the Doctor_Summary. On this branch the
//   Doctor_Summary module (Task 17, Owner: Person A) does not yet exist, so the
//   summary half (Req 8.3 "ground all clinical statements only in Reference_Data"
//   and Req 8.4 "omit any value/citation absent from Reference_Data") is NOT
//   exercised here. Those criteria will be validated by this same property when
//   Person A's summary module merges — at which point a sibling block should be
//   added that runs the same grounded-token / absent-omission checks against the
//   rendered Doctor_Summary text. This file deliberately validates only the CHAT
//   half (Req 9.4, 12.1, 12.3) against lib/chat/grounded-chat.ts.
//
// ---------------------------------------------------------------------------
// KNOWN-VALUE-SET POLICY (why this test is meaningful, not vacuous)
// ---------------------------------------------------------------------------
// We extract numeric tokens from each answer's section/source texts and require
// every *clinical* token to be a member of KNOWN_CLINICAL_VALUES — a set built
// straight from the Reference Constants Layer (@/lib/reference) and the seed
// couple fixture. A fabricated clinical number (e.g. an invented AMH "2.4 ng/mL"
// or a made-up progesterone reading) is NOT in that set and fails the property.
// A negative-control test below proves the checker rejects such fabrications.
//
// Not every digit in prose is a clinical measurement. We classify tokens with a
// precise, documented rule and EXCLUDE the following as STRUCTURAL (they do not
// have to appear in the clinical reference set):
//
//   1. Calendar dates & years. ISO dates (YYYY-MM-DD) and long-form month/day(s)
//      ("July 2–17, 2026", "June 1, 2026", "June 25") are produced by the grounded
//      Trying_Window_Engine / seed dates. We validate ISO dates against the known
//      window/seed dates and validate every 4-digit year against {2026, 2021}
//      (2021 = the WHO-2021 citation year), then strip them before clinical
//      extraction so day-of-month/year digits never pollute the clinical check.
//   2. Score denominators. The "/100" scale in "62/100" — the 100 is structural;
//      the numerator 62 (the seed readiness score) remains and IS checked.
//   3. Enumeration counts. Counts the text frames as quantities of items
//      ("4 female lab(s)", "4 borderline semen parameter(s)", "N reason(s)") are
//      derived array lengths, not clinical readings.
//   4. The derived cycle spread ("15-day spread" = cycle_length_max − min) — an
//      arithmetic artifact, not a measured value.
//
// Everything left after those exclusions is a CLINICAL token and MUST be in
// KNOWN_CLINICAL_VALUES. That set includes: the seed couple's present values, the
// WHO 2021 limits, the female-hormone reference numbers, the trying-duration
// thresholds, the semen collection/development spans, and the documented
// irregular-cycle algorithm constants (ovulation = cycle length − 14; window
// −5 / +1; wide-cycle > 7 days) — all grounded in Reference_Data.
// ===========================================================================

import { describe, test, expect } from "vitest";
import fc from "fast-check";

import {
  answerCanonicalQuestion,
  answerAllCanonicalQuestions,
  CANONICAL_QUESTIONS,
  type CanonicalQuestionId,
  type ChatAnswer,
} from "@/lib/chat/grounded-chat";
import {
  WHO_2021,
  FEMALE_HORMONE,
  DAY3_FSH_MIU_ML,
  DAY3_ESTRADIOL_PG_ML,
  AMH_NG_ML,
  SEMEN_COLLECTION,
  SPERM_DEVELOPMENT,
  SEED_COUPLE_FIXTURE,
  SEED_DERIVED,
} from "@/lib/reference";
import { detectMissingData } from "@/lib/core/missing-data";

// ---------------------------------------------------------------------------
// Build the KNOWN clinical-value set from @/lib/reference + the seed fixture
// ---------------------------------------------------------------------------

const KNOWN_CLINICAL_VALUES = new Set<number>();
const addNums = (...values: Array<number | null | undefined>) => {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) KNOWN_CLINICAL_VALUES.add(v);
  }
};
const addObjNums = (obj: Record<string, unknown>) =>
  addNums(...Object.values(obj).filter((v): v is number => typeof v === "number"));

// WHO 2021 semen lower reference limits + collection / development spans.
addObjNums(WHO_2021);
addNums(SEMEN_COLLECTION.abstinenceDaysMin, SEMEN_COLLECTION.abstinenceDaysMax);
addNums(
  SPERM_DEVELOPMENT.developmentDays,
  SPERM_DEVELOPMENT.trackingWeeksMin,
  SPERM_DEVELOPMENT.trackingWeeksMax,
);

// Female-hormone reference values, day-3 / estradiol / AMH ranges.
addNums(FEMALE_HORMONE.ovulationIndicativeProgesteroneNgMl);
addObjNums(DAY3_FSH_MIU_ML);
addObjNums(DAY3_ESTRADIOL_PG_ML);
addObjNums(AMH_NG_ML);

// Seed couple "Maya & Daniel" present clinical values (sample-couple.md).
const her = SEED_COUPLE_FIXTURE.herProfile;
const him = SEED_COUPLE_FIXTURE.himProfile;
addNums(
  her.amh, her.tsh, her.avg_cycle_length, her.cycle_length_min, her.cycle_length_max,
  her.months_trying,
);
addNums(
  him.volume_ml, him.concentration_million_ml, him.total_count_million,
  him.progressive_motility_pct, him.total_motility_pct, him.morphology_normal_pct,
  him.vitality_pct, him.ph, him.lifestyle.bmi, him.readiness_score,
);
addNums(...SEED_COUPLE_FIXTURE.members.map((m) => m.age)); // 33, 35

// Documented Reference_Data constants (cycle-fertility-reference.md):
//   - irregular-cycle algorithm: ovulation = cycle length − 14; window −5 / +1;
//     wide-cycle threshold > 7 days,
//   - trying-duration thresholds: 12 months (< 35) / 6 months (≥ 35),
//   - age threshold 35 (also the seed male partner's age).
const ALGORITHM_AND_RULE_CONSTANTS = [14, 5, 1, 7, 6, 12, 35] as const;
addNums(...ALGORITHM_AND_RULE_CONSTANTS);

// ---------------------------------------------------------------------------
// Date / year grounding (structural — validated, then stripped)
// ---------------------------------------------------------------------------

const KNOWN_ISO_DATES = new Set<string>([
  SEED_DERIVED.tryingWindow.fertileWindowStart,
  SEED_DERIVED.tryingWindow.fertileWindowEnd,
  SEED_DERIVED.tryingWindow.minOvulation,
  SEED_DERIVED.tryingWindow.maxOvulation,
  SEED_COUPLE_FIXTURE.herProfile.last_period_start,
  ...(SEED_COUPLE_FIXTURE.himProfile.semen_analysis_date
    ? [SEED_COUPLE_FIXTURE.himProfile.semen_analysis_date]
    : []),
]);

const ALLOWED_YEARS = new Set<number>([2026, 2021]); // window year + WHO-2021 citation year

// ---------------------------------------------------------------------------
// Reference_Data files that may be cited (Req 9.3 / 12.1)
// ---------------------------------------------------------------------------

const SEED_COUPLE_ID = "couple_001";
const KNOWN_REFERENCE_FILES = [
  "sample-couple.md",
  "female-hormone-reference.md",
  "semen-analysis-reference.md",
  "cycle-fertility-reference.md",
  "cpt-codes-fertility.md",
  "insurance-coverage-data.md",
  "clinic-intake-data.md",
  "call-scripts.md",
  "README.md",
] as const;

// ---------------------------------------------------------------------------
// Token extraction / classification (the documented policy in code form)
// ---------------------------------------------------------------------------

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
// MonthName D, or MonthName D–D, or MonthName D – MonthName D (year stripped separately).
const LONG_DATE_RE = new RegExp(
  `(?:${MONTHS})\\s+\\d+(?:\\s*[\\u2013-]\\s*(?:(?:${MONTHS})\\s+)?\\d+)?`,
  "g",
);
const SCORE_DENOM_RE = /\/\s*\d+/g; // the "/100" in "62/100" (never "million/mL")
const ENUM_COUNT_RE = /\b\d+\s+(?=female lab|borderline|semen parameter|reason)/gi;
const SPREAD_RE = /\b\d+(?=-day (?:cycle )?spread)/gi;
const NUMBER_RE = /\d+(?:\.\d+)?/g;

/** All section + source text of an answer, concatenated. */
function gatherText(answer: ChatAnswer): string {
  const sources = answer.sources
    .map((s) => `${s.coupleId} ${s.reference} ${s.detail}`)
    .join(" ");
  return [
    answer.question,
    answer.shortAnswer,
    answer.basedOnYourData,
    answer.whatsUncertain,
    answer.sharedNextStep,
    sources,
  ].join("  ");
}

/**
 * Extract the CLINICAL numeric tokens from a block of text, per the documented
 * policy: strip dates, years, score denominators, enumeration counts and the
 * derived spread, then return every remaining number.
 */
function extractClinicalTokens(text: string): number[] {
  let t = text;
  t = t.replace(ISO_DATE_RE, " ");
  t = t.replace(LONG_DATE_RE, " ");
  t = t.replace(YEAR_RE, " ");
  t = t.replace(SCORE_DENOM_RE, " ");
  t = t.replace(ENUM_COUNT_RE, " ");
  t = t.replace(SPREAD_RE, " ");
  return (t.match(NUMBER_RE) ?? []).map(Number);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if any of the given (MISSING) lab labels has a numeric value attached to
 * it in the text — i.e. a fabricated reading like "Day-3 FSH 7.2" or
 * "Prolactin: 18". A grounded answer must NEVER attach a number to a missing lab.
 */
function anyMissingLabHasNumberAttached(text: string, labels: string[]): boolean {
  return labels.some((label) => {
    const re = new RegExp(`${escapeRegExp(label)}\\s*[:=]?\\s*\\d`, "i");
    return re.test(text);
  });
}

const UNAVAILABLE_PHRASE_RE =
  /\b(unavailable|missing|not present in reference_data|no value can be provided|not (?:yet )?(?:done|on file)|not estimated|no substitute)\b/i;

// MISSING female labs for the seed couple, straight from the detector.
const SEED_MISSING_LABELS = detectMissingData({
  day3_fsh: her.day3_fsh,
  day3_estradiol: her.day3_estradiol,
  mid_luteal_progesterone: her.mid_luteal_progesterone,
  prolactin: her.prolactin,
  semen: {
    semenVolumeMl: him.volume_ml,
    concentrationMillionMl: him.concentration_million_ml,
    totalSpermMillion: him.total_count_million,
    totalMotilityPct: him.total_motility_pct,
    progressiveMotilityPct: him.progressive_motility_pct,
    vitalityPct: him.vitality_pct,
    normalMorphologyPct: him.morphology_normal_pct,
    phMin: him.ph,
  },
  coverage_status: SEED_COUPLE_FIXTURE.couple.coverage_status,
})
  .filter((f) => f.kind === "missing")
  .map((f) => f.label);

// ---------------------------------------------------------------------------
// Core assertions
// ---------------------------------------------------------------------------

/** (1) GROUNDED: every clinical token in the answer traces to Reference_Data. */
function assertGroundedClinicalValues(answer: ChatAnswer): void {
  const text = gatherText(answer);

  // Years and ISO dates are structural but still validated against known values.
  for (const iso of text.match(ISO_DATE_RE) ?? []) {
    expect(KNOWN_ISO_DATES.has(iso), `ISO date ${iso} not a known window/seed date`).toBe(true);
  }
  for (const yearStr of text.match(YEAR_RE) ?? []) {
    expect(ALLOWED_YEARS.has(Number(yearStr)), `year ${yearStr} not grounded`).toBe(true);
  }

  // Every remaining clinical token must be in the Reference_Data-derived set.
  const ungrounded = extractClinicalTokens(text).filter((n) => !KNOWN_CLINICAL_VALUES.has(n));
  expect(
    ungrounded,
    `[${answer.questionId}] invented clinical numbers not traceable to Reference_Data: ` +
      `${ungrounded.join(", ")}`,
  ).toEqual([]);
}

/** (2) ABSENT => UNAVAILABLE (Req 9.4): no fabricated value for a MISSING lab. */
function assertAbsentReportedUnavailable(answer: ChatAnswer): void {
  const text = gatherText(answer);
  // Universal: a MISSING lab is never given a number anywhere in the answer.
  expect(
    anyMissingLabHasNumberAttached(text, SEED_MISSING_LABELS),
    `[${answer.questionId}] a MISSING lab has a fabricated numeric value attached`,
  ).toBe(false);

  // The data-gap answer must explicitly name the missing labs and state they
  // are unavailable, offering no substitute.
  if (answer.questionId === "missing_data") {
    for (const label of SEED_MISSING_LABELS) {
      expect(text, `missing label "${label}" should be named`).toContain(label);
    }
    expect(
      UNAVAILABLE_PHRASE_RE.test(answer.basedOnYourData) ||
        UNAVAILABLE_PHRASE_RE.test(answer.whatsUncertain),
      "data-gap answer must state the missing values are unavailable",
    ).toBe(true);
  }
}

/** (3) SOURCES: every citation is couple_001 + a Reference_Data .md file. */
function assertSourcesGrounded(answer: ChatAnswer): void {
  expect(answer.sources.length).toBeGreaterThan(0);
  for (const source of answer.sources) {
    expect(source.coupleId).toBe(SEED_COUPLE_ID);
    const namesReferenceFile = KNOWN_REFERENCE_FILES.some((f) => source.reference.includes(f));
    expect(namesReferenceFile, `source.reference "${source.reference}" names no Reference_Data file`)
      .toBe(true);
  }
}

function assertProperty21Chat(answer: ChatAnswer): void {
  assertGroundedClinicalValues(answer);
  assertAbsentReportedUnavailable(answer);
  assertSourcesGrounded(answer);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const QUESTION_IDS = CANONICAL_QUESTIONS.map((q) => q.id);
const questionIdArb: fc.Arbitrary<CanonicalQuestionId> = fc.constantFrom(...QUESTION_IDS);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 21: Chat answers are grounded in Reference_Data", () => {
  test("every canonical answer is grounded, reports absent values as unavailable, and cites Reference_Data", () => {
    fc.assert(
      fc.property(questionIdArb, (questionId) => {
        assertProperty21Chat(answerCanonicalQuestion(questionId));
      }),
      { numRuns: 200 },
    );
  });

  test("concrete sweep: all five canonical answers satisfy Property 21 (chat)", () => {
    const answers = answerAllCanonicalQuestions();
    expect(answers).toHaveLength(CANONICAL_QUESTIONS.length);
    for (const answer of answers) assertProperty21Chat(answer);
  });

  // ---- Non-vacuity guards: the checks actually reject fabricated grounding ----

  test("negative control: a fabricated clinical value is detected as ungrounded", () => {
    // An invented AMH reading (2.4 ng/mL) is absent from Reference_Data; 7.2 (pH
    // lower limit) is present, so only the fabricated token must be flagged.
    const tokens = extractClinicalTokens("Your AMH is 2.4 ng/mL (pH floor 7.2).");
    expect(tokens).toContain(2.4);
    expect(KNOWN_CLINICAL_VALUES.has(2.4)).toBe(false);
    expect(KNOWN_CLINICAL_VALUES.has(7.2)).toBe(true);
    expect(tokens.some((n) => !KNOWN_CLINICAL_VALUES.has(n))).toBe(true);
  });

  test("negative control: a number attached to a MISSING lab is detected", () => {
    expect(anyMissingLabHasNumberAttached("Day-3 FSH 7.2 ng/mL on file", ["Day-3 FSH"])).toBe(true);
    expect(anyMissingLabHasNumberAttached("Prolactin: 18", ["Prolactin"])).toBe(true);
    // A grounded mention with no attached value is NOT flagged.
    expect(
      anyMissingLabHasNumberAttached("Labs still needed: Day-3 FSH, Prolactin.", [
        "Day-3 FSH",
        "Prolactin",
      ]),
    ).toBe(false);
  });

  test("sanity: at least one canonical answer emits a checkable clinical token", () => {
    // Guards against an accidentally-empty token sweep making the property vacuous.
    const total = answerAllCanonicalQuestions().reduce(
      (n, a) => n + extractClinicalTokens(gatherText(a)).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });
});
