import type { RetrievedChunk } from "@/lib/rag/types";

/** Format retrieved chunks for injection into an AgentPhone system prompt. */
export function formatKnowledgeContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "KNOWLEDGE BASE: (no chunks retrieved — stick to the question script only)";
  }

  const body = chunks
    .map(
      (c) =>
        `[${c.sourceFile} § ${c.section}] (relevance: ${c.similarity.toFixed(2)})\n${c.content}`,
    )
    .join("\n\n");

  return [
    "KNOWLEDGE BASE — use these facts when speaking to the receptionist, insurer, or clinic.",
    "Do not invent clinical values, CPT codes, or coverage terms beyond this context.",
    "",
    body,
  ].join("\n");
}
