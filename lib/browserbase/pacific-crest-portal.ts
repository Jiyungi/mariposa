import { SAMPLE_PLAN } from "@/lib/reference/insurance";
import type { AuthPacket } from "@/lib/types";

/**
 * Fictional member-portal copy for Pacific Crest Health (seed couple only).
 * Served at `/demo/pacific-crest-benefits` and reused as the offline snapshot.
 */
export function buildPacificCrestPortalMarkdown(packet: AuthPacket): string {
  return `# Pacific Crest Health — Member Benefits Summary

Member ID: ${packet.member_id}
Group: ${packet.group_number}
Plan: ${packet.plan_type}
Policy holder: ${packet.policy_holder}

## Fertility benefit snapshot (demo)

- Infertility definition: 12 months trying (under age 35).
- Diagnostic fertility evaluation: covered after deductible.
- Semen analysis CPT 89320: covered as diagnostic.
- Hormone labs (FSH, AMH, estradiol, progesterone, TSH): covered.
- Ultrasound / HSG: covered as diagnostic when medically necessary.
- IUI (58322) and IVF (58970): prior authorization required; lifetime maximum applies.
- In-network lab: Crest Diagnostics.
- Deductible: $1,500 individual | Coinsurance: 20% after deductible | Out-of-pocket max: $4,000.
- Referral from PCP or OB-GYN: not required for initial diagnostic workup.
- Pharmacy fertility medications: separate pharmacy benefit — verify formulary.

## Plan notes

Provider: ${packet.provider}
Coverage status on file: ${SAMPLE_PLAN.coverage_status}

This page is synthetic demo content for Mariposa / Browserbase verification only.
`;
}

export function buildPacificCrestPortalPath(memberId: string): string {
  const params = new URLSearchParams({ member: memberId });
  return `/demo/pacific-crest-benefits?${params.toString()}`;
}

export function resolvePacificCrestPortalUrl(
  appBaseUrl: string,
  packet: AuthPacket,
): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}${buildPacificCrestPortalPath(packet.member_id)}`;
}
