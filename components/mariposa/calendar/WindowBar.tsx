import * as React from "react";

import { cn } from "@/lib/utils";
import type { TryingWindowOutput } from "@/lib/core/trying-window";
import { daysBetween, formatLong } from "./dates";

interface WindowBarProps {
  window: TryingWindowOutput;
  /** True when these dates are retained from a prior load after an engine error. */
  stale?: boolean;
}

/**
 * A horizontal timeline that maps the Trying-Window engine output onto a single
 * track: the full fertile window is the rail, the priority (min–max ovulation)
 * days are the saturated segment inside it. Positions are derived purely from
 * the engine dates, so what the bar shows always equals the engine output
 * (Req 10.3, Property 25).
 *
 * Exact ISO dates are exposed as data attributes for verification; the visible
 * labels are human-formatted.
 */
export function WindowBar({ window, stale }: WindowBarProps) {
  const span = Math.max(daysBetween(window.fertileWindowStart, window.fertileWindowEnd), 1);
  const priorityStart = daysBetween(window.fertileWindowStart, window.minOvulation);
  const priorityEnd = daysBetween(window.fertileWindowStart, window.maxOvulation);

  // Clamp into [0, 100] so a degenerate range never paints outside the rail.
  const clampPct = (n: number) => Math.min(100, Math.max(0, (n / span) * 100));
  const left = clampPct(priorityStart);
  const right = clampPct(priorityEnd);
  const width = Math.max(right - left, 2);

  return (
    <div
      data-testid="cal-window-bar"
      data-fertile-start={window.fertileWindowStart}
      data-fertile-end={window.fertileWindowEnd}
      data-priority-start={window.minOvulation}
      data-priority-end={window.maxOvulation}
      className={cn("select-none", stale && "opacity-60")}
    >
      {/* Rail: full fertile window. Inner segment: priority days. */}
      <div
        className="relative h-2.5 rounded-full bg-secondary"
        role="img"
        aria-label={`Fertile window ${formatLong(window.fertileWindowStart)} to ${formatLong(
          window.fertileWindowEnd,
        )}, priority days ${formatLong(window.minOvulation)} to ${formatLong(
          window.maxOvulation,
        )}`}
      >
        <span
          className="absolute inset-y-0 rounded-full bg-primary"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        {/* Priority endpoints as ticks for legibility at small widths. */}
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
          style={{ left: `${left}%` }}
        />
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
          style={{ left: `${right}%` }}
        />
      </div>

      {/* Range labels: fertile window bounds beneath the rail ends. */}
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {formatLong(window.fertileWindowStart)}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {formatLong(window.fertileWindowEnd)}
        </span>
      </div>

      {/* Priority days, stated explicitly so the highlighted segment is named. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2">
        <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <span className="text-sm text-secondary-foreground">
          <span className="font-semibold">Priority days</span>{" "}
          <span data-testid="cal-priority-label">
            {formatLong(window.minOvulation)} – {formatLong(window.maxOvulation)}
          </span>
        </span>
      </div>
    </div>
  );
}
