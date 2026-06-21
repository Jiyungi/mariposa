import { describe, expect, it } from "vitest";

import { extractInsuranceWithAi } from "@/lib/ai/insurance-extraction";
import { createMockAiProvider } from "@/lib/ai/mock";
import type { AiJsonProvider, GenerateJsonInput } from "@/lib/ai/provider";
import { mockInsuranceCall } from "@/lib/agent/mock-fallback";
import { INSURANCE_RESULT, SEED_AUTH_PACKET } from "@/lib/reference";

describe("extractInsuranceWithAi()", () => {
  it("uses the provider seam to return a validated InsuranceResult", async () => {
    await expect(
      extractInsuranceWithAi({
        transcript: mockInsuranceCall(SEED_AUTH_PACKET).transcript,
        provider: createMockAiProvider(),
      }),
    ).resolves.toEqual({
      result: INSURANCE_RESULT,
      provider: "mock",
    });
  });

  it("passes transcript and reference context into the provider prompt", async () => {
    const calls: GenerateJsonInput[] = [];
    const provider: AiJsonProvider = {
      name: "mock",
      async generateJson<T>(input: GenerateJsonInput): Promise<T> {
        calls.push(input);
        return INSURANCE_RESULT as T;
      },
    };

    await extractInsuranceWithAi({
      transcript: [{ speaker: "responder", text: "Deductible: $1,500" }],
      context: "CPT 89320 is semen analysis.",
      provider,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].schemaName).toBe("InsuranceResult");
    expect(calls[0].prompt).toContain("Reference context:");
    expect(calls[0].prompt).toContain("CPT 89320 is semen analysis.");
    expect(calls[0].prompt).toContain("RESPONDER: Deductible: $1,500");
  });

  it("rejects malformed provider JSON before returning a result", async () => {
    const provider: AiJsonProvider = {
      name: "mock",
      async generateJson<T>(): Promise<T> {
        return { diagnostic_covered: true } as T;
      },
    };

    await expect(
      extractInsuranceWithAi({
        transcript: [],
        provider,
      }),
    ).rejects.toThrow();
  });
});
