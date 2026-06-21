import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

import { TaskBoard } from "@/components/mariposa/TaskBoard";
import type { Task, TaskColumn } from "@/lib/db/types";

afterEach(cleanup);

let nextId = 0;
function task(column: TaskColumn, title: string, weight = 0, completed = false): Task {
  return {
    id: `t${nextId++}`,
    couple_id: "couple_001",
    column,
    title,
    completed,
    weight,
    source_call_record_id: null,
  };
}

describe("TaskBoard (Task 15.1)", () => {
  it("renders exactly three columns labeled Her, His, and Together (Req 5.1)", () => {
    render(<TaskBoard tasks={[]} />);

    const regions = screen.getAllByRole("region");
    expect(regions).toHaveLength(3);

    expect(screen.getByRole("region", { name: /^Her tasks$/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^His tasks$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /^Together tasks$/i }),
    ).toBeInTheDocument();
  });

  it("shows a calm empty state in each column when there are no tasks", () => {
    render(<TaskBoard tasks={[]} />);
    for (const name of ["Her tasks", "His tasks", "Together tasks"]) {
      const region = screen.getByRole("region", { name });
      expect(within(region).getByText(/no tasks yet/i)).toBeInTheDocument();
    }
  });

  it("groups each task into its single column (Req 5.2, 5.5)", () => {
    const tasks = [
      task("her", "Schedule day-3 labs"),
      task("him", "Repeat semen analysis"),
      task("together", "Verify insurance coverage"),
    ];
    render(<TaskBoard tasks={tasks} />);

    const her = screen.getByRole("region", { name: "Her tasks" });
    const his = screen.getByRole("region", { name: "His tasks" });
    const together = screen.getByRole("region", { name: "Together tasks" });

    expect(within(her).getByText("Schedule day-3 labs")).toBeInTheDocument();
    expect(within(his).getByText("Repeat semen analysis")).toBeInTheDocument();
    expect(
      within(together).getByText("Verify insurance coverage"),
    ).toBeInTheDocument();

    // Each appears in exactly one column.
    expect(within(her).queryByText("Repeat semen analysis")).toBeNull();
    expect(within(together).queryByText("Repeat semen analysis")).toBeNull();
  });

  it("increases the Readiness_Score when a His task is completed (Req 5.4)", () => {
    const tasks = [task("him", "Bring records to consult", 10)];
    render(<TaskBoard tasks={tasks} readinessScore={62} />);

    const his = screen.getByRole("region", { name: "His tasks" });
    const meter = within(his).getByRole("progressbar", { name: /readiness/i });
    expect(meter).toHaveAttribute("aria-valuenow", "62");

    const toggle = within(his).getByRole("button", {
      name: /Bring records to consult/i,
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(meter).toHaveAttribute("aria-valuenow", "72");
  });

  it("clamps the Readiness_Score to 100 (Req 5.4)", () => {
    const tasks = [task("him", "Big readiness win", 80)];
    render(<TaskBoard tasks={tasks} readinessScore={62} />);

    const his = screen.getByRole("region", { name: "His tasks" });
    const meter = within(his).getByRole("progressbar", { name: /readiness/i });

    fireEvent.click(
      within(his).getByRole("button", { name: /Big readiness win/i }),
    );

    expect(meter).toHaveAttribute("aria-valuenow", "100");
  });

  it("does not let Her/Together completions change the Readiness_Score", () => {
    const tasks = [task("together", "Verify coverage", 25)];
    render(<TaskBoard tasks={tasks} readinessScore={62} />);

    const his = screen.getByRole("region", { name: "His tasks" });
    const meter = within(his).getByRole("progressbar", { name: /readiness/i });
    expect(meter).toHaveAttribute("aria-valuenow", "62");

    const together = screen.getByRole("region", { name: "Together tasks" });
    fireEvent.click(within(together).getByRole("button", { name: /Verify coverage/i }));

    expect(meter).toHaveAttribute("aria-valuenow", "62");
  });

  it("shows a failure indication and creates no tasks when extraction failed (Req 5.6)", () => {
    render(<TaskBoard tasks={[]} extractionFailed />);

    expect(screen.getByRole("status")).toHaveTextContent(/couldn.t read/i);
    expect(screen.getByText(/no tasks were created/i)).toBeInTheDocument();

    // No task toggles exist.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
