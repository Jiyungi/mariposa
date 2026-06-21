// ===========================================================================
// Mariposa reactive-graph workflow — testable core (lib/inngest/workflow.ts)
//   — Req 7, 17, 18, 19
//
// `runMariposaWorkflow` is a PLAIN async function (no Inngest, no network). The
// Inngest function in ./functions is a thin wrapper that injects `step.run`,
// `step.waitForEvent`, `step.sleep`, and `step.sendEvent` behind the injectable
// dependencies declared here. Every external dependency (db + agent + the four
// workflow-event hooks) is injectable so the integration test (Task 10.2) can
// drive the whole reactive graph with the agent/Grok fully mocked and assert:
//
//   - fan-out / fan-in: analyze-her | analyze-his run concurrently and JOIN
//     before compute-trying-window; insurance-call | clinic-call run
//     concurrently and JOIN before the approval gate (Req 7.2, 7.3).
//   - status transitions incl. "paused" at the Approval_Gate (Req 7.5, 17.4).
//   - approval gate: waitForEvent → approved finalizes; timeout keeps the
//     appointment pending + "needs approval" and does NOT finalize (Req 17).
//   - idempotent finalize: repeated approvals never double-book (Req 17.3).
//   - scheduled Check_In: sleep → emit checkin.due → His re-test task (Req 18).
//   - failure halting: a failed branch in a Promise.all pair prevents the
//     fan-in from proceeding (Req 7.6).
//
// The graph steps are small, independently-exported functions operating on a
// shared, accumulating context so they can be unit-tested in isolation.
// ===========================================================================

import {
  getCouple as dbGetCouple,
  getCalendarEvents as dbGetCalendarEvents,
  getSummary as dbGetSummary,
  saveCalendarEvent as dbSaveCalendarEvent,
  saveCheckIn as dbSaveCheckIn,
  saveSummary as dbSaveSummary,
  saveTasks as dbSaveTasks,
  saveTryingWindow as dbSaveTryingWindow,
  saveWorkflowRun as dbSaveWorkflowRun,
  type SeedCouple,
  type Summary,
} from "@/lib/db";
import {
  applyClinicWriteBack as agentApplyClinicWriteBack,
  runClinicCall as agentRunClinicCall,
  runInsuranceCall as agentRunInsuranceCall,
  type ClinicWriteBackResult,
} from "@/lib/agent";
import { checkDurationRule } from "@/lib/core/duration-rule";
import { detectMissingData } from "@/lib/core/missing-data";
import {
  computeTryingWindow,
  TryingWindowInputError,
} from "@/lib/core/trying-window";
import { deriveHisPrepTasks } from "@/lib/calendar/partner-prep";
import type {
  ApprovalState,
  AuthPacket,
  CalendarEvent,
  CallOutput,
  CallType,
  CheckIn,
  ClinicResult,
  DataFlag,
  DurationResult,
  InsuranceResult,
  Task,
  TaskColumn,
  TryingWindow,
  TryingWindowOutput,
  WorkflowRun,
  WorkflowStepState,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Step definitions — the reactive-graph order (Req 7.1)
// ---------------------------------------------------------------------------

export const WORKFLOW_STEPS = [
  "analyze-her",
  "analyze-his",
  "compute-trying-window",
  "detect-missing-data",
  "check-duration-rule",
  "generate-tasks",
  "insurance-call",
  "clinic-call",
  "approval-gate",
  "finalize-booking",
  "schedule-checkin",
  "build-doctor-summary",
] as const;

export type WorkflowStepName = (typeof WORKFLOW_STEPS)[number];

/**
 * Branch-group tags for the two concurrent fan-out/fan-in pairs (Req 7.2, 7.4).
 * Steps sharing a group run simultaneously and are rendered side-by-side.
 */
export const BRANCH_GROUPS: Partial<Record<WorkflowStepName, string>> = {
  "analyze-her": "analyze",
  "analyze-his": "analyze",
  "insurance-call": "calls",
  "clinic-call": "calls",
};

/** The booked consult date — the single 2026-06-25 event finalize may write. */
export const BOOKING_DATE = "2026-06-25" as const;

/** Default demo Check_In delay token when CHECKIN_DELAY is unset (Req 18.5). */
export const DEFAULT_CHECKIN_DELAY = "10s" as const;

/** UI copy for the ~72-day sperm-regeneration horizon (Req 18.2). */
export const CHECKIN_HORIZON_LABEL = "approximately 10–12 weeks";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a workflow step fails; identifies the failed step (Req 7.6). */
export class MariposaWorkflowError extends Error {
  constructor(
    public readonly step: number,
    public readonly stepName: string,
    public readonly cause: string,
  ) {
    super(`Workflow step ${step} (${stepName}) failed: ${cause}`);
    this.name = "MariposaWorkflowError";
  }
}

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

/** Runs a single named unit of work. Default just invokes the body; the Inngest
 *  wrapper backs this with `step.run` so each step is a durable Inngest step. */
export type StepRunner = <T>(name: string, body: () => Promise<T>) => Promise<T>;

/** Outcome of awaiting the `couple.booking.approved` event (Req 17). */
export interface ApprovalOutcome {
  approved: boolean;
  timedOut: boolean;
}

/** What the `checkin.due` handler produced (Req 18.4). */
export interface CheckinResult {
  task: Task;
  reminder: CalendarEvent | null;
  checkIn: CheckIn;
}

export interface WorkflowDeps {
  getCouple: (id: string) => Promise<SeedCouple | null>;
  saveTryingWindow: (window: TryingWindow) => Promise<TryingWindow>;
  saveTasks: (coupleId: string, tasks: Task[]) => Promise<Task[]>;
  saveWorkflowRun: (run: WorkflowRun) => Promise<WorkflowRun>;
  runInsuranceCall: (packet: AuthPacket) => Promise<CallOutput<InsuranceResult>>;
  runClinicCall: (packet: AuthPacket) => Promise<CallOutput<ClinicResult>>;
  applyClinicWriteBack: (
    coupleId: string,
    insuranceResult: InsuranceResult,
    clinicOutput: CallOutput<ClinicResult>,
    db?: undefined,
    insuranceOutput?: CallOutput<InsuranceResult>,
  ) => Promise<ClinicWriteBackResult>;
  /** Read existing calendar events (finalize idempotency guard, Req 17.3). */
  getCalendarEvents: (coupleId: string) => Promise<CalendarEvent[]>;
  runStep: StepRunner;

  // --- Reactive-graph event hooks (Req 17, 18, 19) -------------------------

  /** Pause for `couple.booking.approved`; default AUTO-APPROVES (Req 17.3). */
  awaitBookingApproval: (run: WorkflowRun) => Promise<ApprovalOutcome>;
  /** The Check_In delay; default resolves immediately so tests don't wait. */
  sleep: (token: string) => Promise<void>;
  /** Emitted per finished call; default refreshes the summary (Req 7.10, 19). */
  emitCallCompleted: (
    coupleId: string,
    callType: CallType,
    output: CallOutput<InsuranceResult | ClinicResult>,
  ) => Promise<void>;
  /** Handle `checkin.due`: create the His re-test task + reminder (Req 18.4). */
  emitCheckinDue: (
    coupleId: string,
    delayToken: string,
    existingTasks: Task[],
  ) => Promise<CheckinResult>;
}

const defaultRunStep: StepRunner = (_name, body) => body();

// ---------------------------------------------------------------------------
// Reactive summary refresh — shared by default emitCallCompleted + the
// separate Reactive_Summary_Function (Req 19.2, 19.3, 19.5).
// ---------------------------------------------------------------------------

/**
 * Refresh the grounded Doctor_Summary from a single completed call's extracted
 * result, decoupled from the main run (Req 19.3). Every value comes only from
 * the call result (Reference_Data-grounded); nothing absent is invented (Req
 * 19.5). Merges into any existing summary so insurance + clinic both land.
 */
export async function refreshDoctorSummaryFromCall(
  coupleId: string,
  callType: CallType,
  result: InsuranceResult | ClinicResult,
  save: (s: Summary) => Promise<Summary> = dbSaveSummary,
  getExisting: (id: string) => Promise<Summary | null> = dbGetSummary,
): Promise<Summary> {
  const existing = await getExisting(coupleId);
  const sections: Record<string, unknown> = { ...(existing?.sections ?? {}) };

  if (callType === "insurance") {
    const r = result as InsuranceResult;
    sections.coverage = {
      diagnostic_covered: r.diagnostic_covered,
      semen_analysis_covered: r.semen_analysis_covered,
      hormone_labs_covered: r.hormone_labs_covered,
      prior_auth_required_for: r.prior_auth_required_for,
      in_network_lab: r.in_network_lab,
      deductible: r.deductible,
      coinsurance_pct: r.coinsurance_pct,
      oop_max: r.oop_max,
      referral_required: r.referral_required,
      coverage_status: "verified (partial)",
    };
  } else {
    const r = result as ClinicResult;
    sections.appointment = r.booked;
    sections.bring_list = r.bring_list;
  }

  const summary: Summary = { couple_id: coupleId, sections };
  return save(summary);
}

// ---------------------------------------------------------------------------
// checkin.due handler — shared by default emitCheckinDue + the Inngest wrapper.
// Creates the His-column re-test task + reminder, appending to existing tasks
// (never dropping them), and persists a Check_In record (Req 18.3, 18.4, 5.7).
// ---------------------------------------------------------------------------

export interface CheckinHandlerDb {
  saveTasks: (coupleId: string, tasks: Task[]) => Promise<Task[]>;
  saveCalendarEvent: (event: CalendarEvent) => Promise<CalendarEvent>;
  saveCheckIn: (checkIn: CheckIn) => Promise<CheckIn>;
}

const defaultCheckinDb: CheckinHandlerDb = {
  saveTasks: dbSaveTasks,
  saveCalendarEvent: dbSaveCalendarEvent,
  saveCheckIn: dbSaveCheckIn,
};

export async function handleCheckinDue(
  coupleId: string,
  delayToken: string,
  existingTasks: Task[],
  db: CheckinHandlerDb = defaultCheckinDb,
): Promise<CheckinResult> {
  const task: Task = {
    id: `task_${coupleId}_checkin_retest`,
    couple_id: coupleId,
    column: "him",
    title: "Re-test semen analysis / review lifestyle progress",
    completed: false,
    weight: 5,
    source_call_record_id: null,
  };

  // Append the re-test task to the existing set — never drop prior tasks.
  await db.saveTasks(coupleId, [...existingTasks, task]);

  // A reminder dated at the regeneration horizon (NOT the Jun 25 consult).
  const reminder: CalendarEvent = {
    id: `event_${coupleId}_checkin_reminder`,
    couple_id: coupleId,
    type: "reminder",
    title: "Re-test semen analysis",
    date: BOOKING_DATE, // placeholder replaced below
    time: "09:00",
    description: `Male-track check-in: re-test semen analysis and review lifestyle progress (${CHECKIN_HORIZON_LABEL}).`,
  };
  reminder.date = checkinReminderDate();
  const savedReminder = await db.saveCalendarEvent(reminder);

  const checkIn: CheckIn = {
    id: `checkin_${coupleId}`,
    couple_id: coupleId,
    delay_token: delayToken,
    horizon_label: CHECKIN_HORIZON_LABEL,
    task_id: task.id,
    status: "due",
  };
  const savedCheckIn = await db.saveCheckIn(checkIn);

  return { task, reminder: savedReminder, checkIn: savedCheckIn };
}

/** Reminder date ~72 days after the seed semen-analysis date (2026-05-20). */
function checkinReminderDate(): string {
  return addDaysIso("2026-05-20", 72);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Default dependencies wired to the real in-memory db + agent. */
export function defaultWorkflowDeps(): WorkflowDeps {
  return {
    getCouple: dbGetCouple,
    saveTryingWindow: dbSaveTryingWindow,
    saveTasks: dbSaveTasks,
    saveWorkflowRun: dbSaveWorkflowRun,
    runInsuranceCall: agentRunInsuranceCall,
    runClinicCall: agentRunClinicCall,
    applyClinicWriteBack: (coupleId, insuranceResult, clinicOutput, _db, insuranceOutput) =>
      agentApplyClinicWriteBack(
        coupleId,
        insuranceResult,
        clinicOutput,
        undefined,
        insuranceOutput,
      ),
    getCalendarEvents: dbGetCalendarEvents,
    runStep: defaultRunStep,

    // Auto-approve so runDemoPath + default runs complete end-to-end (Req 16.1).
    awaitBookingApproval: async () => ({ approved: true, timedOut: false }),
    // Resolve immediately so demo/tests don't actually wait (Req 18.5).
    sleep: async () => {},
    // Refresh the grounded summary reactively from the call result (Req 19.3).
    emitCallCompleted: async (coupleId, callType, output) => {
      await refreshDoctorSummaryFromCall(coupleId, callType, output.result);
    },
    // Create the His re-test task + reminder (Req 18.4).
    emitCheckinDue: (coupleId, delayToken, existingTasks) =>
      handleCheckinDue(coupleId, delayToken, existingTasks),
  };
}

// ---------------------------------------------------------------------------
// Accumulating workflow context (each step adds its output)
// ---------------------------------------------------------------------------

export interface HerAnalysis {
  ovulationConfirmed: boolean;
  cycleRegular: boolean;
  redFlagContext: string[];
}

export interface HisAnalysis {
  semenAnalysisCompleted: boolean;
  semenParametersPresent: string[];
}

export interface CallsOutput {
  insurance: CallOutput<InsuranceResult>;
  clinic: CallOutput<ClinicResult>;
  writeBack: ClinicWriteBackResult;
}

export interface ApprovalContext {
  state: ApprovalState;
  needsApproval: boolean;
  timedOut: boolean;
}

export interface DoctorSummary {
  couple_id: string;
  partners: {
    her: { name: string; age: number };
    him: { name: string; age: number };
  };
  trying_window: TryingWindowOutput;
  missing_data: DataFlag[];
  duration: DurationResult;
  coverage: {
    status: string;
    verified: boolean;
    facts: InsuranceResult;
  };
  appointment: ClinicResult["booked"] | "pending";
  bring_list: string[];
}

export interface WorkflowContext {
  coupleId: string;
  couple?: SeedCouple;
  herAnalysis?: HerAnalysis;
  hisAnalysis?: HisAnalysis;
  window?: TryingWindowOutput;
  flags?: DataFlag[];
  duration?: DurationResult;
  tasks?: Task[];
  /** Raw call outputs captured at the parallel calls join. */
  insuranceOutput?: CallOutput<InsuranceResult>;
  clinicOutput?: CallOutput<ClinicResult>;
  /** Set at finalize (after approval) — the booked artifacts. */
  calls?: CallsOutput;
  approval?: ApprovalContext;
  checkIn?: CheckIn;
  summary?: DoctorSummary;
  /** Idempotency guard: finalize ran in this run. */
  finalized?: boolean;
}

export interface WorkflowResult {
  run: WorkflowRun;
  context: WorkflowContext;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Build the agent authorization packet from the couple's Together data. */
export function buildAuthPacket(couple: SeedCouple): AuthPacket {
  const c = couple.couple;
  const holder = couple.members.find((m) => m.role === c.policy_holder);
  return {
    couple_id: c.id,
    member_id: c.member_id,
    dob: holder?.dob ?? "",
    provider: c.insurance_provider,
    plan_type: c.plan_type,
    group_number: c.group_number,
    policy_holder: c.policy_holder,
  };
}

/**
 * Derive the red-flag conditions for the Trying-Duration rule (Req 7.8).
 * Grounded in the seed/missing-data:
 *   - irregular cycles when `cycle_regular === false`
 *   - known PCOS / endometriosis only when CONFIRMED (suspected does not count)
 *   - borderline semen analysis (known male factor) when the detector flagged
 *     any semen parameter below its WHO 2021 limit
 */
export function deriveRedFlags(couple: SeedCouple, flags: DataFlag[]): string[] {
  const red: string[] = [];

  if (couple.herProfile.cycle_regular === false) {
    red.push("irregular cycles");
  }

  const conditions = couple.herProfile.conditions.map((c) => c.toLowerCase());
  const isConfirmed = (c: string) => !c.includes("suspected") && !c.includes("not confirmed");
  if (conditions.some((c) => c.includes("pcos") && isConfirmed(c))) {
    red.push("known PCOS");
  }
  if (conditions.some((c) => c.includes("endometriosis") && isConfirmed(c))) {
    red.push("known endometriosis");
  }

  const borderlineSemen = flags.some(
    (f) => f.kind === "borderline" && f.source.includes("semen"),
  );
  if (borderlineSemen) {
    red.push("borderline semen analysis");
  }

  return red;
}

/** Column for a prep task derived from a missing-data flag (exactly one column). */
function columnForFlag(flag: DataFlag): TaskColumn {
  if (flag.source.includes("female-hormone")) return "her";
  if (flag.source.includes("semen")) return "him";
  return "together";
}

/** Build her/his/together prep tasks from the detector flags + duration outcome. */
export function buildPrepTasks(
  coupleId: string,
  flags: DataFlag[],
  duration: DurationResult,
): Task[] {
  const tasks: Task[] = [];
  let i = 0;

  for (const flag of flags) {
    const column = columnForFlag(flag);
    const verb =
      flag.kind === "missing" ? "Complete" : flag.kind === "borderline" ? "Repeat" : "Verify";
    tasks.push({
      id: `task_${coupleId}_prep_${i++}`,
      couple_id: coupleId,
      column,
      title: `${verb} ${flag.label} — ${flag.explanation}`,
      completed: false,
      weight: column === "him" ? 5 : 0,
      source_call_record_id: null,
    });
  }

  if (duration.recommendEarlyEvaluation) {
    const reason =
      duration.redFlags.length > 0
        ? `red flags: ${duration.redFlags.join(", ")}`
        : `trying duration meets the ${duration.thresholdMonths}-month threshold`;
    tasks.push({
      id: `task_${coupleId}_prep_${i++}`,
      couple_id: coupleId,
      column: "together",
      title: `Schedule an early fertility evaluation (${reason}).`,
      completed: false,
      weight: 0,
      source_call_record_id: null,
    });
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Graph step bodies (small, independently-testable)
// ---------------------------------------------------------------------------

function requireCouple(ctx: WorkflowContext): SeedCouple {
  if (!ctx.couple) {
    throw new Error("Couple profiles not loaded");
  }
  return ctx.couple;
}

async function loadCouple(ctx: WorkflowContext, deps: WorkflowDeps): Promise<SeedCouple> {
  if (ctx.couple) return ctx.couple;
  const couple = await deps.getCouple(ctx.coupleId);
  if (!couple) {
    throw new Error(`No couple found for id "${ctx.coupleId}"`);
  }
  ctx.couple = couple;
  return couple;
}

/** Branch — analyze her cycle/red-flag context (fan-out, Req 7.2). */
export async function stepAnalyzeHer(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<HerAnalysis> {
  const couple = await loadCouple(ctx, deps);
  const her = couple.herProfile;
  // Ovulation is "confirmed" only with a mid-luteal progesterone result (Req 3.5).
  const ovulationConfirmed = her.mid_luteal_progesterone !== null;

  const redFlagContext: string[] = [];
  if (her.cycle_regular === false) redFlagContext.push("irregular cycles");
  if (!ovulationConfirmed) redFlagContext.push("ovulation not confirmed");

  const analysis: HerAnalysis = {
    ovulationConfirmed,
    cycleRegular: her.cycle_regular,
    redFlagContext,
  };
  ctx.herAnalysis = analysis;
  return analysis;
}

/** Branch — analyze his semen-analysis context (fan-out, Req 7.2). */
export async function stepAnalyzeHis(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<HisAnalysis> {
  const couple = await loadCouple(ctx, deps);
  const him = couple.himProfile;

  const present: string[] = [];
  const params: Array<[string, number | null]> = [
    ["volume_ml", him.volume_ml],
    ["concentration_million_ml", him.concentration_million_ml],
    ["total_count_million", him.total_count_million],
    ["progressive_motility_pct", him.progressive_motility_pct],
    ["total_motility_pct", him.total_motility_pct],
    ["morphology_normal_pct", him.morphology_normal_pct],
    ["vitality_pct", him.vitality_pct],
    ["ph", him.ph],
  ];
  for (const [name, value] of params) {
    if (value !== null) present.push(name);
  }

  const analysis: HisAnalysis = {
    semenAnalysisCompleted: him.semen_analysis_status === "completed",
    semenParametersPresent: present,
  };
  ctx.hisAnalysis = analysis;
  return analysis;
}

/** Compute the trying window from her cycle inputs only (Req 3). */
export async function stepComputeTryingWindow(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<TryingWindowOutput> {
  const couple = requireCouple(ctx);
  const her = couple.herProfile;

  const ovulationConfirmed =
    ctx.herAnalysis?.ovulationConfirmed ?? her.mid_luteal_progesterone !== null;

  let window: TryingWindowOutput;
  try {
    window = computeTryingWindow({
      lastPeriodStart: her.last_period_start,
      cycleLengthMin: her.cycle_length_min,
      cycleLengthMax: her.cycle_length_max,
      ovulationConfirmed,
    });
  } catch (err) {
    if (err instanceof TryingWindowInputError) {
      throw new Error(`Trying-window input invalid: ${err.message}`);
    }
    throw err;
  }

  const record: TryingWindow = {
    id: `window_${ctx.coupleId}`,
    couple_id: ctx.coupleId,
    fertile_window_start: window.fertileWindowStart,
    fertile_window_end: window.fertileWindowEnd,
    min_ovulation: window.minOvulation,
    max_ovulation: window.maxOvulation,
    confidence: window.confidence,
    reasons: window.reasons,
  };
  await deps.saveTryingWindow(record);

  ctx.window = window;
  return window;
}

/** Detect missing/borderline/unverified data (Req 4). */
export async function stepDetectMissingData(
  ctx: WorkflowContext,
  _deps: WorkflowDeps,
): Promise<DataFlag[]> {
  const couple = requireCouple(ctx);
  const her = couple.herProfile;
  const him = couple.himProfile;

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

  ctx.flags = flags;
  return flags;
}

/** Apply the age-based threshold + red-flag override (Req 7.7, 7.8). */
export async function stepCheckDurationRule(
  ctx: WorkflowContext,
  _deps: WorkflowDeps,
): Promise<DurationResult> {
  const couple = requireCouple(ctx);
  const flags = ctx.flags ?? [];
  const herMember = couple.members.find((m) => m.role === "her");
  const femaleAge = herMember?.age ?? 0;
  const redFlags = deriveRedFlags(couple, flags);

  const duration = checkDurationRule({
    femaleAge,
    monthsTrying: couple.herProfile.months_trying,
    redFlags,
  });

  ctx.duration = duration;
  return duration;
}

/** Generate + persist her/his/together prep tasks (Req 5). */
export async function stepGenerateTasks(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<Task[]> {
  const flags = ctx.flags ?? [];
  const duration = ctx.duration;
  if (!duration) {
    throw new Error("Duration result missing before task generation");
  }
  const tasks = buildPrepTasks(ctx.coupleId, flags, duration);
  const hisPrep = ctx.window ? deriveHisPrepTasks(ctx.coupleId) : [];
  await deps.saveTasks(ctx.coupleId, [...tasks, ...hisPrep]);
  ctx.tasks = [...tasks, ...hisPrep];
  return ctx.tasks;
}

/** Branch — the insurance verification call (fan-out, Req 6, 7.3). Emits
 *  `call.completed` once the call resolves (Req 7.10). */
export async function stepInsuranceCall(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<CallOutput<InsuranceResult>> {
  const couple = requireCouple(ctx);
  const packet = buildAuthPacket(couple);
  const output = await deps.runInsuranceCall(packet);
  ctx.insuranceOutput = output;
  await deps.emitCallCompleted(ctx.coupleId, "insurance", output);
  return output;
}

/** Branch — the clinic booking call (fan-out, Req 6, 7.3). Emits
 *  `call.completed` once the call resolves (Req 7.10). */
export async function stepClinicCall(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<CallOutput<ClinicResult>> {
  const couple = requireCouple(ctx);
  const packet = buildAuthPacket(couple);
  const output = await deps.runClinicCall(packet);
  ctx.clinicOutput = output;
  await deps.emitCallCompleted(ctx.coupleId, "clinic", output);
  return output;
}

/**
 * Finalize the booking after approval (Req 17.3). IDEMPOTENT: repeated calls
 * never double-book. Guards:
 *   1. in-run — if this run already finalized, return the existing write-back.
 *   2. persisted — if a 2026-06-25 consult event already exists, reuse it
 *      rather than writing a second booking.
 */
export async function stepFinalizeBooking(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<CallsOutput> {
  requireCouple(ctx);
  if (ctx.finalized && ctx.calls) {
    return ctx.calls; // in-run idempotency
  }
  const insurance = ctx.insuranceOutput;
  const clinic = ctx.clinicOutput;
  if (!insurance || !clinic) {
    throw new Error("Cannot finalize booking before both calls complete");
  }

  // Persisted idempotency: never write a second 2026-06-25 consult event.
  const existingEvents = await deps.getCalendarEvents(ctx.coupleId);
  const existingConsult = existingEvents.find(
    (e) => e.id === `event_${ctx.coupleId}_consult` || e.date === BOOKING_DATE,
  );

  let writeBack: ClinicWriteBackResult;
  if (existingConsult) {
    writeBack = {
      tasks: [],
      calendarEvent: existingConsult,
      summary: { couple_id: ctx.coupleId, sections: {} },
    };
  } else {
    writeBack = await deps.applyClinicWriteBack(
      ctx.coupleId,
      insurance.result,
      clinic,
      undefined,
      insurance,
    );
  }

  // Persist prep tasks (generate-tasks) alongside the call-derived write-back
  // tasks so both survive — append, never drop.
  const prepTasks = ctx.tasks ?? [];
  const combined = [...prepTasks, ...writeBack.tasks];
  await deps.saveTasks(ctx.coupleId, combined);
  ctx.tasks = combined;

  const calls: CallsOutput = { insurance, clinic, writeBack };
  ctx.calls = calls;
  ctx.finalized = true;
  return calls;
}

/** Schedule + fire the male-track Check_In (Req 18). */
export async function stepScheduleCheckin(
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<CheckIn> {
  const delayToken = process.env.CHECKIN_DELAY ?? DEFAULT_CHECKIN_DELAY;
  // Wait the configured delay (default resolves immediately, Req 18.5).
  await deps.sleep(delayToken);
  // On wake, emit checkin.due → create the His re-test task + reminder (Req 18.4).
  const result = await deps.emitCheckinDue(ctx.coupleId, delayToken, ctx.tasks ?? []);
  ctx.tasks = [...(ctx.tasks ?? []), result.task];
  ctx.checkIn = result.checkIn;
  return result.checkIn;
}

/** Assemble / refresh the doctor-ready summary from the accumulated context. */
export async function stepBuildDoctorSummary(
  ctx: WorkflowContext,
  _deps: WorkflowDeps,
): Promise<DoctorSummary> {
  const couple = requireCouple(ctx);
  if (!ctx.window || !ctx.flags || !ctx.duration || !ctx.calls) {
    throw new Error("Cannot build summary before prior steps complete");
  }

  const herMember = couple.members.find((m) => m.role === "her");
  const himMember = couple.members.find((m) => m.role === "him");
  const coverageStatus = couple.couple.coverage_status;
  const insuranceResult = ctx.calls.insurance.result;
  const clinicResult = ctx.calls.clinic.result;

  const summary: DoctorSummary = {
    couple_id: ctx.coupleId,
    partners: {
      her: { name: herMember?.name ?? "", age: herMember?.age ?? 0 },
      him: { name: himMember?.name ?? "", age: himMember?.age ?? 0 },
    },
    trying_window: ctx.window,
    missing_data: ctx.flags,
    duration: ctx.duration,
    coverage: {
      status: coverageStatus,
      verified: coverageStatus === "confirmed",
      facts: insuranceResult,
    },
    appointment: clinicResult.booked ?? "pending",
    bring_list: clinicResult.bring_list ?? [],
  };

  ctx.summary = summary;
  return summary;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function stepIndex(name: WorkflowStepName): number {
  return WORKFLOW_STEPS.indexOf(name);
}

function initialRun(coupleId: string): WorkflowRun {
  const steps: WorkflowStepState[] = WORKFLOW_STEPS.map((name, i) => ({
    step: i + 1,
    name,
    status: "pending",
    ...(BRANCH_GROUPS[name] ? { branchGroup: BRANCH_GROUPS[name] } : {}),
  }));
  return { couple_id: coupleId, steps, status: "pending" };
}

/**
 * Execute one sequential step: mark `running`, run the body via the injected
 * runner, mark `completed`, persisting the run on each transition (Req 7.5). On
 * failure the step is marked `failed`, the run is failed with the failed step,
 * and a MariposaWorkflowError is thrown to halt the pipeline (Req 7.6).
 */
async function executeStep<T>(
  run: WorkflowRun,
  index: number,
  deps: WorkflowDeps,
  body: () => Promise<T>,
): Promise<T> {
  const stepState = run.steps[index];
  stepState.status = "running";
  run.status = "running";
  await deps.saveWorkflowRun(run);

  try {
    const result = await deps.runStep(stepState.name, body);
    stepState.status = "completed";
    await deps.saveWorkflowRun(run);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stepState.status = "failed";
    stepState.error = message;
    run.status = "failed";
    run.failedStep = stepState.step;
    await deps.saveWorkflowRun(run);
    throw new MariposaWorkflowError(stepState.step, stepState.name, message);
  }
}

/**
 * Execute a concurrent fan-out/fan-in pair (Req 7.2, 7.3): both steps are
 * marked `running` simultaneously, run together via Promise.all-style
 * settlement, and the fan-in does NOT proceed until both resolve. If either
 * branch fails, those branches are marked `failed`, the run is failed at the
 * first failed branch, dependents stay `pending`, and a MariposaWorkflowError is
 * thrown so the join never proceeds (Req 7.6).
 */
async function executeParallel<A, B>(
  run: WorkflowRun,
  deps: WorkflowDeps,
  a: { index: number; body: () => Promise<A> },
  b: { index: number; body: () => Promise<B> },
): Promise<[A, B]> {
  const stepA = run.steps[a.index];
  const stepB = run.steps[b.index];
  stepA.status = "running";
  stepB.status = "running";
  run.status = "running";
  await deps.saveWorkflowRun(run);

  // Fan-out: invoke both branches; the awaited settlement IS the fan-in.
  const settled = await Promise.allSettled([
    deps.runStep(stepA.name, a.body),
    deps.runStep(stepB.name, b.body),
  ]);

  const states = [stepA, stepB];
  let firstError: { step: number; name: string; message: string } | null = null;
  settled.forEach((res, i) => {
    const state = states[i];
    if (res.status === "fulfilled") {
      state.status = "completed";
    } else {
      const message =
        res.reason instanceof Error ? res.reason.message : String(res.reason);
      state.status = "failed";
      state.error = message;
      if (!firstError) {
        firstError = { step: state.step, name: state.name, message };
      }
    }
  });

  if (firstError) {
    // Narrow the closure-mutated value for the type checker.
    const fe: { step: number; name: string; message: string } = firstError;
    run.status = "failed";
    run.failedStep = fe.step;
    await deps.saveWorkflowRun(run);
    throw new MariposaWorkflowError(fe.step, fe.name, fe.message);
  }

  await deps.saveWorkflowRun(run);
  return [
    (settled[0] as PromiseFulfilledResult<A>).value,
    (settled[1] as PromiseFulfilledResult<B>).value,
  ];
}

/**
 * Run the Approval_Gate (Req 17). The step reports `paused` while awaiting
 * `couple.booking.approved`; the appointment stays pending. On approval the
 * gate completes; on timeout the gate stays paused, approvalState is "expired",
 * and a "needs approval" state is surfaced (the run does NOT finalize).
 */
async function executeApprovalGate(
  run: WorkflowRun,
  ctx: WorkflowContext,
  deps: WorkflowDeps,
): Promise<ApprovalOutcome> {
  const gate = run.steps[stepIndex("approval-gate")];
  gate.status = "running";
  run.status = "running";
  await deps.saveWorkflowRun(run);

  // Pause: appointment pending, status paused (Req 17.4, 8.6).
  gate.status = "paused";
  run.status = "paused";
  run.approvalState = "awaiting";
  ctx.approval = { state: "awaiting", needsApproval: false, timedOut: false };
  await deps.saveWorkflowRun(run);

  const outcome = await deps.awaitBookingApproval(run);

  if (outcome.approved && !outcome.timedOut) {
    gate.status = "completed";
    run.status = "running";
    run.approvalState = "approved";
    ctx.approval = { state: "approved", needsApproval: false, timedOut: false };
    await deps.saveWorkflowRun(run);
  } else {
    // Wait expired: keep pending + surface "needs approval" (Req 17.5).
    gate.status = "paused";
    run.status = "paused";
    run.approvalState = "expired";
    ctx.approval = { state: "expired", needsApproval: true, timedOut: true };
    await deps.saveWorkflowRun(run);
  }

  return outcome;
}

/**
 * Run the full Mariposa reactive graph for a couple (Req 7.1). Two branch-pairs
 * fan out and join, the run pauses for human approval, finalize is idempotent,
 * and a scheduled delay drives the male-track check-in. A failure halts the
 * dependent steps (Req 7.6). All dependencies are injectable.
 *
 * Throws MariposaWorkflowError if a step fails; the persisted WorkflowRun records
 * which step failed and why.
 */
export async function runMariposaWorkflow(
  coupleId: string,
  overrides: Partial<WorkflowDeps> = {},
): Promise<WorkflowResult> {
  const deps: WorkflowDeps = { ...defaultWorkflowDeps(), ...overrides };
  const ctx: WorkflowContext = { coupleId };
  const run = initialRun(coupleId);
  await deps.saveWorkflowRun(run);

  // Fan-out / fan-in #1: analyze-her | analyze-his → JOIN (Req 7.2).
  await executeParallel(
    run,
    deps,
    { index: stepIndex("analyze-her"), body: () => stepAnalyzeHer(ctx, deps) },
    { index: stepIndex("analyze-his"), body: () => stepAnalyzeHis(ctx, deps) },
  );

  await executeStep(run, stepIndex("compute-trying-window"), deps, () =>
    stepComputeTryingWindow(ctx, deps),
  );
  await executeStep(run, stepIndex("detect-missing-data"), deps, () =>
    stepDetectMissingData(ctx, deps),
  );
  await executeStep(run, stepIndex("check-duration-rule"), deps, () =>
    stepCheckDurationRule(ctx, deps),
  );
  await executeStep(run, stepIndex("generate-tasks"), deps, () =>
    stepGenerateTasks(ctx, deps),
  );

  // Fan-out / fan-in #2: insurance-call | clinic-call → JOIN (Req 7.3, 7.10).
  await executeParallel(
    run,
    deps,
    { index: stepIndex("insurance-call"), body: () => stepInsuranceCall(ctx, deps) },
    { index: stepIndex("clinic-call"), body: () => stepClinicCall(ctx, deps) },
  );

  // Approval_Gate (Req 17): pause until approved or the wait expires.
  const approval = await executeApprovalGate(run, ctx, deps);

  if (!approval.approved || approval.timedOut) {
    // Needs approval: leave the appointment pending; do not finalize (Req 17.5).
    // finalize / schedule-checkin / build-doctor-summary stay pending.
    await deps.saveWorkflowRun(run);
    return { run, context: ctx };
  }

  await executeStep(run, stepIndex("finalize-booking"), deps, () =>
    stepFinalizeBooking(ctx, deps),
  );
  await executeStep(run, stepIndex("schedule-checkin"), deps, () =>
    stepScheduleCheckin(ctx, deps),
  );
  await executeStep(run, stepIndex("build-doctor-summary"), deps, () =>
    stepBuildDoctorSummary(ctx, deps),
  );

  run.status = "completed";
  await deps.saveWorkflowRun(run);

  return { run, context: ctx };
}
