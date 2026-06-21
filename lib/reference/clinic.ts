// ===========================================================================
// Sample clinic + available booking slots for the demo booking call.
// SOURCE (verbatim): reference-data/clinic-intake-data.md
//   "Sample clinic for the demo (FICTIONAL)" + "Sample available slots".
// SINGLE SOURCE OF TRUTH — no clinic literal lives elsewhere.
// ===========================================================================

export const CLINIC = {
  name: "Bay Area Fertility & Reproductive Health", // fictional
  type: "Reproductive Endocrinology (REI) clinic",
  location: "San Francisco, CA",
  phone: "(555) 010-2025", // fake placeholder
  inNetwork: "Pacific Crest Health PPO", // matches seed couple plan
  newPatients: true,
  bothPartnerEval: true,
  telehealthFirstVisit: true,
  bringList: [
    "ID",
    "insurance card",
    "cycle history",
    "prior meds",
    "semen analysis",
    "any labs",
  ],
} as const;

// "Sample available slots (for the booking-call demo)"
export const CLINIC_SLOTS = [
  { date: "2026-06-23", time: "10:30", mode: "virtual" }, // Tue, Jun 23 — 10:30 AM
  { date: "2026-06-25", time: "14:00", mode: "in_person" }, // Thu, Jun 25 — 2:00 PM
  { date: "2026-06-29", time: "09:00", mode: "in_person" }, // Mon, Jun 29 — 9:00 AM
] as const;

// reference-data/clinic-intake-data.md — "Questions to ask the clinic on a booking call"
export const CLINIC_QUESTIONS = [
  "Are you accepting new patients, and what is the earliest consult slot?",
  "Do you evaluate both partners, and can male testing be ordered early?",
  "Do you accept our insurance / are you in-network?",
  "What should we bring to the first visit?",
  "Can billing provide CPT codes before booking so we can verify coverage?",
  "Is a referral required?",
  "Do you offer virtual/telehealth first consults?",
] as const;

export type Clinic = typeof CLINIC;
