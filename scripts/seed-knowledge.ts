/**
 * Seed knowledge_chunks in Supabase from reference-data/*.md
 *
 * Usage:
 *   npm run seed:knowledge
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Run migration 0002_rag_knowledge_chunks.sql in Supabase SQL editor first.
 */

import { createClient } from "@supabase/supabase-js";

import { chunkMarkdownFile, loadReferenceCorpus } from "../lib/rag/chunk-markdown";
import { embedText } from "../lib/rag/embed";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("Put them in .env or .env.local (scripts load both automatically).");
    process.exit(1);
  }
  if (url.includes("your-project-ref")) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL is still the placeholder. Set it to your project URL, e.g.",
    );
    console.error("  https://<project-ref>.supabase.co");
    process.exit(1);
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  const { error: probeError } = await client.from("knowledge_chunks").select("id").limit(1);
  if (probeError?.message.includes("Could not find the table")) {
    console.error("Table public.knowledge_chunks does not exist yet.");
    console.error("");
    console.error("Run migrations first:");
    console.error("  npm run db:migrate");
    console.error("");
    console.error("Or paste supabase/migrations/0002_rag_knowledge_chunks.sql");
    console.error("into Supabase Dashboard → SQL Editor → Run.");
    process.exit(1);
  }

  const chunks = loadReferenceCorpus();
  console.log(`Embedding and upserting ${chunks.length} chunks...`);

  let ok = 0;
  for (const chunk of chunks) {
    const embedding = await embedText(`${chunk.section}\n${chunk.content}`);
    const { error } = await client.from("knowledge_chunks").upsert(
      {
        source_file: chunk.sourceFile,
        section: chunk.section,
        content: chunk.content,
        topic: chunk.topic,
        embedding,
      },
      { onConflict: "source_file,section" },
    );
    if (error) {
      console.error(`Failed ${chunk.sourceFile} § ${chunk.section}:`, error.message);
      continue;
    }
    ok += 1;
  }

  console.log(`Done. Upserted ${ok}/${chunks.length} chunks.`);
  if (ok === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
