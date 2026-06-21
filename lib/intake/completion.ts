/**
 * Intake completion event seam (Req 2.6, Property 12).
 *
 * When BOTH partners' intakes (and the shared Together section) are complete
 * and valid, the system emits the `fertility.intake.completed` event EXACTLY
 * ONCE — never before all required parts are valid, and never twice.
 *
 * ── Ownership / decoupling seam ────────────────────────────────────────────
 * This module is owned by the intake (UI) side. It deliberately does NOT import
 * `lib/inngest` (owned by Person B and not present on this branch). Instead it
 * exposes a tiny injectable emitter callback (`IntakeCompletedEmitter`) that
 * defaults to a console/no-op. Person B can later wire the real Inngest event
 * by passing an emitter that calls `inngest.send({ name: "fertility.intake.completed", ... })`:
 *
 *     const guard = new IntakeCompletionGuard(() =>
 *       inngest.send({ name: INTAKE_COMPLETED_EVENT, data: { coupleId } }),
 *     );
 *
 * Until then the default emitter just logs, so the UI works standalone and the
 * once-only guarantee (Property 12) is fully testable without any orchestration
 * dependency. The guard's decision logic (`reduceCompletion`) is a pure
 * function so the property test can drive it directly, no DOM required.
 */

/** The event name Person B's Inngest workflow is triggered by (Req 2.6, 7.1). */
export const INTAKE_COMPLETED_EVENT = "fertility.intake.completed";

/**
 * The three intake parts that must each be complete and valid before the
 * couple's intake counts as done: the female partner, the male partner, and
 * the shared Together section (Req 2.1–2.4, 2.6).
 */
export type IntakePart = "her" | "his" | "together";

/** The parts required for completion, in display order. */
export const REQUIRED_PARTS: readonly IntakePart[] = ["her", "his", "together"];

/**
 * A single intake update: a part has just become complete-and-valid (`valid`
 * true) or has fallen back to incomplete/invalid (`valid` false). Sequences of
 * these are what Property 12 quantifies over.
 */
export interface IntakeUpdate {
  part: IntakePart;
  valid: boolean;
}

/**
 * The guard's state. `valid` tracks which parts are currently valid; `emitted`
 * latches to `true` the first time every required part is valid and never
 * resets (so the event can fire at most once — Property 12).
 */
export interface IntakeCompletionState {
  readonly valid: Readonly<Record<IntakePart, boolean>>;
  readonly emitted: boolean;
}

/** A fresh state with no part valid and the event not yet emitted. */
export function initialCompletionState(): IntakeCompletionState {
  return {
    valid: { her: false, his: false, together: false },
    emitted: false,
  };
}

/** True when every required part is currently valid. */
function allValid(
  valid: Readonly<Record<IntakePart, boolean>>,
  required: readonly IntakePart[],
): boolean {
  return required.every((part) => valid[part]);
}

/**
 * Pure reducer: apply one update to the completion state. Returns the next
 * state and whether the event should be emitted as a result of THIS update.
 *
 * The `emit` flag is `true` for exactly one update across any sequence: the
 * first update after which all required parts are valid while `emitted` is
 * still `false`. Once `emitted` latches true it never emits again, even if a
 * part later goes invalid and valid once more (Property 12).
 */
export function reduceCompletion(
  state: IntakeCompletionState,
  update: IntakeUpdate,
  required: readonly IntakePart[] = REQUIRED_PARTS,
): { state: IntakeCompletionState; emit: boolean } {
  const valid: Record<IntakePart, boolean> = {
    ...state.valid,
    [update.part]: update.valid,
  };
  const emit = !state.emitted && allValid(valid, required);
  return {
    state: { valid, emitted: state.emitted || emit },
    emit,
  };
}

/**
 * The injectable emitter seam. Returns void or a promise so the real
 * implementation (Person B's Inngest `send`) can be async. Keep it side-effect
 * free of any intake state — the guard owns the "exactly once" decision.
 */
export type IntakeCompletedEmitter = () => void | Promise<void>;

/**
 * Default emitter used until Person B wires Inngest. It does not throw and has
 * no orchestration dependency; it simply records that the event would fire.
 */
export const defaultIntakeCompletedEmitter: IntakeCompletedEmitter = () => {
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.info(
      `[mariposa] ${INTAKE_COMPLETED_EVENT} — both intakes complete; no emitter wired yet`,
    );
  }
};

/**
 * Fire the completion event through the provided emitter (defaults to the
 * console/no-op emitter). This is the single function Person B re-targets at
 * Inngest; callers should route emission through it rather than calling an
 * emitter directly, so the seam stays in one place.
 */
export function emitIntakeCompleted(
  emit: IntakeCompletedEmitter = defaultIntakeCompletedEmitter,
): void | Promise<void> {
  return emit();
}

/**
 * Stateful wrapper around `reduceCompletion` for the UI. Feed it an update each
 * time a section's validity changes; it fires the injected emitter exactly once
 * when all required parts first become valid (Req 2.6, Property 12).
 */
export class IntakeCompletionGuard {
  private state: IntakeCompletionState = initialCompletionState();

  constructor(
    private readonly emitter: IntakeCompletedEmitter = defaultIntakeCompletedEmitter,
    private readonly required: readonly IntakePart[] = REQUIRED_PARTS,
  ) {}

  /**
   * Record a part's validity. Returns `true` iff this update caused the
   * one-and-only emission.
   */
  update(update: IntakeUpdate): boolean {
    const next = reduceCompletion(this.state, update, this.required);
    this.state = next.state;
    if (next.emit) {
      void emitIntakeCompleted(this.emitter);
    }
    return next.emit;
  }

  /** Whether the completion event has already fired (latched). */
  get hasEmitted(): boolean {
    return this.state.emitted;
  }

  /** The parts currently complete and valid. */
  get validParts(): IntakePart[] {
    return this.required.filter((part) => this.state.valid[part]);
  }
}
