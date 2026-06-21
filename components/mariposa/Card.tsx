import * as React from "react";

import { cn } from "@/lib/utils";

/*
  App-like surface primitives for Mariposa. Cards are the lazy answer, so this
  file deliberately offers two affordances:

  - <Card> for genuinely card-worthy content: a self-contained unit that
    benefits from elevation and grouping (the trying-window summary, a single
    consult). Nested cards are never correct.
  - <Field> / <FieldGroup> for the common case that is NOT a card: labeled
    key/value rows that should read as a quiet list, not a grid of boxes.
*/

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render with no padding when the child manages its own spacing. */
  flush?: boolean;
}

export function Card({ className, flush, children, ...props }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/70 bg-card text-card-foreground shadow-card",
        flush ? "" : "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A quiet list of labeled rows — the non-card answer for key/value data. */
export function FieldGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl className={cn("divide-y divide-border/60", className)}>{children}</dl>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0",
        className,
      )}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}
