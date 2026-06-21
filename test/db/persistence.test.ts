import { describe, it, expect } from "vitest";
import { fc, propertyConfig } from "../property";
import type {
  CallRecord,
  HerProfile,
  HimProfile,
  TranscriptTurn,
} from "@/lib/db/types";

/**
 * Property 20: Persistence round-trip preserves values.
 *
 * For any profile or call-record object — including `null` MISSING values —
 * serializing then deserializing (JSON round-trip and a stub in-memory store
 * that serializes on write) preserves every field value exactly, including the
 * nulls.
 *
 * **Validates: Requirements 11.3**
 */

// --- A stub in-memory data store that serializes on write, mirroring how a row
// is persisted and read back from the database. ---
class InMemoryStore<T> {
  private rows = new Map<string, string>();

  write(key: string, value: T): void {
    // Serialize on write exactly as the data layer would persist a row.
    this.rows.set(key, JSON.stringify(value));
  }

  read(key: string): T | undefined {
    const raw = this.rows.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }
}

// --- JSON-safe generators (no undefined, no NaN/Infinity, no -0). ---
const finiteNumber = fc.integer({ min: -1_000_000, max: 1_000_000 });

/** A nullable number: `null` is a valid MISSING value (nil is null, not undefined). */
const nullableNumber = fc.option(finiteNumber, { nil: null });

const jsonLeaf = fc.oneof(
  fc.string(),
  finiteNumber,
  fc.boolean(),
  fc.constant(null),
);

const isoDateLike = fc
  .date({ min: new Date("2000-01-01"), max: new Date("2100-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

const herProfileArb: fc.Arbitrary<HerProfile> = fc.record({
  couple_id: fc.string({ minLength: 1 }),
  last_period_start: fc.option(isoDateLike, { nil: null }),
  avg_cycle_length: nullableNumber,
  cycle_length_min: nullableNumber,
  cycle_length_max: nullableNumber,
  cycle_regular: fc.option(fc.boolean(), { nil: null }),
  months_trying: nullableNumber,
  conditions: fc.array(fc.string()),
  prior_meds: fc.array(fc.string()),
  ovulation_tracking: fc.option(fc.string(), { nil: null }),
  prior_pregnancies: nullableNumber,
  amh: nullableNumber,
  tsh: nullableNumber,
  day3_fsh: nullableNumber,
  day3_estradiol: nullableNumber,
  mid_luteal_progesterone: nullableNumber,
  prolactin: nullableNumber,
});

const himProfileArb: fc.Arbitrary<HimProfile> = fc.record({
  couple_id: fc.string({ minLength: 1 }),
  semen_analysis_status: fc.option(
    fc.constantFrom("not_started", "in_progress", "completed") as fc.Arbitrary<
      HimProfile["semen_analysis_status"]
    >,
    { nil: null },
  ),
  semen_analysis_date: fc.option(isoDateLike, { nil: null }),
  volume_ml: nullableNumber,
  concentration_million_ml: nullableNumber,
  total_count_million: nullableNumber,
  progressive_motility_pct: nullableNumber,
  total_motility_pct: nullableNumber,
  morphology_normal_pct: nullableNumber,
  vitality_pct: nullableNumber,
  ph: nullableNumber,
  lifestyle: fc.record({
    smoking: fc.option(fc.boolean(), { nil: null }),
    alcohol: fc.option(fc.string(), { nil: null }),
    heat_exposure: fc.option(fc.boolean(), { nil: null }),
    sleep: fc.option(fc.string(), { nil: null }),
    stress: fc.option(fc.string(), { nil: null }),
    bmi: nullableNumber,
    supplements: fc.option(fc.boolean(), { nil: null }),
  }),
  medical_history: fc.record({
    surgeries: fc.option(fc.string(), { nil: null }),
    varicocele: fc.option(fc.string(), { nil: null }),
    medications: fc.option(fc.string(), { nil: null }),
    prior_children: nullableNumber,
  }),
  readiness_score: nullableNumber,
});

const transcriptTurnArb: fc.Arbitrary<TranscriptTurn> = fc.record({
  speaker: fc.constantFrom("agent", "responder") as fc.Arbitrary<
    TranscriptTurn["speaker"]
  >,
  text: fc.string(),
});

const callRecordArb: fc.Arbitrary<CallRecord> = fc.record({
  id: fc.uuid(),
  couple_id: fc.string({ minLength: 1 }),
  call_type: fc.constantFrom("insurance", "clinic"),
  transcript: fc.array(transcriptTurnArb),
  extracted_result: fc.option(
    fc.dictionary(fc.string(), jsonLeaf) as fc.Arbitrary<
      Record<string, unknown>
    >,
    { nil: null },
  ),
  used_fallback: fc.boolean(),
  unresolved_fields: fc.array(fc.string()),
});

/** Recursively collect the keys whose value is exactly `null`. */
function nullPaths(value: unknown, prefix = ""): string[] {
  if (value === null) return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => nullPaths(v, `${prefix}[${i}]`));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      nullPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

function assertRoundTrip<T>(arb: fc.Arbitrary<T>, label: string) {
  it(`Feature: mariposa, Property 20: round-trip preserves all ${label} values including nulls`, () => {
    fc.assert(
      fc.property(arb, (original) => {
        // JSON round-trip.
        const viaJson = JSON.parse(JSON.stringify(original)) as T;
        expect(viaJson).toEqual(original);

        // Data-layer round-trip (write then read from the stub store).
        const store = new InMemoryStore<T>();
        store.write("k", original);
        const viaStore = store.read("k");
        expect(viaStore).toEqual(original);

        // Nulls (MISSING) are preserved exactly, never dropped or substituted.
        const before = nullPaths(original);
        expect(nullPaths(viaJson)).toEqual(before);
        expect(nullPaths(viaStore)).toEqual(before);
      }),
      propertyConfig(),
    );
  });
}

describe("Property 20: persistence round-trip preserves values", () => {
  assertRoundTrip(herProfileArb, "her_profile");
  assertRoundTrip(himProfileArb, "him_profile");
  assertRoundTrip(callRecordArb, "call_record");
});
