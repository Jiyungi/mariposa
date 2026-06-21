/**
 * Centralized config / secret resolution (lib/config.ts) — Req 15.4, 15.5
 *
 * Single source of truth for sponsor and fallback configuration. Other modules
 * import from here rather than re-implementing resolution logic.
 */

/** Names of the environment variables that may hold the Grok API key. */
export const GROK_API_KEY_ENV_NAMES = ["XAI_API_KEY", "GROK_API_KEY"] as const;

/**
 * Resolve the Grok API key: `XAI_API_KEY` first, then `GROK_API_KEY` (Req 15.4).
 */
export function resolveGrokApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const xai = env.XAI_API_KEY?.trim();
  if (xai) return xai;

  const grok = env.GROK_API_KEY?.trim();
  if (grok) return grok;

  return null;
}

/** Whether a live Grok key is configured. */
export function hasGrokApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveGrokApiKey(env) !== null;
}

/**
 * Whether the deterministic Mock_Fallback must be used (Req 15.5).
 * Forced when no Grok key is set, or when `USE_MOCK_AI=true`.
 */
export function isMockFallbackForced(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (resolveGrokApiKey(env) === null) return true;
  return parseBooleanEnv(env.USE_MOCK_AI);
}

export interface MariposaConfig {
  grokApiKey: string | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
  deepgramApiKey: string | null;
  redisUrl: string | null;
  redisVectorIndex: string;
  orkesApiKey: string | null;
  orkesBaseUrl: string | null;
  arizeApiKey: string | null;
  sentryDsn: string | null;
  useMockFallback: boolean;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): MariposaConfig {
  return {
    grokApiKey: resolveGrokApiKey(env),
    anthropicApiKey: resolveAnthropicApiKey(env),
    anthropicModel: resolveAnthropicModel(env),
    deepgramApiKey: resolveDeepgramApiKey(env),
    redisUrl: resolveRedisUrl(env),
    redisVectorIndex: resolveRedisVectorIndex(env),
    orkesApiKey: resolveOrkesApiKey(env),
    orkesBaseUrl: resolveOrkesBaseUrl(env),
    arizeApiKey: resolveArizeApiKey(env),
    sentryDsn: resolveSentryDsn(env),
    useMockFallback: isMockFallbackForced(env),
  };
}

export function resolveAnthropicApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  return key || null;
}

export function resolveAnthropicModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
}

export function isAnthropicEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseBooleanEnv(env.USE_MOCK_AI)) return false;
  return resolveAnthropicApiKey(env) !== null;
}

export function resolveDeepgramApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.DEEPGRAM_API_KEY?.trim();
  return key || null;
}

export function resolveDeepgramModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEEPGRAM_MODEL?.trim() || "nova-3";
}

export function resolveDeepgramTtsModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.DEEPGRAM_TTS_MODEL?.trim() || "aura-2-thalia-en";
}

export function isDeepgramVoiceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (parseBooleanEnv(env.USE_MOCK_AI)) return false;
  if (!parseBooleanEnv(env.USE_DEEPGRAM_VOICE)) return false;
  return resolveDeepgramApiKey(env) !== null;
}

export function resolveOrkesApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return resolveAgentspanApiKey(env);
}

/** @deprecated Prefer AGENTSPAN_API_KEY. Kept as an alias for older env files. */
export function resolveAgentspanApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const agentspan = env.AGENTSPAN_API_KEY?.trim();
  if (agentspan) return agentspan;

  const legacy = env.ORKES_API_KEY?.trim();
  return legacy || null;
}

export function resolveOrkesBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return resolveAgentspanServerUrl(env);
}

/**
 * Agentspan server URL. Defaults to the local Agentspan dev server.
 * The SDK expects the `/api` suffix; callers may normalize before use.
 */
export function resolveAgentspanServerUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured =
    env.AGENTSPAN_SERVER_URL?.trim() || env.ORKES_BASE_URL?.trim();
  return configured || "http://localhost:6767";
}

export function isAgentspanOptedIn(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    parseBooleanEnv(env.USE_AGENTSPAN) || parseBooleanEnv(env.USE_ORKES)
  );
}

/** Whether Agentspan orchestration should be attempted for the insurance flow. */
export function isAgentspanEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isAgentspanOptedIn(env);
}

/** Backward-compatible alias for the Orkes/Agentspan sponsor flag. */
export function isOrkesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isAgentspanEnabled(env);
}

export function resolveAgentspanModel(env: NodeJS.ProcessEnv = process.env): string | null {
  if (resolveAnthropicApiKey(env)) {
    return `anthropic/${resolveAnthropicModel(env)}`;
  }

  const openAi = env.OPENAI_API_KEY?.trim();
  if (openAi) return env.AGENTSPAN_MODEL?.trim() || "openai/gpt-4o-mini";

  return null;
}

export function hasAgentspanModelCredential(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveAgentspanModel(env) !== null;
}

export function resolveArizeApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.ARIZE_API_KEY?.trim();
  return key || null;
}

export function isArizeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!parseBooleanEnv(env.ENABLE_ARIZE)) return false;
  return resolveArizeApiKey(env) !== null;
}

export function resolveSentryDsn(env: NodeJS.ProcessEnv = process.env): string | null {
  const dsn = env.SENTRY_DSN?.trim();
  return dsn || null;
}

export function isSentryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveSentryDsn(env) !== null;
}

export interface SupabaseConfig {
  url: string;
  key: string;
  usingServiceRole: boolean;
}

export function resolveSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;

  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) {
    return { url, key: serviceRole, usingServiceRole: true };
  }

  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anon) {
    return { url, key: anon, usingServiceRole: false };
  }

  return null;
}

export function hasSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveSupabaseConfig(env) !== null;
}

/** xAI REST base URL for chat and embeddings. */
export function resolveXaiApiBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (env.XAI_API_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/$/, "");
}

export function resolveXaiModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.XAI_MODEL?.trim() || "grok-4";
}

/** Grok Voice Agent WebSocket base URL (no query string). */
export function resolveXaiVoiceWsUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.XAI_VOICE_WS_URL?.trim() || "wss://api.x.ai/v1/realtime").replace(/\/$/, "");
}

/** Grok Voice model for realtime sessions (sponsor path). */
export function resolveXaiVoiceModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.XAI_VOICE_MODEL?.trim() || "grok-voice-latest";
}

/**
 * Whether live calls should use the Grok Voice Agent API (xAI sponsor).
 * Default on when a Grok key is set and mock fallback is not forced.
 * Set USE_GROK_VOICE=false to opt out.
 */
export function isGrokVoiceEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const e = env as NodeJS.ProcessEnv;
  if (!hasGrokApiKey(e)) return false;
  if (isMockFallbackForced(e)) return false;
  if (env.USE_GROK_VOICE !== undefined && !parseBooleanEnv(env.USE_GROK_VOICE)) {
    return false;
  }
  return true;
}

export interface AgentPhoneConfig {
  apiKey: string;
  agentId: string;
  fromNumberId: string | null;
  toNumber: string;
  baseUrl: string;
}

/** AgentPhone REST base URL. */
export function resolveAgentPhoneBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return (env.AGENTPHONE_BASE_URL?.trim() || "https://api.agentphone.ai/v1").replace(
    /\/$/,
    "",
  );
}

export function resolveAgentPhoneConfig(
  env: Record<string, string | undefined> = process.env,
): AgentPhoneConfig | null {
  const apiKey = env.AGENTPHONE_API_KEY?.trim();
  const agentId = env.AGENTPHONE_AGENT_ID?.trim();
  const toNumber = env.AGENTPHONE_TO_NUMBER?.trim();
  if (!apiKey || !agentId || !toNumber) return null;

  return {
    apiKey,
    agentId,
    fromNumberId: env.AGENTPHONE_FROM_NUMBER_ID?.trim() || null,
    toNumber,
    baseUrl: resolveAgentPhoneBaseUrl(env),
  };
}

/**
 * True when USE_AGENTPHONE is enabled and required env vars are set.
 * Suppressed while Grok Voice is enabled — AgentPhone uses its own model, not Grok.
 */
export function isAgentPhoneEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (isGrokVoiceEnabled(env)) return false;
  if (!parseBooleanEnv(env.USE_AGENTPHONE)) return false;
  return resolveAgentPhoneConfig(env) !== null;
}

/** Redis URL for AgentPhone RAG hot path. */
export function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env.REDIS_URL?.trim();
  return url || null;
}

/** RediSearch index name for knowledge chunks. */
export function resolveRedisVectorIndex(env: NodeJS.ProcessEnv = process.env): string {
  return env.REDIS_VECTOR_INDEX?.trim() || "mariposa-rag";
}

export function hasRedisConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveRedisUrl(env) !== null;
}

export function resolveBrowserbaseApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.BROWSERBASE_API_KEY?.trim();
  return key || null;
}

export function resolveAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit;

  const productionHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return productionHost.startsWith("http")
      ? productionHost
      : `https://${productionHost}`;
  }

  const vercelHost = env.VERCEL_URL?.trim();
  if (vercelHost) {
    return vercelHost.startsWith("http") ? vercelHost : `https://${vercelHost}`;
  }

  return "http://localhost:3000";
}

export function isPublicAppBaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0";
  } catch {
    return false;
  }
}

/** True when Browserbase portal verification is opted in and keyed. */
export function isBrowserbaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!parseBooleanEnv(env.USE_BROWSERBASE)) return false;
  return resolveBrowserbaseApiKey(env) !== null;
}

export function parseBooleanEnv(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}
