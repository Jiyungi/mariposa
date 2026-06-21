/**
 * Seed Redis vector index for AgentPhone RAG (fast call-time retrieval).
 *
 * Usage:
 *   npm run seed:redis
 *
 * Requires REDIS_URL + RediSearch vector module (Redis Stack / Redis Cloud).
 */
import { loadReferenceCorpus } from "../lib/rag/chunk-markdown";
import { embedText } from "../lib/rag/embed";
import {
  ensureRedisVectorIndex,
  getRedisClient,
  upsertChunkToRedis,
} from "../lib/rag/redis-store";
import { resolveRedisUrl, resolveRedisVectorIndex } from "../lib/config";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();

  if (!resolveRedisUrl()) {
    console.error("Missing REDIS_URL in .env or .env.local");
    process.exit(1);
  }

  const redis = await getRedisClient();
  if (!redis) {
    console.error("Could not connect to Redis. Check REDIS_URL.");
    process.exit(1);
  }

  const indexName = resolveRedisVectorIndex();
  await ensureRedisVectorIndex(redis, indexName);
  console.log(`Index ready: ${indexName}`);

  const chunks = loadReferenceCorpus();
  console.log(`Embedding and upserting ${chunks.length} chunks to Redis...`);

  let ok = 0;
  for (const chunk of chunks) {
    const embedding = await embedText(`${chunk.section}\n${chunk.content}`);
    try {
      await upsertChunkToRedis(redis, chunk, embedding);
      ok += 1;
    } catch (err) {
      console.error(
        `Failed ${chunk.sourceFile} § ${chunk.section}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`Done. Upserted ${ok}/${chunks.length} chunks to Redis.`);
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
