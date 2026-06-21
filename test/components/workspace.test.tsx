import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import {
  HerView,
  HisView,
  HER_LAB_FIELDS,
  HIM_SEMEN_FIELDS,
} from "@/components/mariposa/WorkspaceTabs";
import type { HerProfile, HimProfile, Member } from "@/lib/db/types";
import { fc, propertyConfig } from "../property";

afterEach(cleanup);

// Base profiles with every flaggable field present; the property overrides an
// arbitrary subset of clinical fields with null (MISSING) per generated case.
const BASE_HER: HerProfile = {
  couple_id: "couple_001",
  last_period_start: "2026-06-01",
  avg_cycle_length: 52,
  cycle_length_min: 45,
  cycle_length_max: 60,
  cycle_regular: false,
  months_trying: 8,
  conditions: [],
  prior_meds: [],
  ovulation_tracking: "app only",
  prior_pregnancies: 0,
  amh: 1,
  tsh: 1,
  day3_fsh: 1,
  day3_estradiol: 1,
  mid_luteal_progesterone: 1,
  prolactin: 1,
};

const HER_MEMBER: Member = {
  id: "m-her",
  couple_id: "couple_001",
  role: "her",
  name: "Maya",
  age: 33,
  dob: "1992-09-14",
};

const BASE_HIM: HimProfile = {
  couple_id: "couple_001",
  semen_analysis_status: "completed",
  semen_analysis_date: "2026-05-20",
  volume_ml: 2,
  concentration_million_ml: 20,
  total_count_million: 40,
  progressive_motility_pct: 35,
  total_motility_pct: 45,
  morphology_normal_pct: 5,
  vitality_pct: 60,
  ph: 7.4,
  lifestyle: {
    smoking: false,
    alcohol: "moderate",
    heat_exposure: false,
    sleep: "ok",
    stress: "low",
    bmi: 24,
    supplements: false,
  },
  medical_history: {
    surgeries: "none",
    varicocele: "unknown",
    medications: "none",
    prior_children: 0,
  },
  readiness_score: 62,
};

const HIM_MEMBER: Member = {
  id: "m-him",
  couple_id: "couple_001",
  role: "him",
  name: "Daniel",
  age: 35,
  dob: "1990-11-02",
};

/** A nullable clinical value: a concrete number, or null (MISSING). */
const nullableValue = fc.option(fc.integer({ min: 0, max: 300 }), { nil: null });

/**
 * Assert a single value cell renders correctly for its (possibly null) value:
 * a null value shows a MISSING flag and NO substituted numeric value; a
 * present value shows the number and NO flag.
 */
function assertCell(id: string, value: number | null) {
  const cell = screen.getByTestId(`value-${id}`);
  const flag = cell.querySelector("[data-missing]");
  const numberEl = cell.querySelector(".tabular-nums");

  if (value === null) {
    // Rendered as a flag — never blank, never a substituted value (Req 1.8).
    expect(flag).not.toBeNull();
    expect(within(cell).getByText("Missing")).toBeInTheDocument();
    expect(numberEl).toBeNull();
  } else {
    // Present value shown, no flag.
    expect(flag).toBeNull();
    expect(numberEl).not.toBeNull();
    expect(numberEl?.textContent ?? "").toContain(String(value));
  }
}

describe("Feature: mariposa, Property 24: MISSING values render as flags (Task 14.2)", () => {
  // **Validates: Requirements 1.8**
  it("renders every MISSING female lab as a flag, never blank or substituted", () => {
    const labArb = fc.record(
      Object.fromEntries(HER_LAB_FIELDS.map((f) => [f.id, nullableValue])),
    ) as fc.Arbitrary<Record<(typeof HER_LAB_FIELDS)[number]["id"], number | null>>;

    fc.assert(
      fc.property(labArb, (labs) => {
        const her: HerProfile = { ...BASE_HER, ...labs };
        render(<HerView her={her} member={HER_MEMBER} tasks={[]} />);

        for (const field of HER_LAB_FIELDS) {
          assertCell(field.id, her[field.id]);
        }

        cleanup();
      }),
      propertyConfig(),
    );
  });

  it("renders every MISSING semen parameter as a flag, never blank or substituted", () => {
    const semenArb = fc.record(
      Object.fromEntries(HIM_SEMEN_FIELDS.map((f) => [f.id, nullableValue])),
    ) as fc.Arbitrary<Record<(typeof HIM_SEMEN_FIELDS)[number]["id"], number | null>>;

    fc.assert(
      fc.property(semenArb, (semen) => {
        const him: HimProfile = { ...BASE_HIM, ...semen };
        render(<HisView him={him} member={HIM_MEMBER} tasks={[]} />);

        for (const field of HIM_SEMEN_FIELDS) {
          assertCell(field.id, him[field.id]);
        }

        cleanup();
      }),
      propertyConfig(),
    );
  });
});
