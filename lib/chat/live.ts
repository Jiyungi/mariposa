// ===========================================================================
// Live Grok + RAG chat adapter (lib/chat/live.ts) — Req 9, 15.4, 15.5
//
// Tries RAG-backed Grok completion first (retrieve Reference_Data chunks from
// Supabase pgvector or keyword fallback, then call Grok with strict JSON output).
// Falls through to the deterministic Mock_Fallback on any failure.
// ===========================================================================

import { isMockFallbackForced, resolveGrokApiKey } from "@/lib/config";
import { answerWithRag } from "@/lib/rag/completion";
import { loadCoupleContext } from "@/lib/rag/couple-context";

import {
  answerCanonicalQuestion,
  type CanonicalQuestionId,
  type ChatAnswer,
  type CoupleData,
} from "./grounded-chat";

export class LiveChatUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveChatUnavailableError";
  }
}

export function isLiveChatConfigured(): boolean {
  return resolveGrokApiKey() !== null && !isMockFallbackForced();
}

export async function tryLiveChatAnswer(
  questionId: CanonicalQuestionId,
  coupleData?: CoupleData,
): Promise<ChatAnswer> {
  if (!isLiveChatConfigured()) {
    throw new LiveChatUnavailableError(
      "Live RAG chat unavailable (no Grok key or USE_MOCK_AI=true).",
    );
  }

  const data = coupleData ?? (await loadCoupleContext());
  const { answer } = await answerWithRag(questionId, data);
  return answer;
}

export async function answerCanonicalQuestionLiveOrMock(
  questionId: CanonicalQuestionId,
  coupleData?: CoupleData,
): Promise<{ answer: ChatAnswer; usedFallback: boolean }> {
  try {
    const data = coupleData ?? (await loadCoupleContext());
    const answer = await tryLiveChatAnswer(questionId, data);
    return { answer, usedFallback: false };
  } catch {
    const data = coupleData ?? (await loadCoupleContext());
    return {
      answer: answerCanonicalQuestion(questionId, data),
      usedFallback: true,
    };
  }
}
