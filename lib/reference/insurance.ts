// ===========================================================================
// Insurance coverage reference: verification checklist, key terms, sample plan.
// SOURCE (verbatim): reference-data/insurance-coverage-data.md
// SINGLE SOURCE OF TRUTH — no insurance literal lives elsewhere.
// ===========================================================================

import type { CoverageStatus } from "@/lib/types";

// "The insurance verification questions (real checklist — what the agent asks)"
export const INSURANCE_VERIFICATION_QUESTIONS = [
  "How does this plan define infertility, and do we meet it (how many months of trying)?",
  "Is diagnostic fertility evaluation covered (office visit, labs, ultrasound, HSG)?",
  "Is semen analysis (CPT 89320) covered?",
  "Are hormone labs (FSH, AMH, estradiol, progesterone, TSH) covered?",
  "Is prior authorization required, and for which services?",
  "Which labs/clinics are in-network?",
  "What is the deductible, coinsurance, and out-of-pocket maximum?",
  "Are IUI (58322) and IVF (58970) covered, and is there a lifetime maximum?",
  "Are fertility medications covered (separate pharmacy benefit)?",
  "Do we need a referral from a PCP or OB-GYN?",
] as const;

// "Sample plan for the seed couple (FICTIONAL)"
export const SAMPLE_PLAN: {
  provider: string;
  plan_type: string;
  member_id: string;
  group_number: string;
  policy_holder: "her" | "him";
  coverage_status: CoverageStatus;
} = {
  provider: "Pacific Crest Health", // fictional
  plan_type: "PPO",
  member_id: "PCH-0000-1234", // fake placeholder
  group_number: "GRP-558823", // fake placeholder
  policy_holder: "him",
  coverage_status: "partial_unconfirmed", // partial / unconfirmed
};

export type InsuranceVerificationQuestions = typeof INSURANCE_VERIFICATION_QUESTIONS;
