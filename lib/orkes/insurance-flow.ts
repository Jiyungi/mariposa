import {
  hasAgentspanModelCredential,
  isAgentspanEnabled,
} from "@/lib/config";
import { captureWorkflowError } from "@/lib/observability/sentry";
import { checkAgentspanServerHealth } from "@/lib/orkes/agentspan-server";
import { runInsuranceFlowViaAgentspan } from "@/lib/orkes/agentspan-insurance-flow";
import { runInsuranceFlowLocalWithErrorHandling } from "@/lib/orkes/insurance-flow-local";
import {
  INSURANCE_FLOW_NAME,
  type InsuranceFlowResult,
  type RunInsuranceFlowInput,
} from "@/lib/orkes/insurance-flow-types";

export {
  INSURANCE_FLOW_NAME,
  type InsuranceFlowResult,
  type RunInsuranceFlowInput,
};

function toLocalFlowResult(
  local: Awaited<ReturnType<typeof runInsuranceFlowLocalWithErrorHandling>>,
): InsuranceFlowResult {
  return {
    ...local,
    orchestrationMode: "local",
    fallbackFlags: {
      localOrchestration: true,
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
  };
}

export async function runInsuranceFlow(
  input: RunInsuranceFlowInput = {},
): Promise<InsuranceFlowResult> {
  const orchestration = input.orchestration ?? "auto";

  if (
    orchestration !== "local" &&
    isAgentspanEnabled() &&
    hasAgentspanModelCredential()
  ) {
    const healthy = await checkAgentspanServerHealth();
    if (healthy) {
      try {
        return await runInsuranceFlowViaAgentspan(input);
      } catch (error) {
        captureWorkflowError(error, {
          flow: INSURANCE_FLOW_NAME,
          step: "agentspan-orchestration",
          coupleId: input.packet?.couple_id,
        });

        if (orchestration === "agentspan") {
          throw error;
        }
      }
    }
  }

  const local = await runInsuranceFlowLocalWithErrorHandling(input);
  return toLocalFlowResult(local);
}
