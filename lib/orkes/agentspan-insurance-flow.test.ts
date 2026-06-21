import { describe, expect, it } from "vitest";

import { createMariposaInsuranceAgentForTests } from "@/lib/orkes/agentspan-insurance-flow";

describe("Mariposa Agentspan insurance agent", () => {
  it("defines a durable tool-backed orchestrator agent", () => {
    const agent = createMariposaInsuranceAgentForTests("openai/gpt-4o-mini");

    expect(agent.name).toBe("mariposa_insurance_orchestrator");
    expect(agent.tools.length).toBe(1);
  });
});
