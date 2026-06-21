// ===========================================================================
// WHO 2021 (6th edition) semen-analysis lower reference limits.
// SOURCE (verbatim): reference-data/semen-analysis-reference.md
//   "WHO 2021 lower reference limits (5th percentile)" table.
// Values at or above these cutoffs are within reference range; below = flagged.
// SINGLE SOURCE OF TRUTH — no clinical literal for semen analysis lives elsewhere.
// ===========================================================================

export const WHO_2021 = {
  semenVolumeMl: 1.4, // per ejaculate
  concentrationMillionMl: 16,
  totalSpermMillion: 39, // per ejaculate
  totalMotilityPct: 42, // progressive + non-progressive
  progressiveMotilityPct: 30,
  vitalityPct: 54, // live sperm
  normalMorphologyPct: 4, // strict criteria
  phMin: 7.2, // pH >= 7.2
} as const;

// reference-data/semen-analysis-reference.md — "Collection notes"
// Sample collected after 2–7 days of abstinence; one abnormal result is not a
// diagnosis — labs typically recommend a repeat analysis.
export const SEMEN_COLLECTION = {
  abstinenceDaysMin: 2,
  abstinenceDaysMax: 7,
  repeatRecommended: true,
} as const;

// reference-data/semen-analysis-reference.md — "Lifestyle factors that affect sperm"
// Sperm take roughly 72 days to develop, tracked over ~10–12 weeks.
export const SPERM_DEVELOPMENT = {
  developmentDays: 72,
  trackingWeeksMin: 10,
  trackingWeeksMax: 12,
} as const;

export type WHO2021 = typeof WHO_2021;
