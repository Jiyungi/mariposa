import { isSentryEnabled } from "@/lib/config";

export interface CapturedWorkflowError {
  enabled: boolean;
  eventId: string | null;
  message: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function stableEventId(message: string, context?: Record<string, unknown>): string {
  const flow = typeof context?.flow === "string" ? context.flow : "local";
  const step = typeof context?.step === "string" ? context.step : "unknown";
  return `mariposa:error:${flow}:${step}:${message}`
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 160);
}

export function captureWorkflowError(
  error: unknown,
  context?: Record<string, unknown>,
): CapturedWorkflowError {
  const message = errorMessage(error);
  const enabled = isSentryEnabled();

  return {
    enabled,
    eventId: enabled ? stableEventId(message, context) : null,
    message,
  };
}
