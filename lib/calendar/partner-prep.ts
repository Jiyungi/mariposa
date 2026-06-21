import { SPERM_DEVELOPMENT, SEMEN_COLLECTION } from "@/lib/reference/who";
import type { TryingWindowOutput } from "@/lib/core/trying-window";
import type { Task, TaskColumn } from "@/lib/db/types";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface PartnerPrepReminder {
  id: string;
  column: TaskColumn;
  title: string;
  date: string;
  description: string;
}

const HORIZON_LABEL = `approximately ${SPERM_DEVELOPMENT.trackingWeeksMin}–${SPERM_DEVELOPMENT.trackingWeeksMax} weeks`;

/**
 * Husband-side prep tied to her trying window. Her cycle drives the dates; his
 * tasks focus on sperm health habits and repeat-SA timing (semen-analysis-reference.md).
 */
export function deriveHisPrepReminders(
  window: TryingWindowOutput,
): PartnerPrepReminder[] {
  const abstinenceStart = addDays(window.minOvulation, -SEMEN_COLLECTION.abstinenceDaysMax);

  return [
    {
      id: "him-prep-lifestyle-block",
      column: "him",
      title: "His lifestyle prep block begins",
      date: window.fertileWindowStart,
      description:
        `Daniel's sperm health reflects habits from the last ${SPERM_DEVELOPMENT.developmentDays} days ` +
        `(${HORIZON_LABEL}). During her fertile window, keep sleep steady, avoid heat exposure, ` +
        "and limit alcohol — these support a repeat semen analysis before the consult.",
    },
    {
      id: "him-prep-abstinence-window",
      column: "him",
      title: "Abstinence window if repeating SA",
      date: abstinenceStart >= window.fertileWindowStart ? abstinenceStart : window.fertileWindowStart,
      description:
        `If a repeat semen analysis is booked during her priority days, follow ` +
        `${SEMEN_COLLECTION.abstinenceDaysMin}–${SEMEN_COLLECTION.abstinenceDaysMax} days of abstinence ` +
        "before collection (semen-analysis-reference.md).",
    },
    {
      id: "him-prep-priority-support",
      column: "him",
      title: "Support her priority days",
      date: window.minOvulation,
      description:
        "Her highest-priority days start today. His prep: confirm the repeat semen analysis is " +
        "scheduled at the in-network lab, bring prior results, and request a urology note for the consult.",
    },
  ];
}

/** His-column tasks tied to her trying window (persisted on Tasks tab). */
export function deriveHisPrepTasks(coupleId: string): Task[] {
  const prefix = `task_${coupleId}_his_prep_`;
  return [
    {
      id: `${prefix}lifestyle`,
      couple_id: coupleId,
      column: "him",
      title: "Keep lifestyle changes steady through her fertile window",
      completed: false,
      weight: 5,
      source_call_record_id: null,
    },
    {
      id: `${prefix}repeat_sa`,
      couple_id: coupleId,
      column: "him",
      title: "Book repeat semen analysis before priority days end",
      completed: false,
      weight: 5,
      source_call_record_id: null,
    },
    {
      id: `${prefix}urology_note`,
      couple_id: coupleId,
      column: "him",
      title: "Request urology note for the consult",
      completed: false,
      weight: 0,
      source_call_record_id: null,
    },
  ];
}
