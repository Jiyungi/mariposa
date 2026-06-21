import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/demo/insurance-flow/route";

describe("GET /api/demo/insurance-flow", () => {
  it("returns the local insurance flow demo result", async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.workflowName).toBe("mariposa-insurance-flow");
    expect(json.orchestrationMode).toBe("local");
    expect(json.coupleId).toBe("couple_001");
    expect(json.transcript.length).toBeGreaterThan(0);
    expect(json.insuranceResult.diagnostic_covered).toBe(true);
    expect(json.providers.model).toBe("mock");
    expect(json.fallbackFlags.localOrchestration).toBe(true);
    expect(json.memory).toEqual({
      written: false,
      eventId: null,
      redisKey: null,
    });
    expect(json.persistence.tasksAdded).toBeGreaterThan(0);
    expect(json.persistence.summaryUpdated).toBe(true);
  });
});
