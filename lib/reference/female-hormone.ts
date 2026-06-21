// SOURCE: reference-data/female-hormone-reference.md

export const FEMALE_HORMONE = {
  day3FshDrawWindow: "cycle day 2–3",
  ovulationIndicativeProgesteroneNgMl: 10,
} as const;

export const DAY3_FSH_MIU_ML = {
  favorableMax: 10,
  borderlineMin: 10,
  borderlineMax: 15,
  reducedReserveAbove: 15,
} as const;

export const DAY3_ESTRADIOL_PG_ML = {
  typicalMin: 25,
  typicalMax: 75,
} as const;

export const AMH_NG_ML = {
  highAbove: 3.0,
  normalMin: 1.0,
  normalMax: 3.0,
  lowNormalMin: 0.5,
  lowNormalMax: 1.0,
  lowReserveBelow: 0.5,
} as const;

export type FemaleHormone = typeof FEMALE_HORMONE;
