import * as React from "react";
import { Check, Circle, GitBranch, Loader2, Pause, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardHeader } from "./Card";
import { Chip } from "./MissingFlag";

/*
  WorkflowViewer — the visible face of the event-driven Inngest graph (Req
  7.1, 7.2, 20.4, 20.5). It renders each step with a pending / running /
  completed / failed / paused status chip and, crucially, draws the
  concurrent fan-out branches (analyze her | analyze his; insurance call |
  clinic call) as PARALLEL side-by-side tracks rather than a single vertical
  line, so the concurrency reads honestly during the demo. The booking step is
  shown `paused` while the workflow waits at the approval gate.

  ── Two shapes, one viewer ───────────────────────────────────────────────
  • Linear  — the original `WorkflowStep[]` passed via `steps`. Still fully
    supported so existing callers (the Home screen) keep working unchanged.
  • Graph   — the new `WorkflowGraph` passed via `graph`: an ordered list of
    `WorkflowLane`s, where a lane is either a single sequential step or a
    parallel group of 2+ concurrent branches rendered as columns.
  Resolution: `graph` wins if given; else `steps` renders linear; else the
  standalone `defaultWorkflowGraph()` renders so the screen stands alone.

  ── SEAM FOR PERSON B (Task 25, lib/inngest) ─────────────────────────────
  This component owns ONLY the view and the graph/branch types below. The
  durable run lives in `lib/inngest`. To feed real per-step status, build a
  `WorkflowGraph` whose step `id`s match the persisted Inngest step ids
  (see WORKFLOW_GRAPH_STEP_IDS) and update each step's `status` as the run
  transitions — including setting the approval-gate step to `paused` while
  `waitForEvent("couple.booking.approved")` is pending, and to `failed` when a
  step errors. The lane/branch structure mirrors the graph's fan-out/fan-in:
  the two `analyze` branches join before `compute-window`, and the two call
  branches join before the `approval-gate`. Status ids are the stable join
  keys; the viewer derives every chip, the paused notice, and the failed
  notice from them.
*/

/** Status of a single workflow step (Req 7.2, 20.4, 20.5). */
export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "paused";

/** A single workflow step as rendered by the viewer. */
export interface WorkflowStep {
  id: string;
  label: string;
  status: WorkflowStepStatus;
}

/**
 * One concurrent track within a parallel group. A branch carries a short
 * track title (e.g. "Her", "Insurance") and one or more steps that run on
 * that track. In the design graph each branch is a single step, but the shape
 * supports multi-step tracks so Person B can model richer fan-out if needed.
 */
export interface WorkflowBranch {
  id: string;
  title: string;
  steps: WorkflowStep[];
}

/**
 * A lane in the graph: either a single sequential step, or a parallel group
 * of 2+ branches that run concurrently and fan back in before the next lane.
 */
export type WorkflowLane =
  | { kind: "step"; step: WorkflowStep }
  | { kind: "parallel"; id: string; title: string; branches: WorkflowBranch[] };

/** The event-driven workflow as an ordered list of lanes (Req 7.1). */
export interface WorkflowGraph {
  lanes: WorkflowLane[];
}

/**
 * The seven linear steps, in execution order. Retained for the backward-
 * compatible `steps` path and `defaultWorkflowSteps()`.
 */
export const WORKFLOW_STEPS: readonly { id: string; label: string }[] = [
  { id: "extract-profiles", label: "Extract profiles" },
  { id: "compute-window", label: "Compute trying window" },
  { id: "detect-missing", label: "Detect missing data" },
  { id: "duration-rule", label: "Check trying-duration rule" },
  { id: "generate-tasks", label: "Generate her / his / together tasks" },
  { id: "run-calls", label: "Run simulated insurance & clinic calls" },
  { id: "build-summary", label: "Build doctor summary" },
] as const;

/**
 * The stable step ids of the event-driven graph, in dependency order. These
 * are the join keys Person B's Inngest run feeds status against (Task 25).
 */
export const WORKFLOW_GRAPH_STEP_IDS = [
  "analyze-her",
  "analyze-his",
  "compute-window",
  "detect-missing",
  "duration-rule",
  "generate-tasks",
  "insurance-call",
  "clinic-call",
  "approval-gate",
  "finalize-booking",
  "schedule-checkin",
  "build-summary",
] as const;

/** A standalone default: all seven linear steps pending. */
export function defaultWorkflowSteps(): WorkflowStep[] {
  return WORKFLOW_STEPS.map((step) => ({ ...step, status: "pending" }));
}

/**
 * The new design graph (Req 7.1, 20.4, 20.5): two concurrent analyze branches
 * fan in to the window/missing-data/duration/tasks spine, two concurrent call
 * branches fan in to the booking approval gate (shown `paused`), then finalize
 * → scheduled check-in → doctor summary. The default snapshot shows the run
 * arrived at the approval gate so the parallel tracks and the paused gate are
 * both visible standalone.
 */
export function defaultWorkflowGraph(): WorkflowGraph {
  return {
    lanes: [
      {
        kind: "parallel",
        id: "analyze",
        title: "Analyze both partners",
        branches: [
          {
            id: "analyze-her-track",
            title: "Her",
            steps: [
              { id: "analyze-her", label: "Analyze her data", status: "completed" },
            ],
          },
          {
            id: "analyze-his-track",
            title: "His",
            steps: [
              { id: "analyze-his", label: "Analyze his data", status: "completed" },
            ],
          },
        ],
      },
      {
        kind: "step",
        step: { id: "compute-window", label: "Compute trying window", status: "completed" },
      },
      {
        kind: "step",
        step: { id: "detect-missing", label: "Detect missing data", status: "completed" },
      },
      {
        kind: "step",
        step: { id: "duration-rule", label: "Check trying-duration rule", status: "completed" },
      },
      {
        kind: "step",
        step: { id: "generate-tasks", label: "Generate her / his / together tasks", status: "completed" },
      },
      {
        kind: "parallel",
        id: "calls",
        title: "Make the calls",
        branches: [
          {
            id: "insurance-track",
            title: "Insurance",
            steps: [
              { id: "insurance-call", label: "Verify coverage", status: "completed" },
            ],
          },
          {
            id: "clinic-track",
            title: "Clinic",
            steps: [
              { id: "clinic-call", label: "Find a consult slot", status: "completed" },
            ],
          },
        ],
      },
      {
        kind: "step",
        step: { id: "approval-gate", label: "Booking approval", status: "paused" },
      },
      {
        kind: "step",
        step: { id: "finalize-booking", label: "Finalize Jun 25 consult", status: "pending" },
      },
      {
        kind: "step",
        step: { id: "schedule-checkin", label: "Schedule 10–12 week check-in", status: "pending" },
      },
      {
        kind: "step",
        step: { id: "build-summary", label: "Refresh doctor summary", status: "pending" },
      },
    ],
  };
}

const STATUS_META: Record<
  WorkflowStepStatus,
  { label: string; tone: React.ComponentProps<typeof Chip>["tone"] }
> = {
  pending: { label: "Pending", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  // Calm, not alarming: the gate is waiting on the couple, not broken.
  paused: { label: "Waiting", tone: "warning" },
};

function StepIcon({ status }: { status: WorkflowStepStatus }) {
  const base = "flex size-7 shrink-0 items-center justify-center rounded-full";
  switch (status) {
    case "completed":
      return (
        <span className={cn(base, "bg-success/15 text-success")}>
          <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />
        </span>
      );
    case "running":
      return (
        <span className={cn(base, "bg-info/12 text-info")}>
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            strokeWidth={2.4}
            aria-hidden="true"
          />
        </span>
      );
    case "failed":
      return (
        <span className={cn(base, "bg-destructive/12 text-destructive")}>
          <X className="size-4" strokeWidth={2.6} aria-hidden="true" />
        </span>
      );
    case "paused":
      return (
        <span className={cn(base, "bg-warning/15 text-warning")}>
          <Pause className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
        </span>
      );
    default:
      return (
        <span className={cn(base, "bg-secondary text-muted-foreground")}>
          <Circle className="size-3" strokeWidth={2.4} aria-hidden="true" />
        </span>
      );
  }
}

/** A leading vertical rail connecting one lane marker to the next. */
function Connector() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-[13.5px] top-9 h-[calc(100%-1.25rem)] w-px bg-border"
    />
  );
}

/** A single sequential step rendered on the timeline rail. */
function StepLane({
  step,
  index,
  isLast,
}: {
  step: WorkflowStep;
  index: number;
  isLast: boolean;
}) {
  const meta = STATUS_META[step.status];
  return (
    <li
      data-testid={`workflow-step-${step.id}`}
      data-status={step.status}
      className="relative flex items-center gap-3 pb-4 last:pb-0"
    >
      {!isLast ? <Connector /> : null}
      <StepIcon status={step.status} />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-foreground">
          <span className="tabular-nums text-muted-foreground">{index + 1}.</span>{" "}
          {step.label}
        </p>
        <Chip tone={meta.tone}>{meta.label}</Chip>
      </div>
    </li>
  );
}

/** One concurrent track (column) within a parallel group. */
function BranchTrack({ branch }: { branch: WorkflowBranch }) {
  return (
    <div
      data-testid={`workflow-branch-${branch.id}`}
      data-branch="true"
      className="rounded-lg border border-border/70 bg-secondary/40 p-3"
    >
      <p className="text-xs font-medium text-muted-foreground">{branch.title}</p>
      <ul className="mt-2 space-y-2.5">
        {branch.steps.map((step) => {
          const meta = STATUS_META[step.status];
          return (
            <li
              key={step.id}
              data-testid={`workflow-step-${step.id}`}
              data-status={step.status}
              className="flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <StepIcon status={step.status} />
                <span className="min-w-0 text-sm font-medium text-foreground">
                  {step.label}
                </span>
              </div>
              <Chip tone={meta.tone} className="self-start">
                {meta.label}
              </Chip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A parallel group: a forked marker, then 2+ branch tracks side by side. */
function ParallelLane({
  lane,
  index,
  isLast,
}: {
  lane: Extract<WorkflowLane, { kind: "parallel" }>;
  index: number;
  isLast: boolean;
}) {
  return (
    <li
      data-testid={`workflow-parallel-${lane.id}`}
      data-parallel="true"
      data-branch-count={lane.branches.length}
      className="relative pb-4 last:pb-0"
    >
      {!isLast ? <Connector /> : null}
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <GitBranch className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        </span>
        <p className="min-w-0 text-sm font-medium text-foreground">
          <span className="tabular-nums text-muted-foreground">{index + 1}.</span>{" "}
          {lane.title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            runs in parallel
          </span>
        </p>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 pl-10">
        {lane.branches.map((branch) => (
          <BranchTrack key={branch.id} branch={branch} />
        ))}
      </div>
    </li>
  );
}

/** Flatten every step in a graph in lane/branch order. */
function flattenGraphSteps(graph: WorkflowGraph): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  for (const lane of graph.lanes) {
    if (lane.kind === "step") {
      steps.push(lane.step);
    } else {
      for (const branch of lane.branches) steps.push(...branch.steps);
    }
  }
  return steps;
}

interface WorkflowViewerProps {
  /** Linear steps (backward-compatible path). */
  steps?: WorkflowStep[];
  /** Event-driven graph with parallel branches (takes precedence). */
  graph?: WorkflowGraph;
  className?: string;
}

/**
 * Renders the workflow. With a `graph` (or standalone) it draws parallel
 * branches as side-by-side tracks and the booking gate as `paused`; with
 * `steps` it renders the original linear stepper. A failed step surfaces an
 * inline error naming it (Req 7.3); a paused gate surfaces a calm approval
 * notice (Req 20.5).
 */
export function WorkflowViewer({ steps, graph, className }: WorkflowViewerProps) {
  // Resolution order: explicit graph → explicit linear steps → standalone graph.
  const resolvedGraph: WorkflowGraph =
    graph ?? (steps && steps.length > 0 ? { lanes: steps.map((step) => ({ kind: "step", step })) } : defaultWorkflowGraph());

  const allSteps = flattenGraphSteps(resolvedGraph);
  const failed = allSteps.find((s) => s.status === "failed");
  const paused = allSteps.find((s) => s.status === "paused");

  return (
    <Card className={className} aria-label="Workflow">
      <CardHeader
        title="Workflow"
        description="How Mariposa turns your intake into a plan."
      />

      <ol className="mt-4">
        {resolvedGraph.lanes.map((lane, index) => {
          const isLast = index === resolvedGraph.lanes.length - 1;
          if (lane.kind === "parallel") {
            return (
              <ParallelLane
                key={lane.id}
                lane={lane}
                index={index}
                isLast={isLast}
              />
            );
          }
          return (
            <StepLane
              key={lane.step.id}
              step={lane.step}
              index={index}
              isLast={isLast}
            />
          );
        })}
      </ol>

      {paused ? (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg bg-warning/12 px-3 py-2 text-xs font-medium text-warning-foreground"
        >
          <Pause className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={2.4} aria-hidden="true" />
          <span>
            {paused.label} is waiting for your approval. Mariposa holds the booking
            until you confirm.
          </span>
        </p>
      ) : null}

      {failed ? (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {failed.label} failed. Steps that depend on it are paused.
        </p>
      ) : null}
    </Card>
  );
}
