import { describe, expect, it } from "vitest";

import type { CanonicalQuestionId } from "@/lib/chat/grounded-chat";
import { chunkMarkdownFile, loadReferenceCorpus } from "@/lib/rag/chunk-markdown";
import { embedTextLocal } from "@/lib/rag/embed";
import { topicsForQuestion } from "@/lib/rag/topics";
import { retrieveKnowledge } from "@/lib/rag/retrieve";

describe("RAG chunking", () => {
  it("splits markdown by ## sections", () => {
    const md =
      "# Title\n\n## Section A\n\nAlpha content here with enough words to pass the minimum chunk length threshold for retrieval.\n\n## Section B\n\nBeta content here with enough words to pass the minimum chunk length threshold for retrieval.";
    const chunks = chunkMarkdownFile("cycle-fertility-reference.md", md);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.section === "Section A")).toBe(true);
    expect(chunks.every((c) => c.topic === "cycle")).toBe(true);
  });

  it("loads the reference corpus from disk", () => {
    const corpus = loadReferenceCorpus();
    expect(corpus.length).toBeGreaterThan(5);
    expect(corpus.some((c) => c.sourceFile === "insurance-coverage-data.md")).toBe(true);
  });
});

describe("RAG retrieval (keyword fallback)", () => {
  it("retrieves insurance chunks for missing_data question", async () => {
    const { chunks, mode } = await retrieveKnowledge(
      "missing_data",
      "What data are we missing?",
    );
    expect(mode).toBe("keyword");
    expect(chunks.length).toBeGreaterThan(0);
    const topics = new Set(chunks.map((c) => c.topic));
    expect(
      topics.has("insurance") || topics.has("hormone") || topics.has("semen"),
    ).toBe(true);
  });

  it("retrieves cycle chunks for priority_days question", async () => {
    const { chunks } = await retrieveKnowledge(
      "priority_days",
      "Why are these days the priority?",
    );
    expect(chunks.some((c) => c.topic === "cycle" || c.sourceFile.includes("cycle"))).toBe(
      true,
    );
  });

  it("maps each canonical question to topics", () => {
    const ids: CanonicalQuestionId[] = [
      "priority_days",
      "partner_this_week",
      "confidence_low",
      "ask_doctor",
      "missing_data",
    ];
    for (const id of ids) {
      expect(topicsForQuestion(id).length).toBeGreaterThan(0);
    }
  });
});

describe("RAG embeddings", () => {
  it("produces unit-length local vectors", () => {
    const vec = embedTextLocal("fertility insurance semen analysis");
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(vec.length).toBe(384);
    expect(norm).toBeCloseTo(1, 5);
  });
});
