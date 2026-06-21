import { NextResponse } from "next/server";

import { runInsuranceFlow } from "@/lib/orkes/insurance-flow";
import { captureWorkflowError } from "@/lib/observability/sentry";

export async function GET() {
  try {
    const result = await runInsuranceFlow();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const captured = captureWorkflowError(error, {
      flow: "mariposa-insurance-flow",
      step: "api-route",
    });

    return NextResponse.json(
      {
        error: captured.message,
        sentryEventId: captured.eventId,
      },
      { status: 500 },
    );
  }
}
