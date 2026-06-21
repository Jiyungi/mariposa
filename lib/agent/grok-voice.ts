// ===========================================================================
// Grok Voice Agent adapter (lib/agent/grok-voice.ts) — xAI sponsor live path
//
// Opens a realtime WebSocket session (grok-voice-latest), injects RAG-backed
// instructions, and drives turn-taking. Server-side sessions use input_text for
// the human side (demo presenter or reference cue-sheet replies); browser apps
// can use createGrokVoiceEphemeralToken() + mic audio instead.
// ===========================================================================

import WebSocket from "ws";

import {
  resolveGrokApiKey,
  resolveXaiApiBaseUrl,
  resolveXaiVoiceModel,
  resolveXaiVoiceWsUrl,
} from "@/lib/config";
import { buildAgentPhoneCallPrompt } from "@/lib/agent/prompts";
import { callScriptSteps } from "@/lib/agent/mock-fallback";
import type { AuthPacket, CallType, Turn } from "@/lib/types";

import { LiveVoiceUnavailableError } from "@/lib/agent/errors";

const SESSION_TIMEOUT_MS = 120_000;
const TURN_TIMEOUT_MS = 45_000;

interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify(payload));
}

function extractTextFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as { type?: string; text?: string; transcript?: string };
    const text = p.text ?? p.transcript;
    if (typeof text === "string" && text.trim()) parts.push(text.trim());
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function extractAssistantText(event: RealtimeEvent): string | null {
  if (event.type === "response.output_audio_transcript.done") {
    const transcript = event.transcript;
    return typeof transcript === "string" && transcript.trim() ? transcript.trim() : null;
  }

  if (event.type === "response.done") {
    const response = event.response;
    if (!response || typeof response !== "object") return null;
    const output = (response as { output?: unknown }).output;
    if (!Array.isArray(output)) return null;
    const texts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const message = (item as { content?: unknown }).content;
      const text = extractTextFromContent(message);
      if (text) texts.push(text);
    }
    return texts.length > 0 ? texts.join(" ") : null;
  }

  if (event.type === "conversation.item.created") {
    const item = event.item;
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: string }).role;
    if (role !== "assistant") return null;
    const text = extractTextFromContent((item as { content?: unknown }).content);
    return text;
  }

  return null;
}

function waitForEvent(
  ws: WebSocket,
  predicate: (event: RealtimeEvent) => boolean,
  timeoutMs: number,
): Promise<RealtimeEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new LiveVoiceUnavailableError("Grok Voice session timed out"));
    }, timeoutMs);

    function onMessage(data: WebSocket.RawData) {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(String(data)) as RealtimeEvent;
      } catch {
        return;
      }
      if (predicate(event)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(event);
      }
    }

    ws.on("message", onMessage);
  });
}

async function waitForResponseDone(ws: WebSocket): Promise<string | null> {
  let assistantText: string | null = null;

  await waitForEvent(
    ws,
    (event) => {
      const fromTranscript = extractAssistantText(event);
      if (fromTranscript) assistantText = fromTranscript;
      return event.type === "response.done";
    },
    TURN_TIMEOUT_MS,
  );

  return assistantText;
}

function responderTextsForCall(callType: CallType): string[] {
  return callScriptSteps(callType).map((step) => step.responderText);
}

/**
 * Run a Grok Voice realtime session and return a chronological transcript.
 * Uses text input for the human side so server workflows can complete without
 * a browser mic; swap to audio + ephemeral tokens for a spoken demo.
 */
export async function runGrokVoiceSession(
  callType: CallType,
  packet: AuthPacket,
): Promise<Turn[]> {
  const apiKey = resolveGrokApiKey();
  if (!apiKey) {
    throw new LiveVoiceUnavailableError("No Grok API key configured");
  }

  const { systemPrompt } = await buildAgentPhoneCallPrompt(callType, packet);
  const model = resolveXaiVoiceModel();
  const url = `${resolveXaiVoiceWsUrl()}?model=${encodeURIComponent(model)}`;
  const responderTexts = responderTextsForCall(callType);
  const turns: Turn[] = [];

  const ws = new WebSocket(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const sessionDeadline = Date.now() + SESSION_TIMEOUT_MS;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new LiveVoiceUnavailableError("Grok Voice connection timed out"));
      }, 15_000);

      ws.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once("error", (err) => {
        clearTimeout(timer);
        reject(
          new LiveVoiceUnavailableError(
            `Grok Voice connection failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      });
    });

    await waitForEvent(ws, (e) => e.type === "session.created", 10_000);

    sendJson(ws, {
      type: "session.update",
      session: {
        voice: "eve",
        instructions: systemPrompt,
        turn_detection: null,
        audio: {
          input: {
            transcription: { model: "grok-transcribe" },
          },
        },
      },
    });

    await waitForEvent(ws, (e) => e.type === "session.updated", 10_000);

    sendJson(ws, { type: "response.create" });
    const opening = await waitForResponseDone(ws);
    if (opening) turns.push({ speaker: "agent", text: opening });

    for (const responderText of responderTexts) {
      if (Date.now() > sessionDeadline) {
        throw new LiveVoiceUnavailableError("Grok Voice session exceeded time limit");
      }

      turns.push({ speaker: "responder", text: responderText });

      sendJson(ws, {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: responderText }],
        },
      });
      sendJson(ws, { type: "response.create" });

      const agentReply = await waitForResponseDone(ws);
      if (agentReply) turns.push({ speaker: "agent", text: agentReply });
    }

    return turns;
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
}

/** Mint a short-lived client token for browser Grok Voice WebSocket connections. */
export async function createGrokVoiceEphemeralToken(
  session?: Record<string, unknown>,
): Promise<string> {
  const apiKey = resolveGrokApiKey();
  if (!apiKey) {
    throw new LiveVoiceUnavailableError("No Grok API key configured");
  }

  const res = await fetch(`${resolveXaiApiBaseUrl()}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { seconds: 600 },
      session: {
        model: resolveXaiVoiceModel(),
        ...session,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LiveVoiceUnavailableError(
      `Grok Voice ephemeral token failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as { client_secret?: { value?: string }; value?: string };
  const token = json.client_secret?.value ?? json.value;
  if (!token) {
    throw new LiveVoiceUnavailableError("Grok Voice ephemeral token response missing value");
  }
  return token;
}
