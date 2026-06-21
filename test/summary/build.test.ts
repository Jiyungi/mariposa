import { describe, expect, it } from "vitest";

import { buildSeedCouple } from "@/lib/db/seed";
import { buildDoctorSummary, doctorSummaryToText } from "@/lib/summary/build";
import type { CoupleWorkspace } from "@/lib/db/types";

/**
 * Light unit tests for the doctor-summary assembler. They pin the grounded,
 * seed-derived behavior that Req 8 specifies: both partners' data, the trying
 * window + confidence, missing tests, doctor questions, coverage labeled
 * `unverified`, the consult `pending` (no booking on this branch), and the
 * single-string clipboard rendering. They also confirm that MISSING (null)
 * values are omitted from partner data rather than substituted.
 */
describe("buildDoctorSummary (seed couple)", () => {
  const workspace = buildSeedCouple();
  const summary = buildDoctorSummary(workspace);

  it("includes both partners with their grounded data", () => {
    expect(summary.coupleName).toBe("Maya & Daniel");
    expect(summary.partners.her.heading).toBe("Maya (her)");
    expect(summary.partners.him.heading).toBe("Daniel (him)");

    const herAmh = summary.partners.her.fields.find((f) => f.label === "AMH");
    expect(herAmh?.value).toBe("1.6 ng/mL");

    const himConc = summary.partners.him.fields.find(
      (f) => f.label === "Sperm concentration",
    );
    expect(himConc?.value).toBe("14 million/mL");
  });

  it("omits MISSING (null) labs from partner data rather than substituting", () => {
    const labels = summary.partners.her.fields.map((f) => f.label);
    expect(labels).not.toContain("Day-3 FSH");
    expect(labels).not.toContain("Mid-luteal progesterone");
    expect(labels).not.toContain("Prolactin");
    // No blank or "null"/"MISSING" placeholders leak through.
    for (const field of summary.partners.her.fields) {
      expect(field.value.trim().length).toBeGreaterThan(0);
      expect(field.value).not.toMatch(/null|MISSING|undefined/i);
    }
  });

  it("sources the trying window + confidence from the engine output", () => {
    expect(summary.tryingWindow).not.toBeNull();
    expect(summary.tryingWindow).toMatchObject({
      fertileWindowStart: "2026-06-27",
      fertileWindowEnd: "2026-07-18",
      minOvulation: "2026-07-02",
      maxOvulation: "2026-07-17",
      confidence: "Low",
    });
  });

  it("flags the missing female labs, borderline semen, and unverified coverage", () => {
    const ids = summary.missingTests.map((m) => `${m.kind}:${m.label}`);
    expect(ids).toContain("missing:Day-3 FSH");
    expect(ids).toContain("missing:Mid-luteal progesterone");
    expect(ids).toContain("missing:Prolactin");
    expect(summary.missingTests.some((m) => m.kind === "borderline")).toBe(true);
    expect(
      summary.missingTests.some(
        (m) => m.kind === "unverified" && m.label === "Insurance coverage",
      ),
    ).toBe(true);
    // Every flag carries a non-empty grounded explanation + source.
    for (const item of summary.missingTests) {
      expect(item.explanation.length).toBeGreaterThan(0);
      expect(item.source.length).toBeGreaterThan(0);
    }
  });

  it("applies the duration rule and recommends early evaluation on red flags", () => {
    expect(summary.durationGuidance).not.toBeNull();
    expect(summary.durationGuidance?.thresholdMonths).toBe(12);
    expect(summary.durationGuidance?.recommendEarlyEvaluation).toBe(true);
    expect(summary.durationGuidance?.redFlags).toContain("irregular cycles");
    expect(summary.durationGuidance?.redFlags).toContain(
      "borderline semen analysis",
    );
  });

  it("produces grounded doctor questions that cite reference sources", () => {
    expect(summary.doctorQuestions.length).toBeGreaterThan(0);
    for (const question of summary.doctorQuestions) {
      expect(question).toMatch(/reference\.md|\.md\)/);
    }
  });

  it("labels coverage unverified for the partial_unconfirmed seed couple", () => {
    expect(summary.coverage.status).toBe("unverified");
    // Plan-identification facts are present; benefit facts are omitted (no call).
    expect(
      summary.coverage.planFacts.some((f) => f.label === "Provider"),
    ).toBe(true);
    expect(summary.coverage.verifiedFacts).toHaveLength(0);
    expect(summary.coverage.note).toContain("unverified");
  });

  it("shows the consult as pending when no booking exists", () => {
    expect(summary.appointment.status).toBe("pending");
    expect(summary.appointment.date).toBeNull();
    expect(summary.appointment.bringList).toHaveLength(0);
  });

  it("serializes the whole summary to a single plain-text string", () => {
    const text = doctorSummaryToText(summary);
    expect(typeof text).toBe("string");
    expect(text).toContain("Doctor Summary — Maya & Daniel");
    expect(text).toContain("Trying window");
    expect(text).toContain("Missing / borderline tests");
    expect(text).toContain("Questions for the doctor");
    expect(text).toContain("Insurance coverage (unverified)");
    expect(text).toContain("Status: pending");
  });
});

describe("buildDoctorSummary (booked consult + verified coverage)", () => {
  it("reports a booked consult and verified coverage facts when present", () => {
    const base = buildSeedCouple();
    const workspace: CoupleWorkspace = {
      ...base,
      couple: { ...base.couple, coverage_status: "confirmed" },
      calendarEvents: [
        {
          id: "evt_consult",
          couple_id: base.couple.id,
          type: "doctor_consult",
          title: "Fertility consult",
          date: "2026-06-25",
          time: "14:00",
          description: null,
        },
      ],
      callRecords: [
        {
          id: "call_ins",
          couple_id: base.couple.id,
          call_type: "insurance",
          transcript: [],
          extracted_result: {
            diagnostic_covered: true,
            semen_analysis_covered: true,
            in_network_lab: "Crest Diagnostics",
            deductible: 1500,
          },
          used_fallback: true,
          unresolved_fields: [],
        },
        {
          id: "call_clinic",
          couple_id: base.couple.id,
          call_type: "clinic",
          transcript: [],
          extracted_result: {
            booked: {
              date: "2026-06-25",
              time: "14:00",
              mode: "in_person",
              clinic: "Bay Area Fertility & Reproductive Health",
            },
            bring_list: ["ID", "insurance card", "semen analysis"],
          },
          used_fallback: true,
          unresolved_fields: [],
        },
      ],
    };

    const summary = buildDoctorSummary(workspace);
    expect(summary.coverage.status).toBe("verified");
    expect(
      summary.coverage.verifiedFacts.some(
        (f) => f.label === "In-network lab" && f.value === "Crest Diagnostics",
      ),
    ).toBe(true);
    expect(summary.appointment.status).toBe("booked");
    expect(summary.appointment.date).toBe("2026-06-25");
    expect(summary.appointment.clinic).toBe(
      "Bay Area Fertility & Reproductive Health",
    );
    expect(summary.appointment.bringList).toContain("semen analysis");
  });
});
