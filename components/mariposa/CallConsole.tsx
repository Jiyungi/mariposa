import * as React from "react";
import { Bot, PhoneCall, Radio, ShieldCheck, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardHeader } from "./Card";
import { Chip } from "./MissingFlag";
import {
  isResolved,
  resultFieldsFor,
  type ResultField,
} from "./call/fields";
import {
  normalizeSpeaker,
  type CallResultLike,
  type CallType,
  type Turn,
  type TurnRole,
} from "./call/types";

/*
  CallConsole — the live face of a Voice_Agent call (Req 6.10, 20.1–20.3).

  Three things happen on this surface while a call runs:
    1. A chronological transcript of agent/human turns, appended in order as
       each turn occurs (Req 20.1). Agent and human are visually distinct.
    2. A LIVE vs FALLBACK indicator bound to `usedFallback` — LIVE while the
       result comes from the real Live_Voice_Session, FALLBACK when the
       deterministic Mock_Fallback produced it (Req 20.2). Deliberately calm:
       the fallback is a working safety net, not an error.
    3. The structured result, filling in field by field as the agent resolves
       each objective; unresolved fields show a quiet "pending", never a
       fabricated value (Req 20.3).

  CONTROLLED COMPONENT. The live streaming + run state is Person B's workflow
  (Tasks 24–25); this component only renders the current snapshot it is given.
  See ./call/types.ts for the documented interface seam with his CallOutput.

  Built via the Impeccable skill, reusing the existing OKLCH token system and
  the Card / Chip primitives. A critique pass is noted in the task report.
*/

interface CallConsoleProps {
  /** Which call this is — sets the heading and the result field set. */
  callType: CallType;
  /** Chronological transcript; rendered in array order (Req 20.1). */
  transcript: Turn[];
  /** The progressively-resolving structured result (Req 20.3). */
  result: CallResultLike;
  /** Whether the Mock_Fallback produced the result (Req 20.2). */
  usedFallback: boolean;
  className?: string;
}

const CALL_META: Record<CallType, { title: string; description: string }> = {
  insurance: {
    title: "Insurance verification",
    description: "Confirming fertility benefits with the plan.",
  },
  clinic: {
    title: "Clinic booking",
    description: "Arranging the first consult and intake.",
  },
};

const ROLE_META: Record<
  TurnRole,
  { name: string; icon: typeof Bot; align: string; bubble: string; badge: string }
> = {
  agent: {
    name: "Mariposa",
    icon: Bot,
    align: "items-start",
    bubble: "bg-secondary text-secondary-foreground rounded-bl-sm",
    badge: "bg-primary/12 text-primary",
  },
  human: {
    name: "Human",
    icon: User,
    align: "items-end",
    bubble: "bg-card text-card-foreground border border-border/70 rounded-br-sm",
    badge: "bg-info/12 text-info",
  },
};

/**
 * The LIVE / FALLBACK source indicator (Req 20.2). LIVE reads as quietly
 * on-air (a soft pulsing teal dot); FALLBACK reads as a calm safety net (a
 * shield), never as an alarm.
 */
function SourceIndicator({ usedFallback }: { usedFallback: boolean }) {
  if (usedFallback) {
    return (
      <span
        data-testid="call-source-indicator"
        data-source="fallback"
        role="status"
        aria-label="Result source: Fallback"
        className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"
      >
        <ShieldCheck className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
        FALLBACK
      </span>
    );
  }
  return (
    <span
      data-testid="call-source-indicator"
      data-source="live"
      role="status"
      aria-label="Result source: Live"
      className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success-foreground"
    >
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/70 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      LIVE
    </span>
  );
}

/** One transcript turn as a chat-style bubble, agent vs human distinguished. */
function TranscriptTurn({
  turn,
  index,
}: {
  turn: Turn;
  index: number;
}) {
  const role = normalizeSpeaker(turn.speaker);
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <li
      data-testid="call-turn"
      data-role={role}
      data-turn-index={index}
      className={cn("mariposa-rise flex flex-col gap-1", meta.align)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide",
          meta.badge,
        )}
      >
        <Icon className="size-3" strokeWidth={2.4} aria-hidden="true" />
        {meta.name}
      </span>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
          meta.bubble,
        )}
      >
        {turn.text}
      </p>
    </li>
  );
}

/** One result row: a resolved value, or a quiet pending affordance. */
function ResultRow({
  field,
  result,
}: {
  field: ResultField;
  result: CallResultLike;
}) {
  const raw = field.get(result);
  const resolved = isResolved(raw);
  return (
    <div
      data-testid="result-field"
      data-field={field.key}
      data-resolved={resolved ? "true" : "false"}
      className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
    >
      <dt className="text-sm text-muted-foreground">{field.label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">
        {resolved ? (
          <span data-field-value>{field.format(raw)}</span>
        ) : (
          <span
            data-field-pending
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <span
              className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50 motion-reduce:animate-none"
              aria-hidden="true"
            />
            Pending
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * The live call console. Renders the transcript, the LIVE/FALLBACK indicator,
 * and the progressively-resolving structured result for one call.
 */
export function CallConsole({
  callType,
  transcript,
  result,
  usedFallback,
  className,
}: CallConsoleProps) {
  const meta = CALL_META[callType];
  const fields = resultFieldsFor(callType);
  const resolvedCount = fields.filter((f) => isResolved(f.get(result))).length;

  return (
    <Card className={cn("space-y-4", className)} aria-labelledby="call-console-heading">
      <CardHeader
        title={meta.title}
        description={meta.description}
        action={<SourceIndicator usedFallback={usedFallback} />}
      />

      {/* Live transcript (Req 20.1). aria-live so appended turns are announced. */}
      <section aria-label="Live transcript">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <PhoneCall className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
          Live transcript
        </div>
        {transcript.length === 0 ? (
          <p className="rounded-xl bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
            Waiting for the call to begin&hellip;
          </p>
        ) : (
          <ol
            data-testid="call-transcript"
            aria-live="polite"
            className="no-scrollbar flex max-h-72 flex-col gap-3 overflow-y-auto pr-1"
          >
            {transcript.map((turn, index) => (
              <TranscriptTurn key={index} turn={turn} index={index} />
            ))}
          </ol>
        )}
      </section>

      {/* Progressive structured result (Req 20.3). */}
      <section aria-label="Extracted result">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Radio className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
            Extracted result
          </div>
          <Chip tone={resolvedCount === fields.length ? "success" : "neutral"}>
            {resolvedCount}/{fields.length} resolved
          </Chip>
        </div>
        <dl className="divide-y divide-border/60">
          {fields.map((field) => (
            <ResultRow key={field.key} field={field} result={result} />
          ))}
        </dl>
      </section>
    </Card>
  );
}
