import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { CallConsole } from "@/components/mariposa/CallConsole";
import {
  INSURANCE_RESULT_FIELDS,
  CLINIC_RESULT_FIELDS,
} from "@/components/mariposa/call/fields";
import type {
  CallResultLike,
  CallType,
  Turn,
} from "@/components/mariposa/call/types";
import { fc, propertyConfig } from "../property";

afterEach(cleanup);

// A fully-resolved insurance result, grounded in call-scripts.md.
const INSURANCE_RESULT: CallResultLike = {
  diagnostic_covered: true,
  semen_analysis_covered: true,
  hormone_labs_covered: true,
  prior_auth_required_for: ["IUI", "IVF"],
  in_network_lab: "Crest Diagnostics",
  deductible: 1500,
  coinsurance_pct: 20,
  oop_max: 4000,
  referral_required: false,
  follow_up_tasks: [],
};

// A fully-resolved clinic result, grounded in call-scripts.md.
const CLINIC_RESULT: CallResultLike = {
  booked: {
    date: "2026-06-25",
    time: "14:00",
    mode: "in_person",
    clinic: "Bay Area Fertility & Reproductive Health",
  },
  bring_list: ["ID", "insurance card", "cycle history"],
  tasks: { her: ["Gather cycle history"], him: ["Bring semen analysis"], together: [] },
};

const SAMPLE_TRANSCRIPT: Turn[] = [
  { speaker: "agent", text: "Hi, I'm Mariposa, verifying fertility benefits." },
  { speaker: "responder", text: "Sure, what would you like to know?" },
  { speaker: "agent", text: "Is diagnostic evaluation covered?" },
  { speaker: "human", text: "Yes, after the deductible." },
];

describe("Feature: mariposa, Property 28 (UI portion): LIVE iff not fallback, FALLBACK iff fallback (Task 22.2)", () => {
  // **Validates: Requirements 20.2**
  it("shows LIVE exactly when usedFallback is false and FALLBACK exactly when it is true", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom<CallType>("insurance", "clinic"),
        (usedFallback, callType) => {
          const result = callType === "insurance" ? INSURANCE_RESULT : CLINIC_RESULT;
          render(
            <CallConsole
              callType={callType}
              transcript={SAMPLE_TRANSCRIPT}
              result={result}
              usedFallback={usedFallback}
            />,
          );

          const indicator = screen.getByTestId("call-source-indicator");
          const text = indicator.textContent ?? "";

          if (usedFallback) {
            expect(indicator.getAttribute("data-source")).toBe("fallback");
            expect(text).toContain("FALLBACK");
            expect(text).not.toContain("LIVE");
          } else {
            expect(indicator.getAttribute("data-source")).toBe("live");
            expect(text).toContain("LIVE");
            expect(text).not.toContain("FALLBACK");
          }

          cleanup();
        },
      ),
      propertyConfig(),
    );
  });
});

describe("CallConsole transcript ordering and progressive fields (Task 22.3)", () => {
  // **Validates: Requirements 20.1, 20.3**
  it("renders transcript turns in chronological order with the human role normalized", () => {
    render(
      <CallConsole
        callType="insurance"
        transcript={SAMPLE_TRANSCRIPT}
        result={INSURANCE_RESULT}
        usedFallback={false}
      />,
    );

    const turns = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="call-turn"]'),
    );

    // Same number of turns, in the same order they were provided (Req 20.1).
    expect(turns).toHaveLength(SAMPLE_TRANSCRIPT.length);
    turns.forEach((turn, index) => {
      expect(turn.getAttribute("data-turn-index")).toBe(String(index));
      expect(turn.textContent ?? "").toContain(SAMPLE_TRANSCRIPT[index].text);
    });

    // "responder" and "human" both normalize to the human role.
    expect(turns[0].getAttribute("data-role")).toBe("agent");
    expect(turns[1].getAttribute("data-role")).toBe("human"); // from "responder"
    expect(turns[3].getAttribute("data-role")).toBe("human"); // from "human"
  });

  it("shows resolved result fields with their value and unresolved fields as pending (no substitute)", () => {
    // A partial result: only two insurance fields resolved.
    const partial: CallResultLike = {
      diagnostic_covered: true,
      in_network_lab: "Crest Diagnostics",
    };

    render(
      <CallConsole
        callType="insurance"
        transcript={SAMPLE_TRANSCRIPT}
        result={partial}
        usedFallback={false}
      />,
    );

    for (const field of INSURANCE_RESULT_FIELDS) {
      const cell = screen.getByTestId(
        (_content, el) =>
          el?.getAttribute("data-testid") === "result-field" &&
          el.getAttribute("data-field") === field.key,
      );
      const valueEl = cell.querySelector("[data-field-value]");
      const pendingEl = cell.querySelector("[data-field-pending]");

      const isPresent =
        field.key === "diagnostic_covered" || field.key === "in_network_lab";

      if (isPresent) {
        expect(cell.getAttribute("data-resolved")).toBe("true");
        expect(valueEl).not.toBeNull();
        expect(pendingEl).toBeNull();
      } else {
        // Unresolved: a quiet pending affordance, never a fabricated value.
        expect(cell.getAttribute("data-resolved")).toBe("false");
        expect(valueEl).toBeNull();
        expect(pendingEl).not.toBeNull();
        expect(within(cell).getByText("Pending")).toBeInTheDocument();
      }
    }

    // The two provided values appear as given.
    const diagnostic = screen.getByTestId(
      (_c, el) =>
        el?.getAttribute("data-field") === "diagnostic_covered",
    );
    expect(within(diagnostic).getByText("Covered")).toBeInTheDocument();
    const lab = screen.getByTestId(
      (_c, el) => el?.getAttribute("data-field") === "in_network_lab",
    );
    expect(within(lab).getByText("Crest Diagnostics")).toBeInTheDocument();
  });

  it("renders all clinic result fields, flattening the booked object", () => {
    render(
      <CallConsole
        callType="clinic"
        transcript={[]}
        result={CLINIC_RESULT}
        usedFallback={true}
      />,
    );

    for (const field of CLINIC_RESULT_FIELDS) {
      const cell = screen.getByTestId(
        (_c, el) =>
          el?.getAttribute("data-testid") === "result-field" &&
          el.getAttribute("data-field") === field.key,
      );
      expect(cell.getAttribute("data-resolved")).toBe("true");
    }

    // Empty transcript shows the waiting affordance, no turns.
    expect(
      document.querySelectorAll('[data-testid="call-turn"]'),
    ).toHaveLength(0);
  });
});
