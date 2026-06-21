// ===========================================================================
// Property test — Feature: mariposa, Property 23: Chat is scoped to the seed couple.
//
//   "For any question, every source cited in the answer references the single
//    seed couple couple_001 / Reference_Data, and no other couple's data
//    appears."
//
// Validates: Requirement 9.3
//
// Strategy: fast-check selects canonical question ids (with repeats) and feeds
// them through the pure answer engine. For every produced ChatAnswer we assert:
//   - sources is non-empty,
//   - EVERY source.coupleId === "couple_001",
//   - EVERY source.reference names a Reference_Data file,
//   - NO foreign couple id (e.g. "couple_002") leaks into any section or source.
// A second arbitrary feeds a couple_001 fixture (with varied non-id fields) to
// confirm scoping holds end-to-end and no foreign identifier appears.
// ===========================================================================

import { describe, test, expect } from "vitest";
import fc from "fast-check";

import {
  answerCanonicalQuestion,
  answerAllCanonicalQuestions,
  CANONICAL_QUESTIONS,
  type CanonicalQuestionId,
  type ChatAnswer,
  type CoupleData,
} from "@/lib/chat/grounded-chat";
import { SEED_COUPLE_FIXTURE } from "@/lib/reference";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEED_COUPLE_ID = "couple_001";

/** The Reference_Data files that may legitimately be cited (README included). */
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

const QUESTION_IDS = CANONICAL_QUESTIONS.map((q) => q.id);

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Any of the five canonical question ids (fast-check selects + repeats). */
const questionIdArb: fc.Arbitrary<CanonicalQuestionId> = fc.constantFrom(
  ...QUESTION_IDS,
);

/**
 * A couple_001 fixture whose id is pinned to the seed couple while a few
 * scoping-irrelevant fields vary. This confirms scoping is driven by the
 * couple's identity, not by any single concrete value.
 */
const seedScopedCoupleArb: fc.Arbitrary<CoupleData> = fc.record({
  readinessScore: fc.integer({ min: 0, max: 100 }),
  heatExposure: fc.boolean(),
  cycleRegular: fc.boolean(),
  monthsTrying: fc.integer({ min: 0, max: 36 }),
}).map(({ readinessScore, heatExposure, cycleRegular, monthsTrying }) => ({
  ...SEED_COUPLE_FIXTURE,
  couple: { ...SEED_COUPLE_FIXTURE.couple, id: SEED_COUPLE_ID },
  herProfile: {
    ...SEED_COUPLE_FIXTURE.herProfile,
    cycle_regular: cycleRegular,
    months_trying: monthsTrying,
  },
  himProfile: {
    ...SEED_COUPLE_FIXTURE.himProfile,
    readiness_score: readinessScore,
    lifestyle: { ...SEED_COUPLE_FIXTURE.himProfile.lifestyle, heat_exposure: heatExposure },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Concatenate every text-bearing field of an answer (sections + sources). */
function gatherAllText(answer: ChatAnswer): string {
  const sourceText = answer.sources
    .map((s) => `${s.coupleId} ${s.reference} ${s.detail}`)
    .join(" ");
  return [
    answer.question,
    answer.shortAnswer,
    answer.basedOnYourData,
    answer.whatsUncertain,
    answer.sharedNextStep,
    sourceText,
  ].join(" ");
}

/** Every `couple_<n>` identifier appearing anywhere in the answer. */
function coupleIdsInAnswer(answer: ChatAnswer): string[] {
  const matches = gatherAllText(answer).match(/couple_\d+/gi);
  return matches ?? [];
}

/** Assert a single answer is fully scoped to couple_001 / Reference_Data. */
function assertScopedToSeedCouple(answer: ChatAnswer): void {
  // Sources must exist and cite at least one source.
  expect(answer.sources.length).toBeGreaterThan(0);

  for (const source of answer.sources) {
    // Every cited source references the single seed couple.
    expect(source.coupleId).toBe(SEED_COUPLE_ID);
    // Every source names a Reference_Data file.
    const namesReferenceFile = KNOWN_REFERENCE_FILES.some((f) =>
      source.reference.includes(f),
    );
    expect(namesReferenceFile).toBe(true);
  }

  // No foreign couple id leaks into any section or source.
  for (const id of coupleIdsInAnswer(answer)) {
    expect(id.toLowerCase()).toBe(SEED_COUPLE_ID);
  }
  expect(gatherAllText(answer)).not.toContain("couple_002");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 23: Chat is scoped to the seed couple", () => {
  test("every answer (default seed couple) cites only couple_001 / Reference_Data", () => {
    fc.assert(
      fc.property(questionIdArb, (questionId) => {
        const answer = answerCanonicalQuestion(questionId);
        assertScopedToSeedCouple(answer);
      }),
      { numRuns: 200 },
    );
  });

  test("scoping holds for an explicit couple_001 fixture with varied fields", () => {
    fc.assert(
      fc.property(questionIdArb, seedScopedCoupleArb, (questionId, couple) => {
        const answer = answerCanonicalQuestion(questionId, couple);
        assertScopedToSeedCouple(answer);
        // No foreign couple identifier string leaks into any section.
        expect(gatherAllText(answer)).not.toContain("couple_002");
      }),
      { numRuns: 200 },
    );
  });

  test("all five canonical questions are individually scoped to the seed couple", () => {
    for (const q of CANONICAL_QUESTIONS) {
      const answer = answerCanonicalQuestion(q.id);
      assertScopedToSeedCouple(answer);
    }
  });

  test("answerAllCanonicalQuestions yields five fully-scoped answers", () => {
    const answers = answerAllCanonicalQuestions();
    expect(answers).toHaveLength(CANONICAL_QUESTIONS.length);
    for (const answer of answers) {
      assertScopedToSeedCouple(answer);
    }
  });
});
