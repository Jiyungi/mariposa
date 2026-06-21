import { describe, expect, it } from "vitest";

import {
  buildVoiceIntakeReply,
  extractVoiceIntakeDraft,
  summarizeVoiceIntakeDraft,
} from "@/lib/intake/voice";

describe("voice intake extraction", () => {
  it("extracts common spoken intake details", () => {
    const draft = extractVoiceIntakeDraft(
      "I'm 33, we have been trying for 8 months, my cycles are irregular, and we want IVF coverage help.",
    );

    expect(draft).toEqual({
      her: {
        age: 33,
        months_trying: 8,
        cycle_regular: false,
      },
      together: {
        goal: "Explore IVF options",
        top_concern: "Insurance and cost clarity",
      },
    });
  });

  it("summarizes captured fields for the review preview", () => {
    const summary = summarizeVoiceIntakeDraft({
      her: { age: 31, avg_cycle_length: 29, cycle_regular: true },
      his: { semen_analysis_status: "completed" },
    });

    expect(summary).toEqual([
      "Age: 31",
      "Cycles: regular",
      "Average cycle: 29 days",
      "Semen analysis: completed",
    ]);
  });

  it("asks for the next missing field", () => {
    expect(buildVoiceIntakeReply({ her: { age: 33 } })).toContain(
      "How many months",
    );
    expect(
      buildVoiceIntakeReply({
        her: { age: 33, months_trying: 8, cycle_regular: false },
      }),
    ).toContain("I captured");
  });
});
