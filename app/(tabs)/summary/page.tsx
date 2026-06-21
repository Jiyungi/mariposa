import type * as React from "react";

import { AddResultCard } from "@/components/mariposa/AddResultCard";
import { DoctorSummary } from "@/components/mariposa/DoctorSummary";
import {
  InsuranceSummaryEmptyPrompt,
  InsuranceSummarySourceNote,
} from "@/components/mariposa/InsuranceSummaryPrompt";
import { SEED_COUPLE_ID } from "@/lib/db/seed";
import { buildDoctorSummary } from "@/lib/summary/build";
import {
  hasMariposaInsuranceCallRecord,
  loadWorkspaceForSummary,
} from "@/lib/workspace/load-for-summary";

/**
 * Doctor-ready Summary screen (Req 8). Overlays persisted call records so
 * verified coverage from the Mariposa insurance flow appears after it runs.
 */
export default async function SummaryPage() {
  let content: React.ReactNode;
  let showSourceNote = false;

  try {
    const workspace = await loadWorkspaceForSummary(SEED_COUPLE_ID);
    showSourceNote = hasMariposaInsuranceCallRecord(
      SEED_COUPLE_ID,
      workspace.callRecords,
    );
    const summary = buildDoctorSummary(workspace);
    content = <DoctorSummary summary={summary} />;
  } catch {
    content = (
      <div className="rounded-xl border border-border/70 bg-card p-5 text-card-foreground shadow-card">
        <h2 className="text-base font-semibold text-foreground">
          Summary unavailable
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          We couldn&apos;t load the workspace data needed to build the summary.
        </p>
      </div>
    );
  }

  return (
    <>
      <AddResultCard coupleId={SEED_COUPLE_ID} />
      {showSourceNote ? (
        <InsuranceSummarySourceNote />
      ) : (
        <InsuranceSummaryEmptyPrompt />
      )}
      {content}
    </>
  );
}
