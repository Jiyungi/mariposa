import { describe, expect, it } from "vitest";

import {
  INSURANCE_FLOW_NAME,
  runInsuranceFlow,
} from "@/lib/orkes/insurance-flow";
import { INSURANCE_RESULT } from "@/lib/reference";

describe("runInsuranceFlow()", () => {
  it("runs locally without sponsor credentials through deterministic fallbacks", async () => {
    const result = await runInsuranceFlow();

    expect(result.workflowName).toBe(INSURANCE_FLOW_NAME);
    expect(result.orchestrationMode).toBe("local");
    expect(result.coupleId).toBe("couple_001");
    expect(result.transcript.length).toBeGreaterThan(0);
    expect(result.insuranceResult).toEqual(INSURANCE_RESULT);
    expect(["keyword", "vector"]).toContain(result.retrieval.mode);
    expect(result.retrieval.chunkCount).toBeGreaterThan(0);
    expect(result.providers).toEqual({
      voice: "deterministic-fallback",
      model: "mock",
      web: "portal-snapshot",
    });
    expect(result.fallbackFlags).toEqual({
      localOrchestration: true,
      deterministicTranscript: true,
      deterministicModel: true,
      deterministicPortal: true,
    });
    expect(result.memory).toEqual({
      written: false,
      eventId: null,
      redisKey: null,
    });
    expect(result.persistence.tasksAdded).toBe(
      result.insuranceResult.follow_up_tasks.length,
    );
    expect(result.persistence.summaryUpdated).toBe(true);
    expect(result.persistence.callRecordId).toBe(
      "call_couple_001_mariposa_insurance_flow",
    );
    expect(result.traces.map((trace) => trace.kind)).toEqual([
      "retrieval",
      "agent",
      "agent",
      "model",
    ]);
    expect(result.webVerification.mode).toBe("fallback-snapshot");
    expect(result.providers.web).toBe("portal-snapshot");
    expect(result.fallbackFlags.deterministicPortal).toBe(true);
  });

  it("marks provided transcript payloads as Deepgram transcript input", async () => {
    const result = await runInsuranceFlow({
      transcriptPayload: "Agent: Hi\nResponder: Diagnostic coverage is covered.",
    });

    expect(result.providers.voice).toBe("deepgram-transcript");
    expect(result.fallbackFlags.deterministicTranscript).toBe(false);
  });
});
