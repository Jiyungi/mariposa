import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  InsuranceTasksEmptyPrompt,
  InsuranceTasksSourceNote,
} from "@/components/mariposa/InsuranceTasksPrompt";

afterEach(cleanup);

describe("InsuranceTasksPrompt", () => {
  it("prompts users to run the insurance demo when tasks are empty", () => {
    render(<InsuranceTasksEmptyPrompt />);

    expect(screen.getByText(/no insurance follow-ups yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /run insurance flow demo/i }),
    ).toHaveAttribute("href", "/demo/insurance-flow");
  });

  it("shows a source note when insurance tasks are present", () => {
    render(<InsuranceTasksSourceNote taskCount={3} />);

    expect(screen.getByText(/insurance follow-ups loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/3 Together tasks/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /re-run demo/i })).toHaveAttribute(
      "href",
      "/demo/insurance-flow",
    );
  });
});
