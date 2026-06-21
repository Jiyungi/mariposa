/**
 * AgentPhone RAG retrieval — Redis vector search first (fast), in-memory keyword fallback.
 * Does NOT hit Supabase on the call hot path.
 */
import type { CallType } from "@/lib/types";
import { getReferenceCorpus } from "@/lib/rag/chunk-markdown";
import { embedText } from "@/lib/rag/embed";
import { formatKnowledgeContext } from "@/lib/rag/format-context";
import { searchRedisKnowledge } from "@/lib/rag/redis-store";
import { queryForCallType, topicsForCallType } from "@/lib/rag/topics";
import type { KnowledgeTopic, RagRetrievalResult, RetrievedChunk } from "@/lib/rag/types";

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

function keywordFallback(
  query: string,
  topics: KnowledgeTopic[],
): RetrievedChunk[] {
  const tokens = tokenize(query);
  const topicSet = new Set(topics);

  return getReferenceCorpus()
    .filter((c) => topicSet.has(c.topic))
    .map((c) => ({
      ...c,
      similarity: keywordScore(tokens, `${c.section} ${c.content}`),
    }))
    .filter((c) => c.similarity >= MIN_KEYWORD_SCORE)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CHUNKS);
}

function dedupe(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const c of chunks) {
    const key = `${c.sourceFile}::${c.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Retrieve reference knowledge for an AgentPhone call (insurance or clinic).
 * Redis KNN → in-memory keyword. Optimized for low latency during live calls.
 */
export async function retrieveAgentKnowledge(
  callType: CallType,
): Promise<RagRetrievalResult> {
  const topics = topicsForCallType(callType);
  const query = queryForCallType(callType);
  const embedding = await embedText(query);

  const redisChunks = await searchRedisKnowledge(embedding, {
    topics,
    matchCount: MAX_CHUNKS,
  });

  if (redisChunks.length > 0) {
    return { chunks: dedupe(redisChunks), mode: "vector" };
  }

  const keywordChunks = keywordFallback(query, topics);
  if (keywordChunks.length > 0) {
    return { chunks: dedupe(keywordChunks), mode: "keyword" };
  }

  return {
    chunks: dedupe(keywordFallback(query, [...new Set(getReferenceCorpus().map((c) => c.topic))])),
    mode: "keyword",
  };
}

/** Build the KNOWLEDGE BASE block for AgentPhone system prompts. */
export async function buildAgentKnowledgeContext(callType: CallType): Promise<{
  context: string;
  mode: RagRetrievalResult["mode"];
  chunkCount: number;
}> {
  const { chunks, mode } = await retrieveAgentKnowledge(callType);
  return {
    context: formatKnowledgeContext(chunks),
    mode,
    chunkCount: chunks.length,
  };
}
