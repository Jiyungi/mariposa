// ===========================================================================
// Property 18: Identity details withheld until verification requested — Task 9.4
//   Validates: Requirements 6.8
//
// "For any call conversation, the member ID and date of birth are disclosed only
//  AFTER the responder requests identity verification, and never before."
//
// Two complementary angles:
//
//   Angle 1 — exercises the deterministic Mock_Fallback end points
//   (mockInsuranceCall / mockClinicCall) over fast-check-generated AuthPackets.
//   For each produced transcript we locate the FIRST responder turn that
//   requests identity verification and assert no agent turn before it discloses
//   the member ID or the date of birth (in ISO or spoken form), and that those
//   identifiers appear ONLY in an agent turn at/after that request.
//
//   Angle 2 — exercises the pure conversation engine (simulateConversation)
//   over fast-check-generated step lists that mix "answer", "medical_request",
//   and zero-or-more "verify_request" steps in arbitrary order, with a PII-free
//   opening. It asserts the member ID / DOB never appear in any agent turn
//   preceding the first verify_request, and — when there is NO verify_request —
//   never appear in any agent turn at all.
// ===========================================================================

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  formatDobSpoken,
  mockClinicCall,
  mockInsuranceCall,
  simulateConversation,
  type ScriptStep,
} from "@/lib/agent";
import type { AuthPacket, PolicyHolder, Turn } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A responder turn requests identity verification when it asks to "verify" the
 * caller or names the "member id" / "date of birth" identifiers (call-scripts.md
 * guardrail: identity is only shared once the responder asks to verify).
 */
function isVerificationRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("verify") ||
    lower.includes("member id") ||
    lower.includes("date of birth")
  );
}

/** Index of the first RESPONDER turn that requests identity verification. */
function firstVerificationRequestIndex(transcript: Turn[]): number {
  return transcript.findIndex(
    (turn) => turn.speaker === "responder" && isVerificationRequest(turn.text),
  );
}

/** Does this turn's text disclose the member ID or the DOB (ISO or spoken)? */
function disclosesIdentity(text: string, packet: AuthPacket): boolean {
  const spokenDob = formatDobSpoken(packet.dob);
  return (
    text.includes(packet.member_id) ||
    text.includes(packet.dob) ||
    text.includes(spokenDob)
  );
}

// ---------------------------------------------------------------------------
// Arbitrary: varied AuthPackets (Angle 1)
//   Distinctive, non-empty member_id + valid ISO dob so substring checks are
//   meaningful and never accidentally match generic dialogue.
// ---------------------------------------------------------------------------

const policyHolderArb: fc.Arbitrary<PolicyHolder> = fc.constantFrom("her", "him");

const isoDateArb: fc.Arbitrary<string> = fc
  .date({ min: new Date("1950-01-01"), max: new Date("2005-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

const memberIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("ZQX", "MBR", "KLT", "VRN", "WPH"),
    fc.integer({ min: 1000, max: 9999 }),
    fc.integer({ min: 1000, max: 9999 }),
  )
  .map(([prefix, a, b]) => `${prefix}-${a}-${b}`);

const authPacketArb: fc.Arbitrary<AuthPacket> = fc.record({
  couple_id: fc.constantFrom("couple_001", "couple_002", "couple_xyz"),
  member_id: memberIdArb,
  dob: isoDateArb,
  provider: fc.constantFrom(
    "Pacific Crest Health",
    "Blue Ridge Mutual",
    "Cascade Care",
  ),
  plan_type: fc.constantFrom("PPO", "HMO", "EPO", "POS"),
  group_number: fc.integer({ min: 100000, max: 999999 }).map((n) => `GRP-${n}`),
  policy_holder: policyHolderArb,
});

// ---------------------------------------------------------------------------
// Arbitrary: step lists for the pure engine (Angle 2)
//   Benign, PII-free text pools so any member_id/dob appearance can only come
//   from the engine's disclosure turn (never from the generated dialogue).
// ---------------------------------------------------------------------------

const ANSWER_TEXTS = [
  "Yes, that benefit is covered after the deductible.",
  "Prior authorization is required for that service.",
  "The in-network lab is available for those tests.",
  "We are accepting new patients at this time.",
  "Telehealth first visits are available.",
] as const;

const VERIFY_TEXTS = [
  "Before I continue I need to verify the member.",
  "Can you confirm the member ID and the date of birth?",
  "I'll need to verify identity to share plan details.",
] as const;

const MEDICAL_TEXTS = [
  "Should I approve and start the treatment plan now?",
  "Do you want me to commit the couple to the protocol?",
  "Shall I accept the IVF treatment on their behalf?",
] as const;

const stepArb: fc.Arbitrary<ScriptStep> = fc.oneof(
  fc.record({
    agentQuestion: fc.constantFrom(
      "How does the plan define eligibility?",
      "Which labs are in-network?",
      "What should they bring to the consult?",
    ),
    responderKind: fc.constant<"answer">("answer"),
    responderText: fc.constantFrom(...ANSWER_TEXTS),
  }),
  fc.record({
    responderKind: fc.constant<"verify_request">("verify_request"),
    responderText: fc.constantFrom(...VERIFY_TEXTS),
  }),
  fc.record({
    responderKind: fc.constant<"medical_request">("medical_request"),
    responderText: fc.constantFrom(...MEDICAL_TEXTS),
  }),
);

// A PII-free agent opening for the pure-engine angle.
const SAFE_OPENING =
  "Hi, I'm Mariposa, an authorized assistant calling on behalf of a member to " +
  "verify fertility benefits. Can I ask a few coverage questions?";

// ---------------------------------------------------------------------------
// Property 18
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 18: Identity details withheld until verification requested", () => {
  it("Feature: mariposa, Property 18: Identity details withheld until verification requested", () => {
    // --- Angle 1: Mock_Fallback insurance + clinic calls ---
    fc.assert(
      fc.property(authPacketArb, (packet) => {
        for (const output of [mockInsuranceCall(packet), mockClinicCall(packet)]) {
          const transcript = output.transcript;
          const verifyIdx = firstVerificationRequestIndex(transcript);

          // A verification request must occur (identity is gated behind it).
          expect(verifyIdx).toBeGreaterThanOrEqual(0);

          // No agent turn BEFORE the verification request discloses identity.
          transcript.slice(0, verifyIdx).forEach((turn) => {
            if (turn.speaker === "agent") {
              expect(disclosesIdentity(turn.text, packet)).toBe(false);
            }
          });

          // Every agent turn that discloses identity is at/after the request,
          // and at least one such disclosure exists (member ID + spoken DOB).
          let disclosedMemberId = false;
          let disclosedDob = false;
          transcript.forEach((turn, idx) => {
            if (turn.speaker !== "agent") return;
            if (disclosesIdentity(turn.text, packet)) {
              expect(idx).toBeGreaterThanOrEqual(verifyIdx);
            }
            if (idx >= verifyIdx) {
              if (turn.text.includes(packet.member_id)) disclosedMemberId = true;
              if (turn.text.includes(formatDobSpoken(packet.dob))) disclosedDob = true;
            }
          });
          expect(disclosedMemberId).toBe(true);
          expect(disclosedDob).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: mariposa, Property 18: pure engine withholds identity before any verify_request", () => {
    // --- Angle 2: pure simulateConversation over arbitrary step lists ---
    fc.assert(
      fc.property(authPacketArb, fc.array(stepArb, { maxLength: 12 }), (packet, steps) => {
        const { transcript } = simulateConversation(packet, SAFE_OPENING, steps);

        const hasVerifyRequest = steps.some(
          (s) => s.responderKind === "verify_request",
        );

        if (!hasVerifyRequest) {
          // With NO verification request, identity must NEVER be disclosed.
          transcript.forEach((turn) => {
            if (turn.speaker === "agent") {
              expect(disclosesIdentity(turn.text, packet)).toBe(false);
            }
          });
          return;
        }

        // Locate the first verify_request's responder turn in the transcript.
        const verifyIdx = transcript.findIndex(
          (turn) =>
            turn.speaker === "responder" &&
            (VERIFY_TEXTS as readonly string[]).includes(turn.text),
        );
        expect(verifyIdx).toBeGreaterThanOrEqual(0);

        // No agent turn preceding the first verify_request discloses identity.
        transcript.slice(0, verifyIdx).forEach((turn) => {
          if (turn.speaker === "agent") {
            expect(disclosesIdentity(turn.text, packet)).toBe(false);
          }
        });
      }),
      { numRuns: 100 },
    );
  });
});
