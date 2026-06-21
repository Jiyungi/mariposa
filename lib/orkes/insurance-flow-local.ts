import { extractInsuranceWithAi } from "@/lib/ai/insurance-extraction";
import { runDeepgramInsuranceSession } from "@/lib/agent/deepgram-voice";
import {
  traceAgentStep,
  traceModelCall,
  traceRetrieval,
  type TraceResult,
} from "@/lib/observability/arize";
import { captureWorkflowError } from "@/lib/observability/sentry";
import {
  writeAgentMemoryEvent,
  type WriteAgentMemoryResult,
} from "@/lib/rag/agent-memory";
import { buildAgentKnowledgeContext } from "@/lib/rag/retrieve-for-agent";
import { verifyInsurancePortal } from "@/lib/browserbase/insurance-portal-verify";
import type { InsurancePortalVerificationResult } from "@/lib/browserbase/insurance-portal-verify";
import {
  persistInsuranceFlowResult,
  type PersistInsuranceFlowResult,
} from "@/lib/orkes/persist-insurance-flow";
import { SEED_AUTH_PACKET } from "@/lib/reference";
import type { AuthPacket, InsuranceResult, Turn } from "@/lib/types";

import { INSURANCE_FLOW_NAME } from "@/lib/orkes/insurance-flow-types";

export interface InsuranceFlowLocalResult {
  coupleId: string;
  workflowName: typeof INSURANCE_FLOW_NAME;
  transcript: Turn[];
  insuranceResult: InsuranceResult;
  retrieval: {
    mode: "vector" | "keyword";
    chunkCount: number;
  };
  providers: {
    voice: "deepgram-transcript" | "deterministic-fallback";
    model: "claude" | "mock";
    web: "browserbase-fetch" | "portal-snapshot";
  };
  fallbackFlags: {
    deterministicTranscript: boolean;
    deterministicModel: boolean;
    deterministicPortal: boolean;
  };
  webVerification: InsurancePortalVerificationResult;
  memory: WriteAgentMemoryResult;
  persistence: PersistInsuranceFlowResult;
  traces: TraceResult[];
}

export interface RunInsuranceFlowLocalInput {
  packet?: AuthPacket;
  transcriptPayload?: unknown;
  persist?: boolean;
}

export async function runInsuranceFlowLocal(
  input: RunInsuranceFlowLocalInput = {},
): Promise<InsuranceFlowLocalResult> {
  const packet = input.packet ?? SEED_AUTH_PACKET;
  const traces: TraceResult[] = [];

  traces.push(
    traceRetrieval({
      flow: INSURANCE_FLOW_NAME,
      coupleId: packet.couple_id,
      step: "retrieve-context",
    }),
  );
  const knowledge = await buildAgentKnowledgeContext("insurance");

  traces.push(
    traceAgentStep({
      flow: INSURANCE_FLOW_NAME,
      coupleId: packet.couple_id,
      step: "browserbase-portal-verify",
    }),
  );
  const portal = await verifyInsurancePortal({ packet });

  traces.push(
    traceAgentStep({
      flow: INSURANCE_FLOW_NAME,
      coupleId: packet.couple_id,
      step: "run-deepgram-session",
    }),
  );
  const transcript = await runDeepgramInsuranceSession(
    packet,
    input.transcriptPayload,
  );

  traces.push(
    traceModelCall({
      flow: INSURANCE_FLOW_NAME,
      coupleId: packet.couple_id,
      step: "extract-insurance-result",
    }),
  );
  const extraction = await extractInsuranceWithAi({
    transcript,
    context: [knowledge.context, portal.contextBlock].filter(Boolean).join("\n\n"),
  });

  const memory = await writeAgentMemoryEvent({
    coupleId: packet.couple_id,
    flow: INSURANCE_FLOW_NAME,
    step: "insurance-result",
    summary: `Insurance verification completed: diagnostic ${
      extraction.result.diagnostic_covered ? "covered" : "not covered"
    }.`,
    metadata: {
      retrievalMode: knowledge.mode,
      modelProvider: extraction.provider,
      followUpTaskCount: extraction.result.follow_up_tasks.length,
    },
  });

  const flowResult: InsuranceFlowLocalResult = {
    coupleId: packet.couple_id,
    workflowName: INSURANCE_FLOW_NAME,
    transcript,
    insuranceResult: extraction.result,
    retrieval: {
      mode: knowledge.mode,
      chunkCount: knowledge.chunkCount,
    },
    providers: {
      voice: input.transcriptPayload
        ? "deepgram-transcript"
        : "deterministic-fallback",
      model: extraction.provider,
      web: portal.mode === "live-fetch" ? "browserbase-fetch" : "portal-snapshot",
    },
    fallbackFlags: {
      deterministicTranscript: !input.transcriptPayload,
      deterministicModel: extraction.provider === "mock",
      deterministicPortal: portal.mode !== "live-fetch",
    },
    webVerification: portal,
    memory,
    persistence: {
      callRecordId: "",
      tasksAdded: 0,
      summaryUpdated: false,
    },
    traces,
  };

  if (input.persist !== false) {
    flowResult.persistence = await persistInsuranceFlowResult({
      coupleId: flowResult.coupleId,
      transcript: flowResult.transcript,
      insuranceResult: flowResult.insuranceResult,
      fallbackFlags: flowResult.fallbackFlags,
    });
  }

  return flowResult;
}

export async function runInsuranceFlowLocalWithErrorHandling(
  input: RunInsuranceFlowLocalInput = {},
): Promise<InsuranceFlowLocalResult> {
  try {
    return await runInsuranceFlowLocal(input);
  } catch (error) {
    captureWorkflowError(error, {
      flow: INSURANCE_FLOW_NAME,
      step: "run-insurance-flow",
      coupleId: input.packet?.couple_id ?? SEED_AUTH_PACKET.couple_id,
    });
    throw error;
  }
}
