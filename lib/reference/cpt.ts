// ===========================================================================
// CPT codes used in a fertility workup — asked by the agent, listed in summary.
// SOURCE (verbatim): reference-data/cpt-codes-fertility.md
//   Codes referenced by the agent question lists in call-scripts.md.
// SINGLE SOURCE OF TRUTH — no CPT literal lives elsewhere.
// ===========================================================================

export const CPT = {
  semenAnalysis: "89320", // Semen analysis; volume, count, motility, differential
  fsh: "83001", // FSH (follicle-stimulating hormone)
  estradiol: "82670", // Estradiol
  progesterone: "84144", // Progesterone
  tsh: "84443", // TSH (thyroid)
  prolactin: "84146", // Prolactin
  iui: "58322", // Artificial insemination; intrauterine (IUI)
  ivf: "58970", // Follicle puncture for oocyte retrieval (IVF)
} as const;

export type CptCode = (typeof CPT)[keyof typeof CPT];
export type Cpt = typeof CPT;
