// ===========================================================================
// Property test — Feature: mariposa, Property 17: Mock_Fallback is deterministic.
//
//   "For any call type and authorization packet, repeated Mock_Fallback runs
//    with identical inputs return identical schema and identical field values."
//
// Validates: Requirements 6.7, 15.5, 16.3
//
// Strategy: generate VARIED AuthPacket inputs with fast-check (varying every
// field, including a mix of well-formed ISO dobs and arbitrary strings, and both
// policy_holder values). For each generated packet, call mockInsuranceCall and
// mockClinicCall MULTIPLE independent times and assert every run is DEEP-EQUAL
// to the first — transcript array, result object, and usedFallback flag. The
// Mock_Fallback is a pure function of (call type, packet): identical inputs must
// always yield identical output (no Date.now / Math.random / I/O).
//
// A concrete case pins SEED_AUTH_PACKET's results to the verbatim
// INSURANCE_RESULT / CLINIC_RESULT from @/lib/reference.
// ===========================================================================

import { describe, test, expect } from "vitest";
import fc from "fast-check";

import { mockInsuranceCall, mockClinicCall } from "@/lib/agent";
import {
  SEED_AUTH_PACKET,
  INSURANCE_RESULT,
  CLINIC_RESULT,
} from "@/lib/reference";
import type { AuthPacket, PolicyHolder } from "@/lib/types";

// Number of independent repeated runs per generated packet (>= 2; use 3).
const REPEAT_RUNS = 3;

// ---------------------------------------------------------------------------
// Arbitrary — varied AuthPacket inputs
// ---------------------------------------------------------------------------

const policyHolderArb: fc.Arbitrary<PolicyHolder> = fc.constantFrom(
  "her",
  "him",
);

// A mix of well-formed ISO `YYYY-MM-DD` dates (exercises formatDobSpoken's
// spoken-date branch) and arbitrary strings (exercises its passthrough branch).
const isoDateArb: fc.Arbitrary<string> = fc
  .date({ min: new Date("1950-01-01"), max: new Date("2010-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

const dobArb: fc.Arbitrary<string> = fc.oneof(isoDateArb, fc.string());

const authPacketArb: fc.Arbitrary<AuthPacket> = fc.record({
  couple_id: fc.string(),
  member_id: fc.string(),
  dob: dobArb,
  provider: fc.string(),
  plan_type: fc.string(),
  group_number: fc.string(),
  policy_holder: policyHolderArb,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Feature: mariposa, Property 17: Mock_Fallback is deterministic", () => {
  test("mockInsuranceCall returns deep-equal output across repeated runs (varied packets)", () => {
    fc.assert(
      fc.property(authPacketArb, (packet) => {
        const first = mockInsuranceCall(packet);
        for (let i = 0; i < REPEAT_RUNS; i++) {
          const again = mockInsuranceCall(packet);
          // Identical schema + identical field values: transcript, result, flag.
          expect(again).toEqual(first);
          expect(again.transcript).toEqual(first.transcript);
          expect(again.result).toEqual(first.result);
          expect(again.usedFallback).toEqual(first.usedFallback);
        }
      }),
      { numRuns: 150 },
    );
  });

  test("mockClinicCall returns deep-equal output across repeated runs (varied packets)", () => {
    fc.assert(
      fc.property(authPacketArb, (packet) => {
        const first = mockClinicCall(packet);
        for (let i = 0; i < REPEAT_RUNS; i++) {
          const again = mockClinicCall(packet);
          expect(again).toEqual(first);
          expect(again.transcript).toEqual(first.transcript);
          expect(again.result).toEqual(first.result);
          expect(again.usedFallback).toEqual(first.usedFallback);
        }
      }),
      { numRuns: 150 },
    );
  });

  test("both call types stay deterministic when interleaved on the same packet", () => {
    fc.assert(
      fc.property(authPacketArb, (packet) => {
        const insA = mockInsuranceCall(packet);
        const cliA = mockClinicCall(packet);
        const insB = mockInsuranceCall(packet);
        const cliB = mockClinicCall(packet);

        expect(insB).toEqual(insA);
        expect(cliB).toEqual(cliA);
        // The two call types are distinct outputs (sanity: not collapsed).
        expect(insA.result).not.toEqual(cliA.result);
      }),
      { numRuns: 150 },
    );
  });

  test("SEED_AUTH_PACKET results deep-equal the verbatim reference results", () => {
    const insurance = mockInsuranceCall(SEED_AUTH_PACKET);
    const clinic = mockClinicCall(SEED_AUTH_PACKET);

    // Verbatim INSURANCE_RESULT / CLINIC_RESULT from @/lib/reference.
    expect(insurance.result).toEqual(INSURANCE_RESULT);
    expect(clinic.result).toEqual(CLINIC_RESULT);

    // Fallback flag is set, and re-running is still identical.
    expect(insurance.usedFallback).toBe(true);
    expect(clinic.usedFallback).toBe(true);
    expect(mockInsuranceCall(SEED_AUTH_PACKET)).toEqual(insurance);
    expect(mockClinicCall(SEED_AUTH_PACKET)).toEqual(clinic);
  });
});
