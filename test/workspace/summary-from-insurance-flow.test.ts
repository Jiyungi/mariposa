import { describe, expect, it } from "vitest";

import { runInsuranceFlow } from "@/lib/orkes/insurance-flow";
import { buildDoctorSummary } from "@/lib/summary/build";
import {
  hasMariposaInsuranceCallRecord,
  hasPersistedInsuranceCall,
  loadWorkspaceForSummary,
} from "@/lib/workspace/load-for-summary";

describe("Doctor summary from insurance flow persistence", () => {
  it("includes verified coverage facts after the Mariposa demo runs", async () => {
    await runInsuranceFlow();

    const workspace = await loadWorkspaceForSummary("couple_001");
    expect(hasPersistedInsuranceCall(workspace.callRecords)).toBe(true);
    expect(
      hasMariposaInsuranceCallRecord("couple_001", workspace.callRecords),
    ).toBe(true);

    const summary = buildDoctorSummary(workspace);
    expect(summary.coverage.verifiedFacts.length).toBeGreaterThan(0);
    expect(
      summary.coverage.verifiedFacts.some((fact) =>
        fact.label.includes("Diagnostic evaluation"),
      ),
    ).toBe(true);
    expect(
      summary.coverage.verifiedFacts.some((fact) =>
        fact.label.includes("In-network lab"),
      ),
    ).toBe(true);
  });
});
