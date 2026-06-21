import {
  resolveAgentspanApiKey,
  resolveAgentspanServerUrl,
} from "@/lib/config";

export function normalizeAgentspanServerUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export function agentspanUiUrl(serverUrl: string): string {
  return normalizeAgentspanServerUrl(serverUrl).replace(/\/api$/, "");
}

export async function checkAgentspanServerHealth(
  serverUrl = resolveAgentspanServerUrl(),
  timeoutMs = 2500,
): Promise<boolean> {
  const apiBase = normalizeAgentspanServerUrl(serverUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBase}/health`, {
      signal: controller.signal,
      headers: buildAgentspanAuthHeaders(),
    });
    if (response.ok) return true;

    const root = await fetch(agentspanUiUrl(serverUrl), {
      signal: controller.signal,
    });
    return root.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function buildAgentspanAuthHeaders(
  apiKey = resolveAgentspanApiKey(),
): Record<string, string> {
  if (!apiKey) return {};
  return { Authorization: `Bearer ${apiKey}` };
}
