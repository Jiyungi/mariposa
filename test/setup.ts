import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

// Property-based tests run a minimum of 100 generated cases per property.
// Configure fast-check's global defaults so every `fc.assert` honors this
// without each test having to repeat `{ numRuns: 100 }`.
fc.configureGlobal({ numRuns: 100 });
