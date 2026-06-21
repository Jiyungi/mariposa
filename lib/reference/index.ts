// ===========================================================================
// Reference Constants Layer (lib/reference/) — Req 12.1, 12.2, 12.3, 11.3
//
// The SINGLE SOURCE OF TRUTH for all clinical literals. Every value here traces
// VERBATIM to a file in reference-data/ (cited in each module's comments). No
// medical number, code, range, or line of dialogue is invented; nothing clinical
// lives outside this layer.
//
//   who.ts            -> reference-data/semen-analysis-reference.md
//   female-hormone.ts -> reference-data/female-hormone-reference.md
//   cpt.ts            -> reference-data/cpt-codes-fertility.md
//   duration-rule.ts  -> reference-data/cycle-fertility-reference.md
//   clinic.ts         -> reference-data/clinic-intake-data.md
//   insurance.ts      -> reference-data/insurance-coverage-data.md
//   call-scripts.ts   -> reference-data/call-scripts.md
//   seed-couple.ts    -> reference-data/sample-couple.md
// ===========================================================================

export * from "./who";
export * from "./female-hormone";
export * from "./cpt";
export * from "./duration-rule";
export * from "./clinic";
export * from "./insurance";
export * from "./call-scripts";
export * from "./seed-couple";
