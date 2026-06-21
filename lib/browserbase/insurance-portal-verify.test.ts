import { describe, expect, it, vi } from "vitest";

import { SEED_AUTH_PACKET } from "@/lib/reference";
import { verifyInsurancePortal } from "@/lib/browserbase/insurance-portal-verify";

describe("verifyInsurancePortal()", () => {
  it("uses a local portal snapshot when Browserbase is disabled", async () => {
    const result = await verifyInsurancePortal({
      packet: SEED_AUTH_PACKET,
    });

    expect(result.mode).toBe("fallback-snapshot");
    expect(result.contextBlock).toContain("Pacific Crest Health");
    expect(result.contextBlock).toContain("Semen analysis CPT 89320");
  });

  it("uses Browserbase fetch when enabled with a public app URL", async () => {
    const previous = {
      USE_BROWSERBASE: process.env.USE_BROWSERBASE,
      BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    };
    process.env.USE_BROWSERBASE = "true";
    process.env.BROWSERBASE_API_KEY = "bb_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://mariposa-demo.example.com";

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://api.browserbase.com/v1/fetch",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        content: "# Pacific Crest Health\n\nLive fetch markdown",
        statusCode: 200,
        contentType: "text/markdown",
        encoding: "utf-8",
        headers: {},
        id: "fetch_1",
      }),
      text: async () =>
        JSON.stringify({
          content: "# Pacific Crest Health\n\nLive fetch markdown",
          statusCode: 200,
        }),
    }));

    try {
      const result = await verifyInsurancePortal({
        packet: SEED_AUTH_PACKET,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result.mode).toBe("live-fetch");
      expect(result.statusCode).toBe(200);
      expect(result.excerpt).toContain("Live fetch markdown");
      expect(fetchImpl).toHaveBeenCalled();
    } finally {
      process.env.USE_BROWSERBASE = previous.USE_BROWSERBASE;
      process.env.BROWSERBASE_API_KEY = previous.BROWSERBASE_API_KEY;
      process.env.NEXT_PUBLIC_APP_URL = previous.NEXT_PUBLIC_APP_URL;
    }
  });

  it("falls back to the local portal snapshot when Browserbase returns a non-2xx page", async () => {
    const previous = {
      USE_BROWSERBASE: process.env.USE_BROWSERBASE,
      BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    };
    process.env.USE_BROWSERBASE = "true";
    process.env.BROWSERBASE_API_KEY = "bb_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://missing-deployment.example.com";

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://api.browserbase.com/v1/fetch",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        content: "**404**: NOT_FOUND",
        statusCode: 404,
        contentType: "text/markdown",
        encoding: "utf-8",
        headers: {},
        id: "fetch_404",
      }),
      text: async () =>
        JSON.stringify({
          content: "**404**: NOT_FOUND",
          statusCode: 404,
        }),
    }));

    try {
      const result = await verifyInsurancePortal({
        packet: SEED_AUTH_PACKET,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result.mode).toBe("fallback-snapshot");
      expect(result.statusCode).toBeNull();
      expect(result.excerpt).toContain("Pacific Crest Health");
      expect(result.excerpt).not.toContain("NOT_FOUND");
      expect(result.contextBlock).toContain("HTTP 404");
    } finally {
      process.env.USE_BROWSERBASE = previous.USE_BROWSERBASE;
      process.env.BROWSERBASE_API_KEY = previous.BROWSERBASE_API_KEY;
      process.env.NEXT_PUBLIC_APP_URL = previous.NEXT_PUBLIC_APP_URL;
    }
  });
});
