/**
 * Verify Redis connectivity and vector index readiness for Mariposa RAG.
 *
 * Usage:
 *   npm run verify:redis
 *
 * Requires REDIS_URL and Redis Stack / RediSearch vector support.
 */
import { resolveRedisUrl, resolveRedisVectorIndex } from "../lib/config";
import {
  ensureRedisVectorIndex,
  getRedisClient,
} from "../lib/rag/redis-store";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();

  const url = resolveRedisUrl();
  if (!url) {
    console.error("Missing REDIS_URL in .env or .env.local");
    console.error("Set REDIS_URL, then run: npm run seed:redis");
    process.exit(1);
  }

  const redis = await getRedisClient();
  if (!redis) {
    console.error("Could not connect to Redis. Check REDIS_URL and network access.");
    process.exit(1);
  }

  const indexName = resolveRedisVectorIndex();
  await ensureRedisVectorIndex(redis, indexName);

  let indexedDocs = 0;
  try {
    const result = await redis.ft.search(indexName, "*", {
      LIMIT: { from: 0, size: 0 },
    });
    indexedDocs = typeof result.total === "number" ? result.total : 0;
  } catch (err) {
    console.error(
      "Connected to Redis but could not read vector index info:",
      err instanceof Error ? err.message : err,
    );
    await redis.quit();
    process.exit(1);
  }

  console.log(JSON.stringify({
    status: "ok",
    redisUrlConfigured: true,
    indexName,
    indexedDocs,
    nextStep:
      indexedDocs > 0
        ? "Redis vector index is ready for insurance retrieval."
        : "Index exists but has no documents. Run: npm run seed:redis",
  }, null, 2));

  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
