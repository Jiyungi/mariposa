/**
 * Doctor-ready Summary assembler (`lib/summary/build.ts`) — Req 8.
 *
 * A pure function that turns a seeded `CoupleWorkspace` into a structured,
 * doctor-ready `DoctorSummary`, plus a plain-text serializer for the single
 * copy-to-clipboard operation (Req 8.2).
 *
 * Grounding rules (Req 8.3, 8.4, 12):
 *  - Every clinical statement and value traces to a `/reference-data/` source,
 *    reached here through the seed (`sample-couple.md`), the pure rules core
 *    (Trying-Window engine, Missing-Data detector, Duration rule), and the
 *    typed reference constants.
 *  - Values that are MISSING (`null`) or absent from the workspace are OMITTED
 *    from the partner-data sections — they surface only as missing-test flags.
 *    Nothing clinical is invented.
 *
 * Coverage & appointment (Req 8.5, 8.6):
 *  - Coverage is labeled `unverified` whenever `coverage_status !== "confirmed"`
 *    (the seed couple is `partial_unconfirmed`). Benefit facts are shown only
 *    when an insurance call has produced them; otherwise they are omitted.
 *  - The consult shows `pending` until a clinic booking produces it.
 *
 * SEAM (documented): live coverage facts and the booked Jun 25 consult are
 * written back by the Voice Agent + Inngest workflow (Person B, Req 6.6 / 7),
 * which are not on this branch. This assembler reads them from the workspace
 * (`callRecords` / `calendarEvents`) when present and otherwise reports
 * coverage as unverified and the appointment as pending — so the summary is
 * correct and grounded either way.
 */

import {
  computeTryingWindow,
  type TryingWindowOutput,
} from "@/lib/core/trying-window";
import {
  detectMissingData,
  type DataFlag,
  type FlagKind,
  type MissingDataInput,
} from "@/lib/core/missing-data";
import { checkDurationRule } from "@/lib/core/duration-rule";
import type { Who2021Key } from "@/lib/reference/who-2021";
import { FEMALE_HORMONE } from "@/lib/reference/female-hormone";
import type { CoupleWorkspace, MemberRole } from "@/lib/db/types";

export type CoverageVerification = "verified" | "unverified";
export type AppointmentStatus = "booked" | "pending";

/** A labeled key/value row shown in a summary section. */
export interface SummaryField {
  label: string;
  value: string;
}

/** One partner's data block (present values only — nulls are omitted). */
export interface DoctorSummaryPartner {
  /** e.g. "Maya (her)". */
  heading: string;
  fields: SummaryField[];
}

/** Trying window + confidence, sourced from the Trying-Window engine output. */
export interface SummaryTryingWindow {
  fertileWindowStart: string;
  fertileWindowEnd: string;
  minOvulation: string;
  maxOvulation: string;
  confidence: string;
  reasons: string[];
}

/** Age-based evaluation guidance from the Trying-Duration rule. */
export interface SummaryDurationGuidance {
  thresholdMonths: number;
  monthsTrying: number | null;
  recommendEarlyEvaluation: boolean;
  redFlags: string[];
}

/** A flagged missing/borderline/unverified item with its grounded explanation. */
export interface SummaryMissingItem {
  label: string;
  kind: FlagKind;
  explanation: string;
  source: string;
}

/** Coverage section — labeled verified/unverified with grounded plan facts. */
export interface SummaryCoverage {
  status: CoverageVerification;
  /** Plan-identification facts from the couple's own record. */
  planFacts: SummaryField[];
  /** Benefit facts confirmed by an insurance call — empty until verified. */
  verifiedFacts: SummaryField[];
  /** Plain-language note explaining the coverage status. */
  note: string;
}

/** Consult section — booked details when present, otherwise pending. */
export interface SummaryAppointment {
  status: AppointmentStatus;
  date: string | null;
  time: string | null;
  clinic: string | null;
  mode: string | null;
  /** What to bring — populated by the booking call; empty when pending. */
  bringList: string[];
}

/** The complete doctor-ready summary (Req 8.1). */
export interface DoctorSummary {
  coupleName: string;
  partners: {
    her: DoctorSummaryPartner;
    him: DoctorSummaryPartner;
  };
  tryingWindow: SummaryTryingWindow | null;
  durationGuidance: SummaryDurationGuidance | null;
  missingTests: SummaryMissingItem[];
  doctorQuestions: string[];
  coverage: SummaryCoverage;
  appointment: SummaryAppointment;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Format a strict `YYYY-MM-DD` ISO date as "Month D, YYYY" without crossing a
 * timezone boundary (the raw components are read directly). Returns the input
 * unchanged if it is not a well-formed ISO date.
 */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIndex < 0 || monthIndex > 11) return iso;
  return `${MONTHS[monthIndex]} ${day}, ${year}`;
}

/** Format a 24h "HH:MM" time as "h:MM AM/PM". Returns input if unparseable. */
export function formatTime(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const hour24 = Number(m[1]);
  const minutes = m[2];
  if (hour24 < 0 || hour24 > 23) return time;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minutes} ${period}`;
}

function memberName(workspace: CoupleWorkspace, role: MemberRole): string {
  return workspace.members.find((member) => member.role === role)?.name ?? "";
}

function memberAge(workspace: CoupleWorkspace, role: MemberRole): number | null {
  return workspace.members.find((member) => member.role === role)?.age ?? null;
}

/** Push a field only when the value is present (not null/empty). */
function pushField(
  fields: SummaryField[],
  label: string,
  value: string | number | null | undefined,
): void {
  if (value === null || value === undefined) return;
  const text = typeof value === "number" ? String(value) : value.trim();
  if (text.length === 0) return;
  fields.push({ label, value: text });
}

function yesNo(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

/** Build the female partner's data block (present values only). */
function buildHerPartner(workspace: CoupleWorkspace): DoctorSummaryPartner {
  const her = workspace.herProfile;
  const name = memberName(workspace, "her") || "Her";
  const fields: SummaryField[] = [];

  pushField(fields, "Age", memberAge(workspace, "her"));
  if (her.last_period_start) {
    pushField(fields, "Last period start", formatIsoDate(her.last_period_start));
  }
  if (her.cycle_length_min !== null && her.cycle_length_max !== null) {
    pushField(
      fields,
      "Cycle length",
      `${her.cycle_length_min}\u2013${her.cycle_length_max} days`,
    );
  } else {
    pushField(fields, "Average cycle length", her.avg_cycle_length);
  }
  if (her.cycle_regular !== null) {
    pushField(fields, "Cycle regularity", her.cycle_regular ? "Regular" : "Irregular");
  }
  pushField(fields, "Months trying", her.months_trying);
  if (her.conditions.length > 0) {
    pushField(fields, "Conditions", her.conditions.join("; "));
  }
  if (her.prior_meds.length > 0) {
    pushField(fields, "Prior medications", her.prior_meds.join("; "));
  }
  pushField(fields, "Ovulation tracking", her.ovulation_tracking);
  pushField(fields, "Prior pregnancies", her.prior_pregnancies);
  // Labs — present values only; MISSING (null) labs appear as missing-test flags.
  if (her.amh !== null) pushField(fields, "AMH", `${her.amh} ng/mL`);
  if (her.tsh !== null) pushField(fields, "TSH", `${her.tsh} mIU/L`);
  if (her.day3_fsh !== null) pushField(fields, "Day-3 FSH", `${her.day3_fsh} mIU/mL`);
  if (her.day3_estradiol !== null) {
    pushField(fields, "Day-3 estradiol", `${her.day3_estradiol} pg/mL`);
  }
  if (her.mid_luteal_progesterone !== null) {
    pushField(
      fields,
      "Mid-luteal progesterone",
      `${her.mid_luteal_progesterone} ng/mL`,
    );
  }
  if (her.prolactin !== null) pushField(fields, "Prolactin", `${her.prolactin} ng/mL`);

  return { heading: `${name} (her)`, fields };
}

/** Build the male partner's data block (present values only). */
function buildHimPartner(workspace: CoupleWorkspace): DoctorSummaryPartner {
  const him = workspace.himProfile;
  const name = memberName(workspace, "him") || "Him";
  const fields: SummaryField[] = [];

  pushField(fields, "Age", memberAge(workspace, "him"));
  pushField(fields, "Semen analysis status", him.semen_analysis_status);
  if (him.semen_analysis_date) {
    pushField(fields, "Semen analysis date", formatIsoDate(him.semen_analysis_date));
  }
  if (him.volume_ml !== null) pushField(fields, "Semen volume", `${him.volume_ml} mL`);
  if (him.concentration_million_ml !== null) {
    pushField(fields, "Sperm concentration", `${him.concentration_million_ml} million/mL`);
  }
  if (him.total_count_million !== null) {
    pushField(fields, "Total sperm number", `${him.total_count_million} million/ejaculate`);
  }
  if (him.progressive_motility_pct !== null) {
    pushField(fields, "Progressive motility", `${him.progressive_motility_pct}%`);
  }
  if (him.total_motility_pct !== null) {
    pushField(fields, "Total motility", `${him.total_motility_pct}%`);
  }
  if (him.morphology_normal_pct !== null) {
    pushField(fields, "Normal morphology", `${him.morphology_normal_pct}%`);
  }
  if (him.vitality_pct !== null) pushField(fields, "Vitality", `${him.vitality_pct}%`);
  if (him.ph !== null) pushField(fields, "pH", `${him.ph}`);

  // Lifestyle (Req 5.3) — present values only.
  pushField(fields, "Heat exposure", yesNo(him.lifestyle.heat_exposure));
  pushField(fields, "Smoking", yesNo(him.lifestyle.smoking));
  pushField(fields, "Alcohol", him.lifestyle.alcohol);
  pushField(fields, "Sleep", him.lifestyle.sleep);
  pushField(fields, "Stress", him.lifestyle.stress);
  pushField(fields, "BMI", him.lifestyle.bmi);

  if (him.readiness_score !== null) {
    pushField(fields, "Readiness score", `${him.readiness_score}/100`);
  }

  return { heading: `${name} (him)`, fields };
}

/**
 * Resolve the trying window: prefer the persisted engine output (the single
 * source of truth), falling back to recomputing from the female profile so the
 * window is always grounded in the engine and never invented.
 */
function resolveTryingWindow(
  workspace: CoupleWorkspace,
): SummaryTryingWindow | null {
  const persisted = workspace.tryingWindows[0];
  if (
    persisted &&
    persisted.fertile_window_start &&
    persisted.fertile_window_end &&
    persisted.min_ovulation &&
    persisted.max_ovulation &&
    persisted.confidence
  ) {
    return {
      fertileWindowStart: persisted.fertile_window_start,
      fertileWindowEnd: persisted.fertile_window_end,
      minOvulation: persisted.min_ovulation,
      maxOvulation: persisted.max_ovulation,
      confidence: persisted.confidence,
      reasons: [...persisted.reasons],
    };
  }

  const her = workspace.herProfile;
  if (
    her.last_period_start &&
    her.cycle_length_min !== null &&
    her.cycle_length_max !== null
  ) {
    try {
      const out: TryingWindowOutput = computeTryingWindow({
        lastPeriodStart: her.last_period_start,
        cycleLengthMin: her.cycle_length_min,
        cycleLengthMax: her.cycle_length_max,
        ovulationConfirmed: her.mid_luteal_progesterone !== null,
      });
      return {
        fertileWindowStart: out.fertileWindowStart,
        fertileWindowEnd: out.fertileWindowEnd,
        minOvulation: out.minOvulation,
        maxOvulation: out.maxOvulation,
        confidence: out.confidence,
        reasons: out.reasons,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/** Build the Missing-Data detector input from the workspace profiles. */
function buildMissingDataInput(workspace: CoupleWorkspace): MissingDataInput {
  const her = workspace.herProfile;
  const him = workspace.himProfile;
  const semen: Record<Who2021Key, number | null> = {
    semenVolumeMl: him.volume_ml,
    concentrationMillionMl: him.concentration_million_ml,
    totalSpermMillion: him.total_count_million,
    totalMotilityPct: him.total_motility_pct,
    progressiveMotilityPct: him.progressive_motility_pct,
    vitalityPct: him.vitality_pct,
    normalMorphologyPct: him.morphology_normal_pct,
    phMin: him.ph,
  };
  return {
    day3_fsh: her.day3_fsh,
    day3_estradiol: her.day3_estradiol,
    mid_luteal_progesterone: her.mid_luteal_progesterone,
    prolactin: her.prolactin,
    semen,
    coverage_status: workspace.couple.coverage_status ?? "",
  };
}

/** Derive the red flags the Trying-Duration rule consumes, grounded in the seed. */
function deriveRedFlags(workspace: CoupleWorkspace, hasSemenFlag: boolean): string[] {
  const flags: string[] = [];
  if (workspace.herProfile.cycle_regular === false) {
    flags.push("irregular cycles");
  }
  if (hasSemenFlag) {
    flags.push("borderline semen analysis");
  }
  return flags;
}

/**
 * Build grounded questions for the doctor from the detected data state. Each
 * question is derived from an actual flag or rule result and cites the
 * reference source it rests on — none are free-floating.
 */
function buildDoctorQuestions(
  missingFlags: DataFlag[],
  duration: SummaryDurationGuidance | null,
): string[] {
  const questions: string[] = [];

  const hasFemaleLabFlag = missingFlags.some(
    (flag) =>
      flag.kind === "missing" &&
      (flag.id === "day3_fsh" ||
        flag.id === "day3_estradiol" ||
        flag.id === "mid_luteal_progesterone" ||
        flag.id === "prolactin"),
  );
  if (hasFemaleLabFlag) {
    questions.push(
      `Should I complete the missing baseline labs \u2014 day-3 FSH and estradiol drawn on ${FEMALE_HORMONE.day3FshDrawWindow}, a mid-luteal progesterone to confirm ovulation (toward \u2248${FEMALE_HORMONE.ovulationIndicativeProgesteroneNgMl} ng/mL), and prolactin? (female-hormone-reference.md)`,
    );
  }

  const hasSemenFlag = missingFlags.some((flag) => flag.kind === "borderline");
  if (hasSemenFlag) {
    questions.push(
      "Several semen parameters are below the WHO 2021 lower reference limits \u2014 should he repeat the semen analysis after 2\u20137 days of abstinence and see urology? (semen-analysis-reference.md)",
    );
  }

  if (duration?.recommendEarlyEvaluation) {
    questions.push(
      `Given ${duration.redFlags.join(" and ") || "the red flags noted"}, should we begin evaluation now rather than waiting the full ${duration.thresholdMonths}-month window? (cycle-fertility-reference.md)`,
    );
  }

  const coverageUnverified = missingFlags.some(
    (flag) => flag.id === "insurance_coverage",
  );
  if (coverageUnverified) {
    questions.push(
      "Are the diagnostic evaluation, semen analysis (CPT 89320), and hormone labs covered, and is prior authorization required for IUI (58322) or IVF (58970)? (insurance-coverage-data.md, cpt-codes-fertility.md)",
    );
  }

  return questions;
}

/** Build the coverage section, labeling it unverified per Req 8.5. */
function buildCoverage(workspace: CoupleWorkspace): SummaryCoverage {
  const couple = workspace.couple;
  const status: CoverageVerification =
    couple.coverage_status === "confirmed" ? "verified" : "unverified";

  const planFacts: SummaryField[] = [];
  pushField(planFacts, "Provider", couple.insurance_provider);
  pushField(planFacts, "Plan", couple.plan_type);
  pushField(planFacts, "Member ID", couple.member_id);
  pushField(planFacts, "Group", couple.group_number);
  if (couple.policy_holder) {
    const holderName = memberName(workspace, couple.policy_holder);
    pushField(
      planFacts,
      "Policy holder",
      holderName ? `${holderName} (${couple.policy_holder})` : couple.policy_holder,
    );
  }

  // Verified benefit facts come from an insurance call's extracted result.
  // Absent that (this branch), they are omitted rather than invented (Req 8.4).
  const verifiedFacts = buildVerifiedCoverageFacts(workspace);

  const note =
    status === "unverified"
      ? `Coverage is unverified (status: ${couple.coverage_status}). Benefit details will be confirmed by the insurance verification call before care.`
      : "Coverage verified.";

  return { status, planFacts, verifiedFacts, note };
}

/**
 * Read verified coverage facts from a completed insurance call record, if one
 * exists in the workspace. Returns an empty list when no call has run.
 */
function buildVerifiedCoverageFacts(
  workspace: CoupleWorkspace,
): SummaryField[] {
  const record = workspace.callRecords.find(
    (call) => call.call_type === "insurance" && call.extracted_result,
  );
  if (!record || !record.extracted_result) return [];

  const result = record.extracted_result;
  const facts: SummaryField[] = [];
  const boolFact = (key: string, label: string): void => {
    const value = result[key];
    if (typeof value === "boolean") {
      pushField(facts, label, value ? "Covered" : "Not covered");
    }
  };
  boolFact("diagnostic_covered", "Diagnostic evaluation");
  boolFact("semen_analysis_covered", "Semen analysis (89320)");
  boolFact("hormone_labs_covered", "Hormone labs");
  if (Array.isArray(result.prior_auth_required_for) && result.prior_auth_required_for.length > 0) {
    pushField(facts, "Prior auth required for", result.prior_auth_required_for.join(", "));
  }
  if (typeof result.in_network_lab === "string") {
    pushField(facts, "In-network lab", result.in_network_lab);
  }
  if (typeof result.deductible === "number") {
    pushField(facts, "Deductible", `$${result.deductible}`);
  }
  if (typeof result.coinsurance_pct === "number") {
    pushField(facts, "Coinsurance", `${result.coinsurance_pct}%`);
  }
  if (typeof result.oop_max === "number") {
    pushField(facts, "Out-of-pocket max", `$${result.oop_max}`);
  }
  if (typeof result.referral_required === "boolean") {
    pushField(facts, "Referral required", result.referral_required ? "Yes" : "No");
  }
  return facts;
}

/**
 * Build the consult section. When a booking has produced a consult calendar
 * event (and optionally a clinic call with a bring-list), report it as booked;
 * otherwise report it as pending (Req 8.6).
 */
function buildAppointment(workspace: CoupleWorkspace): SummaryAppointment {
  const consult = workspace.calendarEvents.find((event) =>
    event.type.includes("consult"),
  );

  if (!consult) {
    return {
      status: "pending",
      date: null,
      time: null,
      clinic: null,
      mode: null,
      bringList: [],
    };
  }

  const clinicCall = workspace.callRecords.find(
    (call) => call.call_type === "clinic" && call.extracted_result,
  );
  let clinic: string | null = null;
  let mode: string | null = null;
  let bringList: string[] = [];
  if (clinicCall?.extracted_result) {
    const result = clinicCall.extracted_result;
    const booked = result.booked;
    if (booked && typeof booked === "object") {
      const b = booked as Record<string, unknown>;
      if (typeof b.clinic === "string") clinic = b.clinic;
      if (typeof b.mode === "string") mode = b.mode;
    }
    if (Array.isArray(result.bring_list)) {
      bringList = result.bring_list.filter(
        (item): item is string => typeof item === "string",
      );
    }
  }

  return {
    status: "booked",
    date: consult.date,
    time: consult.time,
    clinic,
    mode,
    bringList,
  };
}

/**
 * Assemble a complete, grounded doctor-ready summary from a couple workspace.
 * Pure: performs no I/O and does not mutate `workspace`.
 */
export function buildDoctorSummary(workspace: CoupleWorkspace): DoctorSummary {
  const missingTestsRaw = detectMissingData(buildMissingDataInput(workspace));
  const hasSemenFlag = missingTestsRaw.some((flag) => flag.kind === "borderline");

  const femaleAge = memberAge(workspace, "her");
  let durationGuidance: SummaryDurationGuidance | null = null;
  if (femaleAge !== null) {
    const redFlags = deriveRedFlags(workspace, hasSemenFlag);
    const result = checkDurationRule({
      femaleAge,
      monthsTrying: workspace.herProfile.months_trying ?? 0,
      redFlags,
    });
    durationGuidance = {
      thresholdMonths: result.thresholdMonths,
      monthsTrying: workspace.herProfile.months_trying,
      recommendEarlyEvaluation: result.recommendEarlyEvaluation,
      redFlags: result.redFlags,
    };
  }

  const missingTests: SummaryMissingItem[] = missingTestsRaw.map((flag) => ({
    label: flag.label,
    kind: flag.kind,
    explanation: flag.explanation,
    source: flag.source,
  }));

  return {
    coupleName: workspace.couple.display_name,
    partners: {
      her: buildHerPartner(workspace),
      him: buildHimPartner(workspace),
    },
    tryingWindow: resolveTryingWindow(workspace),
    durationGuidance,
    missingTests,
    doctorQuestions: buildDoctorQuestions(missingTestsRaw, durationGuidance),
    coverage: buildCoverage(workspace),
    appointment: buildAppointment(workspace),
  };
}

/**
 * Serialize a `DoctorSummary` to clean plain text for the single
 * copy-to-clipboard operation (Req 8.2). The whole document is produced in one
 * pass so the caller copies it atomically.
 */
export function doctorSummaryToText(summary: DoctorSummary): string {
  const lines: string[] = [];

  lines.push(`Doctor Summary \u2014 ${summary.coupleName}`);
  lines.push("");

  const writePartner = (partner: DoctorSummaryPartner): void => {
    lines.push(partner.heading);
    for (const field of partner.fields) {
      lines.push(`  - ${field.label}: ${field.value}`);
    }
    lines.push("");
  };
  writePartner(summary.partners.her);
  writePartner(summary.partners.him);

  if (summary.tryingWindow) {
    const tw = summary.tryingWindow;
    lines.push("Trying window");
    lines.push(
      `  - Fertile window: ${formatIsoDate(tw.fertileWindowStart)} \u2013 ${formatIsoDate(tw.fertileWindowEnd)}`,
    );
    lines.push(
      `  - Priority days: ${formatIsoDate(tw.minOvulation)} \u2013 ${formatIsoDate(tw.maxOvulation)}`,
    );
    lines.push(`  - Confidence: ${tw.confidence}`);
    if (tw.reasons.length > 0) {
      lines.push(`  - Why: ${tw.reasons.join(", ")}`);
    }
    lines.push("");
  }

  if (summary.durationGuidance) {
    const d = summary.durationGuidance;
    lines.push("Evaluation timing");
    lines.push(`  - Age-based threshold: ${d.thresholdMonths} months`);
    if (d.monthsTrying !== null) {
      lines.push(`  - Months trying: ${d.monthsTrying}`);
    }
    lines.push(
      `  - Recommendation: ${d.recommendEarlyEvaluation ? "begin evaluation now" : "continue trying to threshold"}`,
    );
    if (d.redFlags.length > 0) {
      lines.push(`  - Red flags: ${d.redFlags.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("Missing / borderline tests");
  if (summary.missingTests.length === 0) {
    lines.push("  - None flagged");
  } else {
    for (const item of summary.missingTests) {
      lines.push(`  - ${item.label} (${item.kind}): ${item.explanation}`);
    }
  }
  lines.push("");

  lines.push("Questions for the doctor");
  if (summary.doctorQuestions.length === 0) {
    lines.push("  - None");
  } else {
    summary.doctorQuestions.forEach((question, index) => {
      lines.push(`  ${index + 1}. ${question}`);
    });
  }
  lines.push("");

  lines.push(`Insurance coverage (${summary.coverage.status})`);
  for (const fact of summary.coverage.planFacts) {
    lines.push(`  - ${fact.label}: ${fact.value}`);
  }
  for (const fact of summary.coverage.verifiedFacts) {
    lines.push(`  - ${fact.label}: ${fact.value}`);
  }
  lines.push(`  - Note: ${summary.coverage.note}`);
  lines.push("");

  const appt = summary.appointment;
  lines.push("Consult");
  if (appt.status === "pending") {
    lines.push("  - Status: pending (not yet booked)");
  } else {
    lines.push("  - Status: booked");
    if (appt.date) lines.push(`  - Date: ${formatIsoDate(appt.date)}`);
    if (appt.time) lines.push(`  - Time: ${formatTime(appt.time)}`);
    if (appt.clinic) lines.push(`  - Clinic: ${appt.clinic}`);
    if (appt.mode) lines.push(`  - Mode: ${appt.mode}`);
    if (appt.bringList.length > 0) {
      lines.push(`  - Bring: ${appt.bringList.join(", ")}`);
    }
  }

  return lines.join("\n");
}
