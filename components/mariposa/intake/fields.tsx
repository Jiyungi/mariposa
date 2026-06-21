"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/*
  Reusable intake field primitives (Req 2.1 — structured fields only).

  These compose the same OKLCH token system as the rest of Mariposa: `border`,
  `input`, `ring`, `foreground`, `muted-foreground`, `destructive`. Every
  control carries label, hint, and error slots so the form can name the field
  and its expected range inline (Req 2.8) with a consistent, calm vocabulary —
  no bespoke per-field markup, no synthetic-data clutter.

  An invalid control is wired up for assistive tech: `aria-invalid` plus
  `aria-describedby` pointing at the error text, which uses `role="alert"`.
*/

const controlBase =
  "h-11 w-full rounded-xl border bg-card px-3.5 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

function controlClass(invalid?: boolean): string {
  return cn(
    controlBase,
    invalid
      ? "border-destructive focus-visible:ring-destructive"
      : "border-input",
  );
}

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Render the control inline (label left, control right) for compact rows. */
  children: React.ReactNode;
  className?: string;
}

/** Label + control + hint/error scaffold shared by every field type. */
function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
}: FieldShellProps) {
  const describedBy = error
    ? `${id}-error`
    : hint
      ? `${id}-hint`
      : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {/* Provide the describedby id to the control via context-free cloning. */}
      <FieldControlContext.Provider value={{ describedBy }}>
        {children}
      </FieldControlContext.Provider>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const FieldControlContext = React.createContext<{ describedBy?: string }>({});

function useDescribedBy() {
  return React.useContext(FieldControlContext).describedBy;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  type?: "text" | "date";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}

export function TextField({
  id,
  label,
  value,
  onChange,
  onCommit,
  hint,
  error,
  placeholder,
  type = "text",
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <TextControl
        id={id}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        placeholder={placeholder}
        type={type}
        invalid={Boolean(error)}
      />
    </FieldShell>
  );
}

function TextControl({
  id,
  value,
  onChange,
  onCommit,
  placeholder,
  type,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  type: "text" | "date";
  invalid: boolean;
}) {
  const describedBy = useDescribedBy();
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      className={controlClass(invalid)}
    />
  );
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

interface NumberFieldProps {
  id: string;
  label: string;
  /** The committed string value (empty string === blank / MISSING). */
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  hint?: string;
  error?: string;
  unit?: string;
  /** Show a "leave blank if not done" affordance for nullable labs (Req 1.8). */
  optional?: boolean;
  step?: string;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  onCommit,
  hint,
  error,
  unit,
  optional,
  step,
}: NumberFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint ?? (optional ? "Leave blank if not done yet" : undefined)}
      error={error}
    >
      <NumberControl
        id={id}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        unit={unit}
        step={step}
        invalid={Boolean(error)}
      />
    </FieldShell>
  );
}

function NumberControl({
  id,
  value,
  onChange,
  onCommit,
  unit,
  step,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  unit?: string;
  step?: string;
  invalid: boolean;
}) {
  const describedBy = useDescribedBy();
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className={cn(controlClass(invalid), unit ? "pr-12" : undefined)}
      />
      {unit ? (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-medium text-muted-foreground">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select (enumerations — Req 2.3, 2.4)
// ---------------------------------------------------------------------------

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  hint,
  error,
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <SelectControl
        id={id}
        value={value}
        options={options}
        onChange={onChange}
        invalid={Boolean(error)}
      />
    </FieldShell>
  );
}

function SelectControl({
  id,
  value,
  options,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const describedBy = useDescribedBy();
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={cn(controlClass(invalid), "appearance-none pr-9")}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute inset-y-0 right-3 my-auto size-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle (booleans)
// ---------------------------------------------------------------------------

interface ToggleFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}

export function ToggleField({
  id,
  label,
  checked,
  onChange,
  hint,
}: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 transform rounded-full bg-card shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List (string[] — conditions, prior meds). Structured chips, not free text.
// ---------------------------------------------------------------------------

interface ListFieldProps {
  id: string;
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  hint?: string;
  placeholder?: string;
}

export function ListField({
  id,
  label,
  items,
  onChange,
  hint,
  placeholder,
}: ListFieldProps) {
  const [draft, setDraft] = React.useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft("");
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {items.length ? (
          <ul className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <li key={`${item}-${index}`}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  {item}
                  <button
                    type="button"
                    aria-label={`Remove ${item}`}
                    onClick={() => removeAt(index)}
                    className="-mr-1 grid size-4 place-items-center rounded-full text-secondary-foreground/70 transition-colors hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      aria-hidden="true"
                    >
                      <path
                        d="m5 5 10 10M15 5 5 15"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <input
            id={id}
            type="text"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={controlClass(false)}
          />
          <button
            type="button"
            onClick={add}
            className="h-11 shrink-0 rounded-xl border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            Add
          </button>
        </div>
      </div>
    </FieldShell>
  );
}
