import { describe, expect, it } from "vitest";
import { INSURANCE_RESULT } from "@/lib/reference";
import type { InsuranceResult } from "@/lib/types";
import { createClaudeProvider } from "@/lib/ai/claude";
import { createAiJsonProvider } from "@/lib/ai/provider";

const baseInput = {
  schemaName: "InsuranceResult",
  system: "Extract insurance coverage facts.",
  prompt: "Transcript text",
};

describe("createAiJsonProvider()", () => {
  it("uses the deterministic mock provider when Anthropic is not configured", async () => {
    const provider = createAiJsonProvider({ NODE_ENV: "test" });

    expect(provider.name).toBe("mock");
    await expect(provider.generateJson<InsuranceResult>(baseInput)).resolves.toEqual(
      INSURANCE_RESULT,
    );
  });

  it("uses the deterministic mock provider when USE_MOCK_AI is true", () => {
    const provider = createAiJsonProvider({
      NODE_ENV: "test",
      ANTHROPIC_API_KEY: "anthropic-key",
      USE_MOCK_AI: "true",
    });

    expect(provider.name).toBe("mock");
  });

  it("uses Claude when Anthropic is configured and mock AI is not forced", () => {
    const provider = createAiJsonProvider({
      NODE_ENV: "test",
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_MODEL: "claude-test-model",
    });

    expect(provider.name).toBe("claude");
  });
});

describe("createClaudeProvider()", () => {
  it("posts a Messages API request and parses JSON text", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify(INSURANCE_RESULT) }],
        }),
        { status: 200 },
      );
    };

    const provider = createClaudeProvider({
      apiKey: "anthropic-key",
      model: "claude-test-model",
      baseUrl: "https://anthropic.test/v1/",
      fetchImpl,
    });

    await expect(provider.generateJson<InsuranceResult>(baseInput)).resolves.toEqual(
      INSURANCE_RESULT,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://anthropic.test/v1/messages");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": "anthropic-key",
    });
  });
});
