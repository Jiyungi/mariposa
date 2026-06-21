import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { applyResultUpdate } from "@/lib/workspace/result-update";
import { captureWorkflowError } from "@/lib/observability/sentry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await applyResultUpdate(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid result update.",
          issues: error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const captured = captureWorkflowError(error, {
      flow: "mariposa-result-update",
      step: "api",
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
