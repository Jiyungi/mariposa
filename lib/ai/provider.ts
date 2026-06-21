import {
  isAnthropicEnabled,
  resolveAnthropicApiKey,
  resolveAnthropicModel,
} from "@/lib/config";
import { createClaudeProvider } from "@/lib/ai/claude";
import { createMockAiProvider } from "@/lib/ai/mock";

export interface GenerateJsonInput {
  schemaName: string;
  system: string;
  prompt: string;
  temperature?: number;
}

export interface AiJsonProvider {
  readonly name: "claude" | "mock";
  generateJson<T>(input: GenerateJsonInput): Promise<T>;
}

export function createAiJsonProvider(
  env: NodeJS.ProcessEnv = process.env,
): AiJsonProvider {
  if (isAnthropicEnabled(env)) {
    const apiKey = resolveAnthropicApiKey(env);
    if (apiKey) {
      return createClaudeProvider({
        apiKey,
        model: resolveAnthropicModel(env),
      });
    }
  }

  return createMockAiProvider();
}
