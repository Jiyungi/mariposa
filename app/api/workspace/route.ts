// ===========================================================================
// Workspace read endpoint (app/api/workspace/route.ts) — Req 1, 16.1
//
// GET returns the persisted couple data the UI tabs render: the couple +
// partner profiles, the computed trying window, missing-data flags, tasks
// (her / his / together), calendar events (incl. the 2026-06-25 consult), the
// stored doctor summary, and the seven-step workflow run status.
//
// Read-only: it reads what the workflow persisted. If the workflow has not run
// yet for this couple, window/summary are null and the lists are empty — the UI
// can use /api/intake (inline mode) to populate them. Response shape is typed
// via WorkspaceResponse so Person A's UI can consume it directly.
// ===========================================================================

import { NextResponse } from "next/server";

import {
  getCalendarEvents,
  getCouple,
  getSummary,
  getTasks,
  getTryingWindow,
  getWorkflowRun,
  type SeedCouple,
  type Summary,
} from "@/lib/db";
import { DEMO_COUPLE_ID } from "@/lib/demo/run-demo";
import type {
  CalendarEvent,
  Task,
  TaskColumn,
  TryingWindow,
  WorkflowRun,
} from "@/lib/types";

export interface WorkspaceResponse {
  coupleId: string;
  couple: SeedCouple;
  window: TryingWindow | null;
  tasks: {
    all: Task[];
    her: Task[];
    him: Task[];
    together: Task[];
  };
  calendarEvents: CalendarEvent[];
  summary: Summary | null;
  workflow: WorkflowRun | null;
}

function byColumn(tasks: Task[], column: TaskColumn): Task[] {
  return tasks.filter((t) => t.column === column);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const coupleId = url.searchParams.get("coupleId") ?? DEMO_COUPLE_ID;

  const couple = await getCouple(coupleId);
  if (!couple) {
    return NextResponse.json(
      { error: `No couple found for id "${coupleId}".` },
      { status: 404 },
    );
  }

  const [window, tasks, calendarEvents, summary, workflow] = await Promise.all([
    getTryingWindow(coupleId),
    getTasks(coupleId),
    getCalendarEvents(coupleId),
    getSummary(coupleId),
    getWorkflowRun(coupleId),
  ]);

  const response: WorkspaceResponse = {
    coupleId,
    couple,
    window,
    tasks: {
      all: tasks,
      her: byColumn(tasks, "her"),
      him: byColumn(tasks, "him"),
      together: byColumn(tasks, "together"),
    },
    calendarEvents,
    summary,
    workflow,
  };

  return NextResponse.json(response, { status: 200 });
}
