// Shared type definitions for Mariposa — the contract across UI, API, agent, and workflow layers.

// ---------------------------------------------------------------------------
// Enumerations (grounded in sample-couple.md / validation schemas)
// ---------------------------------------------------------------------------

export type Role = "her" | "him";
export type SemenAnalysisStatus = "not_started" | "in_progress" | "completed";
export type PolicyHolder = "her" | "him";
export type CoverageStatus = "confirmed" | "partial_unconfirmed" | "unconfirmed";
export type Confidence = "Low" | "Moderate" | "High";
export type TaskColumn = "her" | "him" | "together";
export type FlagKind = "missing" | "borderline" | "unverified";
export type CallType = "insurance" | "clinic";
export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "paused";
export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "paused";

// ---------------------------------------------------------------------------
// Inngest seven-step workflow status tracking (lib/inngest/) — Req 7.1, 7.2, 7.3
// A `workflow_run` record persists an ordered array of per-step states the UI
// can poll/stream. `null` is never used here — every step always has a status.
// ---------------------------------------------------------------------------

export interface WorkflowStepState {
  /** 1-based step number in the documented graph order. */
  step: number;
  /** Human-readable step name shown in the WorkflowViewer. */
  name: string;
  /** Current lifecycle status of this step (Req 7.5). */
  status: WorkflowStepStatus;
  /** Error message when the step failed (Req 7.6); absent otherwise. */
  error?: string;
  /**
   * Marks steps that belong to a concurrent fan-out/fan-in branch-pair so the
   * Workflow_Viewer can render them side-by-side as simultaneous lanes (Req 7.4).
   * The `analyze-her`/`analyze-his` pair and the `insurance-call`/`clinic-call`
   * pair each share a `branchGroup`. Sequential steps omit it.
   */
  branchGroup?: string;
}

/** Approval_Gate lifecycle for the persisted run (Req 17). */
export type ApprovalState = "awaiting" | "approved" | "expired";

export interface WorkflowRun {
  couple_id: string;
  /** Ordered states for the reactive-graph steps (Req 7.1, 7.5). */
  steps: WorkflowStepState[];
  /** Overall run status (failed once any step fails; paused at the gate). */
  status: WorkflowRunStatus;
  /** The 1-based number of the failed step, when the run failed (Req 7.6). */
  failedStep?: number;
  /** Approval_Gate state: awaiting → approved | expired (Req 17.3, 17.5). */
  approvalState?: ApprovalState;
}

/**
 * Scheduled male-track Check_In (Req 18). Created when the booking is finalized;
 * fires the His re-test task + reminder when the configured delay elapses.
 */
export interface CheckIn {
  id: string;
  couple_id: string;
  /** The CHECKIN_DELAY token used for the sleep (e.g. "10s"). */
  delay_token: string;
  /** UI copy for the ~72-day / ~10–12 week sperm-regeneration horizon. */
  horizon_label: string;
  /** Id of the His re-test task created when the check-in fired. */
  task_id: string;
  status: "scheduled" | "due";
}

// ---------------------------------------------------------------------------
// Data model entities (Supabase schema)
// `null` represents a MISSING clinical value so the detector/UI can flag it.
// ---------------------------------------------------------------------------

export interface Couple {
  id: string;
  display_name: string;
  trying_since_months: number;
  goal: string;
  top_concern: string;
  insurance_provider: string;
  plan_type: string;
  member_id: string;
  group_number: string;
  policy_holder: PolicyHolder;
  coverage_status: CoverageStatus;
}

export interface Member {
  id: string;
  couple_id: string;
  role: Role;
  name: string;
  age: number;
  dob: string; // ISO date
}

export interface HerProfile {
  couple_id: string;
  last_period_start: string; // ISO date
  avg_cycle_length: number;
  cycle_length_min: number;
  cycle_length_max: number;
  cycle_regular: boolean;
  months_trying: number;
  conditions: string[];
  prior_meds: string[];
  ovulation_tracking: string;
  prior_pregnancies: number;
  amh: number | null;
  tsh: number | null;
  day3_fsh: number | null;
  day3_estradiol: number | null;
  mid_luteal_progesterone: number | null;
  prolactin: number | null;
}

export interface HimLifestyle {
  smoking: boolean;
  alcohol: string;
  heat_exposure: boolean;
  sleep: string;
  stress: string;
  bmi: number;
  supplements: boolean;
}

export interface HimMedicalHistory {
  surgeries: string;
  varicocele: string;
  medications: string;
  prior_children: number;
}

export interface HimProfile {
  couple_id: string;
  semen_analysis_status: SemenAnalysisStatus;
  semen_analysis_date: string | null; // ISO date
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
  readiness_score: number;
}

export interface TryingWindow {
  id: string;
  couple_id: string;
  fertile_window_start: string; // ISO date
  fertile_window_end: string;
  min_ovulation: string;
  max_ovulation: string;
  confidence: Confidence;
  reasons: string[];
}

export interface Task {
  id: string;
  couple_id: string;
  column: TaskColumn;
  title: string;
  completed: boolean;
  weight: number;
  source_call_record_id: string | null;
}

export interface CalendarEvent {
  id: string;
  couple_id: string;
  type: string;
  title: string;
  date: string; // ISO date
  time: string;
  description: string;
}

export interface CallRecord {
  id: string;
  couple_id: string;
  call_type: CallType;
  transcript: Turn[];
  extracted_result: InsuranceResult | ClinicResult;
  used_fallback: boolean;
  unresolved_fields: string[];
}

// ---------------------------------------------------------------------------
// Trying-Window Engine (lib/core/trying-window.ts) — Req 3
// ---------------------------------------------------------------------------

export interface TryingWindowInput {
  lastPeriodStart: string; // ISO date
  cycleLengthMin: number; // days
  cycleLengthMax: number; // days
  ovulationConfirmed: boolean; // mid-luteal progesterone OR LH confirmation present
}

export interface TryingWindowOutput {
  fertileWindowStart: string; // ISO date
  fertileWindowEnd: string;
  minOvulation: string; // priority day start
  maxOvulation: string; // priority day end
  confidence: Confidence;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Missing-Data Detector (lib/core/missing-data.ts) — Req 4
// ---------------------------------------------------------------------------

export interface MissingDataInput {
  labs: {
    day3_fsh: number | null;
    day3_estradiol: number | null;
    mid_luteal_progesterone: number | null;
    prolactin: number | null;
  };
  semen: {
    volume_ml: number | null;
    concentration_million_ml: number | null;
    total_count_million: number | null;
    progressive_motility_pct: number | null;
    total_motility_pct: number | null;
    morphology_normal_pct: number | null;
    vitality_pct: number | null;
    ph: number | null;
  };
  coverage_status: CoverageStatus | string;
}

export interface DataFlag {
  id: string; // e.g. "day3_fsh", "concentration", "insurance_coverage"
  kind: FlagKind;
  label: string;
  explanation: string; // grounded text citing the reference file
  source: string; // reference file name
}

// ---------------------------------------------------------------------------
// Trying-Duration Rule (lib/core/duration-rule.ts) — Req 7.4–7.6
// ---------------------------------------------------------------------------

export interface DurationInput {
  femaleAge: number;
  monthsTrying: number;
  redFlags: string[];
}

export interface DurationResult {
  thresholdMonths: 6 | 12;
  recommendEarlyEvaluation: boolean;
  redFlags: string[];
}

// ---------------------------------------------------------------------------
// Structured-Result Extractors / Agent (lib/core/extract.ts, lib/agent/) — Req 6
// ---------------------------------------------------------------------------

export interface InsuranceResult {
  diagnostic_covered: boolean;
  semen_analysis_covered: boolean;
  hormone_labs_covered: boolean;
  prior_auth_required_for: string[];
  in_network_lab: string;
  deductible: number;
  coinsurance_pct: number;
  oop_max: number;
  referral_required: boolean;
  follow_up_tasks: string[];
}

export interface ClinicResult {
  booked: { date: string; time: string; mode: string; clinic: string };
  bring_list: string[];
  tasks: { her: string[]; him: string[]; together: string[] };
  calendar_event: { type: string; date: string; time: string };
}

export interface Turn {
  speaker: "agent" | "responder";
  text: string;
}

export interface AuthPacket {
  couple_id: string;
  member_id: string;
  dob: string;
  provider: string;
  plan_type: string;
  group_number: string;
  policy_holder: PolicyHolder;
}

export interface CallOutput<T> {
  transcript: Turn[];
  result: T;
  usedFallback: boolean;
  /**
   * Partial turns as they appeared live, streamed to the Call UI (Req 6.14).
   * OPTIONAL and additive: the deterministic Mock_Fallback may omit it.
   */
  transcriptStream?: Turn[];
  /**
   * Whether the structured result came from the real Live_Voice_Session or the
   * deterministic Mock_Fallback (Req 6.12, 6.13). OPTIONAL/additive.
   */
  resultSource?: "live" | "fallback";
  /**
   * Schema fields that could not be extracted from the call (Req 6.8).
   * OPTIONAL/additive — existing object literals remain valid without it.
   */
  unresolvedFields?: string[];
}

// ---------------------------------------------------------------------------
// Live agentic Voice_Agent (lib/agent/) — Req 6.1–6.14, 15.2
// ---------------------------------------------------------------------------

/**
 * A single Call_Objective the Voice_Agent must satisfy during a Live_Voice_Session.
 * Derived from the call-scripts.md question checklist (10 insurance / 7 clinic);
 * the agent phrases each objective itself rather than reading a verbatim script
 * (Req 6.2).
 */
export interface CallObjective {
  /** Stable objective identifier (e.g. "deductible", "booked"). */
  id: string;
  /** Human-readable description of what the agent must obtain. */
  summary: string;
  /** The structured-result field this objective maps to, when applicable. */
  resultField?: string;
}

/**
 * Real-time spoken conversation client over a WebSocket (Req 6.1).
 * Configured by `XAI_VOICE_WS_URL` / `XAI_VOICE_MODEL`. The Voice_Agent speaks
 * its own phrasing, listens to the live human's transcribed turns, streams the
 * partial transcript to the UI, and closes cleanly at the end of the call.
 */
export interface LiveVoiceSession {
  /** Open the WebSocket session. */
  connect(): Promise<void>;
  /** Send a TTS prompt for the agent to speak (its own phrasing). */
  speak(prompt: string): Promise<void>;
  /** Register a callback invoked for each transcribed human (responder) turn. */
  onHumanTurn(cb: (t: Turn) => void): void;
  /** The partial transcript accumulated so far (for the live UI). */
  partialTranscript(): Turn[];
  /** Close the WebSocket session. */
  close(): Promise<void>;
}

/** Names of the events the reactive Inngest graph emits / reacts to (Req 7, 17, 19). */
export type WorkflowEventName =
  | "fertility.intake.completed"
  | "call.completed"
  | "couple.booking.approved"
  | "checkin.due";
