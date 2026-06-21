// ===========================================================================
// Property test — Feature: mariposa, Property 19: Medical-decision requests are
// declined. — Task 9.5 (Owner: Person A)
//
//   "For ANY responder turn requesting a medical decision or acceptance of
//    treatment, the agent declines and adds a follow-up task for the couple,
//    and NEVER accepts on their behalf."
//
// Validates: Requirements 6.9
//
// Strategy: generate step lists with fast-check that contain an arbitrary
// number (>= 0) of `medical_request` steps interleaved with `answer` /
// `verify_request` steps (each given a unique, PII-free text), plus a PII-free
// agent opening. Run the pure `simulateConversation` engine and assert the
// medical-decline guardrail:
//   1. medicalDeclineTasks.length === count of medical_request steps;
//   2. each medical_request step's text is referenced by a follow-up task;
//   3. for EVERY medical_request, the immediately-following agent turn is a
//      decline (mentions it is "not able to make medical decisions" / declines
//      / acts on the "couple's behalf");
//   4. NO agent turn ever affirmatively accepts treatment (no agent turn says
//      it will "approve" / "accept" / "commit" / "start ... treatment" on their
//      behalf).
//
// Concrete cases pin mockInsuranceCall + mockClinicCall (each scripts >= 1
// medical_request): the transcript contains the decline language while the
// result still conforms to the standard schema and nothing is accepted.
// ===========================================================================

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { simulateConversation, mockInsuranceCall, mockClinicCall } from "@/lib/agent";
import type { ScriptStep, ResponderKind } from "@/lib/agent";
import { SEED_AUTH_PACKET } from "@/lib/reference";
import type { ClinicResult, InsuranceResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Guardrail detectors
// ---------------------------------------------------------------------------

/** True if an agent turn is a medical-decision decline (Req 6.9 language). */
function isDecline(text: string): boolean {
  const l = text.toLowerCase();
  return (
    l.includes("not able to make medical decisions") ||
    l.includes("decline") ||
    l.includes("couple's behalf")
  );
}

// Affirmative, first-person commitment by the AGENT to accept/approve/commit/
// start treatment. Requires a commitment lead-in ("I'll", "I will", "yes, I",
// ...) followed (within the same sentence) by an acceptance verb. This is
// intentionally narrow so the legitimate NEGATED decline ("I'm not able to ...
// or accept treatment on the couple's behalf") never matches.
const AFFIRMATIVE_ACCEPT_RE =
  /\b(i'?ll|i will|i can|i'?m going to|i am going to|yes,? i|sure,? i|i'?d be happy to|i'?ll go ahead and)\b[^.?!]*?\b(approve|accept|commit|start)\b/i;

/** True if an agent turn affirmatively accepts treatment on the couple's behalf. */
function agentAffirmativelyAccepts(text: string): boolean {
  return AFFIRMATIVE_ACCEPT_RE.test(text);
}

// ---------------------------------------------------------------------------
// Arbitrary — step lists with an arbitrary number (>= 0) of medical requests
// interleaved with answers / verification requests (PII-free, unique texts).
// ---------------------------------------------------------------------------

const kindArb: fc.Arbitrary<ResponderKind> = fc.constantFrom(
  "answer",
  "verify_request",
  "medical_request",
);

const stepsArb: fc.Arbitrary<ScriptStep[]> = fc
  .array(kindArb, { minLength: 0, maxLength: 14 })
  .map((kinds) =>
    kinds.map((kind, i): ScriptStep => {
      if (kind === "verify_request") {
        return {
          responderKind: "verify_request",
          responderText: `Verify ${i}: please confirm the member's identity before we continue.`,
        };
      }
      if (kind === "medical_request") {
        return {
          responderKind: "medical_request",
          // Responder (NOT the agent) asking the agent to accept treatment.
          responderText: `MedReq ${i}: would you approve and start IVF treatment plan ${i} on the couple's behalf?`,
        };
      }
      return {
        agentQuestion: `Question ${i}: can you share one coverage detail?`,
        responderKind: "answer",
        responderText: `Answer ${i}: here is a benefit detail.`,
      };
    }),
  );

// PII-free agent opening (no member_id / dob).
const SAFE_OPENING =
  "Hi, I'm Mariposa, an authorized assistant calling to ask a few questions.";

// ---------------------------------------------------------------------------
// Minimal schema shape checks (nothing accepted; standard schema upheld)
// ---------------------------------------------------------------------------

function checkInsuranceShape(result: InsuranceResult): void {
  expect(typeof result.diagnostic_covered).toBe("boolean");
  expect(typeof result.semen_analysis_covered).toBe("boolean");
  expect(typeof result.hormone_labs_covered).toBe("boolean");
  expect(Array.isArray(result.prior_auth_required_for)).toBe(true);
  expect(typeof result.in_network_lab).toBe("string");
  expect(Number.isFinite(result.deductible)).toBe(true);
  expect(Number.isFinite(result.coinsurance_pct)).toBe(true);
  expect(Number.isFinite(result.oop_max)).toBe(true);
  expect(typeof result.referral_required).toBe("boolean");
  expect(Array.isArray(result.follow_up_tasks)).toBe(true);
}

function checkClinicShape(result: ClinicResult): void {
  expect(typeof result.booked.date).toBe("string");
  expect(typeof result.booked.time).toBe("string");
  expect(typeof result.booked.mode).toBe("string");
  expect(typeof result.booked.clinic).toBe("string");
  expect(Array.isArray(result.bring_list)).toBe(true);
  expect(Array.isArray(result.tasks.her)).toBe(true);
  expect(Array.isArray(result.tasks.him)).toBe(true);
  expect(Array.isArray(result.tasks.together)).toBe(true);
  expect(typeof result.calendar_event.type).toBe("string");
  expect(typeof result.calendar_event.date).toBe("string");
  expect(typeof result.calendar_event.time).toBe("string");
}

// ---------------------------------------------------------------------------
// Property 19
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 19: Medical-decision requests are declined", () => {
  it("Feature: mariposa, Property 19: Medical-decision requests are declined", () => {
    fc.assert(
      fc.property(stepsArb, (steps) => {
        const { transcript, medicalDeclineTasks } = simulateConversation(
          SEED_AUTH_PACKET,
          SAFE_OPENING,
          steps,
        );

        const medSteps = steps.filter(
          (s) => s.responderKind === "medical_request",
        );

        // 1. One follow-up task per medical request — never accepts silently.
        expect(medicalDeclineTasks.length).toBe(medSteps.length);

        // 2. Every medical request is referenced by a follow-up task for the couple.
        for (const s of medSteps) {
          expect(
            medicalDeclineTasks.some((task) => task.includes(s.responderText)),
          ).toBe(true);
        }

        // 3. The agent turn immediately following each medical request is a decline.
        for (const s of medSteps) {
          const idx = transcript.findIndex(
            (t) => t.speaker === "responder" && t.text === s.responderText,
          );
          expect(idx).toBeGreaterThanOrEqual(0);
          const next = transcript[idx + 1];
          expect(next).toBeDefined();
          expect(next.speaker).toBe("agent");
          expect(isDecline(next.text)).toBe(true);
        }

        // 4. NO agent turn EVER affirmatively accepts treatment on their behalf.
        for (const turn of transcript) {
          if (turn.speaker === "agent") {
            expect(agentAffirmativelyAccepts(turn.text)).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("concrete: mockInsuranceCall declines its scripted medical request and accepts nothing", () => {
    const out = mockInsuranceCall(SEED_AUTH_PACKET);

    // >= 1 scripted decline in the transcript.
    const declines = out.transcript.filter(
      (t) => t.speaker === "agent" && isDecline(t.text),
    );
    expect(declines.length).toBeGreaterThanOrEqual(1);

    // No agent turn affirmatively accepts treatment.
    for (const turn of out.transcript) {
      if (turn.speaker === "agent") {
        expect(agentAffirmativelyAccepts(turn.text)).toBe(false);
      }
    }

    // Result still conforms to the standard insurance schema (nothing accepted).
    checkInsuranceShape(out.result);
  });

  it("concrete: mockClinicCall declines its scripted medical request and accepts nothing", () => {
    const out = mockClinicCall(SEED_AUTH_PACKET);

    const declines = out.transcript.filter(
      (t) => t.speaker === "agent" && isDecline(t.text),
    );
    expect(declines.length).toBeGreaterThanOrEqual(1);

    for (const turn of out.transcript) {
      if (turn.speaker === "agent") {
        expect(agentAffirmativelyAccepts(turn.text)).toBe(false);
      }
    }

    checkClinicShape(out.result);
  });
});
