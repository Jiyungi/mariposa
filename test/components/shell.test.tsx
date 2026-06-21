import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { AppShell } from "@/components/mariposa/AppShell";
import { PHONE_WIDTH } from "@/components/mariposa/PhoneFrame";
import { TABS } from "@/components/mariposa/BottomTabs";

// The shell relies on the App Router. Mock the two Next hooks/components it
// touches so the chrome renders in jsdom without an app-router context.
const navState = vi.hoisted(() => ({ path: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navState.path,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("App shell structure (Task 12.3)", () => {
  it("renders the 390px phone frame", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const frame = screen.getByTestId("phone-frame");
    expect(frame).toBeInTheDocument();
    expect(frame.style.width).toBe(`${PHONE_WIDTH}px`);
    expect(PHONE_WIDTH).toBe(390);
  });

  it("renders exactly four bottom tabs: Home, Calendar, Tasks, Chat", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: /primary/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);

    const expected = [
      { label: "Home", href: "/home" },
      { label: "Calendar", href: "/calendar" },
      { label: "Tasks", href: "/tasks" },
      { label: "Chat", href: "/chat" },
    ];
    expect(TABS.map((t) => ({ label: t.label, href: t.href }))).toEqual(
      expected,
    );

    for (const { label, href } of expected) {
      const link = within(nav).getByRole("link", { name: new RegExp(label) });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("marks the active tab from the current path", () => {
    navState.path = "/calendar";
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: /primary/i });
    const active = within(nav).getByRole("link", { name: /calendar/i });
    expect(active).toHaveAttribute("aria-current", "page");

    const home = within(nav).getByRole("link", { name: /home/i });
    expect(home).not.toHaveAttribute("aria-current");

    navState.path = "/home";
  });
});
