// ===========================================================================
// Booking-approval endpoint (app/api/booking/route.ts) — Req 17.2, 17.3
//
// The Approval_Card UI (Person A) POSTs here when the couple taps "Approve" on
// the booking. This emits the `couple.booking.approved` event (matched on
// `data.coupleId`) so the SAME paused Inngest workflow run resumes from its
// `waitForEvent` Approval_Gate and finalizes the booking, the 2026-06-25
// calendar event, and the summary (Req 17.3).
//
// With the Inngest dev server running this resumes the real paused run. In the
// self-contained inline demo path the workflow auto-approves, so this endpoint
// is the production/event-mode resume trigger.
// ===========================================================================

import { NextResponse } from "next/server";

import { getCouple } from "@/lib/db";
import { BOOKING_APPROVED_EVENT, inngest } from "@/lib/inngest";
import { DEMO_COUPLE_ID } from "@/lib/demo/run-demo";

interface BookingRequestBody {
  coupleId?: string;
}

export async function POST(request: Request) {
  let body: BookingRequestBody = {};
  try {
    body = (await request.json()) as BookingRequestBody;
  } catch {
    // Empty/invalid JSON body is fine — fall back to defaults + query params.
  }

  const url = new URL(request.url);
  const coupleId = body.coupleId ?? url.searchParams.get("coupleId") ?? DEMO_COUPLE_ID;

  const couple = await getCouple(coupleId);
  if (!couple) {
    return NextResponse.json(
      { error: `No couple found for id "${coupleId}"; cannot approve booking.` },
      { status: 404 },
    );
  }

  // Release the Approval_Gate for this couple's paused run (Req 17.3).
  await inngest.send({
    name: BOOKING_APPROVED_EVENT,
    data: { coupleId },
  });

  return NextResponse.json(
    {
      coupleId,
      emitted: BOOKING_APPROVED_EVENT,
      message:
        "Emitted couple.booking.approved. The paused workflow run resumes and " +
        "finalizes the booking, the June 25 calendar event, and the summary.",
    },
    { status: 202 },
  );
}
