/*
  Local prop types for the Call Console.

  Shapes mirror the agent `CallOutput` contract:

      interface CallOutput<T> { transcript: Turn[]; result: T; usedFallback: boolean }

  where each `Turn` is `{ speaker: "agent" | "responder"; text: string }` — the
  agent speaks as "agent" and the live human (insurance rep / clinic scheduler)
  speaks as "responder". The console accepts BOTH "responder" and "human" for
  that role and labels it "Human" in the UI.

  `result` is the partially-extracted structured result. It fills in field by
  field as the Voice_Agent resolves objectives, so the console treats it as a
  partial: a key is "resolved" once it is present with a non-null value, and
  unresolved keys render a quiet pending affordance rather than a stand-in
  value (Req 20.3).
  ─────────────────────────────────────────────────────────────────────────
*/

/** Raw speaker tag as it may arrive from either branch's transcript. */
export type TurnSpeaker = "agent" | "human" | "responder";

/** A single chronological transcript turn (Req 20.1). */
export interface Turn {
  speaker: TurnSpeaker;
  text: string;
}

/** The two roles the console renders. The live human is always "human". */
export type TurnRole = "agent" | "human";

/**
 * Normalize a raw speaker tag to a render role. Agent transcripts use
 * "responder" for the human party; we accept it and "human" alike, and treat
 * anything that is not the agent as the human side.
 */
export function normalizeSpeaker(speaker: TurnSpeaker): TurnRole {
  return speaker === "agent" ? "agent" : "human";
}

/** Insurance structured result (subset shown), per call-scripts.md. */
export interface InsuranceResultLike {
  diagnostic_covered?: boolean;
  semen_analysis_covered?: boolean;
  hormone_labs_covered?: boolean;
  prior_auth_required_for?: string[];
  in_network_lab?: string;
  deductible?: number;
  coinsurance_pct?: number;
  oop_max?: number;
  referral_required?: boolean;
  follow_up_tasks?: string[];
}

/** Clinic structured result (subset shown), per call-scripts.md. */
export interface ClinicResultLike {
  booked?: { date?: string; time?: string; mode?: string; clinic?: string };
  bring_list?: string[];
  tasks?: { her?: string[]; him?: string[]; together?: string[] };
  calendar_event?: { type?: string; date?: string; time?: string };
}

/** The progressively-resolving result the console consumes (Req 20.3). */
export type CallResultLike =
  | Partial<Record<string, unknown>>
  | InsuranceResultLike
  | ClinicResultLike;

/** The two call modes the console renders (Req 6.10). */
export type CallType = "insurance" | "clinic";

/**
 * Agent call output shape used by the Call Console.
 */
export interface CallOutputLike {
  transcript: Turn[];
  result: CallResultLike;
  usedFallback: boolean;
}
