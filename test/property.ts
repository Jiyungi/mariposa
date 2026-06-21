import fc from "fast-check";

/**
 * Minimum number of generated cases per property-based test.
 * Property tests across the suite use at least this many runs.
 */
export const MIN_RUNS = 100;

/**
 * Shared fast-check parameters for property tests. Spread (or extend) this in
 * `fc.assert(..., propertyConfig)` to guarantee the minimum run count.
 *
 * @example
 * fc.assert(fc.property(fc.integer(), (n) => n === n), propertyConfig());
 */
export function propertyConfig(
  overrides: fc.Parameters<unknown> = {},
): fc.Parameters<unknown> {
  return { numRuns: MIN_RUNS, ...overrides };
}

export { fc };
