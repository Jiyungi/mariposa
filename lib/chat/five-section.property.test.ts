// ===========================================================================
// Property test — Feature: mariposa, Property 22: Chat answers use the fixed
// five-section format.
//
//   "For any question, the grounded-chat answer contains the five sections —
//    Short answer, Based on your data, What's uncertain, Shared next step,
//    Sources — in that exact order, each present and non-empty."
//
// Validates: Requirements 9.2
//
// Strategy: cover the full canonical-question input space two ways —
//   1) iterate every CANONICAL_QUESTIONS id and answer it directly, and
//   2) generate arbitrary free-text strings, route them through
//      matchCanonicalQuestion, and (when a canonical id is matched) answer that.
// For each produced ChatAnswer we assert the five named sections exist in the
// EXACT order encoded by CHAT_SECTION_ORDER, each text section is a non-empty
// trimmed string, and `sources` is a non-empty array. We also assert the same
// invariants on a string serialization (section headers appear in order, none
// empty) to mirror how the UI renders the answer.
//
// Unmatched free text (matchCanonicalQuestion -> null) is out of scope for this
// property and is skipped, per the task definition.
// ===========================================================================

import { describe, test, expect } from "vitest";
import fc from "fast-check";

import {
  answerCanonicalQuestion,
  answerAllCanonicalQuestions,
  matchCanonicalQuestion,
  CANONICAL_QUESTIONS,
  CHAT_SECTION_ORDER,
  type CanonicalQuestionId,
  type ChatAnswer,
} from "@/lib/chat/grounded-chat";

// ---------------------------------------------------------------------------
// Section-order contract
// ---------------------------------------------------------------------------

// The fixed five sections, in their required order (Req 9.2). We assert the
// module's CHAT_SECTION_ORDER encodes exactly this so the rest of the test can
// trust it as the source of truth for ordering.
const EXPECTED_SECTION_ORDER = [
  "Short answer",
  "Based on your data",
  "What's uncertain",
  "Shared next step",
  "Sources",
] as const;

// Maps each ordered section header to the ChatAnswer field that backs it.
const TEXT_SECTION_FIELDS: ReadonlyArray<{
  header: (typeof EXPECTED_SECTION_ORDER)[number];
  field: keyof ChatAnswer;
}> = [
  { header: "Short answer", field: "shortAnswer" },
  { header: "Based on your data", field: "basedOnYourData" },
  { header: "What's uncertain", field: "whatsUncertain" },
  { header: "Shared next step", field: "sharedNextStep" },
];

/** Serialize an answer the way the UI would, headers in fixed order. */
function serializeAnswer(answer: ChatAnswer): string {
  const sourcesText = answer.sources
    .map((s) => `${s.coupleId} — ${s.reference}: ${s.detail}`)
    .join("\n");
  return [
    `Short answer\n${answer.shortAnswer}`,
    `Based on your data\n${answer.basedOnYourData}`,
    `What's uncertain\n${answer.whatsUncertain}`,
    `Shared next step\n${answer.sharedNextStep}`,
    `Sources\n${sourcesText}`,
  ].join("\n\n");
}

/**
 * Core assertion for Property 22: the answer carries all five sections, in the
 * exact fixed order, each text section non-empty (trimmed) and `sources` a
 * non-empty array — both on the structured object and on its serialization.
 */
function assertFiveSectionFormat(answer: ChatAnswer): void {
  // CHAT_SECTION_ORDER encodes the exact required five-section order.
  expect(CHAT_SECTION_ORDER).toEqual(EXPECTED_SECTION_ORDER);

  // Each text section field is present and a non-empty trimmed string.
  for (const { field } of TEXT_SECTION_FIELDS) {
    const value = answer[field];
    expect(typeof value).toBe("string");
    expect((value as string).trim().length).toBeGreaterThan(0);
  }

  // Sources section: a non-empty array, every source scoped + non-empty.
  expect(Array.isArray(answer.sources)).toBe(true);
  expect(answer.sources.length).toBeGreaterThan(0);
  for (const source of answer.sources) {
    expect(source.coupleId.trim().length).toBeGreaterThan(0);
    expect(source.reference.trim().length).toBeGreaterThan(0);
    expect(source.detail.trim().length).toBeGreaterThan(0);
  }

  // Serialized form: headers appear in the exact fixed order, none empty.
  const serialized = serializeAnswer(answer);
  let cursor = -1;
  for (const header of EXPECTED_SECTION_ORDER) {
    const idx = serialized.indexOf(header, cursor + 1);
    expect(idx).toBeGreaterThan(cursor); // present and strictly after the prior
    cursor = idx;
  }
  // No section body in the serialization is empty (header immediately followed
  // by content on the next line).
  for (const header of EXPECTED_SECTION_ORDER) {
    const re = new RegExp(`${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n(.+)`);
    const match = serialized.match(re);
    expect(match).not.toBeNull();
    expect((match![1] ?? "").trim().length).toBeGreaterThan(0);
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const CANONICAL_IDS: readonly CanonicalQuestionId[] = CANONICAL_QUESTIONS.map(
  (q) => q.id,
);

// Generate inputs that should route to a canonical question: the ids
// themselves, the exact prompts, individual keyword cues, and keyword cues
// embedded in a longer free-text sentence (with varied casing/whitespace).
const matchableTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...CANONICAL_IDS),
  fc.constantFrom(...CANONICAL_QUESTIONS.map((q) => q.prompt)),
  fc.constantFrom(
    ...CANONICAL_QUESTIONS.flatMap((q) => q.keywords),
  ),
  // Keyword embedded in surrounding free text, with random padding/casing.
  fc
    .tuple(
      fc.constantFrom(...CANONICAL_QUESTIONS.flatMap((q) => q.keywords)),
      fc.string(),
      fc.string(),
    )
    .map(([kw, pre, post]) => `${pre} ${kw} ${post}`),
);

// Fully arbitrary free text — most will NOT match (out of scope, skipped), but
// this exercises the matcher + answer path against anything that does match.
const freeTextArb: fc.Arbitrary<string> = fc.string();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 22: Chat answers use the fixed five-section format", () => {
  test("every canonical question id yields the fixed five-section format", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CANONICAL_IDS), (id) => {
        assertFiveSectionFormat(answerCanonicalQuestion(id));
      }),
      { numRuns: 100 },
    );
  });

  test("matched free-text (via matchCanonicalQuestion) yields the fixed five-section format", () => {
    fc.assert(
      fc.property(fc.oneof(matchableTextArb, freeTextArb), (text) => {
        const id = matchCanonicalQuestion(text);
        // Unmatched text is out of scope for this property.
        if (id === null) return;
        expect(CANONICAL_IDS).toContain(id);
        assertFiveSectionFormat(answerCanonicalQuestion(id));
      }),
      { numRuns: 300 },
    );
  });

  test("all five canonical answers (concrete sweep) satisfy the format and are exhaustive", () => {
    const answers = answerAllCanonicalQuestions();
    expect(answers).toHaveLength(CANONICAL_QUESTIONS.length);
    for (const answer of answers) {
      assertFiveSectionFormat(answer);
    }
  });
});
