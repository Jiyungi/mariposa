import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  traceAgentStep,
  traceModelCall,
  traceRetrieval,
} from "@/lib/observability/arize";
import { captureWorkflowError } from "@/lib/observability/sentry";

const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(() => "sentry-event-123"),
  setTag: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMock.captureException,
  withScope: (
    callback: (scope: {
      setTag: typeof sentryMock.setTag;
      setContext: typeof sentryMock.setContext;
    }) => string,
  ) =>
    callback({ setTag: sentryMock.setTag, setContext: sentryMock.setContext }),
}));

const ENV_KEYS = ["ENABLE_ARIZE", "ARIZE_API_KEY", "SENTRY_DSN"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  sentryMock.captureException.mockClear();
  sentryMock.setTag.mockClear();
  sentryMock.setContext.mockClear();

  for (const key of ENV_KEYS) {
    if (!(key in originalEnv)) originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("Arize observability hooks", () => {
  it("are no-op-safe when Arize is not configured", () => {
    expect(
      traceAgentStep({
        flow: "insurance-flow",
        coupleId: "couple_001",
        step: "run-session",
      }),
    ).toEqual({
      enabled: false,
      traceId: null,
      kind: "agent",
    });
  });

  it("return stable trace IDs when Arize is enabled", () => {
    process.env.ENABLE_ARIZE = "true";
    process.env.ARIZE_API_KEY = "arize-key";

    expect(
      traceRetrieval({
        flow: "insurance-flow",
        coupleId: "couple_001",
        step: "retrieve-context",
      }),
    ).toEqual({
      enabled: true,
      traceId: "mariposa:retrieval:insurance-flow:couple_001:retrieve-context",
      kind: "retrieval",
    });

    expect(
      traceModelCall({
        flow: "insurance-flow",
        coupleId: "couple_001",
        step: "extract-coverage",
      }).traceId,
    ).toBe("mariposa:model:insurance-flow:couple_001:extract-coverage");
  });
});

describe("Sentry observability hook", () => {
  it("captures error messages without throwing when Sentry is disabled", () => {
    expect(
      captureWorkflowError(new Error("call failed"), {
        flow: "insurance-flow",
        step: "run-session",
      }),
    ).toEqual({
      enabled: false,
      eventId: null,
      message: "call failed",
    });
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("captures exceptions with workflow tags when Sentry is enabled", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1";

    expect(
      captureWorkflowError("bad payload", {
        flow: "insurance-flow",
        step: "extract-coverage",
      }),
    ).toEqual({
      enabled: true,
      eventId: "sentry-event-123",
      message: "bad payload",
    });
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(sentryMock.setTag).toHaveBeenCalledWith("app", "mariposa");
    expect(sentryMock.setTag).toHaveBeenCalledWith("flow", "insurance-flow");
    expect(sentryMock.setTag).toHaveBeenCalledWith("step", "extract-coverage");
    expect(sentryMock.setContext).toHaveBeenCalledWith("workflow", {
      flow: "insurance-flow",
      step: "extract-coverage",
    });
  });
});
