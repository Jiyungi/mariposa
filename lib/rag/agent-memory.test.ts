import { describe, expect, it } from "vitest";

import {
  buildMemoryRedisKey,
  writeAgentMemoryEvent,
} from "@/lib/rag/agent-memory";

describe("agent memory", () => {
  it("builds the mariposa memory redis key", () => {
    expect(buildMemoryRedisKey("couple_001")).toBe(
      "mariposa:memory:couple_001",
    );
  });

  it("is no-op-safe when Redis is not configured", async () => {
    await expect(
      writeAgentMemoryEvent({
        coupleId: "couple_001",
        flow: "mariposa-insurance-flow",
        step: "insurance-result",
        summary: "Insurance verification completed.",
      }),
    ).resolves.toEqual({
      written: false,
      eventId: null,
      redisKey: null,
    });
  });
});
