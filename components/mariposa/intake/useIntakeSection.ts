"use client";

import * as React from "react";
import type { z } from "zod";

import { safeValidate, type FieldIssue } from "@/lib/validation/intake";
import type { FieldConfig } from "./config";

/*
  Per-section form state for an intake section (Her / His / Together).

  Behaviour grounded in Req 2.7 / 2.8:
   - Text and number fields edit a string "draft"; the typed value is committed
     on blur only if the whole section still validates for that field.
   - On an invalid edit the value is REJECTED and the PRIOR value is RETAINED:
     the draft snaps back to the last committed value and an inline error names
     the field and its expected range (the message comes straight from
     `safeValidate`).
   - Select / toggle / list controls commit immediately (no free-text draft).
   - Blank nullable number fields commit `null` (MISSING, Req 1.8).

  The hook reports the section's overall validity to the parent so the
  completion guard can fire `fertility.intake.completed` exactly once when all
  three sections are valid (Req 2.6, Property 12).
*/

function getPath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (acc, key) =>
      acc != null && typeof acc === "object"
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  );
}

function setPath<T>(obj: T, path: string[], value: unknown): T {
  const copy = structuredClone(obj);
  let node = copy as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    node = node[path[i]] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
  return copy;
}

const keyOf = (path: string[]) => path.join(".");

/** Format a committed value as the draft string a text/number input shows. */
function toDraft(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Parse a number draft to its committed value (`null` when nullable + blank). */
function parseNumber(raw: string, nullable: boolean): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return nullable ? null : undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

export interface UseIntakeSectionResult<T> {
  values: T;
  isValid: boolean;
  getDraft: (path: string[]) => string;
  getError: (path: string[]) => string | undefined;
  /** Update a text/number draft as the user types (no commit yet). */
  setDraft: (path: string[], value: string) => void;
  /** Commit a text/number field on blur, validating + retaining prior on fail. */
  commitField: (field: FieldConfig) => void;
  /** Immediately commit a select/toggle/list value and re-validate. */
  setValue: (field: FieldConfig, value: unknown) => void;
}

export function useIntakeSection<T>(
  schema: z.ZodType<T>,
  initial: T,
  fields: FieldConfig[],
  onValidityChange?: (valid: boolean) => void,
): UseIntakeSectionResult<T> {
  const [values, setValues] = React.useState<T>(() =>
    structuredClone(initial),
  );
  const [drafts, setDrafts] = React.useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const f of fields) {
      if (f.kind === "text" || f.kind === "date" || f.kind === "number") {
        map[keyOf(f.path)] = toDraft(getPath(initial, f.path));
      }
    }
    return map;
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Report initial + subsequent validity to the parent guard.
  const lastReported = React.useRef<boolean | null>(null);
  const isValid = safeValidate(schema, values).success;
  React.useEffect(() => {
    if (lastReported.current !== isValid) {
      lastReported.current = isValid;
      onValidityChange?.(isValid);
    }
  }, [isValid, onValidityChange]);

  const errorsByField = (issues: FieldIssue[]): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const issue of issues) {
      if (map[issue.field] === undefined) map[issue.field] = issue.message;
    }
    return map;
  };

  const setDraft = React.useCallback((path: string[], value: string) => {
    setDrafts((prev) => ({ ...prev, [keyOf(path)]: value }));
  }, []);

  const commitField = React.useCallback(
    (field: FieldConfig) => {
      const key = keyOf(field.path);
      const raw = drafts[key] ?? "";
      const parsed =
        field.kind === "number"
          ? parseNumber(raw, Boolean(field.nullable))
          : raw;

      const candidate = setPath(values, field.path, parsed);
      const result = safeValidate(schema, candidate);

      if (result.success) {
        setValues(candidate);
        setErrors({});
        setDrafts((prev) => ({ ...prev, [key]: toDraft(parsed) }));
        return;
      }

      const map = errorsByField(result.errors);
      if (map[key] !== undefined) {
        // Reject this value, retain the prior one (Req 2.8): snap the draft
        // back to the last committed value and surface the field+range error.
        setDrafts((prev) => ({
          ...prev,
          [key]: toDraft(getPath(values, field.path)),
        }));
        setErrors((prev) => ({ ...prev, [key]: map[key] }));
      } else {
        // The edited field is fine; another field is the problem. Commit this
        // field and surface the remaining issues.
        setValues(candidate);
        setDrafts((prev) => ({ ...prev, [key]: toDraft(parsed) }));
        setErrors(map);
      }
    },
    [drafts, values, schema],
  );

  const setValue = React.useCallback(
    (field: FieldConfig, value: unknown) => {
      const candidate = setPath(values, field.path, value);
      setValues(candidate);
      const result = safeValidate(schema, candidate);
      setErrors(result.success ? {} : errorsByField(result.errors));
    },
    [values, schema],
  );

  const getDraft = React.useCallback(
    (path: string[]) => drafts[keyOf(path)] ?? "",
    [drafts],
  );
  const getError = React.useCallback(
    (path: string[]) => errors[keyOf(path)],
    [errors],
  );

  return {
    values,
    isValid,
    getDraft,
    getError,
    setDraft,
    commitField,
    setValue,
  };
}
