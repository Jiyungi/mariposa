// ===========================================================================
// Intake-complete endpoint (app/api/intake/route.ts) — Req 2.6, 16.1, 16.3
//
// POST signals that both partners' intakes are complete and valid for a couple
// (default: couple_001). It supports TWO modes so the demo is reliable with or
// without a running Inngest dev server:
//
//   • mode = "event" (default)
//       Emits `fertility.intake.completed` exactly once via inngest.send (Req
//       2.6). When the Inngest dev server is running it picks this up and runs
//       the seven-step workflow asynchronously. Poll app/api/workflow-status to
//       watch per-step progress. (No server running ⇒ the event is queued but
//       nothing executes — use inline mode for a self-contained demo.)
//
//   • mode = "inline"
//       Directly AWAITS runWorkflowNow(coupleId) (a thin wrapper over
//       runMariposaWorkflow). The whole chain executes synchronously and persists
//       the trying window, missing-data flags, her/his/together tasks, the
//       2026-06-25 consult, and the doctor summary BEFORE responding — no
//       Inngest server required. This is the deterministic demo path; live-call
//       failure transparently uses the Mock_Fallback (Req 16.3).
//
// Mode is selected via the `?mode=` query param or a `{ "mode": "..." }` JSON
// body field; the body may also carry `{ "coupleId": "..." }`.
// ===========================================================================

import { NextResponse } from "next/server";

import { getCouple } from "@/lib/db";
import { INTAKE_COMPLETED_EVENT, inngest } from "@/lib/inngest";
import type { WorkflowRun } from "@/lib/types";
import { runDemoPath, DEMO_COUPLE_ID, type DemoPathResult } from "@/lib/demo/run-demo";

type IntakeMode = "event" | "inline";

interface IntakeRequestBody {
  coupleId?: string;
  mode?: string;
}

/** Inline demo path: run the full chain now and return its artifacts (Req 16.1). */
async function runWorkflowNow(
  coupleId: string = DEMO_COUPLE_ID,
): Promise<DemoPathResult> {
  return runDemoPath(coupleId);
}

interface EventModeResponse {
  mode: "event";
  coupleId: string;
  emitted: typeof INTAKE_COMPLETED_EVENT;
  message: string;
}

interface InlineModeResponse {
  mode: "inline";
  coupleId: string;
  run: WorkflowRun;
  usedFallback: boolean;
  result: DemoPathResult;
}

function resolveMode(value: string | null | undefined): IntakeMode {
  return value === "inline" ? "inline" : "event";
}

export async function POST(request: Request) {
  let body: IntakeRequestBody = {};
  try {
    body = (await request.json()) as IntakeRequestBody;
  } catch {
    // Empty/invalid JSON body is fine — fall back to defaults + query params.
  }

  const url = new URL(request.url);
  const coupleId = body.coupleId ?? url.searchParams.get("coupleId") ?? DEMO_COUPLE_ID;
  const mode = resolveMode(body.mode ?? url.searchParams.get("mode"));

  // Both intakes must exist and be valid before we proceed (Req 2.6). The seed
  // couple is pre-validated; a missing couple is rejected so we never emit/run
  // for an unknown couple.
  const couple = await getCouple(coupleId);
  if (!couple) {
    return NextResponse.json(
      { error: `No couple found for id "${coupleId}"; intake cannot complete.` },
      { status: 404 },
    );
  }

  if (mode === "inline") {
    const result = await runWorkflowNow(coupleId);
    const response: InlineModeResponse = {
      mode: "inline",
      coupleId,
      run: result.run,
      usedFallback: result.usedFallback,
      result,
    };
    return NextResponse.json(response, { status: 200 });
  }

  // event mode: emit the trigger exactly once (Req 2.6).
  await inngest.send({
    name: INTAKE_COMPLETED_EVENT,
    data: { coupleId },
  });
  const response: EventModeResponse = {
    mode: "event",
    coupleId,
    emitted: INTAKE_COMPLETED_EVENT,
    message:
      "Emitted fertility.intake.completed. With the Inngest dev server running, " +
      "the seven-step workflow will execute; poll /api/workflow-status to watch it.",
  };
  return NextResponse.json(response, { status: 202 });
}
