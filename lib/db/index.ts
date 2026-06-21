// Minimal in-memory data layer for local demo routes without a live Supabase connection.
// Seed couple "Maya & Daniel" (couple_001) is loaded verbatim from sample-couple.md.

import type {
  CalendarEvent,
  CallRecord,
  CheckIn,
  Couple,
  HerProfile,
  HimProfile,
  Member,
  Task,
  TryingWindow,
  WorkflowRun,
} from "@/lib/types";

export interface SeedCouple {
  couple: Couple;
  members: Member[];
  herProfile: HerProfile;
  himProfile: HimProfile;
}

export interface Summary {
  couple_id: string;
  sections: Record<string, unknown>;
}

// --- Seed object — values EXACTLY as in reference-data/sample-couple.md -----

const SEED_COUPLE: SeedCouple = {
  couple: {
    id: "couple_001",
    display_name: "Maya & Daniel",
    trying_since_months: 8,
    goal: "Understand our timing, get the right tests, and enter care prepared",
    top_concern: "We're not sure if we're missing tests or wasting time",
    insurance_provider: "Pacific Crest Health",
    plan_type: "PPO",
    member_id: "PCH-0000-1234",
    group_number: "GRP-558823",
    policy_holder: "him",
    coverage_status: "partial_unconfirmed",
  },
  members: [
    {
      id: "member_her_001",
      couple_id: "couple_001",
      role: "her",
      name: "Maya",
      age: 33,
      dob: "1992-09-14",
    },
    {
      id: "member_him_001",
      couple_id: "couple_001",
      role: "him",
      name: "Daniel",
      age: 35,
      dob: "1990-11-02",
    },
  ],
  herProfile: {
    couple_id: "couple_001",
    last_period_start: "2026-06-01",
    avg_cycle_length: 52,
    cycle_length_min: 45,
    cycle_length_max: 60,
    cycle_regular: false,
    months_trying: 8,
    conditions: ["suspected PCOS (not confirmed)"],
    prior_meds: ["letrozole 2.5 mg (2026-03, 1 cycle)"],
    ovulation_tracking: "app only, no LH/progesterone confirmation",
    prior_pregnancies: 0,
    amh: 1.6,
    tsh: 2.1,
    day3_fsh: null,
    day3_estradiol: null,
    mid_luteal_progesterone: null,
    prolactin: null,
  },
  himProfile: {
    couple_id: "couple_001",
    semen_analysis_status: "completed",
    semen_analysis_date: "2026-05-20",
    volume_ml: 2.1,
    concentration_million_ml: 14,
    total_count_million: 29,
    progressive_motility_pct: 28,
    total_motility_pct: 44,
    morphology_normal_pct: 3,
    vitality_pct: 60,
    ph: 7.4,
    lifestyle: {
      smoking: false,
      alcohol: "moderate",
      heat_exposure: true,
      sleep: "ok",
      stress: "high",
      bmi: 27,
      supplements: false,
    },
    medical_history: {
      surgeries: "none",
      varicocele: "unknown",
      medications: "none",
      prior_children: 0,
    },
    readiness_score: 62,
  },
};

// --- In-memory stores -------------------------------------------------------

const couples = new Map<string, SeedCouple>([["couple_001", clone(SEED_COUPLE)]]);
const tryingWindows = new Map<string, TryingWindow>();
const tasks = new Map<string, Task[]>();
const calendarEvents = new Map<string, CalendarEvent[]>();
const callRecords = new Map<string, CallRecord[]>();
const summaries = new Map<string, Summary>();
const workflowRuns = new Map<string, WorkflowRun>();
const checkIns = new Map<string, CheckIn>();

function clone<T>(value: T): T {
  return structuredClone(value);
}

// --- Async workspace API --------------------------------------------

export async function getCouple(id: string): Promise<SeedCouple | null> {
  const found = couples.get(id);
  return found ? clone(found) : null;
}

export async function getSeedCouple(): Promise<SeedCouple> {
  return clone(SEED_COUPLE);
}

export async function saveTryingWindow(window: TryingWindow): Promise<TryingWindow> {
  tryingWindows.set(window.couple_id, clone(window));
  return clone(window);
}

export async function saveTasks(coupleId: string, items: Task[]): Promise<Task[]> {
  tasks.set(coupleId, items.map(clone));
  return items.map(clone);
}

export async function saveCalendarEvent(event: CalendarEvent): Promise<CalendarEvent> {
  const existing = calendarEvents.get(event.couple_id) ?? [];
  existing.push(clone(event));
  calendarEvents.set(event.couple_id, existing);
  return clone(event);
}

export async function saveCallRecord(record: CallRecord): Promise<CallRecord> {
  const existing = callRecords.get(record.couple_id) ?? [];
  existing.push(clone(record));
  callRecords.set(record.couple_id, existing);
  return clone(record);
}

export async function saveSummary(summary: Summary): Promise<Summary> {
  summaries.set(summary.couple_id, clone(summary));
  return clone(summary);
}

// --- Workflow-run status tracking (Inngest seven-step workflow) -------------
// Persists the ordered per-step statuses the WorkflowViewer polls/streams
// (Req 7.2). The whole run is written on every step transition.

export async function saveWorkflowRun(run: WorkflowRun): Promise<WorkflowRun> {
  workflowRuns.set(run.couple_id, clone(run));
  return clone(run);
}

export async function getWorkflowRun(coupleId: string): Promise<WorkflowRun | null> {
  const found = workflowRuns.get(coupleId);
  return found ? clone(found) : null;
}

// --- Read getters for the persisted workflow outputs ------------------------
// Used by the read endpoints (app/api/workspace, app/api/workflow-status) so the
// UI tabs can render the trying window, tasks, calendar, call records, and the
// stored summary that the seven-step workflow persisted.

export async function getTryingWindow(coupleId: string): Promise<TryingWindow | null> {
  const found = tryingWindows.get(coupleId);
  return found ? clone(found) : null;
}

export async function getTasks(coupleId: string): Promise<Task[]> {
  const found = tasks.get(coupleId);
  return found ? found.map(clone) : [];
}

export async function getCalendarEvents(coupleId: string): Promise<CalendarEvent[]> {
  const found = calendarEvents.get(coupleId);
  return found ? found.map(clone) : [];
}

export async function getCallRecords(coupleId: string): Promise<CallRecord[]> {
  const found = callRecords.get(coupleId);
  return found ? found.map(clone) : [];
}

export async function getSummary(coupleId: string): Promise<Summary | null> {
  const found = summaries.get(coupleId);
  return found ? clone(found) : null;
}

// --- Scheduled male-track Check_In (Req 18) ---------------------------------
// Persists the Check_In created when the booking is finalized so the His
// re-test task + reminder can be surfaced when the delay elapses.

export async function saveCheckIn(checkIn: CheckIn): Promise<CheckIn> {
  checkIns.set(checkIn.couple_id, clone(checkIn));
  return clone(checkIn);
}

export async function getCheckIn(coupleId: string): Promise<CheckIn | null> {
  const found = checkIns.get(coupleId);
  return found ? clone(found) : null;
}
