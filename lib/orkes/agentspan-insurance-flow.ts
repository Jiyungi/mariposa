import { Agent, AgentRuntime, tool } from "@agentspan-ai/sdk";

import {
  resolveAgentspanApiKey,
  resolveAgentspanModel,
  resolveAgentspanServerUrl,
} from "@/lib/config";
import {
  agentspanUiUrl,
  normalizeAgentspanServerUrl,
} from "@/lib/orkes/agentspan-server";
import type { InsuranceFlowLocalResult } from "@/lib/orkes/insurance-flow-local";
import { runInsuranceFlowLocal } from "@/lib/orkes/insurance-flow-local";
import type {
  InsuranceFlowResult,
  RunInsuranceFlowInput,
} from "@/lib/orkes/insurance-flow-types";
import { INSURANCE_FLOW_NAME } from "@/lib/orkes/insurance-flow-types";
import { persistInsuranceFlowResult } from "@/lib/orkes/persist-insurance-flow";
import type { InsuranceResult } from "@/lib/types";

const flowToolInputSchema = {
  type: "object",
  properties: {
    coupleId: { type: "string" },
    transcriptPayload: {},
  },
  required: ["coupleId"],
  additionalProperties: false,
} as const;

const flowToolOutputSchema = {
  type: "object",
  properties: {
    coupleId: { type: "string" },
    workflowName: { type: "string", const: INSURANCE_FLOW_NAME },
    transcript: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string", enum: ["agent", "responder"] },
          text: { type: "string" },
        },
        required: ["speaker", "text"],
      },
    },
    insuranceResult: { type: "object" },
    retrieval: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["vector", "keyword"] },
        chunkCount: { type: "number" },
      },
      required: ["mode", "chunkCount"],
    },
    providers: {
      type: "object",
      properties: {
        voice: {
          type: "string",
          enum: ["deepgram-transcript", "deterministic-fallback"],
        },
        model: { type: "string", enum: ["claude", "mock"] },
        web: { type: "string", enum: ["browserbase-fetch", "portal-snapshot"] },
      },
      required: ["voice", "model", "web"],
    },
    fallbackFlags: {
      type: "object",
      properties: {
        deterministicTranscript: { type: "boolean" },
        deterministicModel: { type: "boolean" },
        deterministicPortal: { type: "boolean" },
      },
      required: ["deterministicTranscript", "deterministicModel", "deterministicPortal"],
    },
    webVerification: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["live-fetch", "fallback-snapshot", "skipped"],
        },
        url: { type: ["string", "null"] },
        statusCode: { type: ["number", "null"] },
        excerpt: { type: "string" },
      },
      required: ["mode", "url", "statusCode", "excerpt"],
    },
    memory: {
      type: "object",
      properties: {
        written: { type: "boolean" },
        eventId: { type: ["string", "null"] },
        redisKey: { type: ["string", "null"] },
      },
      required: ["written", "eventId", "redisKey"],
    },
    traces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          traceId: { type: ["string", "null"] },
          kind: { type: "string", enum: ["agent", "model", "retrieval"] },
        },
        required: ["enabled", "traceId", "kind"],
      },
    },
  },
  required: [
    "coupleId",
    "workflowName",
    "transcript",
    "insuranceResult",
    "retrieval",
    "providers",
    "fallbackFlags",
    "webVerification",
    "memory",
    "traces",
  ],
} as const;

interface AgentspanFlowToolInput {
  coupleId: string;
  transcriptPayload?: unknown;
}

interface AgentspanFlowToolOutput {
  coupleId: string;
  workflowName: typeof INSURANCE_FLOW_NAME;
  transcript: InsuranceFlowLocalResult["transcript"];
  insuranceResult: Record<string, unknown>;
  retrieval: InsuranceFlowLocalResult["retrieval"];
  providers: InsuranceFlowLocalResult["providers"];
  fallbackFlags: InsuranceFlowLocalResult["fallbackFlags"];
  webVerification: InsuranceFlowResult["webVerification"];
  memory: InsuranceFlowLocalResult["memory"];
  traces: InsuranceFlowLocalResult["traces"];
}

function createMariposaInsuranceAgent(
  model: string,
  input: RunInsuranceFlowInput,
): Agent {
  const runMariposaInsuranceFlow = tool(
    async (args: AgentspanFlowToolInput) => {
      const local = await runInsuranceFlowLocal({
        packet: input.packet,
        transcriptPayload: args.transcriptPayload ?? input.transcriptPayload,
        persist: false,
      });

      return {
        coupleId: local.coupleId,
        workflowName: local.workflowName,
        transcript: local.transcript,
        insuranceResult: local.insuranceResult as unknown as Record<string, unknown>,
        retrieval: local.retrieval,
        providers: local.providers,
        fallbackFlags: local.fallbackFlags,
        webVerification: {
          mode: local.webVerification.mode,
          url: local.webVerification.url,
          statusCode: local.webVerification.statusCode,
          excerpt: local.webVerification.excerpt,
        },
        memory: local.memory,
        traces: local.traces,
      } satisfies AgentspanFlowToolOutput;
    },
    {
      name: "run_mariposa_insurance_flow",
      description:
        "Run the Mariposa insurance verification workflow for the seed couple.",
      inputSchema: flowToolInputSchema,
      outputSchema: flowToolOutputSchema,
    },
  );

  return new Agent({
    name: "mariposa_insurance_orchestrator",
    model,
    requiredTools: ["run_mariposa_insurance_flow"],
    maxTurns: 4,
    instructions: [
      "You orchestrate the Mariposa insurance admin demo.",
      "You MUST call run_mariposa_insurance_flow exactly once with coupleId couple_001.",
      "Do not invent coverage facts, do not summarize benefits yourself, and do not call any other tools.",
      "After the tool returns, reply with one short sentence confirming the workflow finished.",
    ].join(" "),
    tools: [runMariposaInsuranceFlow],
  });
}

function localResultFromToolOutput(
  output: AgentspanFlowToolOutput,
): InsuranceFlowLocalResult {
  return {
    coupleId: output.coupleId,
    workflowName: output.workflowName,
    transcript: output.transcript,
    insuranceResult: output.insuranceResult as unknown as InsuranceResult,
    retrieval: output.retrieval,
    providers: output.providers,
    fallbackFlags: output.fallbackFlags,
    webVerification: {
      ...output.webVerification,
      contextBlock: output.webVerification.excerpt,
    },
    memory: output.memory,
    traces: output.traces,
    persistence: {
      callRecordId: "",
      tasksAdded: 0,
      summaryUpdated: false,
    },
  };
}

function toInsuranceFlowResult(
  local: InsuranceFlowLocalResult,
  agentspan: InsuranceFlowResult["agentspan"],
): InsuranceFlowResult {
  return {
    coupleId: local.coupleId,
    workflowName: local.workflowName,
    orchestrationMode: agentspan ? "agentspan" : "local",
    transcript: local.transcript,
    insuranceResult: local.insuranceResult,
    retrieval: local.retrieval,
    providers: local.providers,
    fallbackFlags: {
      localOrchestration: !agentspan,
      deterministicTranscript: local.fallbackFlags.deterministicTranscript,
      deterministicModel: local.fallbackFlags.deterministicModel,
      deterministicPortal: local.fallbackFlags.deterministicPortal,
    },
    webVerification: {
      mode: local.webVerification.mode,
      url: local.webVerification.url,
      statusCode: local.webVerification.statusCode,
      excerpt: local.webVerification.excerpt,
    },
    memory: local.memory,
    persistence: local.persistence,
    traces: local.traces,
    agentspan,
  };
}

function extractToolOutput(result: {
  output: Record<string, unknown>;
  toolCalls: unknown[];
  events?: Array<{
    type?: string;
    toolName?: string;
    result?: unknown;
    output?: unknown;
  }>;
  subResults?: Record<string, unknown>;
}): AgentspanFlowToolOutput | null {
  if (isAgentspanFlowToolOutput(result.output)) return result.output;
  if (isAgentspanFlowToolOutput(result.output.result)) {
    return result.output.result;
  }

  for (const call of result.toolCalls) {
    const candidate = (call as { result?: unknown }).result;
    if (isAgentspanFlowToolOutput(candidate)) return candidate;
  }

  for (const event of result.events ?? []) {
    if (
      event.toolName !== "run_mariposa_insurance_flow" &&
      event.type !== "tool_result"
    ) {
      continue;
    }
    const candidate = event.result ?? event.output;
    if (isAgentspanFlowToolOutput(candidate)) return candidate;
  }

  for (const value of Object.values(result.subResults ?? {})) {
    if (isAgentspanFlowToolOutput(value)) return value;
  }

  return null;
}

function isAgentspanFlowToolOutput(value: unknown): value is AgentspanFlowToolOutput {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.workflowName === INSURANCE_FLOW_NAME &&
    typeof record.coupleId === "string" &&
    Array.isArray(record.transcript)
  );
}

export async function runInsuranceFlowViaAgentspan(
  input: RunInsuranceFlowInput = {},
): Promise<InsuranceFlowResult> {
  const model = resolveAgentspanModel();
  if (!model) {
    throw new Error(
      "Agentspan orchestration requires ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    );
  }

  const serverUrl = resolveAgentspanServerUrl();
  const runtime = new AgentRuntime({
    serverUrl: normalizeAgentspanServerUrl(serverUrl),
    apiKey: resolveAgentspanApiKey() ?? undefined,
  });

  const coupleId = input.packet?.couple_id ?? "couple_001";
  let handle: Awaited<ReturnType<AgentRuntime["start"]>> | null = null;

  try {
    const agent = createMariposaInsuranceAgent(model, input);
    handle = await runtime.start(
      agent,
      `Run the Mariposa insurance flow for ${coupleId}.`,
      { timeoutSeconds: 120 },
    );

    let toolOutput = await collectToolOutputFromStream(handle.stream());

    if (!toolOutput) {
      const result = await handle.wait(500);
      if (!result.isSuccess) {
        throw new Error(result.error ?? "Agentspan insurance flow failed.");
      }
      toolOutput = extractToolOutput(result);
    }

    if (!toolOutput) {
      throw new Error("Agentspan run completed without insurance flow output.");
    }

    const local = localResultFromToolOutput(toolOutput);
    if (input.persist !== false) {
      local.persistence = await persistInsuranceFlowResult({
        coupleId: local.coupleId,
        transcript: local.transcript,
        insuranceResult: local.insuranceResult,
        fallbackFlags: local.fallbackFlags,
      });
    }

    return toInsuranceFlowResult(local, {
      executionId: handle.executionId,
      serverUrl: normalizeAgentspanServerUrl(serverUrl),
      uiUrl: agentspanUiUrl(serverUrl),
    });
  } finally {
    if (handle) {
      await handle.cancel().catch(() => undefined);
    }
    await runtime.shutdown();
  }
}

async function collectToolOutputFromStream(
  stream: AsyncIterable<{ type?: string; toolName?: string; result?: unknown; output?: unknown; content?: unknown }>,
): Promise<AgentspanFlowToolOutput | null> {
  for await (const event of stream) {
    if (event.type === "error") {
      throw new Error(String(event.content ?? "Agentspan agent error"));
    }

    if (
      event.type !== "tool_result" &&
      event.toolName !== "run_mariposa_insurance_flow"
    ) {
      continue;
    }

    const candidate = event.result ?? event.output;
    if (isAgentspanFlowToolOutput(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function createMariposaInsuranceAgentForTests(
  model: string,
  input: RunInsuranceFlowInput = {},
): Agent {
  return createMariposaInsuranceAgent(model, input);
}

export { extractToolOutput, isAgentspanFlowToolOutput };
