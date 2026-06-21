"use client";

import * as React from "react";
import {
  Bell,
  CalendarOff,
  CircleAlert,
  Clock,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  computeTryingWindow,
  TryingWindowInputError,
  type TryingWindowInput,
  type TryingWindowOutput,
} from "@/lib/core/trying-window";
import type { CalendarEvent, Task, TaskColumn } from "@/lib/db/types";
import { Card, CardHeader } from "./Card";
import { MonthGrid, type MonthGridDayEvent } from "./calendar/MonthGrid";
import { WindowBar } from "./calendar/WindowBar";
import { addDays, compareIso, dayBadge, formatWeekday, monthBadge } from "./calendar/dates";
import { usePerspective } from "./PerspectiveProvider";
import {
  deriveHisPrepReminders,
} from "@/lib/calendar/partner-prep";

export interface CalendarViewProps {
  /**
   * The female partner's cycle inputs. The calendar derives the trying-window
   * and priority-day dates by calling the engine with these — the engine is the
   * single source of truth (Req 10.3). New inputs produce new displayed dates
   * (Req 10.4).
   */
  cycle: TryingWindowInput;
  /** Couple id for derived partner-prep tasks. */
  coupleId?: string;
  /** Externally sourced events (the booked consult, etc.). */
  events?: CalendarEvent[];
  /** Delegation-board tasks surfaced on the calendar (Req 10.1). */
  tasks?: Task[];
}

/** A dated item placed on the calendar timeline. */
interface TimelineItem {
  id: string;
  kind: "consult" | "reminder";
  title: string;
  date: string;
  time: string | null;
  description: string | null;
  column?: TaskColumn;
}

const CONFIDENCE_STYLES: Record<TryingWindowOutput["confidence"], string> = {
  Low: "bg-warning/15 text-warning-foreground ring-1 ring-inset ring-warning/30",
  Moderate: "bg-info/12 text-info ring-1 ring-inset ring-info/25",
  High: "bg-success/15 text-success-foreground ring-1 ring-inset ring-success/30",
};

const KIND_ICON: Record<TimelineItem["kind"], LucideIcon> = {
  consult: Stethoscope,
  reminder: Bell,
};

const TASK_COLUMN_LABEL: Record<TaskColumn, string> = {
  her: "Her",
  him: "His",
  together: "Together",
};

const TASK_COLUMNS: readonly TaskColumn[] = ["her", "him", "together"] as const;

/**
 * The Shared Calendar (Req 10). It derives the trying window and priority days
 * from the engine, lays the window, priority days, engine-derived reminders,
 * and the booked consult on one timeline, and shows full detail for any event
 * the user selects. If the engine cannot produce output, it surfaces a
 * non-destructive error and keeps showing the last good window plus all
 * previously loaded calendar data (Req 10.5).
 */
export function CalendarView({
  cycle,
  coupleId = "couple_001",
  events = [],
  tasks = [],
}: CalendarViewProps) {
  const { perspective } = usePerspective();
  // Retain the last successfully computed window so an engine error never wipes
  // the dates already on screen (Req 10.5).
  const lastGoodWindow = React.useRef<TryingWindowOutput | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  let windowError = false;
  let windowOutput: TryingWindowOutput | null;
  try {
    windowOutput = computeTryingWindow(cycle);
    lastGoodWindow.current = windowOutput;
  } catch (err) {
    if (!(err instanceof TryingWindowInputError)) throw err;
    windowError = true;
    windowOutput = lastGoodWindow.current; // retained from a prior good load
  }

  // Engine-derived reminders track the window exactly, so they can never drift
  // from the single source of truth.
  const reminders: TimelineItem[] = React.useMemo(
    () =>
      windowOutput
        ? [
            {
              id: "reminder-fertile-open",
              kind: "reminder",
              title: "Fertile window opens",
              date: windowOutput.fertileWindowStart,
              time: null,
              description:
                "Your estimated fertile window begins today, based on your cycle range.",
            },
            {
              id: "reminder-priority",
              kind: "reminder",
              title: "Priority days begin",
              date: windowOutput.minOvulation,
              time: null,
              description:
                "The highest-priority days in your window start today. Confidence is " +
                `${windowOutput.confidence.toLowerCase()} — see why on the trying-window card.`,
            },
          ]
        : [],
    [windowOutput],
  );

  const hisPrepReminders: TimelineItem[] = React.useMemo(
    () =>
      windowOutput
        ? deriveHisPrepReminders(windowOutput).map((item) => ({
            id: item.id,
            kind: "reminder" as const,
            title: item.title,
            date: item.date,
            time: null,
            description: item.description,
            column: item.column,
          }))
        : [],
    [windowOutput],
  );

  // Externally sourced events (e.g. the booked consult), plus a derived
  // prep-reminder the day before each consult.
  const sourced: TimelineItem[] = React.useMemo(() => {
    const items: TimelineItem[] = [];
    for (const e of events) {
      if (!e.date) continue;
      const kind: TimelineItem["kind"] = e.type === "consult" ? "consult" : "reminder";
      items.push({
        id: e.id,
        kind,
        title: e.title,
        date: e.date,
        time: e.time,
        description: e.description,
      });
      if (kind === "consult") {
        items.push({
          id: `${e.id}-prep`,
          kind: "reminder",
          title: "Prep for your consult",
          date: addDays(e.date, -1),
          time: null,
          description:
            "Your consult is tomorrow. Gather your documents and the bring-list so you walk in ready.",
        });
      }
    }
    return items;
  }, [events]);

  const timeline = [...reminders, ...hisPrepReminders, ...sourced].sort(
    (a, b) => compareIso(a.date, b.date) || a.title.localeCompare(b.title),
  );

  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, MonthGridDayEvent[]>();
    const push = (date: string, event: MonthGridDayEvent) => {
      const list = map.get(date) ?? [];
      if (!list.some((entry) => entry.id === event.id)) list.push(event);
      map.set(date, list);
    };

    if (windowOutput) {
      for (const item of reminders) {
        push(item.date, { id: item.id, title: item.title, tone: "her-window" });
      }
      for (const item of hisPrepReminders) {
        push(item.date, { id: item.id, title: item.title, tone: "him-prep" });
      }
    }

    for (const item of sourced) {
      push(item.date, {
        id: item.id,
        title: item.title,
        tone: item.kind === "consult" ? "consult" : "reminder",
      });
    }

    return map;
  }, [windowOutput, reminders, hisPrepReminders, sourced]);

  const selected = timeline.find((item) => item.id === selectedId) ?? null;
  const selectedDayItems = selectedDate
    ? timeline.filter((item) => item.date === selectedDate)
    : [];
  const groupedTasks = TASK_COLUMNS.map((col) => ({
    column: col,
    items: tasks.filter((t) => t.column === col),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {windowError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <p>
            We can&rsquo;t load your trying window or priority days right now.
            {windowOutput
              ? " Showing your last saved dates until they refresh."
              : " Your other calendar items are still below."}
          </p>
        </div>
      ) : null}

      {/* Trying window + priority days — derived from the engine (Req 10.1, 10.3). */}
      {windowOutput ? (
        <Card>
          <CardHeader
            title="Your trying window"
            description="Estimated from your cycle range"
            action={
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                  CONFIDENCE_STYLES[windowOutput.confidence],
                )}
              >
                {windowOutput.confidence} confidence
              </span>
            }
          />
          <div className="mt-4">
            <WindowBar window={windowOutput} stale={windowError} />
          </div>
          {windowOutput.reasons.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {windowOutput.reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {windowOutput ? (
        <Card>
          <CardHeader
            title="Month view"
            description="Fertile window, his prep, consult, and reminders on one calendar"
          />
          <div className="mt-4">
            <MonthGrid
              window={windowOutput}
              eventsByDate={eventsByDate}
              selectedDate={selectedDate}
              onSelectDate={(iso) => {
                setSelectedDate(iso);
                setSelectedId(null);
              }}
            />
          </div>
          {selectedDate && selectedDayItems.length > 0 ? (
            <div className="mt-4 rounded-xl bg-secondary/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatWeekday(selectedDate)}
              </p>
              <ul className="mt-2 space-y-2">
                {selectedDayItems.map((item) => (
                  <li key={item.id}>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {windowOutput ? (
        <Card>
          <CardHeader
            title={perspective === "him" ? "Your prep this cycle" : "His prep this cycle"}
            description={
              perspective === "him"
                ? "Her fertile window sets the dates — your tasks focus on sperm health and repeat testing"
                : "Daniel's tasks are timed to her fertile window and priority days"
            }
          />
          <ul className="mt-4 space-y-2">
            {hisPrepReminders.map((item) => (
              <li key={item.id} className="rounded-lg bg-secondary/50 px-3.5 py-3">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatWeekday(item.date)}</p>
                {item.description ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-secondary-foreground">
                    {item.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Timeline: reminders + the booked consult (Req 10.1). Selecting shows
          full detail inline (Req 10.2). */}
      <Card flush>
        <div className="px-5 pb-1 pt-5">
          <CardHeader title="Upcoming" description="All reminders, his prep, and your consult" />
        </div>
        {timeline.length > 0 ? (
          <ul className="px-2 pb-2">
            {timeline.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const isSelected = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-expanded={isSelected}
                    onClick={() => setSelectedId(isSelected ? null : item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-out",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                      isSelected ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <span
                      className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-secondary py-1 leading-none"
                      aria-hidden="true"
                    >
                      <span className="text-[0.625rem] font-semibold tracking-wide text-primary">
                        {monthBadge(item.date)}
                      </span>
                      <span className="mt-0.5 text-base font-semibold text-foreground">
                        {dayBadge(item.date)}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {item.column ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide">
                            {TASK_COLUMN_LABEL[item.column]}
                          </span>
                        ) : null}
                        <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        {formatWeekday(item.date)}
                        {item.time ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <Clock className="size-3.5" strokeWidth={2} aria-hidden="true" />
                            {item.time}
                          </>
                        ) : null}
                      </span>
                    </span>
                  </button>

                  {isSelected && item.description ? (
                    <div
                      data-testid="cal-event-detail"
                      className="mariposa-rise mx-3 mb-2 rounded-lg bg-secondary/50 px-3.5 py-3"
                    >
                      <p className="text-sm leading-relaxed text-secondary-foreground">
                        {item.description}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
              <CalendarOff className="size-5" strokeWidth={1.9} aria-hidden="true" />
            </span>
            <p className="mt-3 max-w-[28ch] text-sm text-muted-foreground">
              No reminders or appointments yet. They&rsquo;ll appear here as your prep moves
              forward.
            </p>
          </div>
        )}
      </Card>

      {/* Delegation tasks surfaced on the calendar (Req 10.1). */}
      {groupedTasks.length > 0 ? (
        <Card>
          <CardHeader title="Prep tasks" description="Shared across Her, His, and Together" />
          <div className="mt-4 space-y-4">
            {groupedTasks.map((group) => (
              <div key={group.column}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {TASK_COLUMN_LABEL[group.column]}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {group.items.map((task) => (
                    <li key={task.id} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          task.completed ? "bg-success" : "bg-primary",
                        )}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          "text-foreground",
                          task.completed && "text-muted-foreground line-through",
                        )}
                      >
                        {task.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
