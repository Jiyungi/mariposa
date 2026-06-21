import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The single disclaimer line shown once per screen (Req 14.1). This exact
 * string is the source of truth; do not add synthetic-data badges or extra
 * warnings anywhere in the main views (Req 14.2).
 */
export const DISCLAIMER_TEXT =
  "Mariposa provides educational fertility information, not medical advice.";

interface DisclaimerFooterProps {
  className?: string;
}

export function DisclaimerFooter({ className }: DisclaimerFooterProps) {
  return (
    <footer className={cn("px-5 pb-3 pt-2", className)}>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {DISCLAIMER_TEXT}
      </p>
    </footer>
  );
}
