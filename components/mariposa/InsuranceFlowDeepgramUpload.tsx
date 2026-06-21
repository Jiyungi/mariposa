"use client";

import { useState } from "react";

import { Card, CardHeader, Field, FieldGroup } from "@/components/mariposa/Card";
import { InsuranceFlowDemo } from "@/components/mariposa/InsuranceFlowDemo";
import { Button } from "@/components/ui/button";
import type { InsuranceFlowResult } from "@/lib/orkes/insurance-flow";

interface DeepgramUploadResponse {
  result: InsuranceFlowResult;
  deepgram: {
    model: string;
    fileName: string;
    fileSize: number;
    transcriptTurns: number;
    transcript: InsuranceFlowResult["transcript"];
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InsuranceFlowDeepgramUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DeepgramUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose an audio file first.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set("audio", file);

    try {
      const response = await fetch("/api/demo/insurance-flow/deepgram", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Deepgram transcription failed.");
      }

      setResult(json as DeepgramUploadResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <details className="space-y-4">
      <summary className="cursor-pointer rounded-xl border border-border/70 bg-card p-4 text-sm font-medium text-muted-foreground shadow-card transition-colors hover:text-foreground">
        Developer test: Deepgram insurance transcript input
      </summary>

      <div className="pt-4">
        <Card>
          <CardHeader
            title="Deepgram transcript test"
            description="Optional developer-only check: transcribe a prerecorded insurance call and rerun this workflow with that transcript."
          />
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Audio file</span>
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
                className="mt-2 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button type="submit" size="sm" disabled={isUploading || !file}>
              {isUploading ? "Transcribing..." : "Transcribe with Deepgram"}
            </Button>
            {error ? (
              <p className="text-sm font-medium text-destructive">{error}</p>
            ) : null}
          </form>
        </Card>
      </div>

      {result ? (
        <>
          <Card>
            <CardHeader
              title="Deepgram transcription result"
              description="This run used uploaded audio instead of the deterministic transcript."
            />
            <FieldGroup className="mt-4">
              <Field label="Model">{result.deepgram.model}</Field>
              <Field label="File">{result.deepgram.fileName}</Field>
              <Field label="Size">
                {formatFileSize(result.deepgram.fileSize)}
              </Field>
              <Field label="Transcript turns">
                {result.deepgram.transcriptTurns}
              </Field>
              <Field label="Voice provider">
                {result.result.providers.voice}
              </Field>
            </FieldGroup>
          </Card>
          <InsuranceFlowDemo result={result.result} />
        </>
      ) : null}
    </details>
  );
}
