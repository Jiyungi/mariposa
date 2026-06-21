// ===========================================================================
// Unit test — Feature: mariposa, Task 19.4: key resolution.
//
//   Asserts correct behavior of lib/config.ts across ALL XAI_API_KEY /
//   GROK_API_KEY presence combinations, plus the derived Mock_Fallback
//   forcing and the typed getConfig() view.
//
// Validates: Requirement 15.4
//
// Strategy: example-based (no fast-check). Each case snapshots and restores
// the three relevant env vars (XAI_API_KEY, GROK_API_KEY, USE_MOCK_AI) so the
// suite is fully isolated and never leaks state into other tests.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveGrokApiKey,
  isMockFallbackForced,
  getConfig,
  isAnthropicEnabled,
  isArizeEnabled,
  isDeepgramVoiceEnabled,
  isOrkesEnabled,
  isSentryEnabled,
  resolveOrkesBaseUrl,
} from "@/lib/config";

const ENV_KEYS = [
  "XAI_API_KEY",
  "GROK_API_KEY",
  "USE_MOCK_AI",
  "ANTHROPIC_API_KEY",
  "DEEPGRAM_API_KEY",
  "USE_DEEPGRAM_VOICE",
  "USE_ORKES",
  "USE_AGENTSPAN",
  "ORKES_API_KEY",
  "ORKES_BASE_URL",
  "AGENTSPAN_SERVER_URL",
  "AGENTSPAN_API_KEY",
  "ENABLE_ARIZE",
  "ARIZE_API_KEY",
  "SENTRY_DSN",
] as const;

// Snapshot of the original environment for the whole suite, restored at the end.
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  // Start every case from a known-clean slate: capture then delete each var.
  for (const key of ENV_KEYS) {
    if (!(key in originalEnv)) {
      originalEnv[key] = process.env[key];
    }
    delete process.env[key];
  }
});

afterEach(() => {
  // Restore exactly what was there before each case so nothing leaks.
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe("resolveGrokApiKey() — XAI_API_KEY / GROK_API_KEY truth table", () => {
  it("case 1: both unset => null", () => {
    expect(resolveGrokApiKey()).toBeNull();
  });

  it("case 2: only XAI_API_KEY set => returns the XAI value", () => {
    process.env.XAI_API_KEY = "xai-key-123";
    expect(resolveGrokApiKey()).toBe("xai-key-123");
  });

  it("case 3: only GROK_API_KEY set => returns the GROK value (fallback)", () => {
    process.env.GROK_API_KEY = "grok-key-456";
    expect(resolveGrokApiKey()).toBe("grok-key-456");
  });

  it("case 4: both set => returns the XAI value (XAI precedence)", () => {
    process.env.XAI_API_KEY = "xai-key-123";
    process.env.GROK_API_KEY = "grok-key-456";
    expect(resolveGrokApiKey()).toBe("xai-key-123");
  });

  it("case 5: XAI_API_KEY blank/whitespace + GROK set => falls back to GROK", () => {
    process.env.XAI_API_KEY = "   ";
    process.env.GROK_API_KEY = "grok-key-456";
    expect(resolveGrokApiKey()).toBe("grok-key-456");
  });

  it("case 6: both blank/whitespace => null", () => {
    process.env.XAI_API_KEY = "   ";
    process.env.GROK_API_KEY = "\t\n  ";
    expect(resolveGrokApiKey()).toBeNull();
  });
});

describe("isMockFallbackForced()", () => {
  it("is true when no key resolves (case 1: both unset)", () => {
    expect(isMockFallbackForced()).toBe(true);
  });

  it("is true when no key resolves (case 6: both blank/whitespace)", () => {
    process.env.XAI_API_KEY = "   ";
    process.env.GROK_API_KEY = "   ";
    expect(isMockFallbackForced()).toBe(true);
  });

  it("is false when a key resolves and USE_MOCK_AI is unset", () => {
    process.env.XAI_API_KEY = "xai-key-123";
    expect(isMockFallbackForced()).toBe(false);
  });

  it('is true when a key resolves but USE_MOCK_AI="true"', () => {
    process.env.GROK_API_KEY = "grok-key-456";
    process.env.USE_MOCK_AI = "true";
    expect(isMockFallbackForced()).toBe(true);
  });

  it('is true when a key resolves but USE_MOCK_AI="1"', () => {
    process.env.XAI_API_KEY = "xai-key-123";
    process.env.USE_MOCK_AI = "1";
    expect(isMockFallbackForced()).toBe(true);
  });

  it('is true when a key resolves but USE_MOCK_AI="yes"', () => {
    process.env.XAI_API_KEY = "xai-key-123";
    process.env.USE_MOCK_AI = "yes";
    expect(isMockFallbackForced()).toBe(true);
  });
});

describe("getConfig()", () => {
  it("reflects no key (both unset): null key + forced fallback", () => {
    expect(getConfig()).toMatchObject({
      grokApiKey: null,
      useMockFallback: true,
    });
  });

  it("reflects resolved XAI key with fallback off", () => {
    process.env.XAI_API_KEY = "xai-key-123";
    expect(getConfig()).toMatchObject({
      grokApiKey: "xai-key-123",
      useMockFallback: false,
    });
  });

  it("reflects GROK fallback key with fallback off", () => {
    process.env.GROK_API_KEY = "grok-key-456";
    expect(getConfig()).toMatchObject({
      grokApiKey: "grok-key-456",
      useMockFallback: false,
    });
  });

  it("reflects resolved key but forced fallback via USE_MOCK_AI", () => {
    process.env.XAI_API_KEY = "xai-key-123";
    process.env.USE_MOCK_AI = "true";
    expect(getConfig()).toMatchObject({
      grokApiKey: "xai-key-123",
      useMockFallback: true,
    });
  });
});

describe("sponsor config helpers", () => {
  it("enable Anthropic only when a key is present and mock AI is not forced", () => {
    expect(isAnthropicEnabled()).toBe(false);

    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    expect(isAnthropicEnabled()).toBe(true);

    process.env.USE_MOCK_AI = "true";
    expect(isAnthropicEnabled()).toBe(false);
  });

  it("enable Deepgram only when opted in, keyed, and mock AI is not forced", () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-key";
    expect(isDeepgramVoiceEnabled()).toBe(false);

    process.env.USE_DEEPGRAM_VOICE = "true";
    expect(isDeepgramVoiceEnabled()).toBe(true);

    process.env.USE_MOCK_AI = "true";
    expect(isDeepgramVoiceEnabled()).toBe(false);
  });

  it("enable Orkes/Agentspan when opted in", () => {
    expect(isOrkesEnabled()).toBe(false);

    process.env.USE_ORKES = "true";
    expect(isOrkesEnabled()).toBe(true);

    process.env.USE_AGENTSPAN = "true";
    process.env.USE_ORKES = "false";
    expect(isOrkesEnabled()).toBe(true);
  });

  it("resolve Agentspan server URL with local default", () => {
    delete process.env.AGENTSPAN_SERVER_URL;
    delete process.env.ORKES_BASE_URL;
    expect(resolveOrkesBaseUrl()).toBe("http://localhost:6767");
  });

  it("enable Arize only when opted in with an API key", () => {
    process.env.ARIZE_API_KEY = "arize-key";
    expect(isArizeEnabled()).toBe(false);

    process.env.ENABLE_ARIZE = "true";
    expect(isArizeEnabled()).toBe(true);
  });

  it("enable Sentry when a DSN is present", () => {
    expect(isSentryEnabled()).toBe(false);

    process.env.SENTRY_DSN = "https://example@sentry.io/1";
    expect(isSentryEnabled()).toBe(true);
  });
});
