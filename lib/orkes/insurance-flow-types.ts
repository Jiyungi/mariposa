import type { WriteAgentMemoryResult } from "@/lib/rag/agent-memory";
import type { PersistInsuranceFlowResult } from "@/lib/orkes/persist-insurance-flow";
import type { TraceResult } from "@/lib/observability/arize";
import type { InsuranceResult, Turn } from "@/lib/types";
import type { AuthPacket } from "@/lib/types";

export const INSURANCE_FLOW_NAME = "mariposa-insurance-flow" as const;

export interface InsuranceFlowResult {
  coupleId: string;
  workflowName: typeof INSURANCE_FLOW_NAME;
  orchestrationMode: "local" | "agentspan";
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
    localOrchestration: boolean;
    deterministicTranscript: boolean;
    deterministicModel: boolean;
    deterministicPortal: boolean;
  };
  webVerification: {
    mode: "live-fetch" | "fallback-snapshot" | "skipped";
    url: string | null;
    statusCode: number | null;
    excerpt: string;
  };
  memory: WriteAgentMemoryResult;
  persistence: PersistInsuranceFlowResult;
  traces: TraceResult[];
  agentspan?: {
    executionId: string;
    serverUrl: string;
    uiUrl: string;
  };
}

export interface RunInsuranceFlowInput {
  packet?: AuthPacket;
  transcriptPayload?: unknown;
  persist?: boolean;
  orchestration?: "auto" | "local" | "agentspan";
}
