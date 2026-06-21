import * as React from "react";

import type { CallResultLike, CallType } from "./types";

/*
  Result-field descriptors for the Call Console (Req 20.3).

  Each descriptor knows how to (a) pull its raw value out of the partial
  result and (b) format a resolved value for display. The console iterates a
  fixed, ordered descriptor list per call type, so the audience sees the same
  stable set of facts filling in one by one as the agent extracts them — and
  any not-yet-extracted field renders a quiet "pending", never a stand-in.

  A field is RESOLVED iff its raw value is present (not `undefined`/`null`).
  Empty arrays count as resolved — "no prior auth required" is a real answer,
  not a missing one.
*/

export interface ResultField {
  /** Stable key, also the `data-field` hook. */
  key: string;
  /** Human label shown in the result list. */
  label: string;
  /** Pull the raw value from the (partial) result. */
  get: (result: CallResultLike) => unknown;
  /** Format a known-present value into display content. */
  format: (value: unknown) => React.ReactNode;
}

/** True when a raw value counts as resolved (present, non-null). */
export function isResolved(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function record(result: CallResultLike): Record<string, unknown> {
  return result as Record<string, unknown>;
}

function yesNo(value: unknown): string {
  return value ? "Yes" : "No";
}

function coveredLabel(value: unknown): string {
  return value ? "Covered" : "Not covered";
}

function currency(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US")}` : String(value);
}

function list(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "None";
  }
  return String(value);
}

/** "in_person" -> "In person". */
function humanize(value: unknown): string {
  return String(value)
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export const INSURANCE_RESULT_FIELDS: readonly ResultField[] = [
  {
    key: "diagnostic_covered",
    label: "Diagnostic evaluation",
    get: (r) => record(r).diagnostic_covered,
    format: coveredLabel,
  },
  {
    key: "semen_analysis_covered",
    label: "Semen analysis",
    get: (r) => record(r).semen_analysis_covered,
    format: coveredLabel,
  },
  {
    key: "hormone_labs_covered",
    label: "Hormone labs",
    get: (r) => record(r).hormone_labs_covered,
    format: coveredLabel,
  },
  {
    key: "prior_auth_required_for",
    label: "Prior auth required for",
    get: (r) => record(r).prior_auth_required_for,
    format: list,
  },
  {
    key: "in_network_lab",
    label: "In-network lab",
    get: (r) => record(r).in_network_lab,
    format: (v) => String(v),
  },
  {
    key: "deductible",
    label: "Deductible",
    get: (r) => record(r).deductible,
    format: currency,
  },
  {
    key: "coinsurance_pct",
    label: "Coinsurance",
    get: (r) => record(r).coinsurance_pct,
    format: (v) => `${v}%`,
  },
  {
    key: "oop_max",
    label: "Out-of-pocket max",
    get: (r) => record(r).oop_max,
    format: currency,
  },
  {
    key: "referral_required",
    label: "Referral required",
    get: (r) => record(r).referral_required,
    format: yesNo,
  },
] as const;

function bookedField(
  key: string,
  label: string,
  pick: (b: Record<string, unknown>) => unknown,
  format: (v: unknown) => React.ReactNode,
): ResultField {
  return {
    key,
    label,
    get: (r) => {
      const booked = record(r).booked;
      if (booked && typeof booked === "object") {
        return pick(booked as Record<string, unknown>);
      }
      return undefined;
    },
    format,
  };
}

export const CLINIC_RESULT_FIELDS: readonly ResultField[] = [
  bookedField("date", "Consult date", (b) => b.date, (v) => String(v)),
  bookedField("time", "Consult time", (b) => b.time, (v) => String(v)),
  bookedField("mode", "Visit mode", (b) => b.mode, humanize),
  bookedField("clinic", "Clinic", (b) => b.clinic, (v) => String(v)),
  {
    key: "bring_list",
    label: "Bring to the visit",
    get: (r) => record(r).bring_list,
    format: list,
  },
  {
    key: "tasks",
    label: "Follow-up tasks",
    get: (r) => record(r).tasks,
    format: (v) => {
      const tasks = (v ?? {}) as Record<string, unknown>;
      const total = (["her", "him", "together"] as const).reduce((sum, k) => {
        const arr = tasks[k];
        return sum + (Array.isArray(arr) ? arr.length : 0);
      }, 0);
      return `${total} created`;
    },
  },
] as const;

/** The ordered descriptor list for a call type. */
export function resultFieldsFor(callType: CallType): readonly ResultField[] {
  return callType === "insurance"
    ? INSURANCE_RESULT_FIELDS
    : CLINIC_RESULT_FIELDS;
}
