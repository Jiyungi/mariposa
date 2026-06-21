import type { CanonicalQuestionId } from "@/lib/chat/grounded-chat";
import { getReferenceCorpus } from "@/lib/rag/chunk-markdown";
import { embedText } from "@/lib/rag/embed";
import { topicsForQuestion } from "@/lib/rag/topics";
import type { KnowledgeTopic, RagRetrievalResult, RetrievedChunk } from "@/lib/rag/types";
import { getSupabaseClient } from "@/lib/db/client";

const MAX_CHUNKS = 8;
const MIN_KEYWORD_SCORE = 0.05;

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
}

function keywordScore(queryTokens: string[], chunkText: string): number {
  if (queryTokens.length === 0) return 0;
  const hay = chunkText.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (hay.includes(token)) hits += 1;
  }
  return hits / queryTokens.length;
}

function rankByKeyword(
  chunks: Array<{ sourceFile: string; section: string; content: string; topic: KnowledgeTopic }>,
  query: string,
  topics: KnowledgeTopic[],
): RetrievedChunk[] {
  const tokens = tokenize(query);
  const topicSet = new Set(topics);

  return chunks
    .filter((c) => topicSet.has(c.topic))
    .map((c) => ({
      ...c,
      similarity: keywordScore(tokens, `${c.section} ${c.content}`),
    }))
    .filter((c) => c.similarity >= MIN_KEYWORD_SCORE)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CHUNKS);
}

function dedupeChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const key = `${chunk.sourceFile}::${chunk.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }
  return out;
}

/**
 * Retrieve grounded reference chunks for a canonical question.
 * Tries Supabase pgvector first; falls back to in-memory keyword retrieval.
 */
export async function retrieveKnowledge(
  questionId: CanonicalQuestionId,
  questionText: string,
): Promise<RagRetrievalResult> {
  const topics = topicsForQuestion(questionId);
  const query = `${questionText} ${topics.join(" ")}`;
  const client = getSupabaseClient();

  if (client) {
    try {
      const embedding = await embedText(query);
      const { data, error } = await client.rpc("match_knowledge", {
        query_embedding: embedding,
        match_count: MAX_CHUNKS,
        filter_topics: topics,
        min_similarity: 0.12,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        const chunks: RetrievedChunk[] = data.map(
          (row: {
            source_file: string;
            section: string;
            content: string;
            topic: KnowledgeTopic;
            similarity: number;
          }) => ({
            sourceFile: row.source_file,
            section: row.section,
            content: row.content,
            topic: row.topic,
            similarity: row.similarity,
          }),
        );
        return { chunks: dedupeChunks(chunks), mode: "vector" };
      }
    } catch {
      // Fall through to keyword retrieval.
    }
  }

  const keywordChunks = rankByKeyword(getReferenceCorpus(), query, topics);
  if (keywordChunks.length > 0) {
    return { chunks: dedupeChunks(keywordChunks), mode: "keyword" };
  }

  // Broaden to all topics if the filter was too narrow.
  const broad = rankByKeyword(
    getReferenceCorpus(),
    query,
    [...new Set(getReferenceCorpus().map((c) => c.topic))],
  );
  return { chunks: dedupeChunks(broad), mode: "keyword" };
}
