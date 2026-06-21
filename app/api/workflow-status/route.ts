// ===========================================================================
// Workflow status read endpoint (app/api/workflow-status/route.ts) — Req 7.2
//
// GET returns the persisted seven-step workflow run for a couple so the UI's
// WorkflowViewer can render each step's status (pending / running / completed /
// failed) and surface the failed step when the run halts (Req 7.3). Intended to
// be polled while the Inngest workflow (or the inline demo path) executes.
// ===========================================================================

import { NextResponse } from "next/server";

import { getWorkflowRun } from "@/lib/db";
import { DEMO_COUPLE_ID } from "@/lib/demo/run-demo";
import type { WorkflowRun, WorkflowRunStatus } from "@/lib/types";

export interface WorkflowStatusResponse {
  coupleId: string;
  /** null until the workflow has started for this couple. */
  status: WorkflowRunStatus | "not_started";
  failedStep: number | null;
  run: WorkflowRun | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const coupleId = url.searchParams.get("coupleId") ?? DEMO_COUPLE_ID;

  const run = await getWorkflowRun(coupleId);

  const response: WorkflowStatusResponse = {
    coupleId,
    status: run?.status ?? "not_started",
    failedStep: run?.failedStep ?? null,
    run,
  };

  return NextResponse.json(response, { status: 200 });
}
