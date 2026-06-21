/**
 * Start the local Agentspan server with Mariposa .env files loaded so LLM keys
 * are available to the Java runtime (required for orchestration runs).
 *
 * Usage:
 *   npm run agentspan:start
 */
import { spawn } from "node:child_process";

import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const child = spawn("agentspan", ["server", "start"], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
