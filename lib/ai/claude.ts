import type { AiJsonProvider, GenerateJsonInput } from "@/lib/ai/provider";

export interface ClaudeProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ClaudeMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

export function createClaudeProvider(config: ClaudeProviderConfig): AiJsonProvider {
  const baseUrl = (config.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    name: "claude",
    async generateJson<T>(input: GenerateJsonInput): Promise<T> {
      const res = await fetchImpl(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1200,
          temperature: input.temperature ?? 0,
          system: `${input.system}\nReturn only valid JSON for ${input.schemaName}.`,
          messages: [{ role: "user", content: input.prompt }],
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Claude JSON generation failed (${res.status}): ${detail.slice(0, 200)}`);
      }

      const json = (await res.json()) as ClaudeMessageResponse;
      const text = json.content?.find((part) => part.type === "text" && part.text)?.text;
      if (!text) throw new Error("Claude JSON generation returned empty content");

      return parseJsonContent(text) as T;
    },
  };
}
