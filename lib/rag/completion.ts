import {
  CANONICAL_QUESTIONS,
  type CanonicalQuestionId,
  type ChatAnswer,
  type ChatSource,
  type CoupleData,
} from "@/lib/chat/grounded-chat";
import {
  resolveGrokApiKey,
  resolveXaiApiBaseUrl,
  resolveXaiModel,
} from "@/lib/config";
import { buildRagSystemPrompt, buildRagUserPrompt } from "@/lib/rag/prompt";
import { retrieveKnowledge } from "@/lib/rag/retrieve";

interface GrokJsonAnswer {
  shortAnswer?: string;
  basedOnYourData?: string;
  whatsUncertain?: string;
  sharedNextStep?: string;
  sources?: Array<{ reference?: string; detail?: string }>;
}

function promptForQuestion(questionId: CanonicalQuestionId): string {
  return CANONICAL_QUESTIONS.find((q) => q.id === questionId)?.prompt ?? questionId;
}

function normalizeSources(
  raw: GrokJsonAnswer["sources"],
  chunks: { sourceFile: string; section: string }[],
): ChatSource[] {
  const fromModel: ChatSource[] = (raw ?? [])
    .filter((s) => s.reference && s.detail)
    .map((s) => ({
      coupleId: "couple_001",
      reference: s.reference!,
      detail: s.detail!,
    }));

  if (fromModel.length > 0) return fromModel;

  return chunks.slice(0, 4).map((c) => ({
    coupleId: "couple_001",
    reference: c.sourceFile,
    detail: `Section: ${c.section}`,
  }));
}

function parseGrokContent(content: string): GrokJsonAnswer {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonText) as GrokJsonAnswer;
}

function toChatAnswer(
  questionId: CanonicalQuestionId,
  parsed: GrokJsonAnswer,
  chunks: { sourceFile: string; section: string }[],
): ChatAnswer {
  const requireSection = (value: string | undefined, label: string): string => {
    const v = value?.trim();
    if (!v) throw new Error(`RAG response missing section: ${label}`);
    return v;
  };

  return {
    questionId,
    question: promptForQuestion(questionId),
    shortAnswer: requireSection(parsed.shortAnswer, "shortAnswer"),
    basedOnYourData: requireSection(parsed.basedOnYourData, "basedOnYourData"),
    whatsUncertain: requireSection(parsed.whatsUncertain, "whatsUncertain"),
    sharedNextStep: requireSection(parsed.sharedNextStep, "sharedNextStep"),
    sources: normalizeSources(parsed.sources, chunks),
  };
}

/**
 * RAG-backed Grok completion: retrieve chunks → build prompt → parse JSON answer.
 */
export async function answerWithRag(
  questionId: CanonicalQuestionId,
  coupleData: CoupleData,
): Promise<{ answer: ChatAnswer; retrievalMode: "vector" | "keyword" }> {
  const apiKey = resolveGrokApiKey();
  if (!apiKey) throw new Error("No Grok API key configured");

  const questionText = promptForQuestion(questionId);
  const { chunks, mode } = await retrieveKnowledge(questionId, questionText);

  const res = await fetch(`${resolveXaiApiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolveXaiModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildRagSystemPrompt() },
        {
          role: "user",
          content: buildRagUserPrompt(questionId, questionText, coupleData, chunks),
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Grok chat failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Grok chat returned empty content");

  const parsed = parseGrokContent(content);
  const answer = toChatAnswer(questionId, parsed, chunks);
  return { answer, retrievalMode: mode };
}
