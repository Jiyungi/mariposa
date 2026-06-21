/**
 * Typed read/write queries for the Couple_Workspace (Req 11.2, 11.3, 1.6, 1.7).
 *
 * Each helper takes a `SupabaseClient` so the data layer stays testable and the
 * client lifecycle is owned by `lib/db/client.ts`. Reads return domain types
 * from `lib/db/types.ts`; `null` clinical values are preserved exactly across
 * the round-trip (Property 20). Writes are upserts keyed on the natural primary
 * keys so re-running the seed is idempotent.
 *
 * The domain types intentionally mirror the column layout, so mapping is a
 * direct cast rather than a field-by-field transform.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalendarEvent,
  CallRecord,
  Couple,
  CoupleWorkspace,
  HerProfile,
  HimProfile,
  Member,
  Task,
  TryingWindow,
} from "@/lib/db/types";

/** Error thrown when a read that must succeed returns nothing (Req 1.7). */
export class WorkspaceLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceLoadError";
    Object.setPrototypeOf(this, WorkspaceLoadError.prototype);
  }
}

function unwrap<T>(data: T | null, error: { message: string } | null, context: string): T {
  if (error) {
    throw new WorkspaceLoadError(`${context}: ${error.message}`);
  }
  if (data === null || data === undefined) {
    throw new WorkspaceLoadError(`${context}: no data returned`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Read the couple row, or `null` when it does not exist. */
export async function getCouple(
  client: SupabaseClient,
  coupleId: string,
): Promise<Couple | null> {
  const { data, error } = await client
    .from("couple")
    .select("*")
    .eq("id", coupleId)
    .maybeSingle();
  if (error) throw new WorkspaceLoadError(`getCouple: ${error.message}`);
  return (data as Couple) ?? null;
}

/** Read both partner member rows for a couple. */
export async function getMembers(
  client: SupabaseClient,
  coupleId: string,
): Promise<Member[]> {
  const { data, error } = await client
    .from("member")
    .select("*")
    .eq("couple_id", coupleId);
  return unwrap(data, error, "getMembers") as Member[];
}

/** Read the female partner's profile, or `null` when absent. */
export async function getHerProfile(
  client: SupabaseClient,
  coupleId: string,
): Promise<HerProfile | null> {
  const { data, error } = await client
    .from("her_profile")
    .select("*")
    .eq("couple_id", coupleId)
    .maybeSingle();
  if (error) throw new WorkspaceLoadError(`getHerProfile: ${error.message}`);
  return (data as HerProfile) ?? null;
}

/** Read the male partner's profile, or `null` when absent. */
export async function getHimProfile(
  client: SupabaseClient,
  coupleId: string,
): Promise<HimProfile | null> {
  const { data, error } = await client
    .from("him_profile")
    .select("*")
    .eq("couple_id", coupleId)
    .maybeSingle();
  if (error) throw new WorkspaceLoadError(`getHimProfile: ${error.message}`);
  return (data as HimProfile) ?? null;
}

/** Read all trying-window rows for a couple. */
export async function getTryingWindows(
  client: SupabaseClient,
  coupleId: string,
): Promise<TryingWindow[]> {
  const { data, error } = await client
    .from("trying_window")
    .select("*")
    .eq("couple_id", coupleId);
  return unwrap(data, error, "getTryingWindows") as TryingWindow[];
}

/** Read all tasks for a couple. */
export async function getTasks(
  client: SupabaseClient,
  coupleId: string,
): Promise<Task[]> {
  const { data, error } = await client
    .from("task")
    .select("*")
    .eq("couple_id", coupleId);
  return unwrap(data, error, "getTasks") as Task[];
}

/** Read all calendar events for a couple. */
export async function getCalendarEvents(
  client: SupabaseClient,
  coupleId: string,
): Promise<CalendarEvent[]> {
  const { data, error } = await client
    .from("calendar_event")
    .select("*")
    .eq("couple_id", coupleId);
  return unwrap(data, error, "getCalendarEvents") as CalendarEvent[];
}

/** Read all call records for a couple. */
export async function getCallRecords(
  client: SupabaseClient,
  coupleId: string,
): Promise<CallRecord[]> {
  const { data, error } = await client
    .from("call_record")
    .select("*")
    .eq("couple_id", coupleId);
  return unwrap(data, error, "getCallRecords") as CallRecord[];
}

/**
 * Read the complete workspace for a couple. Throws `WorkspaceLoadError` when the
 * couple or either profile is missing, so the UI can refuse to render a partial
 * workspace (Req 1.7) rather than show blanks.
 */
export async function getCoupleWorkspace(
  client: SupabaseClient,
  coupleId: string,
): Promise<CoupleWorkspace> {
  const [couple, members, herProfile, himProfile, tryingWindows, tasks, calendarEvents, callRecords] =
    await Promise.all([
      getCouple(client, coupleId),
      getMembers(client, coupleId),
      getHerProfile(client, coupleId),
      getHimProfile(client, coupleId),
      getTryingWindows(client, coupleId),
      getTasks(client, coupleId),
      getCalendarEvents(client, coupleId),
      getCallRecords(client, coupleId),
    ]);

  if (couple === null) {
    throw new WorkspaceLoadError(`couple "${coupleId}" not found`);
  }
  if (herProfile === null) {
    throw new WorkspaceLoadError(`her_profile for "${coupleId}" not found`);
  }
  if (himProfile === null) {
    throw new WorkspaceLoadError(`him_profile for "${coupleId}" not found`);
  }

  return {
    couple,
    members,
    herProfile,
    himProfile,
    tryingWindows,
    tasks,
    calendarEvents,
    callRecords,
  };
}

// ---------------------------------------------------------------------------
// Writes (upserts)
// ---------------------------------------------------------------------------

export async function upsertCouple(client: SupabaseClient, couple: Couple): Promise<void> {
  const { error } = await client.from("couple").upsert(couple, { onConflict: "id" });
  if (error) throw new WorkspaceLoadError(`upsertCouple: ${error.message}`);
}

export async function upsertMembers(client: SupabaseClient, members: Member[]): Promise<void> {
  const { error } = await client.from("member").upsert(members, { onConflict: "id" });
  if (error) throw new WorkspaceLoadError(`upsertMembers: ${error.message}`);
}

export async function upsertHerProfile(
  client: SupabaseClient,
  herProfile: HerProfile,
): Promise<void> {
  const { error } = await client
    .from("her_profile")
    .upsert(herProfile, { onConflict: "couple_id" });
  if (error) throw new WorkspaceLoadError(`upsertHerProfile: ${error.message}`);
}

export async function upsertHimProfile(
  client: SupabaseClient,
  himProfile: HimProfile,
): Promise<void> {
  const { error } = await client
    .from("him_profile")
    .upsert(himProfile, { onConflict: "couple_id" });
  if (error) throw new WorkspaceLoadError(`upsertHimProfile: ${error.message}`);
}

export async function upsertTryingWindows(
  client: SupabaseClient,
  windows: TryingWindow[],
): Promise<void> {
  if (windows.length === 0) return;
  const { error } = await client.from("trying_window").upsert(windows, { onConflict: "id" });
  if (error) throw new WorkspaceLoadError(`upsertTryingWindows: ${error.message}`);
}

export async function upsertTasks(client: SupabaseClient, tasks: Task[]): Promise<void> {
  if (tasks.length === 0) return;
  const { error } = await client.from("task").upsert(tasks, { onConflict: "id" });
  if (error) throw new WorkspaceLoadError(`upsertTasks: ${error.message}`);
}

export async function upsertCalendarEvents(
  client: SupabaseClient,
  events: CalendarEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const { error } = await client.from("calendar_event").upsert(events, { onConflict: "id" });
  if (error) throw new WorkspaceLoadError(`upsertCalendarEvents: ${error.message}`);
}

export async function upsertCallRecords(
  client: SupabaseClient,
  records: CallRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const { error } = await client.from("call_record").upsert(records, { onConflict: "id" });
  if (error) throw new WorkspaceLoadError(`upsertCallRecords: ${error.message}`);
}

/** Write an entire workspace. Order respects FKs: couple → records → tasks. */
export async function upsertCoupleWorkspace(
  client: SupabaseClient,
  workspace: CoupleWorkspace,
): Promise<void> {
  await upsertCouple(client, workspace.couple);
  await Promise.all([
    upsertMembers(client, workspace.members),
    upsertHerProfile(client, workspace.herProfile),
    upsertHimProfile(client, workspace.himProfile),
    upsertTryingWindows(client, workspace.tryingWindows),
    upsertCalendarEvents(client, workspace.calendarEvents),
    upsertCallRecords(client, workspace.callRecords),
  ]);
  // Tasks reference call_record via source_call_record_id, so write them last.
  await upsertTasks(client, workspace.tasks);
}
