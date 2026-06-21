import * as React from "react";

import { cn } from "@/lib/utils";

/** The fixed mobile frame width Mariposa is designed against. */
export const PHONE_WIDTH = 390;

interface PhoneFrameProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Enforces Mariposa's 390px mobile frame (Req 13.4). On a phone the frame fills
 * the viewport edge-to-edge; on a larger screen it floats as a device-like
 * column centered on a calm backdrop so the demo reads as a real app, not a
 * stretched desktop page.
 */
export function PhoneFrame({ children, className }: PhoneFrameProps) {
  return (
    <div className="flex h-dvh w-full items-center justify-center overflow-hidden bg-secondary/40 sm:py-6">
      <div
        data-testid="phone-frame"
        style={{ width: PHONE_WIDTH, maxWidth: "100%" }}
        className={cn(
          // The whole app fits the viewport — never the page scrolls. The frame
          // is a fixed-height column; only the inner content region scrolls, so
          // the header and bottom tabs stay pinned like a real app.
          "relative flex h-dvh w-full flex-col overflow-hidden bg-background",
          // On a larger screen the frame floats as a centered device, capped to
          // the viewport height so it always fits with no page scroll.
          "sm:h-[844px] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2.5rem] sm:border sm:border-border sm:shadow-card",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
