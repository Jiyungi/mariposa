import { describe, expect, it } from "vitest";

import { isAgentPhoneEnabled, isGrokVoiceEnabled } from "@/lib/config";

describe("Grok Voice routing (xAI sponsor)", () => {
  it("enables Grok Voice when API key is set and mock fallback is off", () => {
    expect(
      isGrokVoiceEnabled({
        XAI_API_KEY: "xai-key",
        USE_MOCK_AI: "false",
      }),
    ).toBe(true);
  });

  it("disables Grok Voice when USE_MOCK_AI=true", () => {
    expect(
      isGrokVoiceEnabled({
        XAI_API_KEY: "xai-key",
        USE_MOCK_AI: "true",
      }),
    ).toBe(false);
  });

  it("disables Grok Voice when USE_GROK_VOICE=false", () => {
    expect(
      isGrokVoiceEnabled({
        XAI_API_KEY: "xai-key",
        USE_MOCK_AI: "false",
        USE_GROK_VOICE: "false",
      }),
    ).toBe(false);
  });

  it("allows AgentPhone only when Grok Voice is explicitly off", () => {
    expect(
      isAgentPhoneEnabled({
        USE_GROK_VOICE: "false",
        USE_MOCK_AI: "true",
        USE_AGENTPHONE: "true",
        AGENTPHONE_API_KEY: "sk_test",
        AGENTPHONE_AGENT_ID: "agt_1",
        AGENTPHONE_TO_NUMBER: "+15551234567",
      }),
    ).toBe(true);
  });
});
