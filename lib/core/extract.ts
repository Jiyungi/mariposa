// ===========================================================================
// Structured-Result Extractors (lib/core/extract.ts) — Req 6.2, 6.3, 6.5, 5.2, 5.5
//
// PURE, deterministic functions (no I/O). They map a call transcript (chronological
// agent/responder Turns) — or a transcript built from the mock responses — to the
// EXACT InsuranceResult / ClinicResult schemas defined in reference-data/call-scripts.md
// and lib/types.ts.
//
// Design guarantees (consumed by the Voice Agent in Task 9 and the Inngest workflow
// in Task 10):
//   - Property 10 (Req 5.2, 5.5): every follow-up TaskDraft created from an extracted
//     result is assigned to EXACTLY ONE column ("her" | "him" | "together") — never
//     zero, never more than one.
//   - Property 16 (Req 6.5): any field that cannot be extracted is reported in
//     `unresolved`, a corresponding follow-up task is added, and every successfully
//     extracted field is preserved unchanged.
//
// Composite schema fields (booked, calendar_event, bring_list, tasks) are treated
// atomically: a field is either fully extracted or reported unresolved, so partial
// objects never leak substituted/blank values into the result (cf. Property 24).
// No clinical value is invented — every value comes from the transcript itself.
// ===========================================================================

import type {
  ClinicResult,
  InsuranceResult,
  TaskColumn,
  Turn,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** A follow-up task awaiting persistence. Always carries exactly one column. */
export interface TaskDraft {
  column: TaskColumn; // "her" | "him" | "together"
  title: string;
}

/** The result of running an extractor over a transcript. */
export interface ExtractionOutcome<T> {
  /** Only the fields that were successfully extracted (preserved unchanged). */
  result: Partial<T>;
  /** Schema fields that could not be extracted from the transcript. */
  unresolved: string[];
  /** Column-assigned follow-up tasks (derived results + one per unresolved field). */
  followUpTasks: TaskDraft[];
}

// ---------------------------------------------------------------------------
// Low-level transcript helpers (pure)
// ---------------------------------------------------------------------------

function lc(text: string): string {
  return text.toLowerCase();
}

/** All turns whose text matches a predicate, in chronological order. */
function turnsMatching(transcript: Turn[], keywords: string[]): Turn[] {
  return transcript.filter((t) => {
    const text = lc(t.text);
    return keywords.some((k) => text.includes(lc(k)));
  });
}

/** First turn (any speaker) containing any of the keywords, else undefined. */
function firstTurn(transcript: Turn[], keywords: string[]): Turn | undefined {
  return turnsMatching(transcript, keywords)[0];
}

/**
 * Resolve a coverage yes/no for a subject. Scans ALL turns mentioning the
 * subject (in transcript order) and returns the first DECISIVE verdict, so the
 * result is order-independent: an unrelated turn that merely contains the
 * keyword (e.g. "In-network lab: Crest Diagnostics" matching "diagnostic") but
 * carries no covered/not-covered verdict is skipped rather than latched onto.
 * Returns undefined when no turn addresses the subject with a verdict
 * (=> unresolved). [Fix for Property 16: live answers arrive in any order.]
 */
function parseCovered(transcript: Turn[], keywords: string[]): boolean | undefined {
  for (const turn of turnsMatching(transcript, keywords)) {
    const text = lc(turn.text);
    if (text.includes("not covered") || text.includes("no coverage")) return false;
    if (text.includes("covered") || text.includes("coverage")) return true;
  }
  return undefined;
}

/** Parse a dollar amount that appears after a label, e.g. "deductible $1,500". */
function parseMoney(transcript: Turn[], labels: string[]): number | undefined {
  for (const turn of transcript) {
    for (const label of labels) {
      const re = new RegExp(`${label}\\s*[:\\-]?\\s*\\$?\\s*([\\d,]+)`, "i");
      const m = turn.text.match(re);
      if (m) {
        const n = Number(m[1].replace(/,/g, ""));
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return undefined;
}

/** Parse a percentage that appears after a label, e.g. "coinsurance 20%". */
function parsePercent(transcript: Turn[], label: string): number | undefined {
  for (const turn of transcript) {
    const re = new RegExp(`${label}\\s*[:\\-]?\\s*(\\d+)\\s*%`, "i");
    const m = turn.text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** Resolve a "required / not required" boolean from the first matching turn. */
function parseRequired(transcript: Turn[], keywords: string[]): boolean | undefined {
  const turn = firstTurn(transcript, keywords);
  if (!turn) return undefined;
  const text = lc(turn.text);
  if (text.includes("not required") || text.includes("no ")) return false;
  if (text.includes("required")) return true;
  return undefined;
}

// ---------------------------------------------------------------------------
// Insurance extractor — Req 6.2
// ---------------------------------------------------------------------------

// The 10 InsuranceResult schema fields (call-scripts.md). `follow_up_tasks` is
// always derived from the extracted facts, so it is never reported unresolved.
const INSURANCE_RESOLVABLE_FIELDS: (keyof InsuranceResult)[] = [
  "diagnostic_covered",
  "semen_analysis_covered",
  "hormone_labs_covered",
  "prior_auth_required_for",
  "in_network_lab",
  "deductible",
  "coinsurance_pct",
  "oop_max",
  "referral_required",
];

const INSURANCE_FIELD_LABELS: Record<string, string> = {
  diagnostic_covered: "diagnostic evaluation coverage",
  semen_analysis_covered: "semen analysis coverage",
  hormone_labs_covered: "hormone labs coverage",
  prior_auth_required_for: "prior authorization requirements",
  in_network_lab: "in-network lab",
  deductible: "deductible amount",
  coinsurance_pct: "coinsurance percentage",
  oop_max: "out-of-pocket maximum",
  referral_required: "referral requirement",
};

/** Extract the procedures requiring prior auth (uppercase acronyms after "for").
 *  Scans ALL prior-auth turns and returns the first DECISIVE one, so it is
 *  order-independent: a turn that merely mentions "prior auth" without naming
 *  procedures after "for" (e.g. "IUI/IVF: covered with prior auth") is skipped
 *  in favor of the turn that lists them (Property 16). */
function parsePriorAuthFor(transcript: Turn[]): string[] | undefined {
  for (const turn of turnsMatching(transcript, ["prior auth", "prior authorization"])) {
    const text = lc(turn.text);
    if (text.includes("not required") || text.includes("no prior auth")) return [];
    // Pull the acronyms named after "for" (e.g. "required for IUI and IVF").
    const after = turn.text.split(/for/i).slice(1).join(" ");
    const matches = after.match(/\b[A-Z]{2,}\b/g);
    if (matches && matches.length > 0) return Array.from(new Set(matches));
  }
  return undefined;
}

/** Extract the in-network lab name (quoted, else the phrase after the colon). */
function parseInNetworkLab(transcript: Turn[]): string | undefined {
  const turn = firstTurn(transcript, ["in-network lab", "in network lab", "in-network labs"]);
  if (!turn) return undefined;
  const quoted = turn.text.match(/"([^"]+)"/);
  if (quoted) return quoted[1].trim();
  const afterColon = turn.text.match(/lab[s]?\s*[:\-]\s*([^.(]+)/i);
  if (afterColon) return afterColon[1].trim();
  return undefined;
}

/** Derive the standard insurance follow-up tasks from the extracted facts. */
function synthesizeInsuranceFollowUps(result: Partial<InsuranceResult>): string[] {
  const tasks: string[] = ["Confirm CPT codes with clinic before booking"];
  if (result.in_network_lab) {
    tasks.push(`Use ${result.in_network_lab} for in-network labs`);
  }
  if (result.prior_auth_required_for && result.prior_auth_required_for.length > 0) {
    tasks.push(`Submit prior auth before any ${result.prior_auth_required_for.join("/")}`);
  }
  return tasks;
}

/**
 * Extract the structured InsuranceResult from an insurance-call transcript.
 * Insurance is shared couple data, so every follow-up task is assigned to the
 * "together" column.
 */
export function extractInsuranceResult(
  transcript: Turn[],
): ExtractionOutcome<InsuranceResult> {
  const result: Partial<InsuranceResult> = {};

  const diagnostic = parseCovered(transcript, ["diagnostic"]);
  if (diagnostic !== undefined) result.diagnostic_covered = diagnostic;

  const semen = parseCovered(transcript, ["semen analysis", "89320"]);
  if (semen !== undefined) result.semen_analysis_covered = semen;

  const hormone = parseCovered(transcript, ["hormone lab"]);
  if (hormone !== undefined) result.hormone_labs_covered = hormone;

  const priorAuth = parsePriorAuthFor(transcript);
  if (priorAuth !== undefined) result.prior_auth_required_for = priorAuth;

  const inNetworkLab = parseInNetworkLab(transcript);
  if (inNetworkLab !== undefined) result.in_network_lab = inNetworkLab;

  const deductible = parseMoney(transcript, ["deductible"]);
  if (deductible !== undefined) result.deductible = deductible;

  const coinsurance = parsePercent(transcript, "coinsurance");
  if (coinsurance !== undefined) result.coinsurance_pct = coinsurance;

  const oopMax = parseMoney(transcript, ["oop max", "out-of-pocket", "out of pocket"]);
  if (oopMax !== undefined) result.oop_max = oopMax;

  const referral = parseRequired(transcript, ["referral"]);
  if (referral !== undefined) result.referral_required = referral;

  // follow_up_tasks is always producible (derived from extracted facts).
  result.follow_up_tasks = synthesizeInsuranceFollowUps(result);

  // Any resolvable field still missing is unresolved.
  const unresolved = INSURANCE_RESOLVABLE_FIELDS.filter(
    (f) => result[f] === undefined,
  ).map((f) => String(f));

  const followUpTasks: TaskDraft[] = [
    // The agent's own derived insurance follow-ups (shared => "together").
    ...result.follow_up_tasks.map(
      (title): TaskDraft => ({ column: "together", title }),
    ),
    // One follow-up task per unresolved field (Property 16).
    ...unresolved.map(
      (field): TaskDraft => ({
        column: "together",
        title: `Follow up with insurer to obtain: ${INSURANCE_FIELD_LABELS[field] ?? field}`,
      }),
    ),
  ];

  return { result, unresolved, followUpTasks };
}

// ---------------------------------------------------------------------------
// Clinic extractor — Req 6.3
// ---------------------------------------------------------------------------

const CLINIC_RESOLVABLE_FIELDS: (keyof ClinicResult)[] = [
  "booked",
  "bring_list",
  "tasks",
  "calendar_event",
];

const CLINIC_FIELD_LABELS: Record<string, string> = {
  booked: "confirmed appointment (date, time, mode, clinic)",
  bring_list: "list of records to bring",
  tasks: "her/his/together follow-up tasks",
  calendar_event: "calendar consult event",
};

/** Parse the records-to-bring list from a turn beginning "Bring: ...". */
function parseBringList(transcript: Turn[]): string[] | undefined {
  const turn = firstTurn(transcript, ["bring"]);
  if (!turn) return undefined;
  const after = turn.text.replace(/^.*?bring\s*[:\-]?\s*/i, "");
  const items = after
    .replace(/[.;]+\s*$/, "")
    .split(",")
    .map((s) => s.trim().replace(/^any\s+/i, ""))
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}

/** Parse a confirmed booking (needs ISO date, time, mode, and clinic name). */
function parseBooked(transcript: Turn[]): ClinicResult["booked"] | undefined {
  let date: string | undefined;
  let time: string | undefined;
  let mode: string | undefined;
  let clinic: string | undefined;

  for (const turn of transcript) {
    const text = turn.text;
    if (!date) {
      const m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (m) date = m[1];
    }
    if (!time) {
      const m = text.match(/\b(\d{1,2}:\d{2})\b/);
      if (m) time = m[1];
    }
    if (!mode) {
      const t = lc(text);
      if (t.includes("in person") || t.includes("in-person") || t.includes("in_person")) {
        mode = "in_person";
      } else if (t.includes("virtual") || t.includes("telehealth")) {
        mode = "virtual";
      }
    }
    if (!clinic) {
      const m = text.match(/clinic\s*[:\-]\s*([^.\n]+)/i);
      if (m) clinic = m[1].trim();
    }
  }

  if (date && time && mode && clinic) {
    return { date, time, mode, clinic };
  }
  return undefined;
}

/**
 * Classify a records-to-bring item into the partner who owns that data.
 * Grounded in data ownership only — no clinical value is invented.
 */
function classifyBringItem(item: string): TaskColumn {
  const i = lc(item);
  if (i.includes("semen")) return "him";
  if (i.includes("cycle") || i.includes("period") || i.includes("amh")) return "her";
  return "together";
}

/** Derive her/his/together prep tasks from the bring list. */
function deriveClinicTasks(bringList: string[]): ClinicResult["tasks"] {
  const tasks: ClinicResult["tasks"] = { her: [], him: [], together: [] };
  for (const item of bringList) {
    tasks[classifyBringItem(item)].push(`Bring ${item}`);
  }
  return tasks;
}

/**
 * Flatten a ClinicResult.tasks object into a flat list of column-assigned
 * TaskDrafts. Each task carries exactly one column (Property 10).
 */
export function clinicTasksToDrafts(tasks: ClinicResult["tasks"]): TaskDraft[] {
  return [
    ...tasks.her.map((title): TaskDraft => ({ column: "her", title })),
    ...tasks.him.map((title): TaskDraft => ({ column: "him", title })),
    ...tasks.together.map((title): TaskDraft => ({ column: "together", title })),
  ];
}

/**
 * Extract the structured ClinicResult from a clinic-booking transcript.
 * Composite fields are atomic: a field is fully extracted or reported unresolved.
 */
export function extractClinicResult(transcript: Turn[]): ExtractionOutcome<ClinicResult> {
  const result: Partial<ClinicResult> = {};

  const booked = parseBooked(transcript);
  if (booked !== undefined) {
    result.booked = booked;
    // The calendar event is derived directly from the confirmed booking.
    result.calendar_event = {
      type: "doctor_consult",
      date: booked.date,
      time: booked.time,
    };
  }

  const bringList = parseBringList(transcript);
  if (bringList !== undefined) {
    result.bring_list = bringList;
    result.tasks = deriveClinicTasks(bringList);
  }

  const unresolved = CLINIC_RESOLVABLE_FIELDS.filter(
    (f) => result[f] === undefined,
  ).map((f) => String(f));

  const followUpTasks: TaskDraft[] = [
    // Column-assigned prep tasks derived from the booking (Property 10).
    ...(result.tasks ? clinicTasksToDrafts(result.tasks) : []),
    // One follow-up task per unresolved field (Property 16).
    ...unresolved.map(
      (field): TaskDraft => ({
        column: "together",
        title: `Follow up with clinic to obtain: ${CLINIC_FIELD_LABELS[field] ?? field}`,
      }),
    ),
  ];

  return { result, unresolved, followUpTasks };
}
