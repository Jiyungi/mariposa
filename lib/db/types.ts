/**
 * Domain TypeScript types for the Mariposa data model (Req 11.1).
 *
 * These interfaces mirror the Supabase schema in
 * `supabase/migrations/0001_init_mariposa_schema.sql` and are the canonical domain
 * types other modules import. They are the eight entities from the design ER
 * diagram: couple, member, her_profile, him_profile, trying_window, task,
 * calendar_event, call_record.
 *
 * `null` represents a MISSING clinical value (Req 1.8). A field that may be
 * MISSING is typed `T | null` and is preserved exactly across the persistence
 * round-trip (Property 20 / Req 11.3) — null is never coerced to a default or a
 * substituted value.
 */

/** Coverage verification status for the couple's insurance (Req 2.4). */
export type CoverageStatus = "confirmed" | "partial_unconfirmed" | "unconfirmed";

/** Which partner holds the insurance policy (Req 2.4). */
export type PolicyHolder = "her" | "him";

/** Partner role on a member row. */
export type MemberRole = "her" | "him";

/** Semen-analysis progress for the male partner (Req 2.3). */
export type SemenAnalysisStatus = "not_started" | "in_progress" | "completed";

/** Confidence label produced by the Trying-Window engine (Req 3.4). */
export type Confidence = "Low" | "Moderate" | "High";

/** Task delegation column on the board (Req 5.1). */
export type TaskColumn = "her" | "him" | "together";

/**
 * Couple — the single shared workspace row. Together_View reads from here
 * (insurance, goal, top concern). The seed couple is `couple_001`.
 */
export interface Couple {
  id: string;
  display_name: string;
  trying_since_months: number | null;
  goal: string | null;
  top_concern: string | null;
  insurance_provider: string | null;
  plan_type: string | null;
  member_id: string | null;
  group_number: string | null;
  policy_holder: PolicyHolder | null;
  coverage_status: CoverageStatus | null;
}

/** Member — one row per partner. */
export interface Member {
  id: string;
  couple_id: string;
  role: MemberRole;
  name: string;
  age: number | null;
  dob: string | null;
}

/**
 * Her profile — female cycle data and labs. The lab fields default to MISSING
 * (`null`) for the seed couple: `day3_fsh`, `day3_estradiol`,
 * `mid_luteal_progesterone`, and `prolactin`.
 */
export interface HerProfile {
  couple_id: string;
  last_period_start: string | null;
  avg_cycle_length: number | null;
  cycle_length_min: number | null;
  cycle_length_max: number | null;
  cycle_regular: boolean | null;
  months_trying: number | null;
  conditions: string[];
  prior_meds: string[];
  ovulation_tracking: string | null;
  prior_pregnancies: number | null;
  amh: number | null;
  tsh: number | null;
  day3_fsh: number | null;
  day3_estradiol: number | null;
  mid_luteal_progesterone: number | null;
  prolactin: number | null;
}

/** Lifestyle factors captured for the male partner (Req 2.3, 5.3). */
export interface HimLifestyle {
  smoking: boolean | null;
  alcohol: string | null;
  heat_exposure: boolean | null;
  sleep: string | null;
  stress: string | null;
  bmi: number | null;
  supplements: boolean | null;
}

/** Medical history captured for the male partner (Req 2.3). */
export interface HimMedicalHistory {
  surgeries: string | null;
  varicocele: string | null;
  medications: string | null;
  prior_children: number | null;
}

/**
 * Him profile — semen analysis results, lifestyle, history, and the
 * Readiness_Score (integer 0–100). Any semen parameter may be MISSING (`null`).
 */
export interface HimProfile {
  couple_id: string;
  semen_analysis_status: SemenAnalysisStatus | null;
  semen_analysis_date: string | null;
  volume_ml: number | null;
  concentration_million_ml: number | null;
  total_count_million: number | null;
  progressive_motility_pct: number | null;
  total_motility_pct: number | null;
  morphology_normal_pct: number | null;
  vitality_pct: number | null;
  ph: number | null;
  lifestyle: HimLifestyle;
  medical_history: HimMedicalHistory;
  readiness_score: number | null;
}

/** Trying window — persisted output of the Trying-Window engine (Req 3, 10.3). */
export interface TryingWindow {
  id: string;
  couple_id: string;
  fertile_window_start: string | null;
  fertile_window_end: string | null;
  min_ovulation: string | null;
  max_ovulation: string | null;
  confidence: Confidence | null;
  reasons: string[];
}

/** Task — a Her / His / Together delegation board item (Req 5). */
export interface Task {
  id: string;
  couple_id: string;
  column: TaskColumn;
  title: string;
  completed: boolean;
  weight: number;
  source_call_record_id: string | null;
}

/** Calendar event — window, priority days, reminders, booked consult (Req 10). */
export interface CalendarEvent {
  id: string;
  couple_id: string;
  type: string;
  title: string;
  date: string | null;
  time: string | null;
  description: string | null;
}

/** A single chronological turn in a call transcript (Req 6.4). */
export interface TranscriptTurn {
  speaker: "agent" | "responder";
  text: string;
}

/** Call record — transcript + extracted result of a simulated call (Req 6). */
export interface CallRecord {
  id: string;
  couple_id: string;
  call_type: string;
  transcript: TranscriptTurn[];
  extracted_result: Record<string, unknown> | null;
  used_fallback: boolean;
  unresolved_fields: string[];
}

/**
 * The complete seeded workspace for one couple — the aggregate the seed loader
 * builds and writes, and the workspace loader reads. If any part is missing or
 * unparseable the workspace refuses to render partially (Req 1.7).
 */
export interface CoupleWorkspace {
  couple: Couple;
  members: Member[];
  herProfile: HerProfile;
  himProfile: HimProfile;
  tryingWindows: TryingWindow[];
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  callRecords: CallRecord[];
}
