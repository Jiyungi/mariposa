import {
  AUTHORIZATION_PACKET,
  CLINIC_AGENT_OPENING,
  CLINIC_CALL_OBJECTIVE,
  CLINIC_CALL_QUESTIONS,
  INSURANCE_AGENT_OPENING,
  INSURANCE_CALL_OBJECTIVE,
  INSURANCE_QUESTIONS,
} from "@/lib/reference";
import { buildAgentKnowledgeContext } from "@/lib/rag/retrieve-for-agent";
import type { AuthPacket, CallType } from "@/lib/types";

export interface AgentPhoneCallPrompt {
  systemPrompt: string;
  initialGreeting: string;
  /** Where RAG chunks were loaded from (redis vector / keyword fallback). */
  ragMode?: "vector" | "keyword";
  ragChunkCount?: number;
}

function guardrailBlock(): string {
  return [
    "GUARDRAILS:",
    ...AUTHORIZATION_PACKET.guardrails.map((g) => `- ${g}`),
    "- Use only synthetic demo data. This is a demo simulation.",
    "- Ask questions in the exact order listed. One question at a time.",
    "- Do not accept treatment or make medical decisions on the couple's behalf.",
  ].join("\n");
}

function baseInsurancePrompt(packet: AuthPacket): Omit<AgentPhoneCallPrompt, "ragMode" | "ragChunkCount"> {
  const questions = INSURANCE_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return {
    initialGreeting: INSURANCE_AGENT_OPENING.replace(
      "Pacific Crest Health PCH-0000-1234",
      `${packet.provider}`,
    ),
    systemPrompt: [
      "You are Mariposa, an authorized assistant calling on behalf of a synthetic demo couple (Maya & Daniel).",
      `Objective: ${INSURANCE_CALL_OBJECTIVE}.`,
      `Insurance provider: ${packet.provider}, plan: ${packet.plan_type}, group: ${packet.group_number}.`,
      "Do NOT speak member ID or DOB until the responder explicitly asks to verify identity.",
      "",
      "Ask these 10 questions IN ORDER (wait for a reply before the next):",
      questions,
      "",
      guardrailBlock(),
    ].join("\n"),
  };
}

function baseClinicPrompt(packet: AuthPacket): Omit<AgentPhoneCallPrompt, "ragMode" | "ragChunkCount"> {
  const questions = CLINIC_CALL_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return {
    initialGreeting: CLINIC_AGENT_OPENING,
    systemPrompt: [
      "You are Mariposa, helping a synthetic demo couple prepare for a first fertility consult.",
      `Objective: ${CLINIC_CALL_OBJECTIVE}.`,
      `Insurance: ${packet.provider} ${packet.plan_type}.`,
      "",
      "Ask these 7 questions IN ORDER (wait for a reply before the next):",
      questions,
      "",
      guardrailBlock(),
    ].join("\n"),
  };
}

/**
 * Build AgentPhone system prompt with Redis-backed RAG knowledge injected.
 * The knowledge base grounds answers when speaking to insurers, clinics, or receptionists.
 */
export async function buildAgentPhoneCallPrompt(
  callType: CallType,
  packet: AuthPacket,
): Promise<AgentPhoneCallPrompt> {
  const base = callType === "insurance" ? baseInsurancePrompt(packet) : baseClinicPrompt(packet);
  const { context, mode, chunkCount } = await buildAgentKnowledgeContext(callType);

  return {
    ...base,
    systemPrompt: [base.systemPrompt, "", context].join("\n"),
    ragMode: mode,
    ragChunkCount: chunkCount,
  };
}
