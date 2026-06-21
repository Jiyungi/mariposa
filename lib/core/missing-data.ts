/**
 * Missing-Data Detector (`lib/core/missing-data.ts`) — Req 4.
 *
 * A pure function over the female partner's labs, the male partner's semen
 * analysis, and the couple's insurance coverage status. It produces a single
 * consolidated checklist of flagged items, each with a grounded explanation
 * that cites the reference file it comes from. Nothing clinical is invented:
 * every literal traces to `/reference-data/` via the reference constants.
 *
 * Sources:
 *  - WHO 2021 semen limits  → /reference-data/semen-analysis-reference.md
 *  - Female hormone windows → /reference-data/female-hormone-reference.md
 *  - Coverage terminology   → /reference-data/insurance-coverage-data.md
 */
import { WHO_2021, type Who2021Key } from "@/lib/reference/who-2021";
import { FEMALE_HORMONE } from "@/lib/reference/female-hormone";

export type FlagKind = "missing" | "borderline" | "unverified";

export interface DataFlag {
  /** Stable identifier for the flagged item, e.g. "day3_fsh", "concentrationMillionMl", "insurance_coverage". */
  id: string;
  kind: FlagKind;
  /** Human-readable label for the item. */
  label: string;
  /** Grounded, non-empty explanation citing the reference source. */
  explanation: string;
  /** Reference file the explanation is grounded in. */
  source: string;
}

/**
 * Detector input. Defined locally (not imported from `lib/db`, which is under
 * concurrent development). `null` represents a MISSING value.
 */
export interface MissingDataInput {
  /** Female labs — `null` means the test was not done. */
  day3_fsh: number | null;
  day3_estradiol: number | null;
  mid_luteal_progesterone: number | null;
  prolactin: number | null;
  /** Semen analysis parameters keyed exactly as the WHO 2021 limits. */
  semen: Record<Who2021Key, number | null>;
  /** Insurance coverage status string (e.g. "confirmed", "partial_unconfirmed"). */
  coverage_status: string;
}

const FEMALE_SOURCE = "female-hormone-reference.md";
const SEMEN_SOURCE = "semen-analysis-reference.md";
const INSURANCE_SOURCE = "insurance-coverage-data.md";

/** The four female labs flagged `missing` when null, with grounded explanations. */
const FEMALE_LAB_SPECS: ReadonlyArray<{
  id: keyof Pick<
    MissingDataInput,
    "day3_fsh" | "day3_estradiol" | "mid_luteal_progesterone" | "prolactin"
  >;
  label: string;
  explanation: string;
}> = [
  {
    id: "day3_fsh",
    label: "Day-3 FSH",
    explanation: `Day-3 FSH is missing. It must be drawn on ${FEMALE_HORMONE.day3FshDrawWindow} for ovarian-reserve assessment.`,
  },
  {
    id: "day3_estradiol",
    label: "Day-3 estradiol",
    explanation: `Day-3 estradiol is missing. It must be drawn on ${FEMALE_HORMONE.day3FshDrawWindow} for ovarian-reserve assessment (high day-3 estradiol can mask a high FSH).`,
  },
  {
    id: "mid_luteal_progesterone",
    label: "Mid-luteal progesterone",
    explanation: `Mid-luteal progesterone is missing. Ovulation cannot be confirmed without a mid-luteal progesterone rise toward the ovulation-indicative level of ≈${FEMALE_HORMONE.ovulationIndicativeProgesteroneNgMl} ng/mL.`,
  },
  {
    id: "prolactin",
    label: "Prolactin",
    explanation:
      "Prolactin is missing. It is part of the pituitary/ovulation screen because it affects ovulation.",
  },
];

/** Display labels and units for each WHO 2021 semen parameter. */
const SEMEN_LABELS: Record<Who2021Key, { label: string; unit: string }> = {
  semenVolumeMl: { label: "Semen volume", unit: "mL" },
  concentrationMillionMl: { label: "Sperm concentration", unit: "million/mL" },
  totalSpermMillion: { label: "Total sperm number", unit: "million/ejaculate" },
  totalMotilityPct: { label: "Total motility", unit: "%" },
  progressiveMotilityPct: { label: "Progressive motility", unit: "%" },
  vitalityPct: { label: "Vitality", unit: "%" },
  normalMorphologyPct: { label: "Normal morphology", unit: "%" },
  phMin: { label: "pH", unit: "" },
};

// Preserve the WHO_2021 declaration order for a stable, deterministic checklist.
const SEMEN_KEYS = Object.keys(WHO_2021) as Who2021Key[];

/**
 * Apply the rule-based checks for day-3 FSH, day-3 estradiol, mid-luteal
 * progesterone, prolactin, each WHO 2021 semen parameter, and insurance
 * coverage status, and return the consolidated checklist of flags.
 *
 * Each flagged item appears exactly once; unflagged items do not appear.
 */
export function detectMissingData(input: MissingDataInput): DataFlag[] {
  const flags: DataFlag[] = [];

  // Req 4.2–4.4: female labs flagged `missing` iff null.
  for (const spec of FEMALE_LAB_SPECS) {
    if (input[spec.id] === null) {
      flags.push({
        id: spec.id,
        kind: "missing",
        label: spec.label,
        explanation: spec.explanation,
        source: FEMALE_SOURCE,
      });
    }
  }

  // Req 4.5: semen parameters flagged `borderline` iff a non-null value is
  // below its WHO 2021 lower reference limit. Null (not-done) values are not
  // flagged borderline here.
  for (const key of SEMEN_KEYS) {
    const value = input.semen[key];
    const limit = WHO_2021[key];
    if (value !== null && value < limit) {
      const { label, unit } = SEMEN_LABELS[key];
      const valueText = unit ? `${value} ${unit}` : `${value}`;
      const limitText = unit ? `${limit} ${unit}` : `${limit}`;
      flags.push({
        id: key,
        kind: "borderline",
        label,
        explanation: `${label} is ${valueText}, below the WHO 2021 lower reference limit of ${limitText}. Recommend one repeat semen analysis collected after 2–7 days of abstinence.`,
        source: SEMEN_SOURCE,
      });
    }
  }

  // Req 4.6: insurance flagged `unverified` iff coverage status is not "confirmed".
  if (input.coverage_status !== "confirmed") {
    flags.push({
      id: "insurance_coverage",
      kind: "unverified",
      label: "Insurance coverage",
      explanation: `Insurance coverage status is "${input.coverage_status}", which is not confirmed. Coverage verification is required before care.`,
      source: INSURANCE_SOURCE,
    });
  }

  return flags;
}
