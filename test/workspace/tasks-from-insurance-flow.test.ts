import { describe, expect, it } from "vitest";

import { getTasks } from "@/lib/db";
import { INSURANCE_RESULT } from "@/lib/reference";
import { runInsuranceFlow } from "@/lib/orkes/insurance-flow";
import {
  hasMariposaInsuranceFlowTasks,
  mariposaInsuranceFlowTaskPrefix,
} from "@/lib/orkes/persist-insurance-flow";

describe("Tasks tab data from insurance flow", () => {
  it("surfaces persisted insurance follow-ups for the seed couple", async () => {
    await runInsuranceFlow();

    const tasks = await getTasks("couple_001");

    expect(hasMariposaInsuranceFlowTasks("couple_001", tasks)).toBe(true);
    expect(
      tasks.filter((task) =>
        task.id.startsWith(mariposaInsuranceFlowTaskPrefix("couple_001")),
      ).map((task) => task.title),
    ).toEqual(INSURANCE_RESULT.follow_up_tasks);
    expect(tasks.every((task) => task.column === "together")).toBe(true);
  });
});
