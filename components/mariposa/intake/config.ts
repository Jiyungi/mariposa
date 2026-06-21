/**
 * Declarative field configuration for the three intake sections (Req 2.2–2.4).
 *
 * Each section is a list of visually grouped, structured fields (Req 2.1 — no
 * free-text dialog). Field `path`s address the value within that section's Zod
 * schema, so the form validates against the real schema and surfaces the
 * schema's field+range messages inline (Req 2.8). Labels and value bounds
 * mirror `sample-couple.md` (Req 2.5); nothing clinical is invented (Req 12).
 */
import {
  semenAnalysisStatusEnum,
  policyHolderEnum,
  coverageStatusEnum,
} from "@/lib/validation/intake";

export type FieldKind =
  | "text"
  | "date"
  | "number"
  | "select"
  | "toggle"
  | "list";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  kind: FieldKind;
  /** Path within the section value object, e.g. ["semen_results", "ph"]. */
  path: string[];
  label: string;
  hint?: string;
  unit?: string;
  /** Number fields only: a blank value means `null` (MISSING, Req 1.8). */
  nullable?: boolean;
  step?: string;
  options?: readonly SelectOption[];
  placeholder?: string;
}

export interface FieldGroupConfig {
  title: string;
  description?: string;
  fields: FieldConfig[];
}

export type SectionKey = "her" | "his" | "together";

export interface SectionConfig {
  key: SectionKey;
  title: string;
  subtitle: string;
  groups: FieldGroupConfig[];
}

/** Enum options sourced from the schema enums so they never drift. */
const semenStatusOptions: SelectOption[] = semenAnalysisStatusEnum.options.map(
  (v) => ({
    value: v,
    label: { not_started: "Not started", in_progress: "In progress", completed: "Completed" }[v],
  }),
);

const policyHolderOptions: SelectOption[] = policyHolderEnum.options.map((v) => ({
  value: v,
  label: v === "her" ? "Her" : "Him",
}));

const coverageOptions: SelectOption[] = coverageStatusEnum.options.map((v) => ({
  value: v,
  label: {
    confirmed: "Confirmed",
    partial_unconfirmed: "Partial / unconfirmed",
    unconfirmed: "Unconfirmed",
  }[v],
}));

export const HER_SECTION: SectionConfig = {
  key: "her",
  title: "Her",
  subtitle: "Maya's cycle, history, and labs",
  groups: [
    {
      title: "Cycle",
      fields: [
        { kind: "number", path: ["age"], label: "Age" },
        { kind: "date", path: ["last_period_start"], label: "Last period start" },
        {
          kind: "number",
          path: ["avg_cycle_length"],
          label: "Average cycle length",
          unit: "days",
          hint: "Between 45 and 60 days",
        },
        { kind: "number", path: ["cycle_length_min"], label: "Shortest cycle", unit: "days" },
        { kind: "number", path: ["cycle_length_max"], label: "Longest cycle", unit: "days" },
        { kind: "toggle", path: ["cycle_regular"], label: "Cycle is regular" },
        { kind: "number", path: ["months_trying"], label: "Months trying" },
        { kind: "number", path: ["prior_pregnancies"], label: "Prior pregnancies" },
      ],
    },
    {
      title: "History",
      fields: [
        {
          kind: "list",
          path: ["conditions"],
          label: "Conditions",
          placeholder: "Add a condition",
        },
        {
          kind: "list",
          path: ["prior_meds"],
          label: "Prior medications",
          placeholder: "Add a medication",
        },
        {
          kind: "text",
          path: ["ovulation_tracking"],
          label: "Ovulation tracking",
          placeholder: "e.g. app only, no LH confirmation",
        },
      ],
    },
    {
      title: "Labs",
      description: "Leave blank for any test not done yet — it'll be flagged as missing.",
      fields: [
        { kind: "number", path: ["labs", "amh"], label: "AMH", unit: "ng/mL", nullable: true, step: "0.1" },
        { kind: "number", path: ["labs", "tsh"], label: "TSH", nullable: true, step: "0.1" },
        { kind: "number", path: ["labs", "day3_fsh"], label: "Day-3 FSH", nullable: true, step: "0.1" },
        { kind: "number", path: ["labs", "day3_estradiol"], label: "Day-3 estradiol", nullable: true, step: "0.1" },
        { kind: "number", path: ["labs", "mid_luteal_progesterone"], label: "Mid-luteal progesterone", unit: "ng/mL", nullable: true, step: "0.1" },
        { kind: "number", path: ["labs", "prolactin"], label: "Prolactin", nullable: true, step: "0.1" },
      ],
    },
  ],
};

export const HIS_SECTION: SectionConfig = {
  key: "his",
  title: "His",
  subtitle: "Daniel's analysis, lifestyle, and history",
  groups: [
    {
      title: "Semen analysis",
      fields: [
        { kind: "number", path: ["age"], label: "Age" },
        {
          kind: "select",
          path: ["semen_analysis_status"],
          label: "Analysis status",
          options: semenStatusOptions,
        },
        { kind: "date", path: ["semen_analysis_date"], label: "Analysis date" },
        { kind: "number", path: ["semen_results", "volume_ml"], label: "Volume", unit: "mL", step: "0.1" },
        { kind: "number", path: ["semen_results", "concentration_million_ml"], label: "Concentration", unit: "M/mL", step: "0.1" },
        { kind: "number", path: ["semen_results", "total_count_million"], label: "Total count", unit: "M", step: "0.1" },
        { kind: "number", path: ["semen_results", "progressive_motility_pct"], label: "Progressive motility", unit: "%", step: "0.1" },
        { kind: "number", path: ["semen_results", "total_motility_pct"], label: "Total motility", unit: "%", step: "0.1" },
        { kind: "number", path: ["semen_results", "morphology_normal_pct"], label: "Normal morphology", unit: "%", step: "0.1" },
        { kind: "number", path: ["semen_results", "vitality_pct"], label: "Vitality", unit: "%", step: "0.1" },
        { kind: "number", path: ["semen_results", "ph"], label: "pH", step: "0.1" },
      ],
    },
    {
      title: "Lifestyle",
      fields: [
        { kind: "toggle", path: ["lifestyle", "smoking"], label: "Smoking" },
        { kind: "text", path: ["lifestyle", "alcohol"], label: "Alcohol", placeholder: "e.g. moderate" },
        { kind: "toggle", path: ["lifestyle", "heat_exposure"], label: "Frequent heat exposure" },
        { kind: "text", path: ["lifestyle", "sleep"], label: "Sleep", placeholder: "e.g. ok" },
        { kind: "text", path: ["lifestyle", "stress"], label: "Stress", placeholder: "e.g. high" },
        { kind: "number", path: ["lifestyle", "bmi"], label: "BMI", step: "0.1" },
        { kind: "toggle", path: ["lifestyle", "supplements"], label: "Taking supplements" },
      ],
    },
    {
      title: "Medical history",
      fields: [
        { kind: "text", path: ["medical_history", "surgeries"], label: "Surgeries", placeholder: "e.g. none" },
        { kind: "text", path: ["medical_history", "varicocele"], label: "Varicocele", placeholder: "e.g. unknown" },
        { kind: "text", path: ["medical_history", "medications"], label: "Medications", placeholder: "e.g. none" },
        { kind: "number", path: ["medical_history", "prior_children"], label: "Prior children" },
        { kind: "number", path: ["readiness_score"], label: "Readiness score", hint: "Out of 100" },
      ],
    },
  ],
};

export const TOGETHER_SECTION: SectionConfig = {
  key: "together",
  title: "Together",
  subtitle: "Shared goal, concern, and insurance",
  groups: [
    {
      title: "Goals",
      fields: [
        { kind: "text", path: ["goal"], label: "Goal", placeholder: "What you're working toward" },
        { kind: "text", path: ["top_concern"], label: "Top concern", placeholder: "What worries you most" },
        { kind: "number", path: ["trying_since_months"], label: "Trying since (months)" },
      ],
    },
    {
      title: "Insurance",
      fields: [
        { kind: "text", path: ["insurance", "provider"], label: "Provider", placeholder: "Insurance provider" },
        { kind: "text", path: ["insurance", "plan_type"], label: "Plan type", placeholder: "e.g. PPO" },
        { kind: "text", path: ["insurance", "member_id"], label: "Member ID" },
        { kind: "text", path: ["insurance", "group_number"], label: "Group number" },
        {
          kind: "select",
          path: ["insurance", "policy_holder"],
          label: "Policy holder",
          options: policyHolderOptions,
        },
        {
          kind: "select",
          path: ["insurance", "coverage_status"],
          label: "Coverage status",
          options: coverageOptions,
        },
      ],
    },
  ],
};

export const SECTIONS: readonly SectionConfig[] = [
  HER_SECTION,
  HIS_SECTION,
  TOGETHER_SECTION,
];
