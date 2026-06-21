import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TryingWindowOutput } from "@/lib/core/trying-window";
import {
  buildMonthGrid,
  formatMonthTitle,
  isBetweenInclusive,
  monthKey,
  shiftMonthKey,
} from "./dates";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface MonthGridDayEvent {
  id: string;
  title: string;
  tone: "consult" | "reminder" | "him-prep" | "her-window";
}

export interface MonthGridProps {
  window: TryingWindowOutput;
  /** Default month derived from the fertile window when unset. */
  initialMonth?: string;
  eventsByDate: Map<string, MonthGridDayEvent[]>;
  selectedDate: string | null;
  onSelectDate: (iso: string | null) => void;
}

function defaultMonth(window: TryingWindowOutput): string {
  return monthKey(window.fertileWindowStart);
}

export function MonthGrid({
  window,
  initialMonth,
  eventsByDate,
  selectedDate,
  onSelectDate,
}: MonthGridProps) {
  const [visibleMonth, setVisibleMonth] = React.useState(
    initialMonth ?? defaultMonth(window),
  );

  const cells = buildMonthGrid(visibleMonth);

  return (
    <div data-testid="cal-month-grid">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setVisibleMonth((m) => shiftMonthKey(m, -1))}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <h3 className="text-sm font-semibold text-foreground">{formatMonthTitle(visibleMonth)}</h3>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setVisibleMonth((m) => shiftMonthKey(m, 1))}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso, index) => {
          if (!iso) {
            return <span key={`pad-${index}`} className="aspect-square" aria-hidden="true" />;
          }

          const inFertile = isBetweenInclusive(
            iso,
            window.fertileWindowStart,
            window.fertileWindowEnd,
          );
          const inPriority = isBetweenInclusive(iso, window.minOvulation, window.maxOvulation);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isSelected = selectedDate === iso;

          return (
            <button
              key={iso}
              type="button"
              data-date={iso}
              aria-pressed={isSelected}
              onClick={() => onSelectDate(isSelected ? null : iso)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                inPriority
                  ? "bg-primary font-semibold text-primary-foreground"
                  : inFertile
                    ? "bg-primary/15 font-medium text-foreground"
                    : "text-foreground hover:bg-accent/70",
                isSelected && !inPriority && "ring-2 ring-inset ring-primary/50",
                isSelected && inPriority && "ring-2 ring-inset ring-card",
              )}
            >
              <span>{Number(iso.slice(8, 10))}</span>
              {dayEvents.length > 0 ? (
                <span className="absolute bottom-1 flex gap-0.5" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      className={cn(
                        "size-1 rounded-full",
                        event.tone === "consult"
                          ? "bg-info"
                          : event.tone === "him-prep"
                            ? inPriority
                              ? "bg-card"
                              : "bg-warning"
                            : event.tone === "her-window"
                              ? "bg-primary"
                              : "bg-muted-foreground",
                      )}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary/15 ring-1 ring-inset ring-primary/20" />
          Fertile window
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary" />
          Priority days
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-warning" />
          His prep
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-info" />
          Consult
        </li>
      </ul>
    </div>
  );
}
