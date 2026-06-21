/**
 * Print a short presenter script for the Mariposa insurance demo.
 *
 * Usage:
 *   npm run demo:present
 */
import { describeMariposaEnv } from "../lib/config/env-status";
import { loadEnvFiles } from "./load-env";

const LIVE_DEMO_ENV = [
  "USE_AGENTSPAN=true",
  "AGENTSPAN_SERVER_URL=http://localhost:6767",
  "ANTHROPIC_API_KEY=...",
  "USE_MOCK_AI=false",
  "DEEPGRAM_API_KEY=...",
  "USE_DEEPGRAM_VOICE=true",
  "REDIS_URL=redis://...",
  "REDIS_VECTOR_INDEX=mariposa-rag",
  "ENABLE_ARIZE=true",
  "ARIZE_API_KEY=...",
  "USE_BROWSERBASE=true",
  "BROWSERBASE_API_KEY=...",
  "NEXT_PUBLIC_APP_URL=https://your-deployed-app.vercel.app",
  "SENTRY_DSN=...",
] as const;

function main() {
  loadEnvFiles();
  const status = describeMariposaEnv();

  console.log("Mariposa insurance demo — presenter script\n");
  console.log("Credential-free rehearsal:");
  console.log("  1. npm run demo:present");
  console.log("  2. npm run demo:insurance-flow");
  console.log("  3. Open http://localhost:3000/demo/insurance-flow");
  console.log("  4. Open http://localhost:3000/tasks");
  console.log("  5. Open http://localhost:3000/summary\n");

  console.log("Live sponsor demo prep:");
  console.log("  1. npm install -g @agentspan-ai/agentspan  OR  pip install agentspan");
  console.log("  2. npm run agentspan:start   → http://localhost:6767 (loads .env.local keys)");
  console.log("  3. Copy .env_example to .env.local");
  console.log("  4. Set these keys:");
  for (const line of LIVE_DEMO_ENV) {
    console.log(`     ${line}`);
  }
  console.log("  5. npm run verify:redis");
  console.log("  6. npm run seed:redis");
  console.log("  7. npm run demo:present");
  console.log("  8. npm run dev\n");

  console.log("Integration status:");
  for (const item of status.integrations) {
    const label =
      item.mode === "live" ? "LIVE" : item.mode === "fallback" ? "FALLBACK" : "OFF";
    console.log(`  - ${item.name}: ${label} — ${item.detail}`);
  }

  if (status.warnings.length > 0) {
    console.log("\nEnv warnings:");
    for (const warning of status.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  console.log("\nTalking points:");
  for (const note of status.presenterNotes) {
    console.log(`  - ${note}`);
  }
}

main();
