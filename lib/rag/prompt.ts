import type { CanonicalQuestionId } from "@/lib/chat/grounded-chat";
import type { CoupleData } from "@/lib/chat/grounded-chat";
import type { RetrievedChunk } from "@/lib/rag/types";

export function buildRagSystemPrompt(): string {
  return [
    "You are Mariposa, an educational fertility prep assistant for couple_001 only.",
    "Answer ONLY from COUPLE DATA and REFERENCE CHUNKS provided.",
    "If a fact is missing from context, say it is unavailable — never invent clinical values.",
    "Respond as JSON with exactly these keys:",
    "shortAnswer, basedOnYourData, whatsUncertain, sharedNextStep, sources",
    "sources must be an array of { reference, detail } where reference is the source_file.",
    "Use calm, plain language. This is not medical advice.",
  ].join(" ");
}

export function buildRagUserPrompt(
  questionId: CanonicalQuestionId,
  questionText: string,
  coupleData: CoupleData,
  chunks: RetrievedChunk[],
): string {
  const chunkBlock = chunks
    .map(
      (c) =>
        `[${c.sourceFile} § ${c.section}] (topic: ${c.topic}, score: ${c.similarity.toFixed(2)})\n${c.content}`,
    )
    .join("\n\n");

  return [
    `QUESTION_ID: ${questionId}`,
    `QUESTION: ${questionText}`,
    "",
    "COUPLE DATA (couple_001 — synthetic demo):",
    JSON.stringify(coupleData, null, 2),
    "",
    "REFERENCE CHUNKS:",
    chunkBlock || "(no chunks retrieved — state what is unavailable)",
    "",
    "Format the five sections in order: Short answer, Based on your data, What's uncertain, Shared next step, Sources.",
  ].join("\n");
}
