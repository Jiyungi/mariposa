import { NextResponse } from "next/server";

import { buildSeedCouple, SeedLoadError } from "@/lib/db/seed";
import { buildDoctorSummary, doctorSummaryToText } from "@/lib/summary/build";

/**
 * Doctor-ready summary endpoint (Req 8). Assembles the summary from the seeded
 * couple using the pure `buildDoctorSummary` assembler and returns it as JSON,
 * along with the plain-text rendering used for copy-to-clipboard (Req 8.2).
 *
 * Clinical content is grounded in Reference_Data and absent values are omitted
 * by the assembler (Req 8.3, 8.4); coverage is labeled unverified and the
 * consult pending when applicable (Req 8.5, 8.6).
 */
export async function GET() {
  try {
    const workspace = buildSeedCouple();
    const summary = buildDoctorSummary(workspace);
    return NextResponse.json({
      summary,
      text: doctorSummaryToText(summary),
    });
  } catch (error) {
    const message =
      error instanceof SeedLoadError
        ? "Seed data is missing or could not be parsed."
        : "Failed to build the doctor summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
