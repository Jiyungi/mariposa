import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AddResultCard } from "@/components/mariposa/AddResultCard";
import { DoctorSummary } from "@/components/mariposa/DoctorSummary";
import { DisclaimerFooter } from "@/components/mariposa/DisclaimerFooter";
import {
  InsuranceSummaryEmptyPrompt,
  InsuranceSummarySourceNote,
} from "@/components/mariposa/InsuranceSummaryPrompt";
import { PhoneFrame } from "@/components/mariposa/PhoneFrame";
import { StickyHeader } from "@/components/mariposa/StickyHeader";
import { SEED_COUPLE_ID } from "@/lib/db/seed";
import { buildDoctorSummary } from "@/lib/summary/build";
import {
  hasMariposaInsuranceCallRecord,
  loadWorkspaceForSummary,
} from "@/lib/workspace/load-for-summary";

/**
 * Doctor-ready Summary screen (Req 8). Overlays persisted call records so
 * verified coverage from the Mariposa insurance demo appears after
 * `/demo/insurance-flow` runs.
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
    <PhoneFrame>
      <StickyHeader
        title="Doctor summary"
        subtitle="Ready to share at your visit"
        action={
          <Link
            href="/home"
            aria-label="Back to home"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        }
      />
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        <main className="mariposa-rise flex-1 px-5 py-4">
          <AddResultCard coupleId={SEED_COUPLE_ID} />
          {showSourceNote ? (
            <InsuranceSummarySourceNote />
          ) : (
            <InsuranceSummaryEmptyPrompt />
          )}
          {content}
        </main>
        <DisclaimerFooter />
      </div>
    </PhoneFrame>
  );
}
