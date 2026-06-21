import {
  hasAgentspanModelCredential,
  hasGrokApiKey,
  hasRedisConfig,
  isAgentspanEnabled,
  isAgentspanOptedIn,
  isAnthropicEnabled,
  isArizeEnabled,
  isBrowserbaseEnabled,
  isDeepgramVoiceEnabled,
  isGrokVoiceEnabled,
  isPublicAppBaseUrl,
  isSentryEnabled,
  parseBooleanEnv,
  resolveAnthropicApiKey,
  resolveAppBaseUrl,
  resolveDeepgramApiKey,
} from "@/lib/config";

export type IntegrationMode = "live" | "fallback" | "disabled";

export interface IntegrationStatus {
  name: string;
  mode: IntegrationMode;
  detail: string;
}

export interface MariposaEnvStatus {
  integrations: IntegrationStatus[];
  warnings: string[];
  presenterNotes: string[];
}

function pushWarning(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

export function describeMariposaEnv(
  env: NodeJS.ProcessEnv = process.env,
): MariposaEnvStatus {
  const warnings: string[] = [];
  const integrations: IntegrationStatus[] = [];

  const anthropicKey = resolveAnthropicApiKey(env);
  const deepgramKey = resolveDeepgramApiKey(env);
  const deepgramOptIn = parseBooleanEnv(env.USE_DEEPGRAM_VOICE);
  const grokKey = hasGrokApiKey(env);
  const redisConfigured = hasRedisConfig(env);

  integrations.push({
    name: "Orchestration",
    mode:
      isAgentspanEnabled(env) && hasAgentspanModelCredential(env)
        ? "live"
        : "fallback",
    detail: isAgentspanEnabled(env)
      ? hasAgentspanModelCredential(env)
        ? "Agentspan orchestration when the local server is healthy"
        : "Agentspan opted in, but ANTHROPIC_API_KEY or OPENAI_API_KEY is missing"
      : "Local mariposa-insurance-flow runner",
  });

  integrations.push({
    name: "Retrieval",
    mode: redisConfigured ? "live" : "fallback",
    detail: redisConfigured
      ? "Redis vector search when seeded via npm run seed:redis"
      : "Local keyword retrieval fallback",
  });

  integrations.push({
    name: "Voice / transcript",
    mode: isGrokVoiceEnabled(env) ? "live" : "fallback",
    detail: isDeepgramVoiceEnabled(env)
      ? "Deepgram audio upload route is configured; default demo uses deterministic transcript unless audio is uploaded"
      : isGrokVoiceEnabled(env)
        ? "Grok Voice fallback path"
        : "Deterministic transcript fallback",
  });

  integrations.push({
    name: "Model extraction",
    mode: isAnthropicEnabled(env) ? "live" : "fallback",
    detail: isAnthropicEnabled(env)
      ? "Claude JSON extraction"
      : "Deterministic mock provider",
  });

  integrations.push({
    name: "Portal verification",
    mode: isBrowserbaseEnabled(env)
      ? isPublicAppBaseUrl(resolveAppBaseUrl(env))
        ? "live"
        : "fallback"
      : "fallback",
    detail: isBrowserbaseEnabled(env)
      ? isPublicAppBaseUrl(resolveAppBaseUrl(env))
        ? "Browserbase Fetch API against the synthetic member portal"
        : "Browserbase keyed, but NEXT_PUBLIC_APP_URL is local — portal snapshot fallback"
      : "Synthetic Pacific Crest portal snapshot only",
  });

  integrations.push({
    name: "Agent memory",
    mode: redisConfigured ? "live" : "disabled",
    detail: redisConfigured
      ? "Writes mariposa:memory:{coupleId} after extraction"
      : "Skipped without REDIS_URL",
  });

  integrations.push({
    name: "Arize tracing",
    mode: isArizeEnabled(env) ? "live" : "disabled",
    detail: isArizeEnabled(env)
      ? "Trace hooks enabled (local metadata today)"
      : "No-op trace metadata",
  });

  integrations.push({
    name: "Sentry errors",
    mode: isSentryEnabled(env) ? "live" : "disabled",
    detail: isSentryEnabled(env)
      ? "Server-side Sentry capture enabled for workflow/API errors"
      : "No-op error metadata",
  });

  if (parseBooleanEnv(env.USE_MOCK_AI) && anthropicKey) {
    pushWarning(
      warnings,
      "ANTHROPIC_API_KEY is set but USE_MOCK_AI=true forces the mock model.",
    );
  }

  if (parseBooleanEnv(env.USE_MOCK_AI) && deepgramKey && deepgramOptIn) {
    pushWarning(
      warnings,
      "DEEPGRAM_API_KEY is set but USE_MOCK_AI=true disables the Deepgram voice path.",
    );
  }

  if (deepgramKey && deepgramOptIn && grokKey && isGrokVoiceEnabled(env)) {
    pushWarning(
      warnings,
      "Both Deepgram and Grok Voice are configured; insurance calls prefer Deepgram.",
    );
  }

  if (isAgentspanOptedIn(env) && !hasAgentspanModelCredential(env)) {
    pushWarning(
      warnings,
      "USE_AGENTSPAN/USE_ORKES is enabled but no Agentspan model credential is set (ANTHROPIC_API_KEY or OPENAI_API_KEY).",
    );
  }

  if (parseBooleanEnv(env.USE_AGENTSPAN) || parseBooleanEnv(env.USE_ORKES)) {
    if (!parseBooleanEnv(env.USE_AGENTSPAN) && parseBooleanEnv(env.USE_ORKES)) {
      pushWarning(
        warnings,
        "USE_ORKES is legacy naming; prefer USE_AGENTSPAN=true for Agentspan orchestration.",
      );
    }
  }

  if (parseBooleanEnv(env.USE_AGENTPHONE) && isGrokVoiceEnabled(env)) {
    pushWarning(
      warnings,
      "USE_AGENTPHONE=true is ignored while Grok Voice is enabled.",
    );
  }

  const presenterNotes = [
    "Open /demo/insurance-flow for the visual demo or /api/demo/insurance-flow for JSON.",
    "Run npm run demo:insurance-flow for a credential-free CLI summary.",
    ...integrations.map(
      (item) =>
        `${item.name}: ${item.mode === "live" ? "LIVE" : item.mode === "fallback" ? "FALLBACK" : "OFF"} — ${item.detail}`,
    ),
  ];

  if (warnings.length > 0) {
    presenterNotes.push(
      "Call out env warnings before judging so sponsors know which paths are intentionally disabled.",
    );
  } else if (integrations.every((item) => item.mode !== "live")) {
    presenterNotes.push(
      "This run uses deterministic fallbacks only; sponsor credentials are not required.",
    );
  }

  return { integrations, warnings, presenterNotes };
}
