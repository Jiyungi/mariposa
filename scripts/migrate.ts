/**
 * Apply Supabase SQL migrations from supabase/migrations/*.sql
 *
 * Usage:
 *   npm run db:migrate
 *
 * Requires DATABASE_URL in .env / .env.local (Postgres connection string from
 * Supabase → Project Settings → Database → Connection string → URI).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

import { loadEnvFiles } from "./load-env";

const { Client } = pg;

async function main() {
  loadEnvFiles();

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl || databaseUrl.includes("[YOUR-PASSWORD]")) {
    console.error("DATABASE_URL is missing or still has the [YOUR-PASSWORD] placeholder.");
    console.error("");
    console.error("Option A — run migrations from terminal:");
    console.error("  1. Supabase Dashboard → Project Settings → Database");
    console.error("  2. Copy the URI connection string (postgres://postgres:...@db....:5432/postgres)");
    console.error("  3. Set DATABASE_URL in .env");
    console.error("  4. npm run db:migrate");
    console.error("");
    console.error("Option B — paste SQL manually:");
    console.error("  Supabase Dashboard → SQL Editor → run:");
    console.error("    supabase/migrations/0001_init_mariposa_schema.sql");
    console.error("    supabase/migrations/0002_rag_knowledge_chunks.sql");
    process.exit(1);
  }

  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error("No .sql files in supabase/migrations/");
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log(`Connected. Applying ${files.length} migration(s)...`);

  try {
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`→ ${file}`);
      await client.query(sql);
    }
    console.log("Migrations applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
