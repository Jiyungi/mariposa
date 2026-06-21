// ===========================================================================
// Inngest barrel (lib/inngest/index.ts) — Req 7, 17, 18, 19
//
// Public surface for the Inngest layer: the client + workflow-event constants,
// the reactive-graph function(s) served by /api/inngest, and the plain testable
// pipeline + its types.
// ===========================================================================

export {
  inngest,
  INTAKE_COMPLETED_EVENT,
  CALL_COMPLETED_EVENT,
  BOOKING_APPROVED_EVENT,
  CHECKIN_DUE_EVENT,
  type IntakeCompletedEventData,
  type CallCompletedEventData,
  type BookingApprovedEventData,
  type CheckinDueEventData,
} from "./client";

export {
  mariposaIntakeWorkflow,
  reactiveSummaryFunction,
  functions,
} from "./functions";

export {
  runMariposaWorkflow,
  defaultWorkflowDeps,
  refreshDoctorSummaryFromCall,
  handleCheckinDue,
  buildAuthPacket,
  deriveRedFlags,
  buildPrepTasks,
  MariposaWorkflowError,
  WORKFLOW_STEPS,
  BRANCH_GROUPS,
  BOOKING_DATE,
  DEFAULT_CHECKIN_DELAY,
  CHECKIN_HORIZON_LABEL,
  stepAnalyzeHer,
  stepAnalyzeHis,
  stepComputeTryingWindow,
  stepDetectMissingData,
  stepCheckDurationRule,
  stepGenerateTasks,
  stepInsuranceCall,
  stepClinicCall,
  stepFinalizeBooking,
  stepScheduleCheckin,
  stepBuildDoctorSummary,
  type WorkflowStepName,
  type StepRunner,
  type WorkflowDeps,
  type WorkflowContext,
  type WorkflowResult,
  type CallsOutput,
  type DoctorSummary,
  type HerAnalysis,
  type HisAnalysis,
  type ApprovalOutcome,
  type ApprovalContext,
  type CheckinResult,
  type CheckinHandlerDb,
} from "./workflow";
