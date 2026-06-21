import * as Sentry from "@sentry/nextjs";

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

function normalizeError(error: unknown, message: string): Error {
  if (error instanceof Error) return error;
  return new Error(message);
}

function setWorkflowScope(
  scope: Sentry.Scope,
  context?: Record<string, unknown>,
): void {
  scope.setTag("app", "mariposa");

  for (const [key, value] of Object.entries(context ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      scope.setTag(key, String(value));
    }
  }

  if (context) {
    scope.setContext("workflow", context);
  }
}

export function captureWorkflowError(
  error: unknown,
  context?: Record<string, unknown>,
): CapturedWorkflowError {
  const message = errorMessage(error);
  const enabled = isSentryEnabled();
  let eventId: string | null = null;

  if (enabled) {
    eventId = Sentry.withScope((scope) => {
      setWorkflowScope(scope, context);
      return Sentry.captureException(normalizeError(error, message));
    });
  }

  return {
    enabled,
    eventId: eventId ?? (enabled ? stableEventId(message, context) : null),
    message,
  };
}
