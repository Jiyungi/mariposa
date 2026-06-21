import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  InsuranceSummaryEmptyPrompt,
  InsuranceSummarySourceNote,
} from "@/components/mariposa/InsuranceSummaryPrompt";

afterEach(cleanup);

describe("InsuranceSummaryPrompt", () => {
  it("prompts users to run the insurance demo when coverage is absent", () => {
    render(<InsuranceSummaryEmptyPrompt />);

    expect(screen.getByText(/coverage not verified/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /run insurance flow demo/i }),
    ).toHaveAttribute("href", "/demo/insurance-flow");
  });

  it("shows a source note when verified coverage is present", () => {
    render(<InsuranceSummarySourceNote />);

    expect(screen.getByText(/verified coverage loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /re-run demo/i })).toHaveAttribute(
      "href",
      "/demo/insurance-flow",
    );
  });
});
