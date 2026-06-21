// ===========================================================================
// Inngest reactive-graph functions (lib/inngest/functions.ts) — Req 7, 17, 18, 19
//
// THIN wrappers over the plain, fully-testable pipeline in ./workflow. The main
// function is triggered by `fertility.intake.completed` and drives the reactive
// graph by injecting the Inngest step primitives behind the workflow's
// injectable deps:
//   - runStep            → step.run (durable per-step execution, Req 7.5)
//   - awaitBookingApproval → step.waitForEvent('couple.booking.approved') (Req 17)
//   - sleep              → step.sleep (scheduled Check_In, Req 18)
//   - emitCallCompleted  → step.sendEvent('call.completed') (Req 7.10, 19)
//   - emitCheckinDue     → step.sendEvent('checkin.due') + create the task (Req 18.4)
//
// A SECOND, decoupled function (`reactiveSummaryFunction`) reacts to
// `call.completed` and refreshes the grounded Doctor_Summary (Req 19.2, 19.3).
//
// No running Inngest dev server or network is required to TEST the logic —
// tests call runMariposaWorkflow directly with mocked deps.
// ===========================================================================

import {
  inngest,
  INTAKE_COMPLETED_EVENT,
  CALL_COMPLETED_EVENT,
  BOOKING_APPROVED_EVENT,
  CHECKIN_DUE_EVENT,
  type IntakeCompletedEventData,
  type CallCompletedEventData,
} from "./client";
import {
  runMariposaWorkflow,
  refreshDoctorSummaryFromCall,
  defaultWorkflowDeps,
  DEFAULT_CHECKIN_DELAY,
  type ApprovalOutcome,
  type StepRunner,
  type WorkflowDeps,
} from "./workflow";

/** Configurable demo-short Approval_Gate timeout (Req 17.6). */
const APPROVAL_WAIT_TIMEOUT = process.env.APPROVAL_WAIT_TIMEOUT ?? "5m";

export const mariposaIntakeWorkflow = inngest.createFunction(
  { id: "mariposa-intake-workflow", name: "Mariposa intake → reactive graph" },
  { event: INTAKE_COMPLETED_EVENT },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as Partial<IntakeCompletedEventData>;
    const coupleId = data.coupleId ?? "couple_001";

    const base = defaultWorkflowDeps();

    // Back each step with a durable Inngest step (Req 7.5). Each pair member
    // gets its own step id so concurrent branches persist independent status.
    const runStep: StepRunner = <T>(name: string, body: () => Promise<T>) =>
      step.run(name, body) as unknown as Promise<T>;

    // Approval_Gate: pause until couple.booking.approved or the wait expires.
    const awaitBookingApproval = async (): Promise<ApprovalOutcome> => {
      const received = await step.waitForEvent("await-booking-approved", {
        event: BOOKING_APPROVED_EVENT,
        timeout: APPROVAL_WAIT_TIMEOUT,
        match: "data.coupleId",
      });
      return { approved: received !== null, timedOut: received === null };
    };

    // Scheduled Check_In delay (Req 18.1, 18.5).
    const sleep = async (token: string): Promise<void> => {
      await step.sleep("checkin-delay", token || DEFAULT_CHECKIN_DELAY);
    };

    // Emit call.completed per finished call → drives the reactive summary (Req 7.10).
    const emitCallCompleted: WorkflowDeps["emitCallCompleted"] = async (
      cid,
      callType,
      output,
    ) => {
      await step.sendEvent(`emit-call-completed-${callType}`, {
        name: CALL_COMPLETED_EVENT,
        data: {
          coupleId: cid,
          callType,
          usedFallback: output.usedFallback,
          result: output.result,
        } satisfies CallCompletedEventData,
      });
    };

    // Emit checkin.due and create the His re-test task + reminder (Req 18.3, 18.4).
    const emitCheckinDue: WorkflowDeps["emitCheckinDue"] = async (
      cid,
      delayToken,
      existingTasks,
    ) => {
      await step.sendEvent("emit-checkin-due", {
        name: CHECKIN_DUE_EVENT,
        data: { coupleId: cid },
      });
      return base.emitCheckinDue(cid, delayToken, existingTasks);
    };

    const { run } = await runMariposaWorkflow(coupleId, {
      runStep,
      awaitBookingApproval,
      sleep,
      emitCallCompleted,
      emitCheckinDue,
    });

    return {
      coupleId,
      status: run.status,
      approvalState: run.approvalState,
      steps: run.steps,
    };
  },
);

/**
 * Reactive_Summary_Function (Req 19.2, 19.3) — a SEPARATE Inngest function,
 * decoupled from the main run, that listens for `call.completed` and refreshes
 * the grounded Doctor_Summary using that call's extracted result. Grounds every
 * statement only in the call result and omits anything absent (Req 19.5).
 */
export const reactiveSummaryFunction = inngest.createFunction(
  { id: "mariposa-reactive-summary", name: "Mariposa reactive Doctor_Summary refresh" },
  { event: CALL_COMPLETED_EVENT },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as Partial<CallCompletedEventData>;
    if (!data.coupleId || !data.callType || !data.result) {
      return { refreshed: false };
    }

    const summary = await step.run("refresh-doctor-summary", () =>
      refreshDoctorSummaryFromCall(data.coupleId!, data.callType!, data.result!),
    );

    return { refreshed: true, coupleId: data.coupleId, callType: data.callType, summary };
  },
);

/** All Inngest functions served by the /api/inngest endpoint. */
export const functions = [mariposaIntakeWorkflow, reactiveSummaryFunction];
