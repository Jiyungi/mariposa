// ===========================================================================
// Property test — Feature: mariposa, Property 10: Every task is assigned to
// exactly one column.
//
//   "For any extracted call result, each follow-up task created is assigned to
//    exactly one of the columns Her, His, or Together (never zero, never more
//    than one)."
//
// Validates: Requirements 5.2, 5.5
//
// Strategy: generate VARIED call transcripts (Turn[]) — mixing agent/responder
// turns, including/omitting subjects, and varying phrasing — feed each through
// BOTH extractInsuranceResult and extractClinicResult, and assert that every
// produced followUpTasks[].column is present and is exactly one of the three
// TaskColumn values. The seed mock transcripts (built from the call-scripts
// fixtures) are included as a concrete, named case.
// ===========================================================================

import { describe, test, expect } from "vitest";
import fc from "fast-check";

import {
  extractInsuranceResult,
  extractClinicResult,
} from "@/lib/core/extract";
import type { TaskColumn, Turn } from "@/lib/types";
import {
  INSURANCE_QUESTIONS,
  INSURANCE_MOCK_RESPONSES,
  CLINIC_CALL_QUESTIONS,
  CLINIC_MOCK_RESPONSES,
} from "@/lib/reference/call-scripts";

// The complete, closed set of valid columns (lib/types.ts → TaskColumn).
const VALID_COLUMNS: readonly TaskColumn[] = ["her", "him", "together"] as const;

/**
 * Core assertion for Property 10: every follow-up task carries a column that is
 * present (not undefined/empty) and is EXACTLY ONE of the valid TaskColumns.
 */
function assertExactlyOneColumn(
  followUpTasks: ReadonlyArray<{ column: TaskColumn; title: string }>,
): void {
  for (const task of followUpTasks) {
    // Present — never zero (undefined / null / empty).
    expect(task.column).toBeDefined();
    expect(typeof task.column).toBe("string");
    expect((task.column as string).length).toBeGreaterThan(0);

    // Exactly one — a single membership in the closed column set, never more.
    const memberships = VALID_COLUMNS.filter((c) => c === task.column);
    expect(memberships).toHaveLength(1);
    expect(VALID_COLUMNS).toContain(task.column);
  }
}

// ---------------------------------------------------------------------------
// Arbitraries — varied transcripts that exercise hit / partial / miss paths
// ---------------------------------------------------------------------------

const speakerArb: fc.Arbitrary<Turn["speaker"]> = fc.constantFrom(
  "agent",
  "responder",
);

// Phrases that DO carry extractable subjects (drive the "resolved" branches and
// derived tasks), with varied phrasing and casing.
const subjectPhraseArb: fc.Arbitrary<string> = fc.constantFrom(
  "Diagnostic evaluation: covered after deductible.",
  "Diagnostic fertility evaluation is not covered.",
  "Semen analysis 89320: covered.",
  "Hormone labs are covered.",
  "Prior auth required for IUI and IVF.",
  "Prior authorization not required.",
  'In-network lab: "Crest Diagnostics".',
  "Deductible $1,500; coinsurance 20%; OOP max $4,000.",
  "Referral not required for in-network REI.",
  "Referral is required.",
  "Bring: ID, insurance card, cycle history, semen analysis, AMH result, labs.",
  "Slot booked 2026-06-25 at 14:00 in person. Clinic: Bay Area Fertility.",
  "We can see you 2026-06-29 09:30 virtual. clinic - Pacific REI.",
);

// Phrases with NO extractable subject (drive the "unresolved" branches).
const noisePhraseArb: fc.Arbitrary<string> = fc.constantFrom(
  "Thanks for holding, one moment please.",
  "Sure, happy to help with that.",
  "Let me pull up the account.",
  "",
  "Have a great day!",
);

const turnArb: fc.Arbitrary<Turn> = fc.record({
  speaker: speakerArb,
  text: fc.oneof(
    subjectPhraseArb,
    noisePhraseArb,
    // Fully arbitrary free text — exercises the parsers against anything.
    fc.string(),
  ),
});

// Transcripts vary in length and composition (including the empty transcript).
const transcriptArb: fc.Arbitrary<Turn[]> = fc.array(turnArb, {
  minLength: 0,
  maxLength: 12,
});

// ---------------------------------------------------------------------------
// Seed concrete case — built from the call-scripts.ts fixtures
// ---------------------------------------------------------------------------

/** Interleave a question list (agent) with its mock responses (responder). */
function buildSeedTranscript(
  questions: readonly string[],
  responses: readonly string[],
): Turn[] {
  const turns: Turn[] = [];
  const n = Math.max(questions.length, responses.length);
  for (let i = 0; i < n; i++) {
    if (questions[i] !== undefined) {
      turns.push({ speaker: "agent", text: questions[i] });
    }
    if (responses[i] !== undefined) {
      turns.push({ speaker: "responder", text: responses[i] });
    }
  }
  return turns;
}

const SEED_INSURANCE_TRANSCRIPT = buildSeedTranscript(
  INSURANCE_QUESTIONS,
  INSURANCE_MOCK_RESPONSES,
);
const SEED_CLINIC_TRANSCRIPT = buildSeedTranscript(
  CLINIC_CALL_QUESTIONS,
  CLINIC_MOCK_RESPONSES,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 10: Every task is assigned to exactly one column", () => {
  test("insurance extractor: every follow-up task has exactly one column (varied transcripts)", () => {
    fc.assert(
      fc.property(transcriptArb, (transcript) => {
        const { followUpTasks } = extractInsuranceResult(transcript);
        assertExactlyOneColumn(followUpTasks);
      }),
      { numRuns: 200 },
    );
  });

  test("clinic extractor: every follow-up task has exactly one column (varied transcripts)", () => {
    fc.assert(
      fc.property(transcriptArb, (transcript) => {
        const { followUpTasks } = extractClinicResult(transcript);
        assertExactlyOneColumn(followUpTasks);
      }),
      { numRuns: 200 },
    );
  });

  test("seed mock transcripts (call-scripts fixtures) assign each task exactly one column", () => {
    const insurance = extractInsuranceResult(SEED_INSURANCE_TRANSCRIPT);
    const clinic = extractClinicResult(SEED_CLINIC_TRANSCRIPT);

    // Sanity: the seed transcripts actually produce tasks to check.
    expect(insurance.followUpTasks.length).toBeGreaterThan(0);
    expect(clinic.followUpTasks.length).toBeGreaterThan(0);

    assertExactlyOneColumn(insurance.followUpTasks);
    assertExactlyOneColumn(clinic.followUpTasks);
  });
});
