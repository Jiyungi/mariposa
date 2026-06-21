// ===========================================================================
// Property 16: Unresolved fields are isolated  (Task 7.3)
//
// **Validates: Requirements 6.5**
//
// For any set of fields that cannot be extracted from a call, each such field is
// marked unresolved with a corresponding follow-up task, and every successfully
// extracted field is preserved unchanged.
//
// Strategy (fast-check, >= 100 runs): generate transcripts where an arbitrary
// SUBSET of the schema subjects is present and the rest are omitted. For each
// generated transcript we also build an ORACLE (the values implied by the same
// generated inputs). We then assert, against both extractors:
//   (1) every resolvable field NOT in `result` appears in `unresolved` AND has at
//       least one corresponding follow-up task referencing it;
//   (2) every resolvable field IN `result` is NOT in `unresolved` and its value
//       equals the oracle value (preserved unchanged);
//   (3) the extracted resolvable keys and `unresolved` are disjoint and together
//       exactly cover the resolvable schema fields.
//
// Notes matching the implementation:
//   - Insurance `follow_up_tasks` is always derived, so it is excluded from the
//     "resolvable" set.
//   - Composite clinic fields (booked, calendar_event, bring_list, tasks) are
//     atomic: booked<->calendar_event move together, bring_list<->tasks move
//     together.
// ===========================================================================

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  extractInsuranceResult,
  extractClinicResult,
  type ExtractionOutcome,
} from "@/lib/core/extract";
import type { ClinicResult, InsuranceResult, TaskColumn, Turn } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mirrors of the implementation's resolvable-field lists, human labels, and the
// unresolved-follow-up title prefixes. These act as the test ORACLE for the
// "corresponding follow-up task" requirement (Req 6.5).
// ---------------------------------------------------------------------------

const INSURANCE_RESOLVABLE: (keyof InsuranceResult)[] = [
  "diagnostic_covered",
  "semen_analysis_covered",
  "hormone_labs_covered",
  "prior_auth_required_for",
  "in_network_lab",
  "deductible",
  "coinsurance_pct",
  "oop_max",
  "referral_required",
];

const INSURANCE_LABELS: Record<string, string> = {
  diagnostic_covered: "diagnostic evaluation coverage",
  semen_analysis_covered: "semen analysis coverage",
  hormone_labs_covered: "hormone labs coverage",
  prior_auth_required_for: "prior authorization requirements",
  in_network_lab: "in-network lab",
  deductible: "deductible amount",
  coinsurance_pct: "coinsurance percentage",
  oop_max: "out-of-pocket maximum",
  referral_required: "referral requirement",
};

const INSURANCE_PREFIX = "Follow up with insurer to obtain:";

const CLINIC_RESOLVABLE: (keyof ClinicResult)[] = [
  "booked",
  "bring_list",
  "tasks",
  "calendar_event",
];

const CLINIC_LABELS: Record<string, string> = {
  booked: "confirmed appointment (date, time, mode, clinic)",
  bring_list: "list of records to bring",
  tasks: "her/his/together follow-up tasks",
  calendar_event: "calendar consult event",
};

const CLINIC_PREFIX = "Follow up with clinic to obtain:";

// ---------------------------------------------------------------------------
// Generic verifier for the three sub-properties of Property 16.
// ---------------------------------------------------------------------------

function assertIsolation<T>(
  outcome: ExtractionOutcome<T>,
  oracle: Partial<Record<string, unknown>>,
  resolvable: string[],
  labels: Record<string, string>,
  unresolvedPrefix: string,
): void {
  const resolvableSet = new Set(resolvable);
  const resultKeys = Object.keys(outcome.result).filter((k) =>
    resolvableSet.has(k),
  );
  const resultKeySet = new Set(resultKeys);
  const unresolvedSet = new Set(outcome.unresolved);

  // unresolved must only ever contain resolvable fields.
  for (const f of outcome.unresolved) {
    expect(resolvableSet.has(f)).toBe(true);
  }

  for (const field of resolvable) {
    if (resultKeySet.has(field)) {
      // (2) Extracted field: not unresolved, value preserved unchanged.
      expect(unresolvedSet.has(field)).toBe(false);
      expect((outcome.result as Record<string, unknown>)[field]).toEqual(
        oracle[field],
      );
    } else {
      // (1) Missing field: marked unresolved AND has a corresponding follow-up.
      expect(unresolvedSet.has(field)).toBe(true);
      const referencing = outcome.followUpTasks.filter(
        (t) =>
          t.title.startsWith(unresolvedPrefix) &&
          t.title.includes(labels[field]),
      );
      expect(referencing.length).toBeGreaterThanOrEqual(1);
    }
  }

  // (3) Disjoint + covering: extracted resolvable keys and unresolved partition
  // the resolvable schema fields exactly.
  const union = [...resultKeys, ...outcome.unresolved].sort();
  expect(union).toEqual([...resolvable].sort());
  // Disjointness (no field both extracted and unresolved).
  for (const k of resultKeys) {
    expect(unresolvedSet.has(k)).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// Insurance: arbitraries that emit, per field, either a present value (with a
// transcript turn the parser can read back) or `undefined` (field omitted).
// ---------------------------------------------------------------------------

const insuranceConfigArb = fc.record({
  diagnostic_covered: fc.option(fc.boolean(), { nil: undefined }),
  semen_analysis_covered: fc.option(fc.boolean(), { nil: undefined }),
  hormone_labs_covered: fc.option(fc.boolean(), { nil: undefined }),
  prior_auth_required_for: fc.option(
    fc.subarray(["IUI", "IVF", "ICSI", "HSG"]),
    { nil: undefined },
  ),
  in_network_lab: fc.option(
    fc.constantFrom("Quest Diagnostics", "LabCorp", "BioReference Labs"),
    { nil: undefined },
  ),
  deductible: fc.option(fc.integer({ min: 0, max: 99999 }), { nil: undefined }),
  coinsurance_pct: fc.option(fc.integer({ min: 0, max: 100 }), {
    nil: undefined,
  }),
  oop_max: fc.option(fc.integer({ min: 0, max: 999999 }), { nil: undefined }),
  referral_required: fc.option(fc.boolean(), { nil: undefined }),
});

type InsuranceConfig = typeof insuranceConfigArb extends fc.Arbitrary<infer U>
  ? U
  : never;

function buildInsurance(cfg: InsuranceConfig): {
  transcript: Turn[];
  oracle: Partial<Record<string, unknown>>;
} {
  const transcript: Turn[] = [];
  const oracle: Partial<Record<string, unknown>> = {};
  const push = (text: string) => transcript.push({ speaker: "responder", text });

  if (cfg.diagnostic_covered !== undefined) {
    oracle.diagnostic_covered = cfg.diagnostic_covered;
    push(
      `Diagnostic evaluation is ${cfg.diagnostic_covered ? "covered" : "not covered"}.`,
    );
  }
  if (cfg.semen_analysis_covered !== undefined) {
    oracle.semen_analysis_covered = cfg.semen_analysis_covered;
    push(
      `Semen analysis is ${cfg.semen_analysis_covered ? "covered" : "not covered"}.`,
    );
  }
  if (cfg.hormone_labs_covered !== undefined) {
    oracle.hormone_labs_covered = cfg.hormone_labs_covered;
    push(
      `Hormone labs are ${cfg.hormone_labs_covered ? "covered" : "not covered"}.`,
    );
  }
  if (cfg.prior_auth_required_for !== undefined) {
    oracle.prior_auth_required_for = cfg.prior_auth_required_for;
    if (cfg.prior_auth_required_for.length === 0) {
      push("Prior authorization is not required.");
    } else {
      push(
        `Prior authorization is required for ${cfg.prior_auth_required_for.join(" and ")}.`,
      );
    }
  }
  if (cfg.in_network_lab !== undefined) {
    oracle.in_network_lab = cfg.in_network_lab;
    push(`In-network lab: "${cfg.in_network_lab}".`);
  }
  if (cfg.deductible !== undefined) {
    oracle.deductible = cfg.deductible;
    push(`Deductible: $${cfg.deductible}.`);
  }
  if (cfg.coinsurance_pct !== undefined) {
    oracle.coinsurance_pct = cfg.coinsurance_pct;
    push(`Coinsurance: ${cfg.coinsurance_pct}%.`);
  }
  if (cfg.oop_max !== undefined) {
    oracle.oop_max = cfg.oop_max;
    push(`Out-of-pocket: $${cfg.oop_max}.`);
  }
  if (cfg.referral_required !== undefined) {
    oracle.referral_required = cfg.referral_required;
    push(`A referral is ${cfg.referral_required ? "required" : "not required"}.`);
  }

  return { transcript, oracle };
}

// ---------------------------------------------------------------------------
// Clinic: two atomic subjects — booking (booked + calendar_event) and the bring
// list (bring_list + derived tasks).
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

const dateArb = fc
  .tuple(
    fc.constantFrom(2025, 2026, 2027),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`);

const timeArb = fc
  .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, mm]) => `${h}:${pad(mm)}`);

const BRING_POOL = [
  "cycle history", // -> her
  "amh results", // -> her
  "semen analysis report", // -> him
  "insurance card", // -> together
  "prior lab results", // -> together
];

const clinicConfigArb = fc.record({
  booking: fc.option(
    fc.record({
      date: dateArb,
      time: timeArb,
      modeText: fc.constantFrom("in person", "virtual", "telehealth"),
      clinic: fc.constantFrom(
        "Pacific Fertility Center",
        "Bay IVF",
        "Stanford REI",
        "Coastal Reproductive",
      ),
    }),
    { nil: undefined },
  ),
  bring: fc.option(fc.subarray(BRING_POOL, { minLength: 1 }), {
    nil: undefined,
  }),
});

type ClinicConfig = typeof clinicConfigArb extends fc.Arbitrary<infer U>
  ? U
  : never;

// Mirror of the implementation's task derivation (used only as oracle).
function classifyBringItem(item: string): TaskColumn {
  const i = item.toLowerCase();
  if (i.includes("semen")) return "him";
  if (i.includes("cycle") || i.includes("period") || i.includes("amh"))
    return "her";
  return "together";
}

function deriveTasks(bringList: string[]): ClinicResult["tasks"] {
  const tasks: ClinicResult["tasks"] = { her: [], him: [], together: [] };
  for (const item of bringList) {
    tasks[classifyBringItem(item)].push(`Bring ${item}`);
  }
  return tasks;
}

function buildClinic(cfg: ClinicConfig): {
  transcript: Turn[];
  oracle: Partial<Record<string, unknown>>;
} {
  const transcript: Turn[] = [];
  const oracle: Partial<Record<string, unknown>> = {};
  const push = (text: string) => transcript.push({ speaker: "responder", text });

  if (cfg.booking) {
    const { date, time, modeText, clinic } = cfg.booking;
    const mode = modeText === "in person" ? "in_person" : "virtual";
    oracle.booked = { date, time, mode, clinic };
    oracle.calendar_event = { type: "doctor_consult", date, time };
    push(
      `Appointment booked on ${date} at ${time}, ${modeText}, clinic: ${clinic}.`,
    );
  }
  if (cfg.bring) {
    oracle.bring_list = cfg.bring;
    oracle.tasks = deriveTasks(cfg.bring);
    push(`Please bring: ${cfg.bring.join(", ")}.`);
  }

  return { transcript, oracle };
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 16: Unresolved fields are isolated", () => {
  it("insurance: unresolved fields are isolated and extracted fields preserved", () => {
    fc.assert(
      fc.property(insuranceConfigArb, (cfg) => {
        const { transcript, oracle } = buildInsurance(cfg);
        const outcome = extractInsuranceResult(transcript);
        assertIsolation(
          outcome,
          oracle,
          INSURANCE_RESOLVABLE as string[],
          INSURANCE_LABELS,
          INSURANCE_PREFIX,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("clinic: unresolved fields are isolated and extracted fields preserved", () => {
    fc.assert(
      fc.property(clinicConfigArb, (cfg) => {
        const { transcript, oracle } = buildClinic(cfg);
        const outcome = extractClinicResult(transcript);
        assertIsolation(
          outcome,
          oracle,
          CLINIC_RESOLVABLE as string[],
          CLINIC_LABELS,
          CLINIC_PREFIX,
        );
      }),
      { numRuns: 100 },
    );
  });
});
