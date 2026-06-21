/**
 * Load .env then .env.local into process.env for standalone scripts (tsx/node).
 * Next.js loads these automatically; seed scripts do not unless we call this.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

export function loadEnvFiles(cwd = process.cwd()): void {
  const merged: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      merged[parsed.key] = parsed.value;
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
}
