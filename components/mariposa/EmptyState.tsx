import * as React from "react";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}

/**
 * A calm placeholder for a screen that has nothing to show yet — an empty
 * state that explains what will live here rather than a blank panel. Used by
 * the tab screens until their feature tasks fill them in.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="size-6" strokeWidth={1.9} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
