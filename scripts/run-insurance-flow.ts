/**
 * Run the local Mariposa insurance-flow demo without starting Next.
 *
 * Usage:
 *   npm run demo:insurance-flow
 */
import { runInsuranceFlow } from "../lib/orkes/insurance-flow";
import { closeRedisClient } from "../lib/rag/redis-store";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();

  const result = await runInsuranceFlow();
  const summary = {
    workflowName: result.workflowName,
    orchestrationMode: result.orchestrationMode,
    agentspan: result.agentspan,
    coupleId: result.coupleId,
    retrieval: result.retrieval,
    providers: result.providers,
    fallbackFlags: result.fallbackFlags,
    memory: result.memory,
    persistence: result.persistence,
    traceIds: result.traces.map((trace) => trace.traceId).filter(Boolean),
    transcriptTurns: result.transcript.length,
    insuranceResult: result.insuranceResult,
  };

  console.log(JSON.stringify(summary, null, 2));
  await closeRedisClient();
}

main().catch((err) => {
  console.error(err);
  void closeRedisClient().finally(() => {
    process.exit(1);
  });
});
