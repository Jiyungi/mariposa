import Browserbase from "@browserbasehq/sdk";

import {
  isBrowserbaseEnabled,
  isPublicAppBaseUrl,
  resolveAppBaseUrl,
  resolveBrowserbaseApiKey,
} from "@/lib/config";
import {
  buildPacificCrestPortalMarkdown,
  resolvePacificCrestPortalUrl,
} from "@/lib/browserbase/pacific-crest-portal";
import type { AuthPacket } from "@/lib/types";

export type InsurancePortalVerificationMode =
  | "live-fetch"
  | "fallback-snapshot"
  | "skipped";

export interface InsurancePortalVerificationResult {
  mode: InsurancePortalVerificationMode;
  url: string | null;
  statusCode: number | null;
  excerpt: string;
  contextBlock: string;
}

export interface VerifyInsurancePortalInput {
  packet: AuthPacket;
  fetchImpl?: typeof fetch;
}

function buildContextBlock(mode: InsurancePortalVerificationMode, excerpt: string): string {
  const label =
    mode === "live-fetch"
      ? "Browserbase member-portal fetch (live)"
      : mode === "fallback-snapshot"
        ? "Member-portal snapshot (local fallback)"
        : "Member-portal snapshot";

  return `${label}:\n${excerpt.trim()}`;
}

function fallbackResult(packet: AuthPacket, reason?: string): InsurancePortalVerificationResult {
  const excerpt = buildPacificCrestPortalMarkdown(packet);
  return {
    mode: "fallback-snapshot",
    url: null,
    statusCode: null,
    excerpt,
    contextBlock: buildContextBlock(
      "fallback-snapshot",
      reason ? `${reason}\n\n${excerpt}` : excerpt,
    ),
  };
}

export async function verifyInsurancePortal(
  input: VerifyInsurancePortalInput,
): Promise<InsurancePortalVerificationResult> {
  const { packet } = input;

  if (!isBrowserbaseEnabled()) {
    return fallbackResult(packet, "Browserbase disabled or BROWSERBASE_API_KEY missing.");
  }

  const apiKey = resolveBrowserbaseApiKey();
  if (!apiKey) {
    return fallbackResult(packet);
  }

  const appBaseUrl = resolveAppBaseUrl();
  if (!isPublicAppBaseUrl(appBaseUrl)) {
    return fallbackResult(
      packet,
      "Set NEXT_PUBLIC_APP_URL to a public URL (deploy or ngrok) for live Browserbase fetch.",
    );
  }

  const url = resolvePacificCrestPortalUrl(appBaseUrl, packet);

  try {
    const client = new Browserbase({
      apiKey,
      fetch: input.fetchImpl,
      timeout: 30_000,
    });
    const response = await client.fetchAPI.create({
      url,
      format: "markdown",
      allowRedirects: true,
    });

    if (
      typeof response.statusCode === "number" &&
      (response.statusCode < 200 || response.statusCode >= 300)
    ) {
      return fallbackResult(
        packet,
        `Browserbase fetch returned HTTP ${response.statusCode} for ${url}.`,
      );
    }

    const excerpt =
      typeof response.content === "string" && response.content.trim()
        ? response.content.trim()
        : buildPacificCrestPortalMarkdown(packet);

    return {
      mode: "live-fetch",
      url,
      statusCode: response.statusCode,
      excerpt,
      contextBlock: buildContextBlock("live-fetch", excerpt),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return fallbackResult(packet, `Browserbase fetch failed: ${detail.slice(0, 200)}`);
  }
}
