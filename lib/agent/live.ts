// ===========================================================================
// Live voice adapter seam (lib/agent/live.ts) — Req 6.4, 6.7, 15.2, 15.4, 15.5
//
// Resolution order:
//   1. Deepgram transcript seam for the insurance MVP
//   2. Grok Voice Agent API when configured
//   3. AgentPhone (opt-in only when USE_GROK_VOICE=false and USE_AGENTPHONE=true)
//   4. Throws LiveVoiceUnavailableError → Mock_Fallback in index.ts
//
// Transcripts are passed through lib/core/extract extractors (Req 6.4).
// ===========================================================================

import {
  isAgentPhoneEnabled,
  isDeepgramVoiceEnabled,
  isGrokVoiceEnabled,
  resolveGrokApiKey,
} from "@/lib/config";
import {
  AgentPhoneUnavailableError,
  runAgentPhoneSession,
} from "@/lib/agent/agentphone";
import { runGrokVoiceSession } from "@/lib/agent/grok-voice";
import { runDeepgramInsuranceSession } from "@/lib/agent/deepgram-voice";
import { LiveVoiceUnavailableError } from "@/lib/agent/errors";
import {
  extractClinicResult,
  extractInsuranceResult,
} from "@/lib/core/extract";
import type {
  AuthPacket,
  CallOutput,
  CallType,
  ClinicResult,
  InsuranceResult,
  Turn,
} from "@/lib/types";

export { LiveVoiceUnavailableError, resolveGrokApiKey };

export function isLiveVoiceConfigured(): boolean {
  return isDeepgramVoiceEnabled() || isGrokVoiceEnabled() || isAgentPhoneEnabled();
}

/**
 * Run a live voice session using the configured provider order.
 */
export async function runLiveVoiceSession(
  callType: CallType,
  packet: AuthPacket,
): Promise<Turn[]> {
  if (callType === "insurance" && isDeepgramVoiceEnabled()) {
    return runDeepgramInsuranceSession(packet);
  }

  if (isGrokVoiceEnabled()) {
    return runGrokVoiceSession(callType, packet);
  }

  if (isAgentPhoneEnabled()) {
    try {
      return await runAgentPhoneSession(callType, packet);
    } catch (err) {
      if (err instanceof AgentPhoneUnavailableError) {
        throw new LiveVoiceUnavailableError(err.message);
      }
      throw err;
    }
  }

  throw new LiveVoiceUnavailableError(
    "No live voice path configured. Set DEEPGRAM_API_KEY with USE_DEEPGRAM_VOICE, XAI_API_KEY (Grok Voice), or USE_AGENTPHONE with AgentPhone env vars.",
  );
}

export async function tryLiveInsuranceCall(
  packet: AuthPacket,
): Promise<CallOutput<InsuranceResult>> {
  const transcript = await runLiveVoiceSession("insurance", packet);
  const outcome = extractInsuranceResult(transcript);
  if (outcome.unresolved.length > 0) {
    throw new LiveVoiceUnavailableError(
      `Live insurance extraction incomplete: ${outcome.unresolved.join(", ")}`,
    );
  }
  return {
    transcript,
    result: outcome.result as InsuranceResult,
    usedFallback: false,
  };
}

export async function tryLiveClinicCall(
  packet: AuthPacket,
): Promise<CallOutput<ClinicResult>> {
  const transcript = await runLiveVoiceSession("clinic", packet);
  const outcome = extractClinicResult(transcript);
  if (outcome.unresolved.length > 0) {
    throw new LiveVoiceUnavailableError(
      `Live clinic extraction incomplete: ${outcome.unresolved.join(", ")}`,
    );
  }
  return {
    transcript,
    result: outcome.result as ClinicResult,
    usedFallback: false,
  };
}
