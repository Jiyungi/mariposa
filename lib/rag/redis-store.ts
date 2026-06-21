/**
 * Redis vector store for AgentPhone RAG (hot path — sub-ms KNN vs Supabase round-trip).
 *
 * Requires Redis Stack / Redis Cloud with RediSearch + vector support.
 * Seed via: npm run seed:redis
 */
import { createClient, type RedisClientType } from "redis";

import { EMBEDDING_DIMENSIONS } from "@/lib/rag/embed";
import type { KnowledgeChunk, KnowledgeTopic, RetrievedChunk } from "@/lib/rag/types";
import { resolveRedisUrl, resolveRedisVectorIndex } from "@/lib/config";

const CHUNK_PREFIX = "mariposa:chunk:";

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

function embeddingToBlob(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

function chunkRedisKey(sourceFile: string, section: string): string {
  const slug = `${sourceFile}::${section}`
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 180);
  return `${CHUNK_PREFIX}${slug}`;
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = resolveRedisUrl();
  if (!url) return null;

  if (client?.isOpen) return client;

  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        const c = createClient({
          url,
          socket: {
            connectTimeout: 10_000,
            reconnectStrategy: (retries) => (retries > 3 ? false : Math.min(retries * 200, 2000)),
          },
        });
        c.on("error", () => {
          /* handled per-command */
        });
        await c.connect();
        client = c as RedisClientType;
        return client;
      } catch {
        client = null;
        return null;
      }
    })();
  }

  return connectPromise;
}

export async function ensureRedisVectorIndex(
  redis: RedisClientType,
  indexName = resolveRedisVectorIndex(),
): Promise<void> {
  try {
    await (redis.ft.create as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>)(
      indexName,
      {
        source_file: { type: "TAG" as const },
        section: { type: "TEXT" as const },
        content: { type: "TEXT" as const },
        topic: { type: "TAG" as const },
        embedding: {
          type: "VECTOR" as const,
          ALGORITHM: "HNSW",
          TYPE: "FLOAT32",
          DIM: EMBEDDING_DIMENSIONS,
          DISTANCE_METRIC: "COSINE",
        },
      },
      {
        ON: "HASH",
        PREFIX: CHUNK_PREFIX,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("index already exists")) throw err;
  }
}

export async function upsertChunkToRedis(
  redis: RedisClientType,
  chunk: KnowledgeChunk,
  embedding: number[],
): Promise<void> {
  const key = chunkRedisKey(chunk.sourceFile, chunk.section);
  await redis.hSet(key, {
    source_file: chunk.sourceFile,
    section: chunk.section,
    content: chunk.content,
    topic: chunk.topic,
    embedding: embeddingToBlob(embedding),
  });
}

function parseSearchResults(
  documents: Array<{ id: string; value: Record<string, string | Buffer> }> | undefined,
): RetrievedChunk[] {
  if (!documents?.length) return [];

  return documents.map((doc) => {
    const v = doc.value;
    const scoreRaw = v.score;
    const similarity =
      typeof scoreRaw === "string"
        ? parseFloat(scoreRaw)
        : typeof scoreRaw === "number"
          ? scoreRaw
          : 0;

    return {
      sourceFile: String(v.source_file ?? ""),
      section: String(v.section ?? ""),
      content: String(v.content ?? ""),
      topic: String(v.topic ?? "general") as KnowledgeTopic,
      similarity: Number.isFinite(similarity) ? similarity : 0,
    };
  });
}

/**
 * KNN vector search in Redis. Optional topic TAG filter for call-type scoping.
 */
export async function searchRedisKnowledge(
  queryEmbedding: number[],
  options: {
    topics?: KnowledgeTopic[];
    matchCount?: number;
    indexName?: string;
  } = {},
): Promise<RetrievedChunk[]> {
  const redis = await getRedisClient();
  if (!redis) return [];

  const indexName = options.indexName ?? resolveRedisVectorIndex();
  const k = options.matchCount ?? 8;
  const blob = embeddingToBlob(queryEmbedding);

  const topicFilter =
    options.topics && options.topics.length > 0
      ? `@topic:{${options.topics.join("|")}}`
      : "*";

  const query = `${topicFilter}=>[KNN ${k} @embedding $vec AS score]`;

  try {
    const result = await redis.ft.search(indexName, query, {
      PARAMS: { vec: blob },
      RETURN: ["source_file", "section", "content", "topic", "score"],
      SORTBY: { BY: "score", DIRECTION: "ASC" },
      DIALECT: 2,
    });

    return parseSearchResults(
      result.documents as Array<{ id: string; value: Record<string, string | Buffer> }>,
    );
  } catch {
    return [];
  }
}

/** Test helper */
export async function __closeRedisForTests(): Promise<void> {
  if (client?.isOpen) await client.quit();
  client = null;
  connectPromise = null;
}
