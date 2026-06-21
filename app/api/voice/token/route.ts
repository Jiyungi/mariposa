import { NextResponse } from "next/server";

import { buildAgentPhoneCallPrompt } from "@/lib/agent/prompts";
import {
  createGrokVoiceEphemeralToken,
  LiveVoiceUnavailableError,
} from "@/lib/agent";
import type { CallType } from "@/lib/types";
import { SEED_AUTH_PACKET } from "@/lib/reference";

const VALID_CALL_TYPES = new Set<CallType>(["insurance", "clinic"]);

/**
 * Mint an ephemeral Grok Voice token for browser WebSocket sessions.
 * POST body: { callType?: "insurance" | "clinic" }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { callType?: string };
    const callType = VALID_CALL_TYPES.has(body.callType as CallType)
      ? (body.callType as CallType)
      : "insurance";

    const { systemPrompt, initialGreeting } = await buildAgentPhoneCallPrompt(callType, SEED_AUTH_PACKET);
    const token = await createGrokVoiceEphemeralToken({
      instructions: systemPrompt,
      voice: "eve",
      turn_detection: { type: "server_vad" },
      audio: {
        input: {
          transcription: { model: "grok-transcribe" },
        },
      },
    });

    return NextResponse.json({
      token,
      callType,
      systemPrompt,
      initialGreeting,
      model: process.env.XAI_VOICE_MODEL?.trim() || "grok-voice-latest",
      wsUrl: process.env.XAI_VOICE_WS_URL?.trim() || "wss://api.x.ai/v1/realtime",
    });
  } catch (err) {
    const message =
      err instanceof LiveVoiceUnavailableError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Grok Voice token unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
