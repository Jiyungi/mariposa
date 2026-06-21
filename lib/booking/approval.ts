/**
 * Booking approval event seam (Req 17.3, 17.4, Property 29).
 *
 * When the couple approves the found consult on the Booking_Approval_Card, the
 * system emits the `couple.booking.approved` event EXACTLY ONCE — and never
 * re-emits, no matter how many times Approve is tapped. The resumed Inngest run
 * must therefore finalize at most one booking and can never double-book
 * (Req 17.4).
 *
 * ── Ownership / decoupling seam ────────────────────────────────────────────
 * This module is owned by the booking-approval (UI) side. It deliberately does
 * NOT import `lib/inngest` (owned by Person B, Task 25, and not present on this
 * branch). Instead it exposes a tiny injectable emitter callback
 * (`BookingApprovedEmitter`) that defaults to a console/no-op. Person B can
 * later wire the real Inngest event by passing an emitter that resumes the
 * paused `waitForEvent` gate:
 *
 *     const guard = new BookingApprovalGuard(coupleId, (id) =>
 *       inngest.send({ name: BOOKING_APPROVED_EVENT, data: { coupleId: id } }),
 *     );
 *
 * Until then the default emitter just logs, so the card works standalone and the
 * once-only guarantee (Property 29) is fully testable without any orchestration
 * dependency. The guard's decision logic (`reduceApproval`) is a pure function
 * so the property test can drive it directly over arbitrary tap sequences, no
 * DOM required.
 *
 * This mirrors `lib/intake/completion.ts` exactly — same injectable-emitter +
 * pure-reducer + latching-guard shape — so both human-in-the-loop event seams
 * read the same way.
 */

/** The event name Person B's Inngest gate resumes on (Req 17.3, 19.1). */
export const BOOKING_APPROVED_EVENT = "couple.booking.approved";

/**
 * The injectable emitter seam. Receives the `coupleId` so the real
 * implementation (Person B's Inngest `send`) can carry it as event data to
 * resume the correct paused run. Returns void or a promise so the real
 * implementation can be async. Keep it free of any approval-state logic — the
 * guard owns the "exactly once" decision.
 */
export type BookingApprovedEmitter = (coupleId: string) => void | Promise<void>;

/**
 * Default emitter used until Person B wires Inngest. It does not throw and has
 * no orchestration dependency; it simply records that the event would fire.
 */
export const defaultBookingApprovedEmitter: BookingApprovedEmitter = (
  coupleId,
) => {
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.info(
      `[mariposa] ${BOOKING_APPROVED_EVENT} — couple ${coupleId} approved booking; no emitter wired yet`,
    );
  }
};

/**
 * The guard's state. `emitted` latches to `true` the first time Approve is
 * acted on and never resets, so the event can fire at most once (Property 29).
 */
export interface BookingApprovalState {
  readonly emitted: boolean;
}

/** A fresh state with the approval event not yet emitted. */
export function initialApprovalState(): BookingApprovalState {
  return { emitted: false };
}

/**
 * Pure reducer: apply one Approve action to the approval state. Returns the
 * next state and whether the event should be emitted as a result of THIS tap.
 *
 * The `emit` flag is `true` for exactly one action across any sequence of taps:
 * the first one. Once `emitted` latches true it never emits again, so repeated
 * taps (the anxious double-tap) never resume the run twice (Req 17.4).
 */
export function reduceApproval(state: BookingApprovalState): {
  state: BookingApprovalState;
  emit: boolean;
} {
  const emit = !state.emitted;
  return { state: { emitted: true }, emit };
}

/**
 * Fire the approval event through the provided emitter (defaults to the
 * console/no-op emitter). This is the single function Person B re-targets at
 * Inngest; callers should route emission through it rather than calling an
 * emitter directly, so the seam stays in one place.
 */
export function emitBookingApproved(
  coupleId: string,
  emit: BookingApprovedEmitter = defaultBookingApprovedEmitter,
): void | Promise<void> {
  return emit(coupleId);
}

/**
 * Stateful wrapper around `reduceApproval` for the UI. Tap `approve()` each
 * time the couple presses Approve; it fires the injected emitter exactly once
 * on the first tap and never again, even on repeated taps (Req 17.3, 17.4,
 * Property 29).
 */
export class BookingApprovalGuard {
  private state: BookingApprovalState = initialApprovalState();

  constructor(
    private readonly coupleId: string,
    private readonly emitter: BookingApprovedEmitter = defaultBookingApprovedEmitter,
  ) {}

  /**
   * Record an Approve tap. Returns `true` iff this tap caused the
   * one-and-only emission.
   */
  approve(): boolean {
    const next = reduceApproval(this.state);
    this.state = next.state;
    if (next.emit) {
      void emitBookingApproved(this.coupleId, this.emitter);
    }
    return next.emit;
  }

  /** Whether the approval event has already fired (latched). */
  get hasEmitted(): boolean {
    return this.state.emitted;
  }
}
