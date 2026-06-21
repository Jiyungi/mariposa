import { describe, expect, it } from "vitest";

import { getTasks } from "@/lib/db";
import { buildDoctorSummary } from "@/lib/summary/build";
import { applyResultUpdate } from "@/lib/workspace/result-update";
import { loadWorkspaceForSummary } from "@/lib/workspace/load-for-summary";

describe("applyResultUpdate()", () => {
  it("updates her lab profile values and adds a follow-up task", async () => {
    const result = await applyResultUpdate({
      coupleId: "couple_001",
      category: "her_labs",
      note: "Day 3 FSH 7.2, estradiol 45, prolactin 12.",
    });

    expect(result.extracted).toMatchObject({
      day3_fsh: 7.2,
      day3_estradiol: 45,
      prolactin: 12,
    });

    const workspace = await loadWorkspaceForSummary("couple_001");
    expect(workspace.herProfile.day3_fsh).toBe(7.2);
    expect(workspace.herProfile.day3_estradiol).toBe(45);
    expect(workspace.herProfile.prolactin).toBe(12);

    const summary = buildDoctorSummary(workspace);
    expect(
      summary.missingTests.some((item) => item.label.includes("Day-3 FSH")),
    ).toBe(false);

    const tasks = await getTasks("couple_001");
    expect(tasks.some((task) => task.title === "Review updated lab result with clinic")).toBe(true);
  });

  it("updates semen analysis values", async () => {
    await applyResultUpdate({
      coupleId: "couple_001",
      category: "semen_analysis",
      note: "2026-06-21 concentration 18 million, progressive motility 34%, morphology 4%",
    });

    const workspace = await loadWorkspaceForSummary("couple_001");
    expect(workspace.himProfile.semen_analysis_date).toBe("2026-06-21");
    expect(workspace.himProfile.concentration_million_ml).toBe(18);
    expect(workspace.himProfile.progressive_motility_pct).toBe(34);
    expect(workspace.himProfile.morphology_normal_pct).toBe(4);
  });
});
