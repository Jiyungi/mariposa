import * as React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { fc, propertyConfig } from "../property";
import {
  reduceApproval,
  initialApprovalState,
  BookingApprovalGuard,
  type BookingApprovalState,
} from "@/lib/booking/approval";
import { BookingApprovalCard } from "@/components/mariposa/BookingApprovalCard";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Feature: mariposa, Property 29 (UI portion): tapping Approve emits
// `couple.booking.approved` exactly once and never re-emits on repeated taps,
// so the resumed run does not double-book.
//
// **Validates: Requirements 17.3, 17.4**
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 29: Approve emits couple.booking.approved exactly once", () => {
  // **Validates: Requirements 17.3, 17.4**

  it("the pure reducer emits on the first tap only, never on any later tap", () => {
    // Arbitrary tap sequence: a non-empty run of Approve taps of any length.
    const tapCountArb = fc.integer({ min: 1, max: 50 });

    fc.assert(
      fc.property(tapCountArb, (taps) => {
        let state: BookingApprovalState = initialApprovalState();
        const emitTaps: number[] = [];

        for (let i = 0; i < taps; i++) {
          const result = reduceApproval(state);
          state = result.state;
          if (result.emit) emitTaps.push(i);
        }

        // Emits exactly once, and only on the very first tap.
        expect(emitTaps).toEqual([0]);
        // State has latched and never resets.
        expect(state.emitted).toBe(true);
      }),
      propertyConfig(),
    );
  });

  it("the guard invokes its emitter exactly once across any sequence of taps (>=1)", () => {
    const tapCountArb = fc.integer({ min: 1, max: 50 });

    fc.assert(
      fc.property(
        tapCountArb,
        fc.string({ minLength: 1, maxLength: 12 }),
        (taps, coupleId) => {
          const emit = vi.fn();
          const guard = new BookingApprovalGuard(coupleId, emit);

          let trueReturns = 0;
          for (let i = 0; i < taps; i++) {
            if (guard.approve()) trueReturns += 1;
          }

          // The emitter fired exactly once, with the right coupleId.
          expect(emit).toHaveBeenCalledTimes(1);
          expect(emit).toHaveBeenCalledWith(coupleId);
          // approve() reported the single emission exactly once.
          expect(trueReturns).toBe(1);
          expect(guard.hasEmitted).toBe(true);
        },
      ),
      propertyConfig(),
    );
  });

  it("zero taps never emit (the run stays paused until the couple approves)", () => {
    const emit = vi.fn();
    const guard = new BookingApprovalGuard("couple_001", emit);
    expect(emit).not.toHaveBeenCalled();
    expect(guard.hasEmitted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Render test: tapping Approve twice on the card calls the injected emitter
// exactly once (the resumed run is never double-booked).
// ---------------------------------------------------------------------------

describe("BookingApprovalCard — single-emit on repeated taps (Task 23.1, Req 17.3, 17.4)", () => {
  it("emits couple.booking.approved exactly once when Approve is tapped twice", () => {
    const onApprove = vi.fn();
    render(<BookingApprovalCard coupleId="couple_001" onApprove={onApprove} />);

    const button = screen.getByRole("button", { name: /approve & book/i });
    fireEvent.click(button);
    // After approval the button stays mounted (label morphs) and routes the
    // tap back through the guard, so a second tap can never re-emit.
    fireEvent.click(button);

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith("couple_001");
  });

  it("shows the appointment as pending until approval, then booking-in-progress", () => {
    render(<BookingApprovalCard coupleId="couple_001" />);

    // Before approval: appointment pending, awaiting the couple's okay.
    expect(screen.getByText(/awaiting your okay/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /approve & book/i }));

    // After approval: a calm booking-in-progress confirmation. The appointment
    // chip and the morphed button both reflect the new state.
    expect(screen.getAllByText(/booking in progress/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /approved/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/finalizing your june/i)).toBeInTheDocument();
  });

  it("grounds the slot detail in the Jun 25 clinic-intake-data slot", () => {
    render(<BookingApprovalCard coupleId="couple_001" />);
    expect(screen.getByText(/Jun 25, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Coverage verified/i)).toBeInTheDocument();
  });

  it("renders a 'needs approval' state when the gate times out (Req 17.5)", () => {
    render(<BookingApprovalCard coupleId="couple_001" timedOut />);

    expect(screen.getByText(/needs approval/i)).toBeInTheDocument();
    expect(screen.getByText(/approval window passed/i)).toBeInTheDocument();
    // Even timed out, the appointment is pending — never auto-booked.
    expect(screen.getByText(/awaiting your okay/i)).toBeInTheDocument();
  });

  it("can still approve from the timed-out state and emits exactly once", () => {
    const onApprove = vi.fn();
    render(
      <BookingApprovalCard coupleId="couple_001" onApprove={onApprove} timedOut />,
    );

    const button = screen.getByRole("button", { name: /approve & book/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
