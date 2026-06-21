// ===========================================================================
// Grok Voice call scripts (simulated): authorization packet, the insurance
// 10-question order, the clinic 7-question order, the mock rep/clinic responses,
// and the structured results the agent extracts.
// SOURCE (verbatim): reference-data/call-scripts.md
//   (question lists cross-grounded in insurance-coverage-data.md +
//    clinic-intake-data.md). Consumed by Person B's agent (Task 9) and chat (Task 18).
// SINGLE SOURCE OF TRUTH — no call dialogue / mock response lives elsewhere.
// ===========================================================================

import type { InsuranceResult, ClinicResult, CallObjective } from "@/lib/types";

// --- Authorization packet (what the agent has before any call) -------------
// reference-data/call-scripts.md — "Authorization packet"
export const AUTHORIZATION_PACKET = {
  caller_identity: "Mariposa, an authorized assistant calling on behalf of the patient",
  patient_names: ["Maya", "Daniel"],
  dob: { her: "1992-09-14", him: "1990-11-02" }, // fictional
  insurance: {
    provider: "Pacific Crest Health",
    member_id: "PCH-0000-1234",
    group_number: "GRP-558823",
    policy_holder: "him",
  },
  guardrails: [
    "Only share member ID / DOB when the rep asks to verify identity.",
    "Do not make medical decisions or accept treatment on the couple's behalf.",
    "Confirm everything back; create follow-up tasks instead of committing to anything binding.",
  ],
} as const;

// ===========================================================================
// CALL 1 — Insurance verification
// ===========================================================================

export const INSURANCE_CALL_OBJECTIVE =
  "confirm fertility coverage, prior auth, in-network labs, CPT coverage, costs";

export const INSURANCE_AGENT_OPENING =
  "Hi, I'm Mariposa, calling on behalf of a member to verify fertility benefits. The policy " +
  "holder is Daniel, member ID Pacific Crest Health PCH-0000-1234. Can I ask a few coverage " +
  "questions?";

// "Agent question list (asks in order; see insurance-coverage-data.md)"
export const INSURANCE_QUESTIONS = [
  "How does the plan define infertility / eligibility?",
  "Is diagnostic fertility evaluation covered (visit, labs, ultrasound, HSG)?",
  "Is semen analysis, CPT 89320, covered?",
  "Are hormone labs (FSH 83001, AMH, estradiol 82670, progesterone 84144, TSH 84443) covered?",
  "Is prior authorization required, and for what?",
  "Which labs are in-network?",
  "Deductible, coinsurance, out-of-pocket max?",
  "Are IUI (58322) and IVF (58970) covered? Lifetime max?",
  "Are fertility meds covered under pharmacy benefit?",
  "Is a PCP/OB-GYN referral required?",
] as const;

// "Mock rep responses (for the demo — from insurance-coverage-data.md sample plan)"
export const INSURANCE_MOCK_RESPONSES = [
  "Infertility defined as 12 months trying (under 35).",
  "Diagnostic evaluation: covered after deductible.",
  "Semen analysis 89320: covered.",
  "Hormone labs + ultrasound: covered.",
  "Prior auth: required for IUI and IVF.",
  'In-network lab: "Crest Diagnostics" (fictional).',
  "Deductible $1,500; coinsurance 20%; OOP max $4,000.",
  "IUI/IVF: covered with prior auth; lifetime max applies.",
  "Meds: separate pharmacy benefit, partial.",
  "Referral: not required for in-network REI.",
] as const;

// "Structured result the agent extracts"
export const INSURANCE_RESULT: InsuranceResult = {
  diagnostic_covered: true,
  semen_analysis_covered: true,
  hormone_labs_covered: true,
  prior_auth_required_for: ["IUI", "IVF"],
  in_network_lab: "Crest Diagnostics",
  deductible: 1500,
  coinsurance_pct: 20,
  oop_max: 4000,
  referral_required: false,
  follow_up_tasks: [
    "Confirm CPT codes with clinic before booking",
    "Use Crest Diagnostics for in-network labs",
    "Submit prior auth before any IUI/IVF",
  ],
};

// ===========================================================================
// CALL 2 — Clinic booking
// ===========================================================================

export const CLINIC_CALL_OBJECTIVE =
  "confirm new-patient + both-partner eval, in-network, what to bring, book a slot";

export const CLINIC_AGENT_OPENING =
  "Hi, I'm Mariposa, helping a couple prepare for a first fertility consult. Are you accepting " +
  "new patients, and do you take Pacific Crest Health PPO?";

// "Agent question list (see clinic-intake-data.md)"
export const CLINIC_CALL_QUESTIONS = [
  "Accepting new patients? Earliest consult slot?",
  "Do you evaluate both partners? Can male testing be ordered early?",
  "In-network with Pacific Crest Health?",
  "What should they bring?",
  "Can billing provide CPT codes before booking?",
  "Referral required?",
  "Telehealth first visit available?",
] as const;

// "Mock clinic responses (from clinic-intake-data.md sample clinic)"
export const CLINIC_MOCK_RESPONSES = [
  "New patients: yes. Slots: Jun 23 (virtual), Jun 25 (in person), Jun 29 (in person).",
  "Both partners evaluated; semen analysis can be ordered early.",
  "In-network with Pacific Crest Health PPO: yes.",
  "Bring: ID, insurance card, cycle history, prior meds, semen analysis, any labs.",
  "Billing can provide CPT codes on request.",
  "Referral: not required.",
  "Telehealth first visit: available.",
] as const;

// "Structured result the agent extracts"
export const CLINIC_RESULT: ClinicResult = {
  booked: {
    date: "2026-06-25",
    time: "14:00",
    mode: "in_person",
    clinic: "Bay Area Fertility & Reproductive Health",
  },
  bring_list: ["ID", "insurance card", "cycle history", "prior meds", "semen analysis", "labs"],
  tasks: {
    her: ["Gather cycle history", "Bring AMH result"],
    him: ["Bring semen analysis", "Request urology note"],
    together: ["Confirm insurance card", "Complete intake forms before visit"],
  },
  calendar_event: { type: "doctor_consult", date: "2026-06-25", time: "14:00" },
};

// "After both calls (agent write-back — F7 workflow)"
export const CALL_WRITEBACK_STEPS = [
  "Create the calendar consult event (Jun 25).",
  "Create the her/his/together tasks.",
  "Update the doctor-ready summary with coverage facts + appointment + bring-list.",
  'Mark insurance coverage_status = "verified (partial)".',
] as const;

// ===========================================================================
// Call_Objectives (live agentic calls) — Req 6.2
//
// The INSURANCE_QUESTIONS / CLINIC_CALL_QUESTIONS lists above remain the
// verbatim reference checklist consumed by the deterministic Mock_Fallback.
// For the LIVE agentic path the agent treats each question as an OBJECTIVE to
// obtain (phrasing it in its own words), NOT a verbatim script. Each objective
// records the InsuranceResult / ClinicResult field it maps to (when a single
// field applies), so the turn policy can skip objectives already answered and
// the extractor can map the live transcript back onto the call-scripts.md schema.
// ===========================================================================

/** The 10 insurance Call_Objectives, derived from INSURANCE_QUESTIONS (Req 6.2, 6.4). */
export const INSURANCE_OBJECTIVES: CallObjective[] = [
  { id: "eligibility", summary: INSURANCE_QUESTIONS[0] },
  {
    id: "diagnostic_covered",
    summary: INSURANCE_QUESTIONS[1],
    resultField: "diagnostic_covered",
  },
  {
    id: "semen_analysis_covered",
    summary: INSURANCE_QUESTIONS[2],
    resultField: "semen_analysis_covered",
  },
  {
    id: "hormone_labs_covered",
    summary: INSURANCE_QUESTIONS[3],
    resultField: "hormone_labs_covered",
  },
  {
    id: "prior_auth_required_for",
    summary: INSURANCE_QUESTIONS[4],
    resultField: "prior_auth_required_for",
  },
  {
    id: "in_network_lab",
    summary: INSURANCE_QUESTIONS[5],
    resultField: "in_network_lab",
  },
  { id: "costs", summary: INSURANCE_QUESTIONS[6], resultField: "deductible" },
  { id: "iui_ivf", summary: INSURANCE_QUESTIONS[7] },
  { id: "meds", summary: INSURANCE_QUESTIONS[8] },
  {
    id: "referral_required",
    summary: INSURANCE_QUESTIONS[9],
    resultField: "referral_required",
  },
];

/** The 7 clinic Call_Objectives, derived from CLINIC_CALL_QUESTIONS (Req 6.2, 6.5). */
export const CLINIC_OBJECTIVES: CallObjective[] = [
  { id: "new_patient_slot", summary: CLINIC_CALL_QUESTIONS[0], resultField: "booked" },
  { id: "both_partner_eval", summary: CLINIC_CALL_QUESTIONS[1], resultField: "tasks" },
  { id: "in_network", summary: CLINIC_CALL_QUESTIONS[2] },
  { id: "bring_list", summary: CLINIC_CALL_QUESTIONS[3], resultField: "bring_list" },
  { id: "cpt_codes", summary: CLINIC_CALL_QUESTIONS[4] },
  { id: "referral", summary: CLINIC_CALL_QUESTIONS[5] },
  { id: "telehealth", summary: CLINIC_CALL_QUESTIONS[6] },
];
