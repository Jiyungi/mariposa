// ===========================================================================
// AgentPhone adapter (lib/agent/agentphone.ts)
//
// Places autonomous outbound calls via the AgentPhone REST API, polls until
// the call completes, and maps the transcript into Mariposa's Turn[] format for
// lib/core/extract.ts.
// ===========================================================================

import {
  isAgentPhoneEnabled,
  resolveAgentPhoneConfig,
  type AgentPhoneConfig,
} from "@/lib/config";
import { buildAgentPhoneCallPrompt } from "@/lib/agent/prompts";
import type { AuthPacket, CallType, Turn } from "@/lib/types";

export class AgentPhoneUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPhoneUnavailableError";
  }
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "ended",
  "cancelled",
  "canceled",
  "busy",
  "no-answer",
  "no_answer",
]);

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 120_000;

interface AgentPhoneCallRecord {
  id?: string;
  call_id?: string;
  status?: string;
  transcript?: unknown;
}

function authHeaders(config: AgentPhoneConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
}

function extractCallId(payload: Record<string, unknown>): string | null {
  const id = payload.id ?? payload.call_id ?? payload.callId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function speakerToRole(speaker: string): "agent" | "responder" | null {
  const s = speaker.toLowerCase();
  if (s === "agent" || s === "assistant" || s === "ai") return "agent";
  if (s === "responder" || s === "user" || s === "human" || s === "caller") {
    return "responder";
  }
  return null;
}

/** Map AgentPhone transcript payloads to Mariposa Turn[]. */
export function parseAgentPhoneTranscript(raw: unknown): Turn[] {
  if (!raw) return [];

  if (typeof raw === "string") {
    return raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(agent|responder|assistant|user)\s*:\s*(.+)$/i);
        if (match) {
          const role = speakerToRole(match[1]);
          if (role) return { speaker: role, text: match[2].trim() };
        }
        return { speaker: "agent" as const, text: line };
      });
  }

  if (!Array.isArray(raw)) return [];

  const turns: Turn[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      turns.push({ speaker: "agent", text: entry });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const text =
      (typeof row.text === "string" && row.text) ||
      (typeof row.content === "string" && row.content) ||
      (typeof row.message === "string" && row.message) ||
      "";
    if (!text.trim()) continue;

    const roleRaw =
      (typeof row.speaker === "string" && row.speaker) ||
      (typeof row.role === "string" && row.role) ||
      "agent";
    const speaker = speakerToRole(roleRaw) ?? "agent";
    turns.push({ speaker, text: text.trim() });
  }
  return turns;
}

async function agentPhoneFetch(
  config: AgentPhoneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: { ...authHeaders(config), ...(init?.headers ?? {}) },
  });
}

async function createOutboundCall(
  config: AgentPhoneConfig,
  callType: CallType,
  packet: AuthPacket,
): Promise<string> {
  const { systemPrompt, initialGreeting } = await buildAgentPhoneCallPrompt(callType, packet);

  const body: Record<string, string> = {
    agentId: config.agentId,
    toNumber: config.toNumber,
    initialGreeting,
    systemPrompt,
  };
  if (config.fromNumberId) body.fromNumberId = config.fromNumberId;

  const res = await agentPhoneFetch(config, "/calls", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AgentPhoneUnavailableError(
      `AgentPhone create call failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as Record<string, unknown>;
  const callId = extractCallId(json);
  if (!callId) {
    throw new AgentPhoneUnavailableError("AgentPhone create call returned no call id");
  }
  return callId;
}

async function fetchCallTranscript(
  config: AgentPhoneConfig,
  callId: string,
): Promise<Turn[]> {
  const transcriptRes = await agentPhoneFetch(config, `/calls/${callId}/transcript`);
  if (transcriptRes.ok) {
    const transcriptJson = await transcriptRes.json();
    const turns = parseAgentPhoneTranscript(
      (transcriptJson as { transcript?: unknown }).transcript ??
        (transcriptJson as { turns?: unknown }).turns ??
        (transcriptJson as { messages?: unknown }).messages ??
        transcriptJson,
    );
    if (turns.length > 0) return turns;
  }

  const callRes = await agentPhoneFetch(config, `/calls/${callId}`);
  if (!callRes.ok) {
    throw new AgentPhoneUnavailableError(
      `AgentPhone get call failed (${callRes.status})`,
    );
  }

  const callJson = (await callRes.json()) as AgentPhoneCallRecord & Record<string, unknown>;
  const turns = parseAgentPhoneTranscript(
    callJson.transcript ??
      (callJson as { turns?: unknown }).turns ??
      (callJson as { messages?: unknown }).messages,
  );
  if (turns.length === 0) {
    throw new AgentPhoneUnavailableError("AgentPhone call completed with empty transcript");
  }
  return turns;
}

async function pollUntilComplete(
  config: AgentPhoneConfig,
  callId: string,
): Promise<Turn[]> {
  const deadline = Date.now() + MAX_POLL_MS;

  while (Date.now() < deadline) {
    const res = await agentPhoneFetch(config, `/calls/${callId}`);
    if (!res.ok) {
      throw new AgentPhoneUnavailableError(`AgentPhone poll failed (${res.status})`);
    }

    const json = (await res.json()) as AgentPhoneCallRecord;
    const status = (json.status ?? "").toLowerCase();

    if (TERMINAL_STATUSES.has(status)) {
      if (status === "failed" || status === "cancelled" || status === "canceled") {
        throw new AgentPhoneUnavailableError(`AgentPhone call ended: ${status}`);
      }
      return fetchCallTranscript(config, callId);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new AgentPhoneUnavailableError("AgentPhone call timed out waiting for completion");
}

/**
 * Place an AgentPhone outbound call and return the transcript as Turn[].
 */
export async function runAgentPhoneSession(
  callType: CallType,
  packet: AuthPacket,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Turn[]> {
  if (!isAgentPhoneEnabled(env)) {
    throw new AgentPhoneUnavailableError("AgentPhone is disabled or not configured");
  }

  const config = resolveAgentPhoneConfig(env);
  if (!config) {
    throw new AgentPhoneUnavailableError("AgentPhone configuration is incomplete");
  }

  const callId = await createOutboundCall(config, callType, packet);
  return pollUntilComplete(config, callId);
}

export { isAgentPhoneEnabled, resolveAgentPhoneConfig };
