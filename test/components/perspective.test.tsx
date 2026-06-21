import * as React from "react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { PerspectiveProvider } from "@/components/mariposa/PerspectiveProvider";
import { WorkspaceTabs } from "@/components/mariposa/WorkspaceTabs";
import { buildSeedCouple } from "@/lib/db/seed";

/*
  Req 1.2 — each partner signs in as themselves and sees a RESTRICTED set of
  workspace views: their own view + the shared Together view, never the other
  partner's private view. We seed localStorage with a perspective so the
  provider hydrates signed-in, then assert the visible tabs.
*/

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
});

function renderWorkspace() {
  const workspace = buildSeedCouple();
  return render(
    <PerspectiveProvider>
      <WorkspaceTabs workspace={workspace} />
    </PerspectiveProvider>,
  );
}

describe("WorkspaceTabs — per-partner restricted views (Req 1.2)", () => {
  it("shows only His and Together when signed in as Daniel (him)", () => {
    window.localStorage.setItem("mariposa.perspective", "him");
    renderWorkspace();

    const tablist = screen.getByRole("tablist", { name: /workspace views/i });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["His", "Together"]);
    expect(within(tablist).queryByRole("tab", { name: "Her" })).toBeNull();
  });

  it("shows only Her and Together when signed in as Maya (her)", () => {
    window.localStorage.setItem("mariposa.perspective", "her");
    renderWorkspace();

    const tablist = screen.getByRole("tablist", { name: /workspace views/i });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Her", "Together"]);
    expect(within(tablist).queryByRole("tab", { name: "His" })).toBeNull();
  });

  it("defaults the active view to the signed-in partner's own view", () => {
    window.localStorage.setItem("mariposa.perspective", "him");
    renderWorkspace();

    const hisTab = screen.getByRole("tab", { name: "His" });
    expect(hisTab).toHaveAttribute("aria-selected", "true");
  });
});
