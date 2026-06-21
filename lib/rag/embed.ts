import {
  resolveGrokApiKey,
  resolveXaiApiBaseUrl,
} from "@/lib/config";

export const EMBEDDING_DIMENSIONS = 384;

/**
 * Deterministic local embedding for offline tests and when the xAI embeddings
 * endpoint is unavailable. Token-hash bag-of-words normalized to unit length.
 */
export function embedTextLocal(text: string, dims = EMBEDDING_DIMENSIONS): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    vec[hash % dims] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Embed text via xAI when available; falls back to local embedding.
 * The same function is used at seed time and query time so dimensions stay aligned.
 */
export async function embedText(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number[]> {
  const apiKey = resolveGrokApiKey(env);
  if (!apiKey) return embedTextLocal(text);

  const baseUrl = resolveXaiApiBaseUrl(env);
  const model = env.XAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }),
    });

    if (!res.ok) return embedTextLocal(text);

    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = json.data?.[0]?.embedding;
    if (!embedding?.length) return embedTextLocal(text);

    if (embedding.length === EMBEDDING_DIMENSIONS) return embedding;

    // Resize foreign-dimension API vectors to our pgvector column size.
    if (embedding.length > EMBEDDING_DIMENSIONS) {
      return embedding.slice(0, EMBEDDING_DIMENSIONS);
    }
    return [...embedding, ...new Array(EMBEDDING_DIMENSIONS - embedding.length).fill(0)];
  } catch {
    return embedTextLocal(text);
  }
}
