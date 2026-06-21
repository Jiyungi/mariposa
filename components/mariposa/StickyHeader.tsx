import * as React from "react";

import { cn } from "@/lib/utils";

interface StickyHeaderProps {
  title: string;
  /** A short, plain-language line under the title. Not a tracked eyebrow. */
  subtitle?: string;
  /** Optional trailing control (e.g. a copy or settings action). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * The per-screen sticky header (Req 13.4). Stays pinned to the top of the
 * frame as content scrolls beneath it, with a translucent backdrop so the
 * scrolled content reads through without losing the title.
 */
export function StickyHeader({
  title,
  subtitle,
  action,
  className,
}: StickyHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-header border-b border-border/70 bg-background/85 px-5 pb-3 pt-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[1.375rem] font-semibold leading-tight text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pb-0.5">{action}</div> : null}
      </div>
    </header>
  );
}
