import { getRedisClient } from "@/lib/rag/redis-store";

export const MEMORY_KEY_PREFIX = "mariposa:memory:" as const;

export interface AgentMemoryEvent {
  eventId: string;
  coupleId: string;
  flow: string;
  step: string;
  recordedAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface WriteAgentMemoryResult {
  written: boolean;
  eventId: string | null;
  redisKey: string | null;
}

export function buildMemoryRedisKey(coupleId: string): string {
  return `${MEMORY_KEY_PREFIX}${coupleId}`;
}

function stableEventId(coupleId: string, flow: string, step: string): string {
  const base = `mariposa:memory:${coupleId}:${flow}:${step}`;
  return base.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 160);
}

export async function writeAgentMemoryEvent(input: {
  coupleId: string;
  flow: string;
  step: string;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<WriteAgentMemoryResult> {
  const redisKey = buildMemoryRedisKey(input.coupleId);
  const eventId = stableEventId(input.coupleId, input.flow, input.step);

  const redis = await getRedisClient();
  if (!redis) {
    return { written: false, eventId: null, redisKey: null };
  }

  const event: AgentMemoryEvent = {
    eventId,
    coupleId: input.coupleId,
    flow: input.flow,
    step: input.step,
    recordedAt: new Date().toISOString(),
    summary: input.summary,
    metadata: input.metadata,
  };

  try {
    await redis.lPush(redisKey, JSON.stringify(event));
    return { written: true, eventId, redisKey };
  } catch {
    return { written: false, eventId: null, redisKey: null };
  }
}
