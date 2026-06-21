import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = 3456;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_HTTP_SMOKE = process.env.RUN_HTTP_SMOKE === "true";

async function waitForServer(url: string, timeoutMs = 90_000): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
    } catch {
      // Server not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

describe.skipIf(!RUN_HTTP_SMOKE)("HTTP smoke: /api/demo/insurance-flow", () => {
  let server: ChildProcess | null = null;

  beforeAll(async () => {
    server = spawn(
      "npx",
      ["next", "dev", "--port", String(PORT), "--hostname", "127.0.0.1"],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "development" },
        stdio: "pipe",
      },
    );

    await waitForServer(`${BASE_URL}/api/demo/insurance-flow`);
  }, 120_000);

  afterAll(async () => {
    if (!server || server.killed) return;

    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      server?.once("exit", () => resolve());
      setTimeout(() => {
        if (server && !server.killed) server.kill("SIGKILL");
        resolve();
      }, 5_000);
    });
  });

  it("returns the local insurance flow JSON over HTTP", async () => {
    const response = await fetch(`${BASE_URL}/api/demo/insurance-flow`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.workflowName).toBe("mariposa-insurance-flow");
    expect(json.persistence.tasksAdded).toBeGreaterThan(0);
  });
});
