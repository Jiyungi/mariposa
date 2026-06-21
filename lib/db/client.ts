/**
 * Supabase client factory (Req 15.3).
 *
 * The client is created lazily and the result is memoized. Importing this module
 * never performs I/O and never throws even when the environment is absent — so
 * tests and the build run without a live database. Callers that need a client
 * use `getSupabaseClient()` and handle the `null` case (e.g. fall back to the
 * in-memory seed builder), or use `requireSupabaseClient()` when a live DB is
 * mandatory and a missing configuration should surface as an error.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig, hasSupabaseConfig } from "@/lib/config";

let cached: SupabaseClient | null = null;
let resolved = false;

/**
 * Return a memoized Supabase client, or `null` when no Supabase configuration is
 * present in the environment. Never throws at import time.
 */
export function getSupabaseClient(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient | null {
  if (resolved) return cached;

  const config = resolveSupabaseConfig(env);
  if (config === null) {
    resolved = true;
    cached = null;
    return null;
  }

  cached = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  resolved = true;
  return cached;
}

/** Error thrown when a live Supabase client is required but not configured. */
export class SupabaseConfigError extends Error {
  constructor(message = "Supabase is not configured (URL and key are required)") {
    super(message);
    this.name = "SupabaseConfigError";
    Object.setPrototypeOf(this, SupabaseConfigError.prototype);
  }
}

/**
 * Return a Supabase client or throw `SupabaseConfigError` when none is
 * configured. Use for operations that genuinely require a live database.
 */
export function requireSupabaseClient(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient {
  const client = getSupabaseClient(env);
  if (client === null) {
    throw new SupabaseConfigError();
  }
  return client;
}

/** Re-exported convenience: whether a live DB is configured. */
export { hasSupabaseConfig };

/**
 * Reset the memoized client. Intended for tests that vary the environment.
 */
export function __resetSupabaseClientForTests(): void {
  cached = null;
  resolved = false;
}
