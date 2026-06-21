import { INSURANCE_RESULT } from "@/lib/reference";
import type { AiJsonProvider, GenerateJsonInput } from "@/lib/ai/provider";

export function createMockAiProvider(): AiJsonProvider {
  return {
    name: "mock",
    async generateJson<T>(input: GenerateJsonInput): Promise<T> {
      if (input.schemaName === "InsuranceResult") {
        return structuredClone(INSURANCE_RESULT) as T;
      }

      throw new Error(`No mock AI response configured for ${input.schemaName}`);
    },
  };
}
