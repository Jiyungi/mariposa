import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import {
  WorkflowViewer,
  defaultWorkflowGraph,
  defaultWorkflowSteps,
  type WorkflowGraph,
} from "@/components/mariposa/WorkflowViewer";

afterEach(cleanup);

/*
  Task 21.2 — structural render test for the event-driven WorkflowViewer.
  Asserts that a parallel group renders its concurrent branches side-by-side
  (both visible, not collapsed to a single line) and that a step paused at the
  booking approval gate renders with the paused chip/indicator.

  **Validates: Requirements 20.4, 20.5**
*/

describe("WorkflowViewer — parallel branches (Task 21.2, Req 20.4)", () => {
  it("renders a parallel group as two concurrent branches side-by-side", () => {
    const graph: WorkflowGraph = {
      lanes: [
        {
          kind: "parallel",
          id: "analyze",
          title: "Analyze both partners",
          branches: [
            {
              id: "her-track",
              title: "Her",
              steps: [
                { id: "analyze-her", label: "Analyze her data", status: "running" },
              ],
            },
            {
              id: "his-track",
              title: "His",
              steps: [
                { id: "analyze-his", label: "Analyze his data", status: "completed" },
              ],
            },
          ],
        },
      ],
    };

    render(<WorkflowViewer graph={graph} />);

    // The parallel group exists and is marked as containing 2 branches.
    const group = screen.getByTestId("workflow-parallel-analyze");
    expect(group).toHaveAttribute("data-parallel", "true");
    expect(group).toHaveAttribute("data-branch-count", "2");

    // Both branch tracks render and are visible — concurrency is shown as
    // distinct side-by-side tracks rather than one vertical line.
    const branches = within(group).getAllByTestId(/^workflow-branch-/);
    expect(branches).toHaveLength(2);
    expect(within(group).getByTestId("workflow-branch-her-track")).toBeVisible();
    expect(within(group).getByTestId("workflow-branch-his-track")).toBeVisible();

    // Both concurrent steps are present, each in its own branch.
    expect(screen.getByText("Analyze her data")).toBeInTheDocument();
    expect(screen.getByText("Analyze his data")).toBeInTheDocument();
  });

  it("renders both fan-out groups of the default design graph as parallel tracks", () => {
    render(<WorkflowViewer graph={defaultWorkflowGraph()} />);

    // analyze her | analyze his
    const analyze = screen.getByTestId("workflow-parallel-analyze");
    expect(within(analyze).getAllByTestId(/^workflow-branch-/)).toHaveLength(2);

    // insurance call | clinic call
    const calls = screen.getByTestId("workflow-parallel-calls");
    expect(within(calls).getAllByTestId(/^workflow-branch-/)).toHaveLength(2);
  });
});

describe("WorkflowViewer — paused approval gate (Task 21.2, Req 20.5)", () => {
  it("renders a step paused at the approval gate with the paused chip", () => {
    const graph: WorkflowGraph = {
      lanes: [
        {
          kind: "step",
          step: { id: "approval-gate", label: "Booking approval", status: "paused" },
        },
      ],
    };

    render(<WorkflowViewer graph={graph} />);

    const step = screen.getByTestId("workflow-step-approval-gate");
    expect(step).toHaveAttribute("data-status", "paused");
    // The calm paused chip renders within the step.
    expect(within(step).getByText("Waiting")).toBeInTheDocument();
  });

  it("the default design graph shows the booking gate paused with an approval notice", () => {
    render(<WorkflowViewer graph={defaultWorkflowGraph()} />);

    const gate = screen.getByTestId("workflow-step-approval-gate");
    expect(gate).toHaveAttribute("data-status", "paused");
    expect(within(gate).getByText("Waiting")).toBeInTheDocument();

    // A calm status notice surfaces the pause to the couple (Req 20.5).
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/waiting for your approval/i);
  });
});

describe("WorkflowViewer — backward compatibility (linear steps)", () => {
  it("still renders the linear steps prop as an ordered stepper", () => {
    const steps = defaultWorkflowSteps();
    render(<WorkflowViewer steps={steps} />);

    for (const step of steps) {
      const el = screen.getByTestId(`workflow-step-${step.id}`);
      expect(el).toHaveAttribute("data-status", "pending");
    }
    // No parallel groups in the linear path.
    expect(screen.queryByTestId(/^workflow-parallel-/)).toBeNull();
  });
});
