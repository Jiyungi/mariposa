import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { describeMariposaEnv } from "@/lib/config/env-status";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "DEEPGRAM_API_KEY",
  "USE_DEEPGRAM_VOICE",
  "USE_MOCK_AI",
  "USE_ORKES",
  "ORKES_API_KEY",
  "ORKES_BASE_URL",
  "REDIS_URL",
  "REDIS_VECTOR_INDEX",
  "ENABLE_ARIZE",
  "ARIZE_API_KEY",
  "SENTRY_DSN",
  "XAI_API_KEY",
  "USE_GROK_VOICE",
  "USE_AGENTPHONE",
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
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

describe("describeMariposaEnv()", () => {
  it("reports fallback-only mode with no credentials", () => {
    const status = describeMariposaEnv();

    expect(status.integrations.map((item) => item.name)).toEqual([
      "Orchestration",
      "Retrieval",
      "Voice / transcript",
      "Model extraction",
      "Portal verification",
      "Agent memory",
      "Arize tracing",
      "Sentry errors",
    ]);
    expect(status.integrations.find((item) => item.name === "Orchestration")?.mode).toBe(
      "fallback",
    );
    expect(status.integrations.find((item) => item.name === "Model extraction")?.mode).toBe(
      "fallback",
    );
    expect(status.warnings).toEqual([]);
    expect(status.presenterNotes.some((note) => note.includes("deterministic fallbacks"))).toBe(
      true,
    );
  });

  it("warns when Anthropic is configured but mock AI is forced", () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    process.env.USE_MOCK_AI = "true";

    const status = describeMariposaEnv();

    expect(status.warnings).toContain(
      "ANTHROPIC_API_KEY is set but USE_MOCK_AI=true forces the mock model.",
    );
    expect(status.integrations.find((item) => item.name === "Model extraction")?.mode).toBe(
      "fallback",
    );
  });

  it("marks live orchestration when Agentspan is opted in with a model credential", () => {
    process.env.USE_AGENTSPAN = "true";
    process.env.OPENAI_API_KEY = "openai-key";

    const status = describeMariposaEnv();

    expect(status.integrations.find((item) => item.name === "Orchestration")?.mode).toBe(
      "live",
    );
  });
});
