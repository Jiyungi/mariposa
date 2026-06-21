"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { WHO_2021, type Who2021Key } from "@/lib/reference/who-2021";
import type {
  CoupleWorkspace,
  HerProfile,
  HimProfile,
  Member,
  Task,
} from "@/lib/db/types";
import { Card, CardHeader, Field, FieldGroup } from "./Card";
import { Chip, MissingFlag } from "./MissingFlag";
import { usePerspective } from "./PerspectiveProvider";

/*
  WorkspaceTabs — the Couple Workspace (Req 1). A Her / His / Together
  segmented control switches between three read-scoped views built from the
  seeded couple. MISSING (null) clinical values render through <MissingFlag>,
  never as a blank field and never as a substituted value (Req 1.8).

  The three views are exported individually so they can be rendered and tested
  in isolation; the field id lists below are the join keys the MISSING-rendering
  property test (Task 14.2) varies.
*/

type WorkspaceView = "her" | "his" | "together";

const VIEWS: readonly { id: WorkspaceView; label: string }[] = [
  { id: "her", label: "Her" },
  { id: "his", label: "His" },
  { id: "together", label: "Together" },
];

// --- formatting helpers ---------------------------------------------------

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format an ISO date (YYYY-MM-DD) as "Jun 1, 2026" without locale drift. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** Trim a trailing ".0" so 2.0 reads "2" but 2.1 stays "2.1". */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

// --- shared value row -----------------------------------------------------

interface ValueRowProps {
  /** Stable field id; the value cell is exposed as `value-${id}`. */
  id: string;
  label: string;
  /** Quiet sub-label, e.g. a reference range. Never holds the field's value. */
  sub?: string;
  value: number | null;
  unit?: string;
  /** Trailing status badge shown only when a value is present. */
  status?: React.ReactNode;
}

/**
 * One labeled clinical value. When the value is null it renders a
 * <MissingFlag> inside the value cell — never blank, never a stand-in number
 * (Req 1.8, Property 24).
 */
function ValueRow({ id, label, sub, value, unit, status }: ValueRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="min-w-0 text-sm text-muted-foreground">
        <span className="text-foreground/90">{label}</span>
        {sub ? (
          <span className="mt-0.5 block text-xs text-muted-foreground/85">
            {sub}
          </span>
        ) : null}
      </dt>
      <dd className="shrink-0 text-right text-sm font-medium text-foreground">
        <span
          data-testid={`value-${id}`}
          className="inline-flex items-center justify-end gap-2"
        >
          {value === null ? (
            <MissingFlag label={label} />
          ) : (
            <>
              {status}
              <span className="tabular-nums">
                {formatNumber(value)}
                {unit}
              </span>
            </>
          )}
        </span>
      </dd>
    </div>
  );
}

function memberByRole(members: Member[], role: "her" | "him"): Member | undefined {
  return members.find((m) => m.role === role);
}

// --- Her view -------------------------------------------------------------

/** Female labs that render as flags when MISSING (Req 1.8). */
export const HER_LAB_FIELDS: readonly {
  id: keyof Pick<
    HerProfile,
    "amh" | "tsh" | "day3_fsh" | "day3_estradiol" | "mid_luteal_progesterone" | "prolactin"
  >;
  label: string;
  unit?: string;
}[] = [
  { id: "amh", label: "AMH", unit: " ng/mL" },
  { id: "tsh", label: "TSH" },
  { id: "day3_fsh", label: "Day-3 FSH" },
  { id: "day3_estradiol", label: "Day-3 estradiol" },
  { id: "mid_luteal_progesterone", label: "Mid-luteal progesterone", unit: " ng/mL" },
  { id: "prolactin", label: "Prolactin" },
];

export function HerView({
  her,
  member,
  tasks,
}: {
  her: HerProfile;
  member?: Member;
  tasks: Task[];
}) {
  const cycleRange =
    her.cycle_length_min !== null && her.cycle_length_max !== null
      ? `${her.cycle_length_min}–${her.cycle_length_max} days`
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={member?.name ?? "Her"} description="Profile & cycle" />
        <FieldGroup className="mt-3">
          {member?.age !== null && member?.age !== undefined ? (
            <Field label="Age">{member.age}</Field>
          ) : null}
          <Field label="Last period">
            {formatDate(her.last_period_start) ?? <MissingFlag label="Last period" />}
          </Field>
          <Field label="Cycle length">
            {cycleRange ?? <MissingFlag label="Cycle length" />}
          </Field>
          <Field label="Regularity">
            {her.cycle_regular === null
              ? <MissingFlag label="Regularity" />
              : her.cycle_regular ? "Regular" : "Irregular"}
          </Field>
          <Field label="Months trying">
            {her.months_trying ?? <MissingFlag label="Months trying" />}
          </Field>
          <Field label="Ovulation tracking">
            {her.ovulation_tracking ?? <MissingFlag label="Ovulation tracking" />}
          </Field>
          <Field label="Prior pregnancies">
            {her.prior_pregnancies ?? <MissingFlag label="Prior pregnancies" />}
          </Field>
        </FieldGroup>

        {her.conditions.length > 0 || her.prior_meds.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
            {her.conditions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {her.conditions.map((c) => (
                  <Chip key={c} tone="warning">{c}</Chip>
                ))}
              </div>
            ) : null}
            {her.prior_meds.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Prior meds: {her.prior_meds.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Labs" description="Hormone & ovarian-reserve panel" />
        <FieldGroup className="mt-3">
          {HER_LAB_FIELDS.map((f) => (
            <ValueRow
              key={f.id}
              id={f.id}
              label={f.label}
              value={her[f.id]}
              unit={f.unit}
            />
          ))}
        </FieldGroup>
      </Card>

      <TaskCard column="her" tasks={tasks} />
    </div>
  );
}

// --- His view -------------------------------------------------------------

/** Semen parameters compared to their WHO 2021 lower reference limit. */
export const HIM_SEMEN_FIELDS: readonly {
  id: keyof Pick<
    HimProfile,
    | "volume_ml"
    | "concentration_million_ml"
    | "total_count_million"
    | "progressive_motility_pct"
    | "total_motility_pct"
    | "morphology_normal_pct"
    | "vitality_pct"
    | "ph"
  >;
  whoKey: Who2021Key;
  label: string;
  unit?: string;
}[] = [
  { id: "volume_ml", whoKey: "semenVolumeMl", label: "Volume", unit: " mL" },
  { id: "concentration_million_ml", whoKey: "concentrationMillionMl", label: "Concentration", unit: " M/mL" },
  { id: "total_count_million", whoKey: "totalSpermMillion", label: "Total count", unit: " M" },
  { id: "progressive_motility_pct", whoKey: "progressiveMotilityPct", label: "Progressive motility", unit: "%" },
  { id: "total_motility_pct", whoKey: "totalMotilityPct", label: "Total motility", unit: "%" },
  { id: "morphology_normal_pct", whoKey: "normalMorphologyPct", label: "Normal morphology", unit: "%" },
  { id: "vitality_pct", whoKey: "vitalityPct", label: "Vitality", unit: "%" },
  { id: "ph", whoKey: "phMin", label: "pH" },
];

function ReadinessMeter({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Readiness</span>
        <MissingFlag label="Readiness score" />
      </div>
    );
  }
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Readiness</span>
        <span className="text-sm font-semibold text-foreground">
          <span className="tabular-nums">{clamped}</span>
          <span className="text-muted-foreground"> / 100</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label="Readiness score"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Improves as his tasks are completed.
      </p>
    </div>
  );
}

const SEMEN_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

export function HisView({
  him,
  member,
  tasks,
}: {
  him: HimProfile;
  member?: Member;
  tasks: Task[];
}) {
  const lifestyle = him.lifestyle;
  const statusLabel = him.semen_analysis_status
    ? SEMEN_STATUS_LABELS[him.semen_analysis_status] ?? him.semen_analysis_status
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={member?.name ?? "His"} description="Readiness & semen analysis" />
        <div className="mt-3">
          <ReadinessMeter score={him.readiness_score} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Semen analysis"
          description="Results compared to WHO 2021 limits"
          action={statusLabel ? <Chip tone="neutral">{statusLabel}</Chip> : undefined}
        />
        {him.semen_analysis_date ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Collected {formatDate(him.semen_analysis_date)}
          </p>
        ) : null}
        <FieldGroup className="mt-3">
          {HIM_SEMEN_FIELDS.map((f) => {
            const value = him[f.id];
            const limit = WHO_2021[f.whoKey];
            const below = value !== null && value < limit;
            return (
              <ValueRow
                key={f.id}
                id={f.id}
                label={f.label}
                sub={`WHO 2021 ≥ ${limit}${f.unit ?? ""}`}
                value={value}
                unit={f.unit}
                status={below ? <Chip tone="warning">below limit</Chip> : undefined}
              />
            );
          })}
        </FieldGroup>
        <p className="mt-3 text-xs text-muted-foreground">
          One result is not a diagnosis. A below-limit value warrants a repeat
          analysis after 2–7 days of abstinence.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Lifestyle"
          description="Tracked over ~72 days (sperm development cycle)"
        />
        <FieldGroup className="mt-3">
          <Field label="Heat exposure">
            {lifestyle.heat_exposure === null ? (
              <MissingFlag label="Heat exposure" />
            ) : lifestyle.heat_exposure ? (
              <Chip tone="warning">Frequent</Chip>
            ) : (
              "None"
            )}
          </Field>
          <Field label="Smoking">
            {lifestyle.smoking === null
              ? <MissingFlag label="Smoking" />
              : lifestyle.smoking ? "Yes" : "No"}
          </Field>
          <Field label="Alcohol">
            {lifestyle.alcohol ?? <MissingFlag label="Alcohol" />}
          </Field>
          <Field label="Sleep">
            {lifestyle.sleep ?? <MissingFlag label="Sleep" />}
          </Field>
          <Field label="Stress">
            {lifestyle.stress === "high" ? (
              <Chip tone="warning">High</Chip>
            ) : (
              lifestyle.stress ?? <MissingFlag label="Stress" />
            )}
          </Field>
          <ValueRow id="bmi" label="BMI" value={lifestyle.bmi} />
        </FieldGroup>
      </Card>

      <TaskCard column="him" tasks={tasks} />
    </div>
  );
}

// --- Together view --------------------------------------------------------

const COVERAGE_META: Record<string, { label: string; tone: React.ComponentProps<typeof Chip>["tone"] }> = {
  confirmed: { label: "Confirmed", tone: "success" },
  partial_unconfirmed: { label: "Partial — unverified", tone: "warning" },
  unconfirmed: { label: "Unverified", tone: "warning" },
};

export function TogetherView({
  workspace,
}: {
  workspace: CoupleWorkspace;
}) {
  const { couple, tasks } = workspace;
  const coverage = couple.coverage_status
    ? COVERAGE_META[couple.coverage_status] ?? {
        label: couple.coverage_status,
        tone: "neutral" as const,
      }
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Insurance"
          description={couple.insurance_provider ?? undefined}
          action={coverage ? <Chip tone={coverage.tone}>{coverage.label}</Chip> : undefined}
        />
        <FieldGroup className="mt-3">
          <Field label="Plan">
            {couple.plan_type ?? <MissingFlag label="Plan" />}
          </Field>
          <Field label="Member ID">
            {couple.member_id ?? <MissingFlag label="Member ID" />}
          </Field>
          <Field label="Group number">
            {couple.group_number ?? <MissingFlag label="Group number" />}
          </Field>
          <Field label="Policy holder">
            {couple.policy_holder
              ? couple.policy_holder === "her" ? "Her" : "Him"
              : <MissingFlag label="Policy holder" />}
          </Field>
        </FieldGroup>
      </Card>

      <Card>
        <CardHeader title="Shared goal" />
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {couple.goal ?? <MissingFlag label="Goal" />}
        </p>
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="text-xs font-medium text-muted-foreground">Top concern</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {couple.top_concern ?? <MissingFlag label="Top concern" />}
          </p>
        </div>
      </Card>

      <TaskCard column="together" tasks={tasks} />
    </div>
  );
}

// --- tasks ----------------------------------------------------------------

function TaskCard({ column, tasks }: { column: Task["column"]; tasks: Task[] }) {
  const scoped = tasks.filter((t) => t.column === column);
  return (
    <Card>
      <CardHeader title="Tasks" />
      {scoped.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No tasks yet. These appear after Mariposa runs the insurance and clinic
          calls.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {scoped.map((task) => (
            <li key={task.id} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  task.completed
                    ? "border-success bg-success/15 text-success"
                    : "border-border text-transparent",
                )}
              >
                <Check className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
              </span>
              <span
                className={cn(
                  "text-sm",
                  task.completed
                    ? "text-muted-foreground line-through"
                    : "text-foreground",
                )}
              >
                {task.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- segmented control + shell -------------------------------------------

export function WorkspaceTabs({
  workspace,
  initialView,
}: {
  workspace: CoupleWorkspace;
  initialView?: WorkspaceView;
}) {
  const { perspective } = usePerspective();
  const her = memberByRole(workspace.members, "her");
  const him = memberByRole(workspace.members, "him");

  // Restrict the views to the signed-in partner's own view + the shared
  // Together view — never the other partner's private view (Req 1.2). With no
  // perspective (e.g. standalone render) all three remain available.
  const allowed: WorkspaceView[] = React.useMemo(() => {
    if (perspective === "her") return ["her", "together"];
    if (perspective === "him") return ["his", "together"];
    return ["her", "his", "together"];
  }, [perspective]);

  const visibleViews = VIEWS.filter((v) => allowed.includes(v.id));
  const defaultView = initialView && allowed.includes(initialView)
    ? initialView
    : (perspective === "him" ? "his" : perspective === "her" ? "her" : allowed[0]);

  const [view, setView] = React.useState<WorkspaceView>(defaultView);

  // Keep the active view valid if the allowed set changes (e.g. the partner
  // switches). Never leave a partner viewing a tab they can't access.
  React.useEffect(() => {
    if (!allowed.includes(view)) setView(defaultView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  return (
    <section aria-label="Your workspace">
      <div
        role="tablist"
        aria-label="Workspace views"
        className="grid gap-1 rounded-full bg-secondary p-1"
        style={{ gridTemplateColumns: `repeat(${visibleViews.length}, minmax(0, 1fr))` }}
      >
        {visibleViews.map((v) => {
          const active = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              id={`workspace-tab-${v.id}`}
              aria-selected={active}
              aria-controls={`workspace-panel-${v.id}`}
              onClick={() => setView(v.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`workspace-panel-${view}`}
        aria-labelledby={`workspace-tab-${view}`}
        className="mt-4"
      >
        {view === "her" ? (
          <HerView her={workspace.herProfile} member={her} tasks={workspace.tasks} />
        ) : null}
        {view === "his" ? (
          <HisView him={workspace.himProfile} member={him} tasks={workspace.tasks} />
        ) : null}
        {view === "together" ? <TogetherView workspace={workspace} /> : null}
      </div>
    </section>
  );
}
