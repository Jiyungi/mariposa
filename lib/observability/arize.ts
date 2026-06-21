import { isArizeEnabled } from "@/lib/config";

export type TraceStepKind = "agent" | "model" | "retrieval";

export interface TracePayload {
  coupleId?: string;
  flow?: string;
  step: string;
  metadata?: Record<string, unknown>;
}

export interface TraceResult {
  enabled: boolean;
  traceId: string | null;
  kind: TraceStepKind;
}

function stableTraceId(kind: TraceStepKind, payload: TracePayload): string {
  const base = [
    "mariposa",
    kind,
    payload.flow ?? "local",
    payload.coupleId ?? "unknown",
    payload.step,
  ].join(":");

  return base.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 160);
}

function trace(kind: TraceStepKind, payload: TracePayload): TraceResult {
  const enabled = isArizeEnabled();
  return {
    enabled,
    traceId: enabled ? stableTraceId(kind, payload) : null,
    kind,
  };
}

export function traceAgentStep(payload: TracePayload): TraceResult {
  return trace("agent", payload);
}

export function traceModelCall(payload: TracePayload): TraceResult {
  return trace("model", payload);
}

export function traceRetrieval(payload: TracePayload): TraceResult {
  return trace("retrieval", payload);
}
