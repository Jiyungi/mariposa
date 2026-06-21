import { z } from "zod";

import {
  createAiJsonProvider,
  type AiJsonProvider,
} from "@/lib/ai/provider";
import type { InsuranceResult, Turn } from "@/lib/types";

const insuranceResultSchema = z.object({
  diagnostic_covered: z.boolean(),
  semen_analysis_covered: z.boolean(),
  hormone_labs_covered: z.boolean(),
  prior_auth_required_for: z.array(z.string()),
  in_network_lab: z.string().min(1),
  deductible: z.number(),
  coinsurance_pct: z.number(),
  oop_max: z.number(),
  referral_required: z.boolean(),
  follow_up_tasks: z.array(z.string()),
});

export interface ExtractInsuranceWithAiInput {
  transcript: Turn[];
  context?: string;
  provider?: AiJsonProvider;
}

export interface ExtractInsuranceWithAiResult {
  result: InsuranceResult;
  provider: AiJsonProvider["name"];
}

function formatTranscript(transcript: Turn[]): string {
  return transcript
    .map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`)
    .join("\n");
}

function buildInsuranceExtractionPrompt(
  transcript: Turn[],
  context: string | undefined,
): string {
  const contextBlock = context?.trim()
    ? `Reference context:\n${context.trim()}\n\n`
    : "";

  return `${contextBlock}Transcript:\n${formatTranscript(transcript)}\n\nExtract the insurance coverage facts into this exact JSON shape:
{
  "diagnostic_covered": boolean,
  "semen_analysis_covered": boolean,
  "hormone_labs_covered": boolean,
  "prior_auth_required_for": string[],
  "in_network_lab": string,
  "deductible": number,
  "coinsurance_pct": number,
  "oop_max": number,
  "referral_required": boolean,
  "follow_up_tasks": string[]
}`;
}

export async function extractInsuranceWithAi({
  transcript,
  context,
  provider = createAiJsonProvider(),
}: ExtractInsuranceWithAiInput): Promise<ExtractInsuranceWithAiResult> {
  const raw = await provider.generateJson<unknown>({
    schemaName: "InsuranceResult",
    system:
      "You extract fertility insurance verification facts from synthetic demo call transcripts. Do not invent facts absent from the transcript or reference context.",
    prompt: buildInsuranceExtractionPrompt(transcript, context),
    temperature: 0,
  });

  return {
    result: insuranceResultSchema.parse(raw),
    provider: provider.name,
  };
}
