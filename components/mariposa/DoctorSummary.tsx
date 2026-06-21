"use client";

import * as React from "react";
import { Check, ClipboardCopy } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Field, FieldGroup } from "@/components/mariposa/Card";
import {
  doctorSummaryToText,
  formatIsoDate,
  formatTime,
  type DoctorSummary as DoctorSummaryData,
  type DoctorSummaryPartner,
} from "@/lib/summary/build";

interface DoctorSummaryProps {
  summary: DoctorSummaryData;
  className?: string;
}

/** Map a flag kind to a calm tone token (amber/indigo), never alarm-red. */
function toneForKind(kind: string): string {
  if (kind === "borderline") {
    return "bg-warning/15 text-warning-foreground";
  }
  if (kind === "unverified") {
    return "bg-info/12 text-info";
  }
  // "missing"
  return "bg-secondary text-secondary-foreground";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 text-sm font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

function PartnerCard({ partner }: { partner: DoctorSummaryPartner }) {
  return (
    <Card>
      <CardHeader title={partner.heading} className="mb-2" />
      <FieldGroup>
        {partner.fields.map((field) => (
          <Field key={field.label} label={field.label}>
            {field.value}
          </Field>
        ))}
      </FieldGroup>
    </Card>
  );
}

/**
 * The doctor-ready summary screen body (Req 8). Renders both partners' data,
 * the trying window + confidence, evaluation timing, missing/borderline tests,
 * questions for the doctor, insurance coverage (labeled verified/unverified),
 * and the consult (booked or pending) — then offers a single copy action that
 * places the entire plain-text summary on the clipboard in one operation.
 */
export function DoctorSummary({ summary, className }: DoctorSummaryProps) {
  const [copied, setCopied] = React.useState(false);
  const plainText = React.useMemo(
    () => doctorSummaryToText(summary),
    [summary],
  );

  const handleCopy = React.useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
      } else {
        // Fallback for environments without the async clipboard API.
        const area = document.createElement("textarea");
        area.value = plainText;
        area.setAttribute("readonly", "");
        area.style.position = "absolute";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [plainText]);

  const tw = summary.tryingWindow;
  const duration = summary.durationGuidance;
  const coverage = summary.coverage;
  const appt = summary.appointment;

  return (
    <div className={cn("space-y-5", className)}>
      <Button
        type="button"
        onClick={handleCopy}
        variant={copied ? "secondary" : "primary"}
        size="md"
        className="w-full"
        aria-live="polite"
      >
        {copied ? (
          <>
            <Check aria-hidden="true" />
            Copied to clipboard
          </>
        ) : (
          <>
            <ClipboardCopy aria-hidden="true" />
            Copy summary
          </>
        )}
      </Button>

      <PartnerCard partner={summary.partners.her} />
      <PartnerCard partner={summary.partners.him} />

      {tw ? (
        <Card>
          <CardHeader
            title="Trying window"
            action={
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                {tw.confidence} confidence
              </span>
            }
            className="mb-2"
          />
          <FieldGroup>
            <Field label="Fertile window">
              {`${formatIsoDate(tw.fertileWindowStart)} \u2013 ${formatIsoDate(tw.fertileWindowEnd)}`}
            </Field>
            <Field label="Priority days">
              {`${formatIsoDate(tw.minOvulation)} \u2013 ${formatIsoDate(tw.maxOvulation)}`}
            </Field>
          </FieldGroup>
          {tw.reasons.length > 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Why: {tw.reasons.join(", ")}.
            </p>
          ) : null}
        </Card>
      ) : null}

      {duration ? (
        <Card>
          <CardHeader title="Evaluation timing" className="mb-2" />
          <FieldGroup>
            <Field label="Age-based threshold">{`${duration.thresholdMonths} months`}</Field>
            {duration.monthsTrying !== null ? (
              <Field label="Months trying">{duration.monthsTrying}</Field>
            ) : null}
            <Field label="Recommendation">
              {duration.recommendEarlyEvaluation
                ? "Begin evaluation now"
                : "Continue to threshold"}
            </Field>
          </FieldGroup>
          {duration.redFlags.length > 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Red flags: {duration.redFlags.join(", ")}.
            </p>
          ) : null}
        </Card>
      ) : null}

      <section className="space-y-2.5">
        <SectionTitle>Missing &amp; borderline tests</SectionTitle>
        {summary.missingTests.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Nothing flagged.
            </p>
          </Card>
        ) : (
          <Card flush className="divide-y divide-border/60">
            {summary.missingTests.map((item) => (
              <div key={`${item.kind}-${item.label}`} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {item.label}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      toneForKind(item.kind),
                    )}
                  >
                    {item.kind}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.explanation}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>

      {summary.doctorQuestions.length > 0 ? (
        <section className="space-y-2.5">
          <SectionTitle>Questions for the doctor</SectionTitle>
          <Card>
            <ol className="space-y-3">
              {summary.doctorQuestions.map((question, index) => (
                <li key={question} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {index + 1}
                  </span>
                  <span className="text-foreground">{question}</span>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader
          title="Insurance coverage"
          action={
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                coverage.status === "verified"
                  ? "bg-success/15 text-success-foreground"
                  : "bg-info/12 text-info",
              )}
            >
              {coverage.status}
            </span>
          }
          className="mb-2"
        />
        <FieldGroup>
          {coverage.planFacts.map((fact) => (
            <Field key={fact.label} label={fact.label}>
              {fact.value}
            </Field>
          ))}
          {coverage.verifiedFacts.map((fact) => (
            <Field key={fact.label} label={fact.label}>
              {fact.value}
            </Field>
          ))}
        </FieldGroup>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {coverage.note}
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Consult"
          action={
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                appt.status === "booked"
                  ? "bg-success/15 text-success-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {appt.status}
            </span>
          }
          className="mb-2"
        />
        {appt.status === "booked" ? (
          <>
            <FieldGroup>
              {appt.date ? (
                <Field label="Date">{formatIsoDate(appt.date)}</Field>
              ) : null}
              {appt.time ? (
                <Field label="Time">{formatTime(appt.time)}</Field>
              ) : null}
              {appt.clinic ? <Field label="Clinic">{appt.clinic}</Field> : null}
              {appt.mode ? <Field label="Mode">{appt.mode}</Field> : null}
            </FieldGroup>
            {appt.bringList.length > 0 ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Bring: {appt.bringList.join(", ")}.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            The first consult is not booked yet. It will appear here once the
            clinic booking call confirms a date.
          </p>
        )}
      </Card>
    </div>
  );
}
