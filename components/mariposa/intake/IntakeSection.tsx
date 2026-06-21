"use client";

import * as React from "react";
import type { z } from "zod";

import { Card, CardHeader } from "@/components/mariposa/Card";
import {
  ListField,
  NumberField,
  SelectField,
  TextField,
  ToggleField,
} from "./fields";
import type { FieldConfig, SectionConfig } from "./config";
import { useIntakeSection } from "./useIntakeSection";

interface IntakeSectionProps<T> {
  section: SectionConfig;
  schema: z.ZodType<T>;
  initial: T;
  hidden?: boolean;
  onValidityChange: (valid: boolean) => void;
}

/**
 * Renders one intake section (Her / His / Together) as grouped, structured
 * fields wired to its Zod schema. Validation, inline errors, and prior-value
 * retention live in `useIntakeSection`; this component only maps each field
 * config to the matching control.
 */
export function IntakeSection<T>({
  section,
  schema,
  initial,
  hidden,
  onValidityChange,
}: IntakeSectionProps<T>) {
  const form = useIntakeSection(schema, initial, allFields(section), onValidityChange);

  return (
    <div hidden={hidden} className="flex flex-col gap-4">
      {section.groups.map((group) => (
        <Card key={group.title}>
          <CardHeader title={group.title} description={group.description} />
          <div className="mt-4 flex flex-col gap-4">
            {group.fields.map((field) => (
              <FieldRenderer
                key={keyOf(field)}
                field={field}
                form={form}
                sectionKey={section.key}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function allFields(section: SectionConfig): FieldConfig[] {
  return section.groups.flatMap((g) => g.fields);
}

const keyOf = (field: FieldConfig) => field.path.join(".");

interface FieldRendererProps<T> {
  field: FieldConfig;
  form: ReturnType<typeof useIntakeSection<T>>;
  sectionKey: string;
}

function FieldRenderer<T>({ field, form, sectionKey }: FieldRendererProps<T>) {
  const id = `intake-${sectionKey}-${keyOf(field)}`;
  const error = form.getError(field.path);

  switch (field.kind) {
    case "text":
    case "date":
      return (
        <TextField
          id={id}
          label={field.label}
          type={field.kind === "date" ? "date" : "text"}
          value={form.getDraft(field.path)}
          onChange={(v) => form.setDraft(field.path, v)}
          onCommit={() => form.commitField(field)}
          hint={field.hint}
          error={error}
          placeholder={field.placeholder}
        />
      );
    case "number":
      return (
        <NumberField
          id={id}
          label={field.label}
          value={form.getDraft(field.path)}
          onChange={(v) => form.setDraft(field.path, v)}
          onCommit={() => form.commitField(field)}
          hint={field.hint}
          error={error}
          unit={field.unit}
          optional={field.nullable}
          step={field.step}
        />
      );
    case "select":
      return (
        <SelectField
          id={id}
          label={field.label}
          value={String(readValue(form, field) ?? "")}
          options={field.options ?? []}
          onChange={(v) => form.setValue(field, v)}
          hint={field.hint}
          error={error}
        />
      );
    case "toggle":
      return (
        <ToggleField
          id={id}
          label={field.label}
          checked={Boolean(readValue(form, field))}
          onChange={(v) => form.setValue(field, v)}
          hint={field.hint}
        />
      );
    case "list":
      return (
        <ListField
          id={id}
          label={field.label}
          items={(readValue(form, field) as string[]) ?? []}
          onChange={(items) => form.setValue(field, items)}
          hint={field.hint}
          placeholder={field.placeholder}
        />
      );
    default:
      return null;
  }
}

/** Read a committed value (for select/toggle/list which don't use drafts). */
function readValue<T>(
  form: ReturnType<typeof useIntakeSection<T>>,
  field: FieldConfig,
): unknown {
  return field.path.reduce<unknown>(
    (acc, key) =>
      acc != null && typeof acc === "object"
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    form.values,
  );
}
