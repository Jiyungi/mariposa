import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { topicForSourceFile } from "@/lib/rag/topics";
import type { KnowledgeChunk } from "@/lib/rag/types";

const REFERENCE_DIR = join(process.cwd(), "reference-data");
const SKIP_FILES = new Set(["README.md"]);

/**
 * Split a reference markdown file into section chunks by `##` headings.
 * Each chunk keeps its section title for citation (Req 9.3).
 */
export function chunkMarkdownFile(
  sourceFile: string,
  markdown: string,
): KnowledgeChunk[] {
  const topic = topicForSourceFile(sourceFile);
  const lines = markdown.split(/\r?\n/);
  const chunks: KnowledgeChunk[] = [];

  let section = "Overview";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content.length < 40) return;
    chunks.push({ sourceFile, section, content, topic });
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      flush();
      section = heading[1].trim();
      buffer = [line];
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (chunks.length === 0 && markdown.trim().length > 0) {
    chunks.push({
      sourceFile,
      section: "Document",
      content: markdown.trim(),
      topic,
    });
  }

  return chunks;
}

/** Load all reference-data/*.md chunks from disk (used for tests + keyword fallback). */
export function loadReferenceCorpus(
  dir: string = REFERENCE_DIR,
): KnowledgeChunk[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !SKIP_FILES.has(f));
  const all: KnowledgeChunk[] = [];
  for (const file of files.sort()) {
    const markdown = readFileSync(join(dir, file), "utf8");
    all.push(...chunkMarkdownFile(file, markdown));
  }
  return all;
}

let cachedCorpus: KnowledgeChunk[] | null = null;

export function getReferenceCorpus(): KnowledgeChunk[] {
  if (!cachedCorpus) cachedCorpus = loadReferenceCorpus();
  return cachedCorpus;
}

/** Test helper — reset memoized corpus. */
export function __resetReferenceCorpusForTests(): void {
  cachedCorpus = null;
}
