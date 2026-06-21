import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import {
  ProgressJourney,
  defaultJourney,
} from "@/components/mariposa/ProgressJourney";

/*
  The user-facing progress abstraction (Req 20, user-abstraction): couples see a
  swipeable strip of plain-language phase cards, not the workflow internals.
*/

afterEach(cleanup);

describe("ProgressJourney — abstracted, swipeable status cards", () => {
  it("renders one card per phase with no technical step names", () => {
    render(<ProgressJourney />);
    for (const phase of defaultJourney()) {
      const card = screen.getByTestId(`journey-phase-${phase.id}`);
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute("data-status", phase.status);
    }
    // The plain-language titles are present; no "step.run"/"Inngest" jargon.
    expect(screen.getByText("Your okay needed")).toBeInTheDocument();
    expect(screen.queryByText(/inngest|waitForEvent|step\.run/i)).toBeNull();
  });

  it("reports the current step and overall progress", () => {
    render(<ProgressJourney />);
    const journey = defaultJourney();
    const activeIndex = journey.findIndex((p) => p.status === "active");
    expect(
      screen.getByText(`Step ${activeIndex + 1} of ${journey.length}`),
    ).toBeInTheDocument();

    const bar = screen.getByRole("progressbar", { name: /overall progress/i });
    const done = journey.filter((p) => p.status === "done").length;
    expect(bar).toHaveAttribute(
      "aria-valuenow",
      String(Math.round((done / journey.length) * 100)),
    );
  });
});
