// ===========================================================================
// Deterministic Mock_Fallback (lib/agent/mock-fallback.ts)
//   — Req 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 6.9, 15.5
//
// PURE functions (NO I/O, NO Date.now(), NO Math.random(), no other
// nondeterministic source). The Mock_Fallback is a pure function of
// (call type, authorization packet): identical inputs ALWAYS yield an identical
// transcript, identical schema, and identical field values across repeated runs
// (Property 17 / Req 6.7, 15.5, 16.3).
//
// The scripted dialogue, question order, mock rep/clinic responses, and the
// verbatim extracted results all come from reference-data/call-scripts.md via
// @/lib/reference — no call dialogue or clinical value is invented here.
//
// Guardrails enforced by the pure conversation engine (call-scripts.md):
//   - Identity withholding (Property 18 / Req 6.8): the member ID and the policy
//     holder's date of birth NEVER appear in an agent turn until AFTER a responder
//     turn requests identity verification. The agent opening and every question
//     turn are PII-free; the single disclosure turn fires only in response to a
//     verification request.
//   - Medical-decision declines (Property 19 / Req 6.9): for ANY responder turn
//     that requests a medical decision or acceptance of treatment, the agent
//     declines and records a follow-up task for the couple; it never accepts on
//     their behalf.
//
// The write-back (I/O) lives in index.ts (applyClinicWriteBack) so this module
// stays pure and Property 17 holds for the fallback itself.
// ===========================================================================

import {
  AUTHORIZATION_PACKET,
  CLINIC_AGENT_OPENING,
  CLINIC_CALL_QUESTIONS,
  CLINIC_MOCK_RESPONSES,
  CLINIC_RESULT,
  INSURANCE_QUESTIONS,
  INSURANCE_MOCK_RESPONSES,
  INSURANCE_RESULT,
} from "@/lib/reference";
import type {
  AuthPacket,
  CallOutput,
  ClinicResult,
  InsuranceResult,
  Turn,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Pure conversation engine
// ---------------------------------------------------------------------------

/** How the agent must react to a given responder turn (drives the guardrails). */
export type ResponderKind = "answer" | "verify_request" | "medical_request";

/** One scripted exchange: an optional agent question + the responder's reply. */
export interface ScriptStep {
  /** Agent question asked before the responder replies (exact reference string). */
  agentQuestion?: string;
  /** Classifies the responder turn so the engine can apply guardrails. */
  responderKind: ResponderKind;
  /** The responder's verbatim turn text. */
  responderText: string;
}

/** Output of the pure conversation engine. */
export interface ConversationOutput {
  transcript: Turn[];
  /** Follow-up tasks created because the agent declined a medical decision. */
  medicalDeclineTasks: string[];
  /** True once the agent has disclosed identity (after a verification request). */
  identityDisclosed: boolean;
}

// Guardrail-safe agent openings (NO member_id / dob — Property 18).
const INSURANCE_OPENING_SAFE =
  "Hi, I'm Mariposa, an authorized assistant calling on behalf of a member to " +
  `verify fertility benefits under ${AUTHORIZATION_PACKET.insurance.provider}. ` +
  "Can I ask a few coverage questions?";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format an ISO `YYYY-MM-DD` date as a spoken date (e.g. "November 2, 1990").
 * Pure, manual parse — avoids Date()/timezone nondeterminism, and keeps the
 * disclosed DOB out of ISO `YYYY-MM-DD` form so it can never be mistaken for an
 * appointment date by a downstream transcript parser.
 */
export function formatDobSpoken(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const year = m[1];
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  const monthName = MONTHS[monthIndex] ?? m[2];
  return `${monthName} ${day}, ${year}`;
}

/**
 * Run a scripted conversation deterministically, enforcing the call-scripts.md
 * guardrails. PURE: identical inputs always produce an identical transcript.
 *
 * The agent speaks the opening first, then for each step asks the (optional)
 * question and reacts to the responder turn. Identity is disclosed ONLY in
 * response to a `verify_request`; medical-decision requests are always declined.
 */
export function simulateConversation(
  packet: AuthPacket,
  opening: string,
  steps: ScriptStep[],
): ConversationOutput {
  const transcript: Turn[] = [];
  const medicalDeclineTasks: string[] = [];
  let identityDisclosed = false;

  transcript.push({ speaker: "agent", text: opening });

  for (const step of steps) {
    if (step.agentQuestion) {
      transcript.push({ speaker: "agent", text: step.agentQuestion });
    }

    transcript.push({ speaker: "responder", text: step.responderText });

    if (step.responderKind === "verify_request") {
      // Disclosure is the ONLY agent turn that may contain member ID / DOB,
      // and it fires only after this verification request (Property 18).
      transcript.push({
        speaker: "agent",
        text:
          `Thank you. For verification: the member ID is ${packet.member_id}, ` +
          `and the policy holder's date of birth is ${formatDobSpoken(packet.dob)}.`,
      });
      identityDisclosed = true;
    } else if (step.responderKind === "medical_request") {
      // Never accept treatment on the couple's behalf; decline + add a task
      // (Property 19 / Req 6.9).
      transcript.push({
        speaker: "agent",
        text:
          "I'm not able to make medical decisions or accept treatment on the " +
          "couple's behalf. I'll note this as a follow-up task for them to " +
          "decide with their clinician.",
      });
      medicalDeclineTasks.push(
        `Couple to decide with their clinician: ${step.responderText}`,
      );
    }
  }

  return { transcript, medicalDeclineTasks, identityDisclosed };
}

// ---------------------------------------------------------------------------
// Insurance Mock_Fallback — Req 6.2
// ---------------------------------------------------------------------------

/** Scripted responder turns for a call type (shared by Mock_Fallback and Grok Voice). */
export function callScriptSteps(callType: "insurance" | "clinic"): ScriptStep[] {
  return callType === "insurance" ? insuranceScript() : clinicScript();
}

/** Build the deterministic insurance-call script (verify → 10 Qs → decline). */
function insuranceScript(): ScriptStep[] {
  const steps: ScriptStep[] = [
    {
      // Responder asks to verify identity before sharing any plan details.
      responderKind: "verify_request",
      responderText:
        "Before I share any plan details, I need to verify the member. Can you " +
        "confirm the member ID and the policy holder's date of birth?",
    },
    // The 10 insurance questions, asked in the EXACT reference order (Req 6.2).
    ...INSURANCE_QUESTIONS.map(
      (question, i): ScriptStep => ({
        agentQuestion: question,
        responderKind: "answer",
        responderText: INSURANCE_MOCK_RESPONSES[i],
      }),
    ),
    {
      // A responder request for a medical decision — must be declined (Req 6.9).
      responderKind: "medical_request",
      responderText:
        "Based on these benefits, would you like me to approve and start an IVF " +
        "treatment plan for the member right now?",
    },
  ];
  return steps;
}

/**
 * Deterministic insurance Mock_Fallback. Returns the verbatim transcript plus
 * the verbatim extracted INSURANCE_RESULT from reference-data/call-scripts.md.
 * PURE function of `packet` (Property 17).
 */
export function mockInsuranceCall(packet: AuthPacket): CallOutput<InsuranceResult> {
  const { transcript } = simulateConversation(
    packet,
    INSURANCE_OPENING_SAFE,
    insuranceScript(),
  );

  transcript.push({
    speaker: "agent",
    text:
      "Thank you. I've confirmed coverage, in-network labs, and costs, and I've " +
      "logged follow-up tasks for the couple. Nothing binding was accepted on the call.",
  });

  return {
    transcript,
    result: structuredClone(INSURANCE_RESULT),
    usedFallback: true,
    resultSource: "fallback",
  };
}

// ---------------------------------------------------------------------------
// Clinic Mock_Fallback — Req 6.3
// ---------------------------------------------------------------------------

/** Build the deterministic clinic-call script (7 Qs in order + verify + book). */
function clinicScript(): ScriptStep[] {
  const steps: ScriptStep[] = [];

  CLINIC_CALL_QUESTIONS.forEach((question, i) => {
    steps.push({
      agentQuestion: question,
      responderKind: "answer",
      responderText: CLINIC_MOCK_RESPONSES[i],
    });

    // After the in-network question (index 2) the clinic verifies the member.
    if (i === 2) {
      steps.push({
        responderKind: "verify_request",
        responderText:
          "To check in-network status I'll need to verify the member — what's " +
          "the member ID and the policy holder's date of birth?",
      });
    }
  });

  // The agent books the in-person Jun 25 slot and confirms it back.
  steps.push({
    agentQuestion:
      "Let's book the in-person consult on the 25th. Can you confirm the appointment details?",
    responderKind: "answer",
    responderText:
      "Confirmed: 2026-06-25 at 14:00, in person. " +
      "Clinic: Bay Area Fertility & Reproductive Health.",
  });

  // A responder request for a medical decision — must be declined (Req 6.9).
  steps.push({
    responderKind: "medical_request",
    responderText:
      "Should I go ahead and commit the couple to the IVF protocol at intake?",
  });

  return steps;
}

/**
 * Deterministic clinic Mock_Fallback. Returns the verbatim transcript plus the
 * verbatim extracted CLINIC_RESULT from reference-data/call-scripts.md.
 * PURE function of `packet` (Property 17). The Jun 25 calendar event, tasks, and
 * summary write-back are performed by applyClinicWriteBack in index.ts (I/O kept
 * separate so this fallback stays pure).
 */
export function mockClinicCall(packet: AuthPacket): CallOutput<ClinicResult> {
  const { transcript } = simulateConversation(
    packet,
    CLINIC_AGENT_OPENING,
    clinicScript(),
  );

  transcript.push({
    speaker: "agent",
    text:
      "Great — the June 25 in-person consult is booked. I'll prepare the " +
      "her/his/together tasks and the bring-list for the couple. No medical " +
      "decision was made on their behalf.",
  });

  return {
    transcript,
    result: structuredClone(CLINIC_RESULT),
    usedFallback: true,
    resultSource: "fallback",
  };
}
