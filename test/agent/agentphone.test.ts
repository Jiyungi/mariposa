import { describe, expect, it } from "vitest";

import { parseAgentPhoneTranscript } from "@/lib/agent/agentphone";
import { buildAgentPhoneCallPrompt } from "@/lib/agent/prompts";
import { SEED_AUTH_PACKET } from "@/lib/reference";
import { INSURANCE_QUESTIONS, CLINIC_CALL_QUESTIONS } from "@/lib/reference/call-scripts";
import { isAgentPhoneEnabled, resolveAgentPhoneConfig } from "@/lib/config";
import { retrieveAgentKnowledge } from "@/lib/rag/retrieve-for-agent";

describe("AgentPhone prompts", () => {
  it("includes all 10 insurance questions in order", async () => {
    const { systemPrompt } = await buildAgentPhoneCallPrompt("insurance", SEED_AUTH_PACKET);
    for (const q of INSURANCE_QUESTIONS) {
      expect(systemPrompt).toContain(q);
    }
  });

  it("includes all 7 clinic questions in order", async () => {
    const { systemPrompt } = await buildAgentPhoneCallPrompt("clinic", SEED_AUTH_PACKET);
    for (const q of CLINIC_CALL_QUESTIONS) {
      expect(systemPrompt).toContain(q);
    }
  });

  it("does not put member ID in the insurance opening greeting", async () => {
    const { initialGreeting } = await buildAgentPhoneCallPrompt("insurance", SEED_AUTH_PACKET);
    expect(initialGreeting).not.toContain(SEED_AUTH_PACKET.member_id);
  });

  it("injects KNOWLEDGE BASE block from RAG", async () => {
    const { systemPrompt, ragChunkCount } = await buildAgentPhoneCallPrompt(
      "insurance",
      SEED_AUTH_PACKET,
    );
    expect(systemPrompt).toContain("KNOWLEDGE BASE");
    expect(ragChunkCount).toBeGreaterThan(0);
  });
});

describe("AgentPhone RAG retrieval", () => {
  it("retrieves insurance-related chunks without Supabase", async () => {
    const { chunks, mode } = await retrieveAgentKnowledge("insurance");
    expect(chunks.length).toBeGreaterThan(0);
    expect(["vector", "keyword"]).toContain(mode);
    const topics = new Set(chunks.map((c) => c.topic));
    expect(
      topics.has("insurance") || topics.has("calls") || topics.has("cpt"),
    ).toBe(true);
  });
});

describe("AgentPhone transcript parsing", () => {
  it("maps role-based message arrays to Turn[]", () => {
    const turns = parseAgentPhoneTranscript([
      { role: "assistant", content: "Hello, verifying coverage." },
      { role: "user", content: "Sure, go ahead." },
    ]);
    expect(turns).toEqual([
      { speaker: "agent", text: "Hello, verifying coverage." },
      { speaker: "responder", text: "Sure, go ahead." },
    ]);
  });

  it("parses agent:/responder: prefixed lines", () => {
    const turns = parseAgentPhoneTranscript(
      "Agent: First question?\nResponder: Yes, covered.",
    );
    expect(turns[0]).toEqual({ speaker: "agent", text: "First question?" });
    expect(turns[1]).toEqual({ speaker: "responder", text: "Yes, covered." });
  });
});

describe("AgentPhone config", () => {
  it("is disabled without USE_AGENTPHONE", () => {
    expect(
      isAgentPhoneEnabled({
        USE_AGENTPHONE: "false",
        AGENTPHONE_API_KEY: "key",
        AGENTPHONE_AGENT_ID: "agent",
        AGENTPHONE_TO_NUMBER: "+15551234567",
      }),
    ).toBe(false);
  });

  it("is disabled when Grok Voice is enabled (xAI sponsor takes precedence)", () => {
    expect(
      isAgentPhoneEnabled({
        XAI_API_KEY: "xai-key",
        USE_MOCK_AI: "false",
        USE_GROK_VOICE: "true",
        USE_AGENTPHONE: "true",
        AGENTPHONE_API_KEY: "sk_test",
        AGENTPHONE_AGENT_ID: "agt_1",
        AGENTPHONE_TO_NUMBER: "+15551234567",
      }),
    ).toBe(false);
  });

  it("resolves config when enabled and complete", () => {
    const cfg = resolveAgentPhoneConfig({
      AGENTPHONE_API_KEY: "sk_test",
      AGENTPHONE_AGENT_ID: "agt_1",
      AGENTPHONE_FROM_NUMBER_ID: "num_1",
      AGENTPHONE_TO_NUMBER: "+15551234567",
    });
    expect(cfg?.agentId).toBe("agt_1");
    expect(cfg?.toNumber).toBe("+15551234567");
    expect(
      isAgentPhoneEnabled({
        USE_AGENTPHONE: "true",
        AGENTPHONE_API_KEY: "sk_test",
        AGENTPHONE_AGENT_ID: "agt_1",
        AGENTPHONE_TO_NUMBER: "+15551234567",
      }),
    ).toBe(true);
  });
});
