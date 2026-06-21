"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  herIntakeSchema,
  hisIntakeSchema,
  togetherIntakeSchema,
  type HerIntake,
  type HisIntake,
  type TogetherIntake,
} from "@/lib/validation/intake";
import {
  IntakeCompletionGuard,
  defaultIntakeCompletedEmitter,
  type IntakeCompletedEmitter,
  type IntakePart,
} from "@/lib/intake/completion";
import type { VoiceIntakeDraft } from "@/lib/intake/voice";
import { buildIntakeDefaults } from "./intake/defaults";
import {
  HER_SECTION,
  HIS_SECTION,
  TOGETHER_SECTION,
  type SectionConfig,
  type SectionKey,
} from "./intake/config";
import { IntakeSection } from "./intake/IntakeSection";
import type { DeepPartial } from "./intake/useIntakeSection";

/*
  Dual intake forms (Task 13.1, Req 2.1 / 2.6 / 2.8).

  A segmented control switches between the Her, His, and Together sections; all
  three stay mounted so their validity and in-progress edits persist as the
  user moves between them. Each section validates against its Zod schema and
  rejects out-of-range values inline (Req 2.8).

  When all three sections are complete and valid the user can fire the
  completion event. Emission is routed through `IntakeCompletionGuard`, which
  guarantees `fertility.intake.completed` fires EXACTLY ONCE (Req 2.6,
  Property 12). The actual emitter is injectable (`onIntakeCompleted`), defaulting
  to the console/no-op seam — Person B wires it to Inngest later.
*/

interface SectionMeta {
  config: SectionConfig;
  schema: typeof herIntakeSchema | typeof hisIntakeSchema | typeof togetherIntakeSchema;
}

const SECTION_META: Record<SectionKey, SectionMeta> = {
  her: { config: HER_SECTION, schema: herIntakeSchema },
  his: { config: HIS_SECTION, schema: hisIntakeSchema },
  together: { config: TOGETHER_SECTION, schema: togetherIntakeSchema },
};

const ORDER: readonly SectionKey[] = ["her", "his", "together"];

interface IntakeFormProps {
  /**
   * The completion-event emitter (the decoupling seam). Defaults to the
   * console/no-op emitter; Person B passes one that sends the Inngest
   * `fertility.intake.completed` event.
   */
  onIntakeCompleted?: IntakeCompletedEmitter;
  voiceDraft?: VoiceIntakeDraft;
}

export function IntakeForm({ onIntakeCompleted, voiceDraft }: IntakeFormProps) {
  const defaults = React.useMemo(() => buildIntakeDefaults(), []);
  const voicePatches = React.useMemo(
    () => mapVoiceDraftToIntakePatches(voiceDraft),
    [voiceDraft],
  );

  const [active, setActive] = React.useState<SectionKey>("her");
  const [validity, setValidity] = React.useState<Record<IntakePart, boolean>>({
    her: false,
    his: false,
    together: false,
  });
  const [completed, setCompleted] = React.useState(false);

  // One guard instance per mounted form; it owns the exactly-once decision.
  const guardRef = React.useRef<IntakeCompletionGuard | null>(null);
  if (guardRef.current === null) {
    guardRef.current = new IntakeCompletionGuard(
      onIntakeCompleted ?? defaultIntakeCompletedEmitter,
    );
  }

  const handleValidity = React.useCallback(
    (part: IntakePart) => (valid: boolean) => {
      setValidity((prev) =>
        prev[part] === valid ? prev : { ...prev, [part]: valid },
      );
    },
    [],
  );

  const allValid = ORDER.every((key) => validity[key]);

  const handleComplete = React.useCallback(() => {
    const guard = guardRef.current;
    if (!guard) return;
    // Feed the current validity into the guard; the update that completes the
    // set fires the event once (subsequent presses never re-fire — Property 12).
    let fired = false;
    for (const part of ORDER) {
      if (guard.update({ part, valid: validity[part] })) fired = true;
    }
    if (fired || guard.hasEmitted) setCompleted(true);
  }, [validity]);

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        active={active}
        validity={validity}
        onSelect={setActive}
      />

      {ORDER.map((key) => {
        const meta = SECTION_META[key];
        return (
          <IntakeSection
            key={key}
            section={meta.config}
            schema={meta.schema}
            initial={defaults[key]}
            voicePatch={voicePatches[key]}
            hidden={active !== key}
            onValidityChange={handleValidity(key)}
          />
        );
      })}

      <CompletionBar
        validity={validity}
        allValid={allValid}
        completed={completed}
        onComplete={handleComplete}
      />
    </div>
  );
}

function mapVoiceDraftToIntakePatches(
  draft: VoiceIntakeDraft | undefined,
): {
  her?: DeepPartial<HerIntake>;
  his?: DeepPartial<HisIntake>;
  together?: DeepPartial<TogetherIntake>;
} {
  if (!draft) return {};

  return {
    her: draft.her,
    his: draft.his,
    together: draft.together
      ? {
          goal: draft.together.goal,
          top_concern: draft.together.top_concern,
          insurance: draft.together.insurance_provider
            ? { provider: draft.together.insurance_provider }
            : undefined,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Segmented control — Her / His / Together
// ---------------------------------------------------------------------------

function SegmentedControl({
  active,
  validity,
  onSelect,
}: {
  active: SectionKey;
  validity: Record<IntakePart, boolean>;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Intake sections"
      className="sticky top-0 z-header -mx-1 flex gap-1 rounded-full bg-secondary p-1"
    >
      {ORDER.map((key) => {
        const isActive = active === key;
        const valid = validity[key];
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(key)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-secondary",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-secondary-foreground/80 hover:text-secondary-foreground",
            )}
          >
            {SECTION_META[key].config.title}
            {valid ? (
              <Check
                className="size-3.5 text-success"
                strokeWidth={3}
                aria-label="complete"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completion bar — progress + the once-only trigger
// ---------------------------------------------------------------------------

function CompletionBar({
  validity,
  allValid,
  completed,
  onComplete,
}: {
  validity: Record<IntakePart, boolean>;
  allValid: boolean;
  completed: boolean;
  onComplete: () => void;
}) {
  if (completed) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3.5"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
          <Check className="size-4" strokeWidth={3} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Intake complete</p>
          <p className="text-xs text-muted-foreground">
            Both partners&apos; data is in. Mariposa is starting your prep workflow.
          </p>
        </div>
      </div>
    );
  }

  const remaining = ORDER.filter((key) => !validity[key]);

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-center text-xs text-muted-foreground">
        {allValid
          ? "All three sections are complete and valid."
          : `Finish ${remaining
              .map((key) => SECTION_META[key].config.title)
              .join(" & ")} to continue.`}
      </p>
      <Button
        type="button"
        size="lg"
        disabled={!allValid}
        onClick={onComplete}
        className="w-full"
      >
        Complete intake
      </Button>
    </div>
  );
}
