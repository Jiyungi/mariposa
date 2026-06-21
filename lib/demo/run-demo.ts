// ===========================================================================
// End-to-end demo path orchestration (lib/demo/run-demo.ts) — Req 16.1, 16.3
//
// `runDemoPath` runs the FULL Mariposa reactive graph for the seed couple end to
// end and returns the artifacts the demo (and Task 19.2's integration test)
// assert on:
//
//   intake  →  reactive graph (analyze-her | analyze-his fan-out/join)
//           →  trying window + missing-data flags  →  duration rule
//           →  her/his/together tasks  →  insurance | clinic calls (fan-out/join)
//           →  Approval_Gate (auto-approved on the demo path)
//           →  June 25 consult calendar event  →  scheduled Check_In
//           →  doctor summary
//
// It is a thin, awaitable wrapper over `runMariposaWorkflow` (lib/inngest/workflow),
// which already:
//   - runs the reactive graph with the two concurrent branch-pairs (Req 7.2, 7.3),
//   - auto-approves the Approval_Gate by default so the demo completes (Req 17.3),
//   - persists the trying window, tasks, calendar event, call records, and
//     summary through the data layer, and
//   - resolves the simulated calls live-first and TRANSPARENTLY falls through to
//     the deterministic Mock_Fallback on any live-call failure (Req 6.7, 16.3),
//     so the demo always completes even with no XAI_API_KEY / GROK_API_KEY set.
//
// No orphaned code: every wired module is reachable from here or from the route
// handlers in app/api/* that also call runDemoPath / runMariposaWorkflow.
// ===========================================================================

import { runMariposaWorkflow } from "@/lib/inngest";
import type {
  CalendarEvent,
  DataFlag,
  Task,
  TryingWindowOutput,
  WorkflowRun,
} from "@/lib/types";
import type { DoctorSummary } from "@/lib/inngest";

/** The default (and only) seed couple for the demo. */
export const DEMO_COUPLE_ID = "couple_001" as const;

/** Artifacts produced by the end-to-end demo path. */
export interface DemoPathResult {
  /** The completed reactive-graph run (per-step statuses, Req 7.5). */
  run: WorkflowRun;
  /** Trying window: Jun 27–Jul 18 / priority Jul 2–Jul 17 / Low (Req 3.2–3.4). */
  window: TryingWindowOutput;
  /** Missing-data / borderline / unverified flags (Req 4). */
  flags: DataFlag[];
  /** Her / His / Together tasks (prep + call write-back). */
  tasks: Task[];
  /** The booked 2026-06-25 consult calendar event (Req 6.6). */
  calendarEvent: CalendarEvent;
  /** Doctor-ready summary assembled from the accumulated context (Req 8). */
  summary: DoctorSummary;
  /** True when the simulated calls used the deterministic Mock_Fallback (Req 16.3). */
  usedFallback: boolean;
}

/**
 * Run the full Mariposa demo chain end to end for `coupleId` and return the
 * artifacts the demo + integration test assert on. Awaitable and deterministic:
 * it does NOT require a running Inngest dev server — it drives the same testable
 * pipeline the Inngest function wraps.
 *
 * @throws MariposaWorkflowError if any workflow step fails (identifies the step).
 */
export async function runDemoPath(
  coupleId: string = DEMO_COUPLE_ID,
): Promise<DemoPathResult> {
  const { run, context } = await runMariposaWorkflow(coupleId);

  if (!context.window || !context.flags || !context.tasks || !context.calls || !context.summary) {
    throw new Error(
      "Demo path did not produce a complete result; the workflow may have halted early.",
    );
  }

  const { insurance, clinic, writeBack } = context.calls;

  return {
    run,
    window: context.window,
    flags: context.flags,
    tasks: context.tasks,
    calendarEvent: writeBack.calendarEvent,
    summary: context.summary,
    usedFallback: insurance.usedFallback || clinic.usedFallback,
  };
}
