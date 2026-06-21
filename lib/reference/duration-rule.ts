// SOURCE: reference-data/cycle-fertility-reference.md — evaluation timing (F7)

export const DURATION_RULE = {
  under35Months: 12,
  atLeast35Months: 6,
  ageThreshold: 35,
} as const;

export const DURATION_RED_FLAGS = [
  "irregular/absent periods",
  "known PCOS/endometriosis",
  "prior pelvic surgery",
  "known male factor",
] as const;

export const CYCLE_REGULARITY = {
  regularMinDays: 24,
  regularMaxDays: 38,
  irregularVariationDays: 7,
} as const;

export type DurationRule = typeof DURATION_RULE;
