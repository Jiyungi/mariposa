"use client";

import * as React from "react";
import {
  CalendarCheck,
  Check,
  Clock,
  Loader2,
  MapPin,
  ShieldCheck,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Field, FieldGroup } from "@/components/mariposa/Card";
import { Chip } from "@/components/mariposa/MissingFlag";
import {
  BookingApprovalGuard,
  defaultBookingApprovedEmitter,
  type BookingApprovedEmitter,
} from "@/lib/booking/approval";

/*
  BookingApprovalCard — the human-in-the-loop pause made visible (Req 17.2,
  17.3, 17.5, 20.5). While the Inngest run is paused at the Booking_Approval_Gate
  (`waitForEvent`), this card tells the couple their agent already verified
  coverage and found the June 25 slot, and asks them to approve before anything
  is actually booked. On Approve it emits `couple.booking.approved` EXACTLY ONCE
  through an injectable emitter seam (default console/no-op; Person B wires it to
  Inngest `send` in Task 25), so the same run resumes and finalizes — never
  double-booking on a repeated tap (Req 17.4, Property 29).

  Tone: this is an anxious-persona surface. The agent did the legwork; the copy
  is calm and reassuring, the appointment reads "Pending — awaiting your okay"
  (not an alarm), and tapping Approve again after approving does nothing harmful.

  Design-system reuse: <Card>/<Field>/<FieldGroup>, <Button>, <Chip>, the OKLCH
  tokens, and lucide-react — no new primitives, no generic Tailwind fallback.
  A critique pass on this card is noted in the task report.
*/

/**
 * The slot the agent found, grounded in clinic-intake-data.md (the demo books
 * Thu, Jun 25, 2026, 2:00 PM, in person, at the fictional sample clinic).
 * Passed in so the card never invents clinical detail.
 */
export interface FoundSlot {
  /** ISO date, e.g. "2026-06-25". */
  date: string;
  /** Human-readable time, e.g. "2:00 PM". */
  time: string;
  /** "in person" | "virtual" — drives the icon/label. */
  mode: string;
  /** Clinic name, e.g. "Bay Area Fertility & Reproductive Health". */
  clinic: string;
}

/** The seed-couple slot from clinic-intake-data.md, used as a standalone default. */
export const DEFAULT_FOUND_SLOT: FoundSlot = {
  date: "2026-06-25",
  time: "2:00 PM",
  mode: "in person",
  clinic: "Bay Area Fertility & Reproductive Health",
};

interface BookingApprovalCardProps {
  /** The couple whose paused run this approval resumes. */
  coupleId: string;
  /**
   * The injectable approval emitter. Defaults to the seam's console/no-op
   * emitter; Person B passes one that calls `inngest.send`.
   */
  onApprove?: BookingApprovedEmitter;
  /**
   * True when the gate's wait window expired without an approval. Renders the
   * "needs approval" state (Req 17.5) — the appointment stays pending and is
   * not booked automatically; the couple can still approve to resume.
   */
  timedOut?: boolean;
  /** The slot the agent found (defaults to the grounded Jun 25 seed slot). */
  slot?: FoundSlot;
  className?: string;
}

/** Format an ISO date as "Thu, Jun 25, 2026" without pulling in a date lib. */
function formatSlotDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The booking-approval card. Three states off the same content:
 *   • awaiting  — paused at the gate, asking for approval (appointment pending)
 *   • timedOut  — wait window expired, "needs approval" (still pending)
 *   • approved  — the couple approved; booking in progress (event emitted once)
 */
export function BookingApprovalCard({
  coupleId,
  onApprove = defaultBookingApprovedEmitter,
  timedOut = false,
  slot = DEFAULT_FOUND_SLOT,
  className,
}: BookingApprovalCardProps) {
  const [approved, setApproved] = React.useState(false);

  // One guard per (coupleId, emitter) so the "exactly once" decision survives
  // re-renders and repeated taps. Rebuilt only if the seam target changes.
  const guardRef = React.useRef<BookingApprovalGuard | null>(null);
  React.useEffect(() => {
    guardRef.current = new BookingApprovalGuard(coupleId, onApprove);
    // A fresh seam means a fresh approval lifecycle.
    setApproved(false);
  }, [coupleId, onApprove]);

  const handleApprove = React.useCallback(() => {
    // Lazily build the guard for the very first synchronous tap (before the
    // effect runs in some environments), then route every tap through it.
    if (!guardRef.current) {
      guardRef.current = new BookingApprovalGuard(coupleId, onApprove);
    }
    // Emits exactly once; later taps return false and never re-emit.
    guardRef.current.approve();
    setApproved(true);
  }, [coupleId, onApprove]);

  const ModeIcon = slot.mode.toLowerCase().includes("virtual")
    ? Video
    : MapPin;

  return (
    <Card className={cn("mariposa-rise", className)} aria-label="Approve your consult">
      <CardHeader
        title="Approve your consult"
        action={
          approved ? (
            <Chip tone="success">Approved</Chip>
          ) : timedOut ? (
            <Chip tone="warning">Needs approval</Chip>
          ) : (
            <Chip tone="info">Paused for you</Chip>
          )
        }
      />

      <div className="mt-4 rounded-xl bg-secondary/60 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck
            className="size-4 text-success"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          Coverage verified
        </div>
        <FieldGroup className="mt-3">
          <Field label="Date">{formatSlotDate(slot.date)}</Field>
          <Field label="Time">{slot.time}</Field>
          <Field label="Mode">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <ModeIcon
                className="size-3.5 text-muted-foreground"
                strokeWidth={2.2}
                aria-hidden="true"
              />
              {slot.mode}
            </span>
          </Field>
          <Field label="Clinic">{slot.clinic}</Field>
          <Field label="Appointment">
            {approved ? (
              <Chip tone="info">
                <Loader2
                  className="size-3 animate-spin motion-reduce:animate-none"
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
                Booking in progress
              </Chip>
            ) : (
              <Chip tone="neutral">Pending — awaiting your okay</Chip>
            )}
          </Field>
        </FieldGroup>
      </div>

      {/* Timed-out notice: the window passed, but we never book without consent. */}
      {timedOut && !approved ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-xs leading-relaxed text-warning-foreground"
        >
          <Clock
            className="mt-0.5 size-3.5 shrink-0 text-warning"
            strokeWidth={2.4}
            aria-hidden="true"
          />
          <span>
            The approval window passed, so we held off. Your slot is still
            pending — approve whenever you&apos;re ready and we&apos;ll pick right
            back up. Nothing was booked without you.
          </span>
        </p>
      ) : null}

      {/* Action / confirmation. The button stays mounted and routes every tap
          through the guard, so a repeated tap can never emit twice. */}
      <div className="mt-5">
        {approved ? (
          <>
            <Button
              type="button"
              onClick={handleApprove}
              variant="secondary"
              size="md"
              className="w-full"
            >
              <Check aria-hidden="true" />
              Approved — booking in progress
            </Button>
            <p
              role="status"
              className="mt-2.5 text-center text-xs leading-relaxed text-muted-foreground"
            >
              Thanks — Mariposa is finalizing your June&nbsp;25 consult now. You
              don&apos;t need to do anything else.
            </p>
          </>
        ) : (
          <Button
            type="button"
            onClick={handleApprove}
            variant="primary"
            size="md"
            className="w-full"
          >
            <CalendarCheck aria-hidden="true" />
            Approve &amp; book this slot
          </Button>
        )}
      </div>
    </Card>
  );
}
