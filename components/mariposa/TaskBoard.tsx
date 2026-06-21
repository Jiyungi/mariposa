"use client";

import * as React from "react";
import { AlertTriangle, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { applyTaskCompletion, READINESS_MAX, READINESS_MIN } from "@/lib/core/readiness";
import type { Task, TaskColumn } from "@/lib/db/types";

/*
  TaskBoard — the Her / His / Together delegation board (Req 5.1, 5.2, 5.4–5.6).

  This component owns presentation and the demo-local completion state only. It
  is a pure consumer of the data model: it renders whatever `Task[]` it is given
  and groups each task into exactly one of the three columns by its `column`
  field (Req 5.2, 5.5). It never creates tasks.

  Seam — task creation lives elsewhere: the Voice_Agent's structured-result
  extraction (Person B: `lib/core/extract.ts` + the agent) turns completed calls
  into tasks and assigns each to a single column. That code is not on this
  branch. When extraction fails, no tasks are created and the caller passes
  `extractionFailed` so the board shows a calm failure indication (Req 5.6).

  Readiness (Req 5.4) — completing a His-track task increases the male partner's
  Readiness_Score. The score is *derived* from the set of completed His tasks
  (folded through the pure `applyTaskCompletion`), so it is idempotent: toggling
  a task never double-counts, the result is always an integer clamped to
  [0, 100], and a completion never decreases it.
*/

interface ColumnMeta {
  key: TaskColumn;
  label: string;
  /** A small wayfinding hue so the three tracks are scannable at a glance. */
  dotClass: string;
}

/** Exactly three columns, in the order Her · His · Together (Req 5.1). The
 *  His-track column key is `"him"` per the data model's TaskColumn type. */
const COLUMNS: readonly ColumnMeta[] = [
  { key: "her", label: "Her", dotClass: "bg-primary" },
  { key: "him", label: "His", dotClass: "bg-info" },
  { key: "together", label: "Together", dotClass: "bg-success" },
] as const;

export interface TaskBoardProps {
  /** The couple's tasks, from the data model. Each belongs to one column. */
  tasks: Task[];
  /**
   * The male partner's current Readiness_Score (integer 0–100). Used as the
   * His-track baseline; completed His tasks raise it from here.
   */
  readinessScore?: number;
  /**
   * Set by the caller when the Voice_Agent could not extract a structured
   * result from a completed call. When true, no tasks were created and the
   * board surfaces a failure indication (Req 5.6).
   */
  extractionFailed?: boolean;
  className?: string;
}

/** Clamp + round any number into the integer Readiness_Score baseline. */
function readinessBaseline(score: number): number {
  if (!Number.isFinite(score)) return READINESS_MIN;
  return Math.min(READINESS_MAX, Math.max(READINESS_MIN, Math.round(score)));
}

export function TaskBoard({
  tasks,
  readinessScore = 0,
  extractionFailed = false,
  className,
}: TaskBoardProps) {
  // Demo-local completion state, seeded once from the provided tasks.
  const [items, setItems] = React.useState<Task[]>(() => tasks);

  const toggle = React.useCallback((id: string) => {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }, []);

  // Derive the score from completed His tasks so it can never double-count and
  // is always clamped to [0, 100] by applyTaskCompletion (Req 5.4).
  const readiness = React.useMemo(
    () =>
      items
        .filter((t) => t.column === "him" && t.completed)
        .reduce(
          (score, t) => applyTaskCompletion(score, t.weight),
          readinessBaseline(readinessScore),
        ),
    [items, readinessScore],
  );

  const byColumn = React.useMemo(() => {
    const groups: Record<TaskColumn, Task[]> = { her: [], him: [], together: [] };
    for (const t of items) groups[t.column]?.push(t);
    return groups;
  }, [items]);

  return (
    <div className={cn("space-y-3.5", className)}>
      {extractionFailed ? <ExtractionFailureNotice /> : null}

      {COLUMNS.map((meta) => (
        <ColumnSection
          key={meta.key}
          meta={meta}
          tasks={byColumn[meta.key]}
          onToggle={toggle}
          readiness={meta.key === "him" ? readiness : undefined}
        />
      ))}
    </div>
  );
}

interface ColumnSectionProps {
  meta: ColumnMeta;
  tasks: Task[];
  onToggle: (id: string) => void;
  /** Present only for the His column; renders the Readiness_Score meter. */
  readiness?: number;
}

function ColumnSection({ meta, tasks, onToggle, readiness }: ColumnSectionProps) {
  return (
    <section
      aria-label={`${meta.label} tasks`}
      className="overflow-hidden rounded-xl border border-border/70 bg-card text-card-foreground shadow-card"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <span
            className={cn("size-2 rounded-full", meta.dotClass)}
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-secondary-foreground">
          {tasks.length}
        </span>
      </div>

      {readiness !== undefined ? <ReadinessMeter score={readiness} /> : null}

      <div className="px-2 pb-2 pt-2.5">
        {tasks.length > 0 ? (
          <ul className="space-y-0.5">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} onToggle={onToggle} />
            ))}
          </ul>
        ) : (
          <p className="px-2 py-5 text-center text-sm text-muted-foreground">
            No tasks yet
          </p>
        )}
      </div>
    </section>
  );
}

/** The male partner's Readiness_Score, shown where completing a His task
 *  visibly moves it (Req 5.4). */
function ReadinessMeter({ score }: { score: number }) {
  return (
    <div className="px-4 pb-0.5 pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Readiness
        </span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {score}
          <span className="text-muted-foreground">/100</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="His readiness score"
        aria-valuemin={READINESS_MIN}
        aria-valuemax={READINESS_MAX}
        aria-valuenow={score}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
}

function TaskItem({ task, onToggle }: TaskItemProps) {
  const done = task.completed;
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        aria-pressed={done}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left",
          "transition-colors duration-150 ease-out hover:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        )}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ease-out",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-transparent group-hover:border-primary/60",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
        <span
          className={cn(
            "text-sm transition-colors duration-150 ease-out",
            done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {task.title}
        </span>
      </button>
    </li>
  );
}

/** Calm, non-alarming notice shown when call-result extraction failed and no
 *  tasks could be created (Req 5.6). */
function ExtractionFailureNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-warning"
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <p className="text-sm leading-relaxed text-warning-foreground">
        <span className="font-semibold">
          We couldn&rsquo;t read the last call&rsquo;s results.
        </span>{" "}
        No tasks were created. Mariposa will try again on the next call.
      </p>
    </div>
  );
}
