// ===========================================================================
// Agentic turn policy (lib/agent/turn-policy.ts) — Req 6.2, 6.3
//
// PURE, deterministic functions that drive the LIVE agentic Voice_Agent. They
// contain NO I/O, NO Date.now(), NO Math.random(): identical inputs always
// produce identical output.
//
//   - nextQuestion(): given the remaining (unanswered) Call_Objectives plus the
//     couple/flags context, pick the next objective and produce the agent's OWN
//     phrasing for it (Req 6.2). Returns null once every objective is satisfied.
//   - objectivesSatisfied(): inspect the live transcript's human (responder)
//     turns and report which objectives have already been answered, in ANY
//     order and ANY wording (Req 6.3). Keyword/value detection is kept
//     consistent with lib/core/extract so a live transcript that the extractor
//     can parse also marks the corresponding objective satisfied.
//
// The "responder" speaker IS the live human (the transcript model is shared
// with the extractors/tests, so it is intentionally NOT renamed to "human").
// ===========================================================================

import type { CallObjective, Turn } from "@/lib/types";

// ---------------------------------------------------------------------------
// Objective answer-detection keywords (consistent with lib/core/extract)
// ---------------------------------------------------------------------------

/**
 * Keywords that, when present in a human (responder) turn, indicate the named
 * objective has been answered. Keyed by `CallObjective.id`. Detection is
 * substring/keyword based and case-insensitive, mirroring lib/core/extract.
 */
const OBJECTIVE_KEYWORDS: Record<string, string[]> = {
  // Insurance objectives.
  eligibility: ["infertility", "eligibility", "months trying", "defined", "define"],
  diagnostic_covered: ["diagnostic"],
  semen_analysis_covered: ["semen analysis", "89320"],
  hormone_labs_covered: ["hormone lab"],
  prior_auth_required_for: ["prior auth", "prior authorization"],
  in_network_lab: ["in-network lab", "in network lab", "in-network labs"],
  costs: ["deductible", "coinsurance", "out-of-pocket", "out of pocket", "oop"],
  iui_ivf: ["iui", "ivf", "lifetime max"],
  meds: ["meds", "medication", "pharmacy"],
  referral_required: ["referral"],

  // Clinic objectives.
  new_patient_slot: ["new patient", "slot", "consult", "accepting", "jun "],
  both_partner_eval: [
    "both partner",
    "both partners",
    "male testing",
    "evaluate both",
    "semen analysis",
  ],
  in_network: ["in-network", "in network"],
  bring_list: ["bring"],
  cpt_codes: ["cpt"],
  referral: ["referral"],
  telehealth: ["telehealth", "virtual"],
};

function lc(text: string): string {
  return text.toLowerCase();
}

/** True when a turn's text contains any of the keywords (case-insensitive). */
function turnMatches(turn: Turn, keywords: string[]): boolean {
  const text = lc(turn.text);
  return keywords.some((k) => text.includes(lc(k)));
}

// ---------------------------------------------------------------------------
// objectivesSatisfied — which objectives the human has already answered
// ---------------------------------------------------------------------------

/**
 * Inspect the transcript and return the set of objective ids that have been
 * answered by the human, in ANY order/wording (Req 6.3). Only human
 * (responder) turns count as answers — the agent asking a question does not
 * satisfy an objective.
 */
export function objectivesSatisfied(
  objectives: CallObjective[],
  transcript: Turn[],
): Set<string> {
  const answeredHumanTurns = transcript.filter((t) => t.speaker === "responder");
  const satisfied = new Set<string>();

  for (const objective of objectives) {
    const keywords = OBJECTIVE_KEYWORDS[objective.id];
    if (!keywords) continue;
    if (answeredHumanTurns.some((turn) => turnMatches(turn, keywords))) {
      satisfied.add(objective.id);
    }
  }

  return satisfied;
}

// ---------------------------------------------------------------------------
// nextQuestion — pick + phrase the next unmet objective
// ---------------------------------------------------------------------------

/** Context the policy may use to phrase a question in the agent's own words. */
export interface TurnContext {
  couple?: unknown;
  flags?: unknown;
  lastAnswer?: Turn;
}

/** A vague/incomplete answer warrants a deeper follow-up (Req 6.3). */
function answerIsVague(turn: Turn | undefined): boolean {
  if (!turn) return false;
  const text = lc(turn.text).trim();
  if (text.length === 0) return true;
  const vagueMarkers = [
    "not sure",
    "i think",
    "maybe",
    "i don't know",
    "dont know",
    "let me check",
    "depends",
    "possibly",
    "unsure",
  ];
  return vagueMarkers.some((m) => text.includes(m)) || text.split(/\s+/).length <= 2;
}

/** Read a couple's display name from the loosely-typed context, when present. */
function coupleName(context: TurnContext): string | null {
  const couple = context.couple;
  if (couple && typeof couple === "object") {
    const name = (couple as { display_name?: unknown }).display_name;
    if (typeof name === "string" && name.trim().length > 0) return name.trim();
  }
  return null;
}

/**
 * Pick the next UNANSWERED objective and produce the agent's own phrasing for
 * it (Req 6.2). `answered` typically comes from objectivesSatisfied(); any
 * objective already in that set is skipped (Req 6.3). Returns null when every
 * objective is satisfied.
 *
 * Pure + deterministic: identical (objectives, answered, context) always yield
 * identical output, and objectives are considered in their declared order so
 * the chosen objective is stable.
 */
export function nextQuestion(
  objectives: CallObjective[],
  answered: Set<string>,
  context: TurnContext,
): { objectiveId: string; phrasing: string } | null {
  const next = objectives.find((o) => !answered.has(o.id));
  if (!next) return null;

  // If the previous answer was vague/incomplete, open with a clarifying lead-in
  // before re-asking the same objective in the agent's own words (Req 6.3).
  const onBehalf = coupleName(context)
    ? `on behalf of ${coupleName(context)}`
    : "on behalf of the couple";

  const phrasing = answerIsVague(context.lastAnswer)
    ? `Just to make sure I have this right ${onBehalf} — could you clarify: ${next.summary}`
    : `Calling ${onBehalf}, I'd like to confirm: ${next.summary}`;

  return { objectiveId: next.id, phrasing };
}
