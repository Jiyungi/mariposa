/**
 * WHO 2021 (6th edition) lower reference limits for semen analysis.
 *
 * Source: /reference-data/semen-analysis-reference.md
 * ("WHO 2021 lower reference limits (5th percentile)" table). Values at or
 * above each cutoff are within reference range; values below are flagged for
 * discussion. Literals are copied verbatim from the reference file; nothing
 * clinical is invented here (Req 12.1).
 *
 * NOTE: This branch intentionally defines WHO_2021 in its own module rather
 * than in `lib/reference/index.ts`, which is owned and assembled separately.
 */
export const WHO_2021 = {
  /** Semen volume — 1.4 mL per ejaculate. */
  semenVolumeMl: 1.4,
  /** Sperm concentration — 16 million / mL. */
  concentrationMillionMl: 16,
  /** Total sperm number — 39 million / ejaculate. */
  totalSpermMillion: 39,
  /** Total motility (progressive + non-progressive) — 42%. */
  totalMotilityPct: 42,
  /** Progressive motility — 30%. */
  progressiveMotilityPct: 30,
  /** Vitality (live sperm) — 54%. */
  vitalityPct: 54,
  /** Normal morphology (normal forms, strict criteria) — 4%. */
  normalMorphologyPct: 4,
  /** pH — lower limit 7.2 (>= 7.2 is within range). */
  phMin: 7.2,
} as const;

export type Who2021Key = keyof typeof WHO_2021;
