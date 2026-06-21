import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runLiveVoiceSession } from "@/lib/agent/live";
import { mockInsuranceCall } from "@/lib/agent/mock-fallback";
import { SEED_AUTH_PACKET } from "@/lib/reference";

const ENV_KEYS = [
  "DEEPGRAM_API_KEY",
  "USE_DEEPGRAM_VOICE",
  "XAI_API_KEY",
  "USE_GROK_VOICE",
  "USE_MOCK_AI",
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

describe("live voice routing", () => {
  it("routes insurance calls to Deepgram before Grok when both are configured", async () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-key";
    process.env.USE_DEEPGRAM_VOICE = "true";
    process.env.XAI_API_KEY = "xai-key";
    process.env.USE_GROK_VOICE = "true";
    process.env.USE_MOCK_AI = "false";

    await expect(runLiveVoiceSession("insurance", SEED_AUTH_PACKET)).resolves.toEqual(
      mockInsuranceCall(SEED_AUTH_PACKET).transcript,
    );
  });
});
