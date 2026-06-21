import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AppShell } from "@/components/mariposa/AppShell";
import { DISCLAIMER_TEXT } from "@/components/mariposa/DisclaimerFooter";
import { fc, propertyConfig } from "../property";

// Mock the App Router surface the shell touches so screens render in jsdom.
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

// The four tab routes a rendered screen can sit on.
const ROUTES = ["/home", "/calendar", "/tasks", "/chat"] as const;

// Benign content words so generated child copy never collides with the
// strings the property searches for.
const SAFE_WORDS = [
  "today",
  "window",
  "priority",
  "prep",
  "update",
  "note",
  "plan",
  "step",
  "review",
  "ready",
  "soon",
  "details",
];

// Phrases that would indicate synthetic-data clutter in a main view (Req 14.2).
const CLUTTER_PATTERN =
  /synthetic|sample data|mock data|demo data|fake data|simulated data|not real data/i;

describe("Feature: mariposa, Property 26: Single disclaimer, no synthetic-data clutter (Task 12.2)", () => {
  // **Validates: Requirements 14.1, 14.2**
  it("renders exactly one disclaimer line and no synthetic-data badge on any screen", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROUTES),
        fc.array(fc.constantFrom(...SAFE_WORDS), { maxLength: 12 }),
        (route, words) => {
          navState.path = route;
          render(
            <AppShell>
              <section>
                <h2>{words.slice(0, 4).join(" ") || "Screen"}</h2>
                <p>{words.join(" ")}</p>
              </section>
            </AppShell>,
          );

          // Exactly one disclaimer line with the exact text (Req 14.1).
          const lines = screen.queryAllByText(DISCLAIMER_TEXT);
          expect(lines).toHaveLength(1);

          // No synthetic-data badge or warning in the main view (Req 14.2).
          const bodyText = document.body.textContent ?? "";
          expect(CLUTTER_PATTERN.test(bodyText)).toBe(false);

          cleanup();
        },
      ),
      propertyConfig(),
    );

    navState.path = "/home";
  });
});
