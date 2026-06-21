import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Card, CardHeader, Field, FieldGroup } from "@/components/mariposa/Card";
import { DisclaimerFooter } from "@/components/mariposa/DisclaimerFooter";
import { PhoneFrame } from "@/components/mariposa/PhoneFrame";
import { StickyHeader } from "@/components/mariposa/StickyHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InsuranceFlowResult } from "@/lib/orkes/insurance-flow";

function formatFlag(value: boolean): string {
  return value ? "Yes (fallback)" : "No (live path)";
}

function formatMemory(result: InsuranceFlowResult["memory"]): string {
  if (!result.written) return "Skipped (Redis unavailable)";
  return `Written to ${result.redisKey}`;
}

export function InsuranceFlowDemo({ result }: { result: InsuranceFlowResult }) {
  const { insuranceResult } = result;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Mariposa insurance flow"
          description="Insurance admin workflow for the seed couple"
        />
        <FieldGroup className="mt-4">
          <Field label="Workflow">{result.workflowName}</Field>
          <Field label="Orchestration">{result.orchestrationMode}</Field>
          {result.agentspan ? (
            <Field label="Agentspan execution">
              <a
                href={result.agentspan.uiUrl}
                className="text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {result.agentspan.executionId}
              </a>
            </Field>
          ) : null}
          <Field label="Couple">{result.coupleId}</Field>
          <Field label="Retrieval">
            {result.retrieval.mode} ({result.retrieval.chunkCount} chunks)
          </Field>
          <Field label="Voice provider">{result.providers.voice}</Field>
          <Field label="Model provider">{result.providers.model}</Field>
          <Field label="Web verification">{result.providers.web}</Field>
          <Field label="Portal mode">{result.webVerification.mode}</Field>
          {result.webVerification.url ? (
            <Field label="Portal URL">
              <a
                href={result.webVerification.url}
                className="break-all text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {result.webVerification.url}
              </a>
            </Field>
          ) : null}
          <Field label="Transcript turns">{result.transcript.length}</Field>
          <Field label="Memory">{formatMemory(result.memory)}</Field>
          <Field label="Persisted call">{result.persistence.callRecordId}</Field>
          <Field label="Tasks added">{result.persistence.tasksAdded}</Field>
          <Field label="Summary updated">
            {result.persistence.summaryUpdated ? "Yes" : "No"}
          </Field>
        </FieldGroup>
      </Card>

      <Card>
        <CardHeader
          title="Fallback flags"
          description="Deterministic paths used when sponsor credentials are absent"
        />
        <FieldGroup className="mt-4">
          <Field label="Local orchestration">
            {formatFlag(result.fallbackFlags.localOrchestration)}
          </Field>
          <Field label="Deterministic transcript">
            {formatFlag(result.fallbackFlags.deterministicTranscript)}
          </Field>
          <Field label="Deterministic model">
            {formatFlag(result.fallbackFlags.deterministicModel)}
          </Field>
          <Field label="Portal snapshot fallback">
            {formatFlag(result.fallbackFlags.deterministicPortal)}
          </Field>
        </FieldGroup>
      </Card>

      <Card>
        <CardHeader
          title="Member portal excerpt"
          description="Grounding from Browserbase fetch or local synthetic portal"
        />
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-secondary-foreground">
          {result.webVerification.excerpt.slice(0, 900)}
          {result.webVerification.excerpt.length > 900 ? "…" : ""}
        </p>
        <div className="mt-4">
          <Link
            href="/demo/pacific-crest-benefits"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open synthetic portal page
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader title="Extracted coverage" />
        <FieldGroup className="mt-4">
          <Field label="Diagnostic covered">
            {insuranceResult.diagnostic_covered ? "Yes" : "No"}
          </Field>
          <Field label="Semen analysis covered">
            {insuranceResult.semen_analysis_covered ? "Yes" : "No"}
          </Field>
          <Field label="Hormone labs covered">
            {insuranceResult.hormone_labs_covered ? "Yes" : "No"}
          </Field>
          <Field label="In-network lab">{insuranceResult.in_network_lab}</Field>
          <Field label="Deductible">${insuranceResult.deductible}</Field>
          <Field label="Coinsurance">
            {insuranceResult.coinsurance_pct}%
          </Field>
          <Field label="OOP max">${insuranceResult.oop_max}</Field>
          <Field label="Referral required">
            {insuranceResult.referral_required ? "Yes" : "No"}
          </Field>
        </FieldGroup>
      </Card>

      {insuranceResult.follow_up_tasks.length > 0 ? (
        <Card>
          <CardHeader title="Follow-up tasks" />
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-foreground">
            {insuranceResult.follow_up_tasks.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {result.persistence.tasksAdded > 0 ? (
        <Card>
          <CardHeader
            title="Saved to workspace"
            description="Follow-ups and coverage are available in the app."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/tasks" className={cn(buttonVariants({ size: "sm" }))}>
              Open Tasks tab
            </Link>
            <Link
              href="/summary"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Open doctor summary
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function InsuranceFlowDemoChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneFrame>
      <StickyHeader
        title="Insurance flow demo"
        subtitle="Insurance admin workflow"
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
        <main className="mariposa-rise flex-1 px-5 py-4">{children}</main>
        <DisclaimerFooter />
      </div>
    </PhoneFrame>
  );
}
