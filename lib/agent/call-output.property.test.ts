// ===========================================================================
// Property 15: Call output conforms to its schema — Task 9.2 (Owner: Person B)
//   Validates: Requirement 6.4
//
// For ANY completed call (live or Mock_Fallback) and ANY responder variation,
// the output contains a chronological agent/responder transcript and an
// extracted result conforming to that call type's schema (InsuranceResult /
// ClinicResult from lib/types.ts + reference-data/call-scripts.md).
//
// We exercise BOTH the public live-first entry points (runInsuranceCall /
// runClinicCall — async; when live voice is unavailable they
// fall through to the deterministic Mock_Fallback) AND the pure Mock_Fallback
// functions (mockInsuranceCall / mockClinicCall). The "responder variation" is
// driven by varying the AuthPacket fields fed into the agent.
// ===========================================================================

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  mockClinicCall,
  mockInsuranceCall,
  runClinicCall,
  runInsuranceCall,
} from "@/lib/agent";
import { SEED_AUTH_PACKET } from "@/lib/reference";
import type {
  AuthPacket,
  CallOutput,
  ClinicResult,
  InsuranceResult,
  PolicyHolder,
  Turn,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Minimal runtime schema-checker (no external schema lib needed)
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

/** Validate a single transcript Turn: speaker enum + string text. */
function checkTurn(turn: unknown): turn is Turn {
  if (typeof turn !== "object" || turn === null) return false;
  const t = turn as Record<string, unknown>;
  return (
    (t.speaker === "agent" || t.speaker === "responder") && isString(t.text)
  );
}

/**
 * Validate that a transcript is a non-empty, chronological agent/responder
 * exchange: it starts with an agent turn and contains both agent and responder
 * turns with the first responder appearing after the first agent.
 */
function checkTranscript(transcript: unknown): asserts transcript is Turn[] {
  expect(Array.isArray(transcript)).toBe(true);
  const turns = transcript as unknown[];
  expect(turns.length).toBeGreaterThan(0);

  // Every entry is a well-formed Turn.
  for (const turn of turns) {
    expect(checkTurn(turn)).toBe(true);
  }

  const typed = turns as Turn[];

  // Chronological: starts with an agent turn (the agent opens the call).
  expect(typed[0].speaker).toBe("agent");

  // Contains both agent and responder turns.
  const firstAgentIdx = typed.findIndex((t) => t.speaker === "agent");
  const firstResponderIdx = typed.findIndex((t) => t.speaker === "responder");
  expect(firstAgentIdx).toBeGreaterThanOrEqual(0);
  expect(firstResponderIdx).toBeGreaterThan(0);

  // Plausible ordering: the agent speaks before the first responder reply.
  expect(firstAgentIdx).toBeLessThan(firstResponderIdx);
}

/** Validate an InsuranceResult: every required field present + correct type. */
function checkInsuranceResult(result: unknown): asserts result is InsuranceResult {
  expect(typeof result).toBe("object");
  expect(result).not.toBeNull();
  const r = result as Record<string, unknown>;

  expect(isBoolean(r.diagnostic_covered)).toBe(true);
  expect(isBoolean(r.semen_analysis_covered)).toBe(true);
  expect(isBoolean(r.hormone_labs_covered)).toBe(true);
  expect(isStringArray(r.prior_auth_required_for)).toBe(true);
  expect(isString(r.in_network_lab)).toBe(true);
  expect(isFiniteNumber(r.deductible)).toBe(true);
  expect(isFiniteNumber(r.coinsurance_pct)).toBe(true);
  expect(isFiniteNumber(r.oop_max)).toBe(true);
  expect(isBoolean(r.referral_required)).toBe(true);
  expect(isStringArray(r.follow_up_tasks)).toBe(true);
}

/** Validate a ClinicResult: every required field present + correct type. */
function checkClinicResult(result: unknown): asserts result is ClinicResult {
  expect(typeof result).toBe("object");
  expect(result).not.toBeNull();
  const r = result as Record<string, unknown>;

  // booked: { date; time; mode; clinic }
  expect(typeof r.booked).toBe("object");
  expect(r.booked).not.toBeNull();
  const booked = r.booked as Record<string, unknown>;
  expect(isString(booked.date)).toBe(true);
  expect(isString(booked.time)).toBe(true);
  expect(isString(booked.mode)).toBe(true);
  expect(isString(booked.clinic)).toBe(true);

  // bring_list: string[]
  expect(isStringArray(r.bring_list)).toBe(true);

  // tasks: { her; him; together } each string[]
  expect(typeof r.tasks).toBe("object");
  expect(r.tasks).not.toBeNull();
  const tasks = r.tasks as Record<string, unknown>;
  expect(isStringArray(tasks.her)).toBe(true);
  expect(isStringArray(tasks.him)).toBe(true);
  expect(isStringArray(tasks.together)).toBe(true);

  // calendar_event: { type; date; time }
  expect(typeof r.calendar_event).toBe("object");
  expect(r.calendar_event).not.toBeNull();
  const ev = r.calendar_event as Record<string, unknown>;
  expect(isString(ev.type)).toBe(true);
  expect(isString(ev.date)).toBe(true);
  expect(isString(ev.time)).toBe(true);
}

// ---------------------------------------------------------------------------
// Arbitrary: varied AuthPacket inputs (the "responder variation" driver)
// ---------------------------------------------------------------------------

/** ISO `YYYY-MM-DD` date arbitrary (valid calendar dates). */
const isoDateArb: fc.Arbitrary<string> = fc
  .date({ min: new Date("1950-01-01"), max: new Date("2005-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

const policyHolderArb: fc.Arbitrary<PolicyHolder> = fc.constantFrom(
  "her",
  "him",
);

const authPacketArb: fc.Arbitrary<AuthPacket> = fc.record({
  couple_id: fc.constantFrom("couple_001", "couple_002", "couple_xyz"),
  member_id: fc
    .tuple(
      fc.string({ minLength: 2, maxLength: 4 }).map((s) => s.toUpperCase()),
      fc.integer({ min: 0, max: 9999 }),
      fc.integer({ min: 0, max: 9999 }),
    )
    .map(([prefix, a, b]) => `${prefix || "PCH"}-${a}-${b}`),
  dob: isoDateArb,
  provider: fc.constantFrom(
    "Pacific Crest Health",
    "Blue Ridge Mutual",
    "Cascade Care",
  ),
  plan_type: fc.constantFrom("PPO", "HMO", "EPO", "POS"),
  group_number: fc
    .integer({ min: 100000, max: 999999 })
    .map((n) => `GRP-${n}`),
  policy_holder: policyHolderArb,
});

// ---------------------------------------------------------------------------
// Property 15
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 15: Call output conforms to its schema", () => {
  it("Feature: mariposa, Property 15: Call output conforms to its schema", async () => {
    await fc.assert(
      fc.asyncProperty(authPacketArb, async (packet) => {
        // --- Insurance: pure Mock_Fallback ---
        const mockIns: CallOutput<InsuranceResult> = mockInsuranceCall(packet);
        checkTranscript(mockIns.transcript);
        checkInsuranceResult(mockIns.result);
        expect(typeof mockIns.usedFallback).toBe("boolean");

        // --- Insurance: live-first public entry (async) ---
        const liveIns = await runInsuranceCall(packet);
        checkTranscript(liveIns.transcript);
        checkInsuranceResult(liveIns.result);
        expect(typeof liveIns.usedFallback).toBe("boolean");

        // --- Clinic: pure Mock_Fallback ---
        const mockClinic: CallOutput<ClinicResult> = mockClinicCall(packet);
        checkTranscript(mockClinic.transcript);
        checkClinicResult(mockClinic.result);
        expect(typeof mockClinic.usedFallback).toBe("boolean");

        // --- Clinic: live-first public entry (async) ---
        const liveClinic = await runClinicCall(packet);
        checkTranscript(liveClinic.transcript);
        checkClinicResult(liveClinic.result);
        expect(typeof liveClinic.usedFallback).toBe("boolean");
      }),
      { numRuns: 100 },
    );
  });

  it("conforms to schema for the seed authorization packet (concrete example)", async () => {
    const ins = await runInsuranceCall(SEED_AUTH_PACKET);
    checkTranscript(ins.transcript);
    checkInsuranceResult(ins.result);

    const clinic = await runClinicCall(SEED_AUTH_PACKET);
    checkTranscript(clinic.transcript);
    checkClinicResult(clinic.result);
  });
});
