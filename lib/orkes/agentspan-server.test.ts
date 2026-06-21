import { describe, expect, it } from "vitest";

import {
  agentspanUiUrl,
  normalizeAgentspanServerUrl,
} from "@/lib/orkes/agentspan-server";

describe("Agentspan server helpers", () => {
  it("normalizes server URLs to the /api base", () => {
    expect(normalizeAgentspanServerUrl("http://localhost:6767")).toBe(
      "http://localhost:6767/api",
    );
    expect(normalizeAgentspanServerUrl("http://localhost:6767/")).toBe(
      "http://localhost:6767/api",
    );
    expect(normalizeAgentspanServerUrl("http://localhost:6767/api")).toBe(
      "http://localhost:6767/api",
    );
  });

  it("derives the Agentspan UI URL from the server URL", () => {
    expect(agentspanUiUrl("http://localhost:6767/api")).toBe(
      "http://localhost:6767",
    );
  });
});
