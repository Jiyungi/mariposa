import { getTasks } from "@/lib/db";
import { buildSeedCouple, SEED_COUPLE_ID } from "@/lib/db/seed";
import type { TryingWindowInput } from "@/lib/core/trying-window";
import { persistHisPrepTasks } from "@/lib/calendar/persist-his-prep-tasks";
import type { CalendarEvent } from "@/lib/db/types";
import { CalendarView } from "@/components/mariposa/CalendarView";

/*
  Shared Calendar screen (Task 16 / Req 10). Shell chrome — the 390px frame,
  the sticky "Calendar" header, bottom tabs, and the single disclaimer — is
  provided by the (tabs) layout, so this screen renders content only.

  The trying-window and priority-day dates are NOT hardcoded here: CalendarView
  derives them by calling the Trying-Window engine with the couple's cycle
  inputs, keeping the engine the single source of truth (Req 10.3, 10.4). The
  consult is grounded verbatim in the booking outcome from
  `/reference-data/clinic-intake-data.md` (Req 12). His prep tasks are persisted
  so the Tasks tab and calendar share the same His-column items.
*/

const seed = buildSeedCouple();
const { couple, herProfile } = seed;

const cycle: TryingWindowInput = {
  lastPeriodStart: herProfile.last_period_start ?? "",
  cycleLengthMin: herProfile.cycle_length_min ?? 0,
  cycleLengthMax: herProfile.cycle_length_max ?? 0,
  ovulationConfirmed: herProfile.mid_luteal_progesterone != null,
};

const consult: CalendarEvent = {
  id: "evt-consult-001",
  couple_id: couple.id,
  type: "consult",
  title: "Fertility consult — Bay Area Fertility & Reproductive Health",
  date: "2026-06-25",
  time: "2:00 PM",
  description:
    "First consult (in person) at Bay Area Fertility & Reproductive Health, San Francisco. " +
    "Bring: photo ID, insurance card, cycle history, prior meds, semen analysis, and any labs.",
};

export default async function CalendarPage() {
  await persistHisPrepTasks(SEED_COUPLE_ID);
  const tasks = await getTasks(SEED_COUPLE_ID);

  return (
    <CalendarView cycle={cycle} coupleId={couple.id} events={[consult]} tasks={tasks} />
  );
}
