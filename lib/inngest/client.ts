// ===========================================================================
// Inngest client (lib/inngest/client.ts) — Req 7, 15.3
//
// The single Inngest client for the Mariposa app. The seven-step workflow function
// (./functions) and the /api/inngest serve endpoint both import this instance.
//
// NOTE: constructing the client does NOT require a running Inngest dev server or
// any network access — the function logic is a thin wrapper over the plain,
// fully-testable pipeline in ./workflow (runMariposaWorkflow).
// ===========================================================================

import { Inngest } from "inngest";

import type { CallType, InsuranceResult, ClinicResult } from "@/lib/types";

export const inngest = new Inngest({ id: "mariposa" });

/** The single event that triggers the reactive graph (Req 2.6, 7.1, 19.1). */
export const INTAKE_COMPLETED_EVENT = "fertility.intake.completed" as const;

/** Emitted by the main workflow per finished call (Req 7.10, 19.1). */
export const CALL_COMPLETED_EVENT = "call.completed" as const;

/** Emitted by the approval card UI to release the Approval_Gate (Req 17.3, 19.1). */
export const BOOKING_APPROVED_EVENT = "couple.booking.approved" as const;

/** Emitted by the main workflow on the scheduled Check_In wake (Req 18.3, 19.1). */
export const CHECKIN_DUE_EVENT = "checkin.due" as const;

/** Payload carried by the `fertility.intake.completed` event. */
export interface IntakeCompletedEventData {
  coupleId: string;
}

/**
 * Payload carried by `call.completed` (Req 7.10). Consumed by the decoupled
 * Reactive_Summary_Function (Req 19.2, 19.3) to refresh the Doctor_Summary from
 * the call's extracted result.
 */
export interface CallCompletedEventData {
  coupleId: string;
  callType: CallType;
  usedFallback: boolean;
  result: InsuranceResult | ClinicResult;
}

/** Payload carried by `couple.booking.approved` (Req 17.3). */
export interface BookingApprovedEventData {
  coupleId: string;
}

/** Payload carried by `checkin.due` (Req 18.3). */
export interface CheckinDueEventData {
  coupleId: string;
}
