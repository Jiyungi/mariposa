import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/*
  Two small status primitives shared by the Couple Workspace views.

  - <MissingFlag> renders a MISSING (null) clinical value as an explicit
    flag, never as a blank field and never as a substituted value (Req 1.8,
    Property 24). It carries a stable `data-missing` hook so the value can be
    located unambiguously and so a flagged cell is never mistaken for data.
  - <Chip> is the quiet status badge used for coverage state, below-limit
    semen parameters, lifestyle watch-items, and workflow step status. Toned,
    not loud — reassurance over alarm.
*/

interface MissingFlagProps {
  /** Optional accessible context, e.g. "Day-3 FSH". */
  label?: string;
  className?: string;
}

/**
 * The canonical rendering of a MISSING value. Always reads "Missing" (no
 * number, no placeholder), so a null lab or semen value is shown as a flag
 * rather than a blank or a stand-in value.
 */
export function MissingFlag({ label, className }: MissingFlagProps) {
  return (
    <span
      data-missing="true"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground",
        className,
      )}
    >
      <AlertCircle className="size-3.5 text-warning" strokeWidth={2.2} aria-hidden="true" />
      <span>Missing</span>
      {label ? <span className="sr-only">: {label} not on file</span> : null}
    </span>
  );
}

type ChipTone = "neutral" | "success" | "warning" | "info" | "danger";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-success/15 text-success-foreground",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-info/12 text-info-foreground",
  danger: "bg-destructive/12 text-destructive",
};

interface ChipProps {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}

/** A small, quiet status badge. */
export function Chip({ tone = "neutral", className, children }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
