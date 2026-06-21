// ===========================================================================
// Grounded Chat — pure answer engine (lib/chat/grounded-chat.ts) — Req 9
//
// Answers the FIVE canonical questions (Req 9.1) in the FIXED five-section
// format and exact order (Req 9.2):
//   Short answer -> Based on your data -> What's uncertain -> Shared next step -> Sources
//
// Every clinical value and citation traces to Reference_Data via @/lib/reference
// and the pure rules core (computeTryingWindow, detectMissingData,
// checkDurationRule). NOTHING clinical is invented here (Req 12, Property 21).
//
// Sources are scoped to the single Seed_Couple `couple_001` / Reference_Data and
// no other couple (Req 9.3, Property 23). Facts absent from Reference_Data are
// reported as unavailable with NO substitute value (Req 9.4).
//
// This module is PURE and DETERMINISTIC: a function of (questionId, coupleData)
// only — no Date.now, no Math.random, no I/O — so the route's Mock_Fallback and
// the Task 18.2/18.3/18.4 property tests can target it directly.
// ===========================================================================

import { checkDurationRule } from "@/lib/core/duration-rule";
import { detectMissingData } from "@/lib/core/missing-data";
import { computeTryingWindow } from "@/lib/core/trying-window";
import {
  SEED_COUPLE_FIXTURE,
  type SeedCoupleFixture,
} from "@/lib/reference";
import type { DataFlag } from "@/lib/types";

// ---------------------------------------------------------------------------
// Canonical questions (Req 9.1)
// ---------------------------------------------------------------------------

export type CanonicalQuestionId =
  | "priority_days"
  | "partner_this_week"
  | "confidence_low"
  | "ask_doctor"
  | "missing_data";

export interface CanonicalQuestion {
  id: CanonicalQuestionId;
  /** The user-facing prompt shown in the chat UI. */
  prompt: string;
  /** Lowercase keyword cues used by the free-text matcher. */
  keywords: string[];
}

/** The five canonical questions the Grounded_Chat answers (Req 9.1). */
export const CANONICAL_QUESTIONS: readonly CanonicalQuestion[] = [
  {
    id: "priority_days",
    prompt: "Why are these days the priority?",
    keywords: ["priority", "these days", "fertile", "window", "best days", "timing"],
  },
  {
    id: "partner_this_week",
    prompt: "What should my partner do this week?",
    keywords: ["partner", "this week", "his", "daniel", "do this week", "what should"],
  },
  {
    id: "confidence_low",
    prompt: "Why is the confidence low?",
    keywords: ["confidence", "low", "why low", "uncertain estimate", "reliable"],
  },
  {
    id: "ask_doctor",
    prompt: "What should we ask the doctor?",
    keywords: ["ask the doctor", "ask doctor", "doctor", "appointment questions", "consult"],
  },
  {
    id: "missing_data",
    prompt: "What data are we missing?",
    keywords: ["missing", "data", "tests", "what data", "labs needed", "incomplete"],
  },
] as const;

/**
 * Match free-text input to a canonical question id, or null if none matches.
 * Deterministic: first canonical question whose id or a keyword appears in the
 * normalized text wins (questions are evaluated in their canonical order).
 */
export function matchCanonicalQuestion(text: string): CanonicalQuestionId | null {
  if (typeof text !== "string") return null;
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return null;

  for (const q of CANONICAL_QUESTIONS) {
    if (normalized === q.id || normalized === q.prompt.toLowerCase()) return q.id;
  }
  for (const q of CANONICAL_QUESTIONS) {
    if (q.keywords.some((kw) => normalized.includes(kw))) return q.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Answer shape (Req 9.2) — the five named sections, in order
// ---------------------------------------------------------------------------

/** A single grounded citation, always scoped to the seed couple (Req 9.3). */
export interface ChatSource {
  /** The single seed couple this answer is scoped to (e.g. "couple_001"). */
  coupleId: string;
  /** Reference_Data source file (or the seed-couple record) the fact traces to. */
  reference: string;
  /** What this source grounds in the answer. */
  detail: string;
}

/**
 * A grounded chat answer. The five named sections map 1:1 to the required
 * fixed-order sections; `sources` is the rendered "Sources" section (Req 9.2).
 */
export interface ChatAnswer {
  questionId: CanonicalQuestionId;
  question: string;
  /** 1. Short answer */
  shortAnswer: string;
  /** 2. Based on your data */
  basedOnYourData: string;
  /** 3. What's uncertain */
  whatsUncertain: string;
  /** 4. Shared next step */
  sharedNextStep: string;
  /** 5. Sources — scoped to the seed couple / Reference_Data */
  sources: ChatSource[];
}

/** The ordered section keys, exposed so callers/tests assert the fixed order. */
export const CHAT_SECTION_ORDER = [
  "Short answer",
  "Based on your data",
  "What's uncertain",
  "Shared next step",
  "Sources",
] as const;

/** Couple data the answer engine grounds in (the only couple in the system). */
export type CoupleData = SeedCoupleFixture;

const REFERENCE_SOURCE_NOT_AVAILABLE =
  "This information is not present in Reference_Data, so no value can be provided.";

// ---------------------------------------------------------------------------
// Grounding helpers (pure)
// ---------------------------------------------------------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Format an ISO date (YYYY-MM-DD) as "July 2, 2026". Deterministic. */
function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Format an ISO range that shares a month/year compactly: "July 2–17, 2026". */
function formatDateRange(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}, ${sy}`;
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}, ${sy}`;
  return `${formatLongDate(startIso)} – ${formatLongDate(endIso)}`;
}

/** Derived grounded values computed once from the couple data + rules core. */
function deriveContext(couple: CoupleData) {
  const her = couple.herProfile;
  const him = couple.himProfile;
  const memberHer = couple.members.find((m) => m.role === "her");
  const femaleAge = memberHer?.age ?? 0;

  const ovulationConfirmed = her.mid_luteal_progesterone !== null;

  const window = computeTryingWindow({
    lastPeriodStart: her.last_period_start,
    cycleLengthMin: her.cycle_length_min,
    cycleLengthMax: her.cycle_length_max,
    ovulationConfirmed,
  });

  const flags = detectMissingData({
    day3_fsh: her.day3_fsh,
    day3_estradiol: her.day3_estradiol,
    mid_luteal_progesterone: her.mid_luteal_progesterone,
    prolactin: her.prolactin,
    semen: {
      semenVolumeMl: him.volume_ml,
      concentrationMillionMl: him.concentration_million_ml,
      totalSpermMillion: him.total_count_million,
      totalMotilityPct: him.total_motility_pct,
      progressiveMotilityPct: him.progressive_motility_pct,
      vitalityPct: him.vitality_pct,
      normalMorphologyPct: him.morphology_normal_pct,
      phMin: him.ph,
    },
    coverage_status: couple.couple.coverage_status,
  });

  // Red flags derived from the couple's own data (cycle-fertility-reference.md).
  const redFlags: string[] = [];
  if (!her.cycle_regular) redFlags.push("irregular cycles");
  if (flags.some((f) => f.kind === "borderline")) redFlags.push("borderline semen analysis");

  const duration = checkDurationRule({
    femaleAge,
    monthsTrying: her.months_trying,
    redFlags,
  });

  return { her, him, femaleAge, ovulationConfirmed, window, flags, duration, redFlags };
}

/** A source pointing at the seed-couple record itself (sample-couple.md). */
function coupleSource(coupleId: string, detail: string): ChatSource {
  return { coupleId, reference: "Seed_Couple record (sample-couple.md)", detail };
}

/** A source pointing at a Reference_Data file. */
function refSource(coupleId: string, reference: string, detail: string): ChatSource {
  return { coupleId, reference, detail };
}

// ---------------------------------------------------------------------------
// Public answer engine (Req 9.1, 9.2, 9.3, 9.4)
// ---------------------------------------------------------------------------

/**
 * Answer a canonical question, grounded entirely in the given couple's data and
 * Reference_Data. Pure + deterministic. Sources are scoped to this couple only
 * (Req 9.3). Defaults to the seed couple `couple_001`, the only couple in the app.
 */
export function answerCanonicalQuestion(
  questionId: CanonicalQuestionId,
  coupleData: CoupleData = SEED_COUPLE_FIXTURE,
): ChatAnswer {
  const coupleId = coupleData.couple.id;
  const question =
    CANONICAL_QUESTIONS.find((q) => q.id === questionId)?.prompt ?? questionId;
  const ctx = deriveContext(coupleData);

  switch (questionId) {
    case "priority_days":
      return buildPriorityDays(questionId, question, coupleId, ctx);
    case "partner_this_week":
      return buildPartnerThisWeek(questionId, question, coupleId, coupleData, ctx);
    case "confidence_low":
      return buildConfidenceLow(questionId, question, coupleId, ctx);
    case "ask_doctor":
      return buildAskDoctor(questionId, question, coupleId, ctx);
    case "missing_data":
      return buildMissingData(questionId, question, coupleId, ctx);
    default: {
      // Exhaustiveness guard — unknown ids never reach here for valid input.
      const _never: never = questionId;
      throw new Error(`Unknown canonical question: ${String(_never)}`);
    }
  }
}

/** Answer all five canonical questions (convenience for the UI / sanity checks). */
export function answerAllCanonicalQuestions(
  coupleData: CoupleData = SEED_COUPLE_FIXTURE,
): ChatAnswer[] {
  return CANONICAL_QUESTIONS.map((q) => answerCanonicalQuestion(q.id, coupleData));
}

type DerivedContext = ReturnType<typeof deriveContext>;

// ---------------------------------------------------------------------------
// Per-question builders (each section grounded + non-empty)
// ---------------------------------------------------------------------------

function buildPriorityDays(
  questionId: CanonicalQuestionId,
  question: string,
  coupleId: string,
  ctx: DerivedContext,
): ChatAnswer {
  const { her, window } = ctx;
  const priority = formatDateRange(window.minOvulation, window.maxOvulation);
  const fertile = formatDateRange(window.fertileWindowStart, window.fertileWindowEnd);

  return {
    questionId,
    question,
    shortAnswer:
      `Your priority days are ${priority} — the highest-chance days inside your ` +
      `estimated fertile window of ${fertile}.`,
    basedOnYourData:
      `These dates come only from your cycle inputs: last period ${formatLongDate(her.last_period_start)} ` +
      `and a cycle length of ${her.cycle_length_min}–${her.cycle_length_max} days. Using the ` +
      `irregular-cycle method, ovulation is estimated at cycle length minus 14 days, the fertile ` +
      `window opens 5 days before the earliest estimate and closes 1 day after the latest.`,
    whatsUncertain:
      `The window is wide because your estimate is labeled "${window.confidence}" confidence ` +
      `(${window.reasons.join("; ")}). With a ${her.cycle_length_max - her.cycle_length_min}-day ` +
      `cycle spread, the priority days span about two weeks rather than a tight few days.`,
    sharedNextStep:
      `Track ovulation more precisely this cycle (LH testing) and complete a mid-luteal ` +
      `progesterone draw so the priority days can be narrowed.`,
    sources: [
      coupleSource(coupleId, "Last period date and 45–60 day cycle range used for the estimate"),
      refSource(
        coupleId,
        "cycle-fertility-reference.md",
        "Irregular-cycle algorithm (ovulation = cycle length − 14; window −5 / +1)",
      ),
    ],
  };
}

function buildPartnerThisWeek(
  questionId: CanonicalQuestionId,
  question: string,
  coupleId: string,
  coupleData: CoupleData,
  ctx: DerivedContext,
): ChatAnswer {
  const { him, flags } = ctx;
  const semenFlags = flags.filter(
    (f) => f.kind === "borderline" && f.source === "semen-analysis-reference.md",
  );
  const heatExposure = him.lifestyle.heat_exposure;
  const belowList = semenFlags.map((f) => f.label).join(", ");

  const partnerName =
    coupleData.members.find((m) => m.role === "him")?.name ?? "Your partner";

  const actions: string[] = [];
  if (semenFlags.length > 0) actions.push("schedule one repeat semen analysis");
  if (heatExposure) actions.push("cut back on heat exposure (frequent sauna)");
  actions.push("bring the semen analysis and request a urology note for the consult");

  return {
    questionId,
    question,
    shortAnswer:
      `This week, ${partnerName} can ${actions.join(", ")} — these move the readiness score ` +
      `(currently ${him.readiness_score}/100) and prepare for the consult.`,
    basedOnYourData:
      semenFlags.length > 0
        ? `${partnerName}'s semen analysis (${him.semen_analysis_date ?? "date on file"}) is below ` +
          `the WHO 2021 lower reference limits for: ${belowList}. ` +
          `Lifestyle on file: heat exposure ${heatExposure ? "yes" : "no"}, stress ${him.lifestyle.stress}, ` +
          `BMI ${him.lifestyle.bmi}.`
        : `${partnerName}'s semen analysis is within WHO 2021 reference limits; focus stays on ` +
          `consult prep and lifestyle factors on file.`,
    whatsUncertain:
      `A single semen analysis is not a diagnosis. The reference recommends one repeat sample ` +
      `collected after 2–7 days of abstinence before drawing conclusions, and sperm changes take ` +
      `roughly 72 days (about 10–12 weeks) to show.`,
    sharedNextStep:
      `Book the repeat semen analysis and the in-network lab now so results are ready before the ` +
      `June 25 consult; review the bring-list together.`,
    sources: [
      coupleSource(
        coupleId,
        `${partnerName}'s semen analysis results, lifestyle factors, and readiness score`,
      ),
      refSource(
        coupleId,
        "semen-analysis-reference.md",
        "WHO 2021 lower reference limits; repeat after 2–7 days abstinence; ~72-day sperm cycle",
      ),
      refSource(
        coupleId,
        "call-scripts.md",
        "His consult tasks: bring semen analysis, request urology note",
      ),
    ],
  };
}

function buildConfidenceLow(
  questionId: CanonicalQuestionId,
  question: string,
  coupleId: string,
  ctx: DerivedContext,
): ChatAnswer {
  const { her, window } = ctx;
  const spread = her.cycle_length_max - her.cycle_length_min;

  return {
    questionId,
    question,
    shortAnswer:
      `Your trying-window confidence is "${window.confidence}" because the estimate rests on an ` +
      `irregular, unconfirmed cycle.`,
    basedOnYourData:
      window.reasons.length > 0
        ? `The engine flagged three reasons: ${window.reasons.join("; ")}. Your cycle ranges ` +
          `${her.cycle_length_min}–${her.cycle_length_max} days (a ${spread}-day spread, wider than ` +
          `7 days) and ovulation tracking is "${her.ovulation_tracking}", with no progesterone or LH confirmation.`
        : `The engine reported confidence "${window.confidence}" from your cycle inputs.`,
    whatsUncertain:
      `Without a confirmed ovulation marker, the exact ovulation day can't be pinned down — only ` +
      `estimated from cycle length, which is why the window stays broad.`,
    sharedNextStep:
      `Confirm ovulation with a mid-luteal progesterone draw (toward ≈10 ng/mL) and add LH ` +
      `tracking; that raises confidence and tightens the dates.`,
    sources: [
      coupleSource(coupleId, "Cycle regularity, 45–60 day range, and ovulation-tracking method"),
      refSource(
        coupleId,
        "cycle-fertility-reference.md",
        "Wide-cycle (>7 days) and unconfirmed-ovulation low-confidence reasons",
      ),
      refSource(
        coupleId,
        "female-hormone-reference.md",
        "Mid-luteal progesterone ≈10 ng/mL confirms ovulation",
      ),
    ],
  };
}

function buildAskDoctor(
  questionId: CanonicalQuestionId,
  question: string,
  coupleId: string,
  ctx: DerivedContext,
): ChatAnswer {
  const { duration, flags, her } = ctx;
  const missingLabs = flags.filter((f) => f.kind === "missing").map((f) => f.label);
  const borderline = flags.filter((f) => f.kind === "borderline").length;

  return {
    questionId,
    question,
    shortAnswer:
      `Ask about completing the missing ovarian-reserve and ovulation labs, repeating the ` +
      `borderline semen analysis, and whether you qualify for early evaluation.`,
    basedOnYourData:
      `Your trying-duration threshold is ${duration.thresholdMonths} months (female partner under 35), ` +
      `you've been trying ${her.months_trying} months, and early evaluation is ` +
      `${duration.recommendEarlyEvaluation ? "recommended" : "not yet triggered"}` +
      `${duration.redFlags.length > 0 ? ` due to red flags: ${duration.redFlags.join(", ")}` : ""}. ` +
      `${missingLabs.length > 0 ? `Labs still needed: ${missingLabs.join(", ")}. ` : ""}` +
      `${borderline > 0 ? `${borderline} semen parameter(s) are below WHO 2021 limits.` : ""}`,
    whatsUncertain:
      `Which specific tests the clinic orders and the appointment outcome aren't known yet; the ` +
      `consult is booked but results are pending.`,
    sharedNextStep:
      `Bring the doctor-ready summary to the June 25 consult and confirm the test plan and any ` +
      `prior-authorization steps for covered services.`,
    sources: [
      coupleSource(coupleId, "Female age, months trying, and red-flag conditions on file"),
      refSource(
        coupleId,
        "cycle-fertility-reference.md",
        "Under-35 → 12-month threshold; red flags trigger early evaluation",
      ),
      refSource(
        coupleId,
        "female-hormone-reference.md",
        "Day-3 FSH/estradiol, mid-luteal progesterone, prolactin screen",
      ),
    ],
  };
}

function buildMissingData(
  questionId: CanonicalQuestionId,
  question: string,
  coupleId: string,
  ctx: DerivedContext,
): ChatAnswer {
  const { flags } = ctx;
  const missing = flags.filter((f) => f.kind === "missing");
  const borderline = flags.filter((f) => f.kind === "borderline");
  const unverified = flags.filter((f) => f.kind === "unverified");

  const missingList = missing.map((f) => f.label).join(", ");
  const borderlineList = borderline.map((f) => f.label).join(", ");

  const basedParts: string[] = [];
  if (missing.length > 0) {
    basedParts.push(
      `Not on file (MISSING): ${missingList}. ${REFERENCE_SOURCE_NOT_AVAILABLE} ` +
        `These are reported as unavailable, not estimated.`,
    );
  }
  if (borderline.length > 0) {
    basedParts.push(
      `Below WHO 2021 limits: ${borderlineList} — recommend one repeat semen analysis after ` +
        `2–7 days of abstinence.`,
    );
  }
  if (unverified.length > 0) {
    basedParts.push(`Insurance coverage is unverified and must be confirmed before care.`);
  }

  const sources: ChatSource[] = [
    coupleSource(coupleId, "Her labs, his semen analysis, and coverage status on file"),
  ];
  if (missing.length > 0) {
    sources.push(
      refSource(coupleId, "female-hormone-reference.md", "Day-3 and mid-luteal lab screen"),
    );
  }
  if (borderline.length > 0) {
    sources.push(
      refSource(coupleId, "semen-analysis-reference.md", "WHO 2021 lower reference limits"),
    );
  }
  if (unverified.length > 0) {
    sources.push(
      refSource(coupleId, "insurance-coverage-data.md", "Coverage verification before care"),
    );
  }

  return {
    questionId,
    question,
    shortAnswer:
      `You're missing ${missing.length} female lab(s), have ${borderline.length} borderline semen ` +
      `parameter(s), and ${unverified.length > 0 ? "unverified insurance" : "verified insurance"}.`,
    basedOnYourData: basedParts.join(" "),
    whatsUncertain:
      `These gaps mean ovulation and ovarian reserve can't be confirmed yet, and some values ` +
      `simply aren't in your records — no substitute numbers are shown.`,
    sharedNextStep:
      `Complete the day-3 and mid-luteal labs, book the repeat semen analysis at the in-network ` +
      `lab, and verify insurance coverage before the consult.`,
    sources,
  };
}
