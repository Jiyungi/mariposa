import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runInsuranceFlow } from "@/lib/orkes/insurance-flow";
import * as agentspanServer from "@/lib/orkes/agentspan-server";
import * as agentspanFlow from "@/lib/orkes/agentspan-insurance-flow";

const ENV_KEYS = [
  "USE_AGENTSPAN",
  "USE_ORKES",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    if (!(key in originalEnv)) originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("runInsuranceFlow() Agentspan routing", () => {
  it("falls back to local orchestration when Agentspan is disabled", async () => {
    const result = await runInsuranceFlow();

    expect(result.orchestrationMode).toBe("local");
    expect(result.fallbackFlags.localOrchestration).toBe(true);
  });

  it("uses Agentspan when enabled, healthy, and a model credential is present", async () => {
    process.env.USE_AGENTSPAN = "true";
    process.env.OPENAI_API_KEY = "openai-key";

    vi.spyOn(agentspanServer, "checkAgentspanServerHealth").mockResolvedValue(true);
    vi.spyOn(agentspanFlow, "runInsuranceFlowViaAgentspan").mockResolvedValue({
      coupleId: "couple_001",
      workflowName: "mariposa-insurance-flow",
      orchestrationMode: "agentspan",
      transcript: [],
      insuranceResult: {
        diagnostic_covered: true,
        semen_analysis_covered: true,
        hormone_labs_covered: true,
        prior_auth_required_for: [],
        in_network_lab: "Crest Diagnostics",
        deductible: 1500,
        coinsurance_pct: 20,
        oop_max: 4000,
        referral_required: false,
        follow_up_tasks: ["Task"],
      },
      retrieval: { mode: "keyword", chunkCount: 8 },
      providers: {
        voice: "deterministic-fallback",
        model: "mock",
        web: "portal-snapshot",
      },
      fallbackFlags: {
        localOrchestration: false,
        deterministicTranscript: true,
        deterministicModel: true,
        deterministicPortal: true,
      },
      webVerification: {
        mode: "fallback-snapshot",
        url: null,
        statusCode: null,
        excerpt: "Synthetic portal snapshot",
      },
      memory: { written: false, eventId: null, redisKey: null },
      persistence: {
        callRecordId: "call_couple_001_mariposa_insurance_flow",
        tasksAdded: 1,
        summaryUpdated: true,
      },
      traces: [],
      agentspan: {
        executionId: "exec_123",
        serverUrl: "http://localhost:6767/api",
        uiUrl: "http://localhost:6767",
      },
    });

    const result = await runInsuranceFlow();

    expect(result.orchestrationMode).toBe("agentspan");
    expect(result.agentspan?.executionId).toBe("exec_123");
    expect(result.fallbackFlags.localOrchestration).toBe(false);
  });
});
