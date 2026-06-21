import * as React from "react";
import { Check, Clock, Loader2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardHeader } from "./Card";
import { Chip } from "./MissingFlag";

/*
  ProgressJourney — the user-facing abstraction of the agent workflow.

  Couples don't need to see the seven-step Inngest graph (that's an internal
  orchestration detail). Instead this shows their journey as a row of plain-
  language status cards they can swipe through horizontally — "where are we,
  what's next" — with one phase highlighted as current. No technical step
  names, no failure internals; just calm progress.

  Built on the existing design system (Card, Chip, OKLCH tokens). The horizontal
  scroller snaps card-to-card and hides its scrollbar (the app shows no
  scrollbars), so it reads like a native, swipeable status strip.
*/

export type PhaseStatus = "done" | "active" | "upcoming";

export interface JourneyPhase {
  id: string;
  /** Plain-language title — what's happening, in human terms. */
  title: string;
  /** One calm line of detail. */
  note: string;
  status: PhaseStatus;
}

/**
 * The default journey for the seed couple, in human terms. Mirrors the
 * underlying graph (analyze → window → tests → calls → approval → booking →
 * check-in) without exposing any of its mechanics. The "active" phase is the
 * one currently needing attention (the booking approval).
 */
export function defaultJourney(): JourneyPhase[] {
  return [
    {
      id: "analyze",
      title: "Getting to know you",
      note: "Reviewed both of your details.",
      status: "done",
    },
    {
      id: "window",
      title: "Your fertile window",
      note: "Estimated your priority days.",
      status: "done",
    },
    {
      id: "tests",
      title: "Checking your tests",
      note: "Flagged what's still missing.",
      status: "done",
    },
    {
      id: "calls",
      title: "Making your calls",
      note: "Verified coverage and found a slot.",
      status: "done",
    },
    {
      id: "approval",
      title: "Your okay needed",
      note: "Approve the June 25 consult below.",
      status: "active",
    },
    {
      id: "booking",
      title: "Booking your consult",
      note: "We'll lock in June 25 once you approve.",
      status: "upcoming",
    },
    {
      id: "checkin",
      title: "Follow-up check-in",
      note: "We'll check back in ~10–12 weeks.",
      status: "upcoming",
    },
  ];
}

const STATUS_META: Record<
  PhaseStatus,
  { label: string; tone: React.ComponentProps<typeof Chip>["tone"]; icon: LucideIcon }
> = {
  done: { label: "Done", tone: "success", icon: Check },
  active: { label: "Now", tone: "info", icon: Loader2 },
  upcoming: { label: "Next", tone: "neutral", icon: Clock },
};

function PhaseCard({ phase, index }: { phase: JourneyPhase; index: number }) {
  const meta = STATUS_META[phase.status];
  const Icon = meta.icon;
  const active = phase.status === "active";
  return (
    <li
      data-testid={`journey-phase-${phase.id}`}
      data-status={phase.status}
      className={cn(
        "flex w-[15.5rem] shrink-0 snap-start flex-col gap-2 rounded-xl border p-4",
        active
          ? "border-primary/40 bg-primary/[0.04] shadow-card"
          : "border-border/70 bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full",
            phase.status === "done"
              ? "bg-success/15 text-success"
              : active
                ? "bg-info/12 text-info"
                : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4",
              active && "animate-spin motion-reduce:animate-none",
            )}
            strokeWidth={2.4}
            aria-hidden="true"
          />
        </span>
        <Chip tone={meta.tone}>{meta.label}</Chip>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{phase.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {phase.note}
        </p>
      </div>
      <span className="mt-auto text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/80">
        Step {index + 1}
      </span>
    </li>
  );
}

interface ProgressJourneyProps {
  phases?: JourneyPhase[];
  className?: string;
}

/**
 * The swipeable progress strip. Shows overall progress (done / total) and a
 * horizontally-scrollable row of phase cards with the current one highlighted.
 */
export function ProgressJourney({ phases, className }: ProgressJourneyProps) {
  const resolved = phases && phases.length > 0 ? phases : defaultJourney();
  const total = resolved.length;
  const doneCount = resolved.filter((p) => p.status === "done").length;
  const activeIndex = resolved.findIndex((p) => p.status === "active");
  // The step the couple is on (1-based): the active phase, else progress so far.
  const currentStep = activeIndex >= 0 ? activeIndex + 1 : doneCount;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <Card className={className} aria-label="Your progress">
      <CardHeader
        title="Your progress"
        description="Swipe to see what Mariposa has done and what's next."
        action={
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            Step {currentStep} of {total}
          </span>
        }
      />

      {/* Overall progress bar (done so far). */}
      <div
        role="progressbar"
        aria-label="Overall progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Swipeable phase cards. Negative margin + padding lets cards bleed to
          the card edge while keeping a comfortable first/last inset. */}
      <ul
        className="no-scrollbar -mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1"
        aria-label="Journey phases"
      >
        {resolved.map((phase, index) => (
          <PhaseCard key={phase.id} phase={phase} index={index} />
        ))}
      </ul>
    </Card>
  );
}
