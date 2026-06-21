/**
 * Preview AgentPhone system prompt with Redis RAG (no real call placed).
 *
 * Usage:
 *   npm run preview:agentphone-prompt
 *   npm run preview:agentphone-prompt -- clinic
 */
import { buildAgentPhoneCallPrompt } from "../lib/agent/prompts";
import { SEED_AUTH_PACKET } from "../lib/reference";
import type { CallType } from "../lib/types";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();

  const callType = (process.argv[2] === "clinic" ? "clinic" : "insurance") as CallType;
  const prompt = await buildAgentPhoneCallPrompt(callType, SEED_AUTH_PACKET);

  console.log(`callType: ${callType}`);
  console.log(`ragMode: ${prompt.ragMode ?? "unknown"}`);
  console.log(`ragChunkCount: ${prompt.ragChunkCount ?? 0}`);
  console.log(
    prompt.systemPrompt.includes("KNOWLEDGE BASE")
      ? "OK: KNOWLEDGE BASE injected"
      : "MISSING: KNOWLEDGE BASE not found",
  );
  console.log("");
  console.log("--- initialGreeting ---");
  console.log(prompt.initialGreeting);
  console.log("");
  console.log("--- systemPrompt (first 1200 chars) ---");
  console.log(prompt.systemPrompt.slice(0, 1200));
  if (prompt.systemPrompt.length > 1200) console.log("... [truncated]");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
