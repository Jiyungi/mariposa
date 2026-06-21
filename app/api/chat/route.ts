// ===========================================================================
// Grounded Chat endpoint (app/api/chat/route.ts) — Req 9.1, 9.2, 9.3, 9.4
//
// POST: answers the FIVE canonical questions (Req 9.1) in the fixed five-section
// order (Req 9.2), scoped to the single seed couple couple_001 / Reference_Data
// (Req 9.3). It is a thin wrapper: it resolves the question id (explicit or via
// the free-text matcher), then calls the Grok-or-Mock seam. Absent a Grok key
// the seam falls through to the deterministic Mock_Fallback (Req 15.5) so the
// demo never stalls. All grounding/scoping lives in lib/chat/grounded-chat.ts.
// ===========================================================================

import { NextResponse } from "next/server";

import {
  CANONICAL_QUESTIONS,
  CHAT_SECTION_ORDER,
  matchCanonicalQuestion,
  type CanonicalQuestionId,
} from "@/lib/chat/grounded-chat";
import { answerCanonicalQuestionLiveOrMock } from "@/lib/chat/live";

export const dynamic = "force-dynamic";

interface ChatRequestBody {
  questionId?: string;
  question?: string;
}

const VALID_IDS = new Set<string>(CANONICAL_QUESTIONS.map((q) => q.id));

/** GET: expose the canonical question list so the UI can render the prompts. */
export function GET() {
  return NextResponse.json({
    questions: CANONICAL_QUESTIONS.map((q) => ({ id: q.id, prompt: q.prompt })),
    sectionOrder: CHAT_SECTION_ORDER,
  });
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Resolve the canonical question id: explicit id wins, else match free text.
  let questionId: CanonicalQuestionId | null = null;
  if (typeof body.questionId === "string" && VALID_IDS.has(body.questionId)) {
    questionId = body.questionId as CanonicalQuestionId;
  } else if (typeof body.question === "string") {
    questionId = matchCanonicalQuestion(body.question);
  }

  if (questionId === null) {
    return NextResponse.json(
      {
        error:
          "Unrecognized question. Ask one of the five supported questions.",
        questions: CANONICAL_QUESTIONS.map((q) => ({ id: q.id, prompt: q.prompt })),
      },
      { status: 400 },
    );
  }

  // Grok-or-Mock seam: live path falls through to the deterministic fallback.
  const { answer, usedFallback } = await answerCanonicalQuestionLiveOrMock(questionId);

  return NextResponse.json({
    answer,
    usedFallback,
    sectionOrder: CHAT_SECTION_ORDER,
  });
}
