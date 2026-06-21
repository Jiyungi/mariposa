"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Card, CardHeader } from "@/components/mariposa/Card";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  {
    value: "her_labs",
    label: "Her labs",
    placeholder: "AMH 1.8, TSH 2.0, day 3 FSH 7.2, estradiol 45",
  },
  {
    value: "semen_analysis",
    label: "Semen analysis",
    placeholder:
      "2026-06-21 concentration 18 million, progressive motility 34%, morphology 4%",
  },
  {
    value: "insurance",
    label: "Insurance update",
    placeholder: "Prior authorization was approved; pharmacy formulary still pending.",
  },
  {
    value: "clinic",
    label: "Clinic instruction",
    placeholder: "Clinic asked us to bring semen analysis and day 3 labs to consult.",
  },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export function AddResultCard({ coupleId = "couple_001" }: { coupleId?: string }) {
  const router = useRouter();
  const [category, setCategory] = React.useState<Category>("her_labs");
  const [note, setNote] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const selected = CATEGORIES.find((item) => item.value === category) ?? CATEGORIES[0];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId, category, note }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not save result.");
      }

      setStatus("saved");
      setNote("");
      router.refresh();
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save result.",
      );
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Add a new result"
        description="Paste a lab, semen analysis, insurance update, or clinic instruction. Mariposa will update the workspace context."
      />
      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-foreground">Result type</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-foreground">Result details</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={selected.placeholder}
            rows={4}
            className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground"
          />
        </label>

        <Button type="submit" size="sm" disabled={status === "saving" || note.trim().length < 3}>
          {status === "saving" ? "Saving..." : "Save result"}
        </Button>

        {status === "saved" ? (
          <p className="text-sm font-medium text-success-foreground">
            Saved. Summary and tasks are refreshing.
          </p>
        ) : null}
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      </form>
    </Card>
  );
}
