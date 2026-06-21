"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { PhoneFrame } from "./PhoneFrame";
import { StickyHeader } from "./StickyHeader";
import { BottomTabs } from "./BottomTabs";
import { DisclaimerFooter } from "./DisclaimerFooter";
import { PARTNER_NAME, usePerspective } from "./PerspectiveProvider";

interface ScreenMeta {
  title: string;
  subtitle?: string;
}

/** Per-screen header copy. Plain language, scoped to the seed couple. */
const SCREEN_META: Record<string, ScreenMeta> = {
  "/home": { title: "Maya & Daniel", subtitle: "Your shared fertility prep" },
  "/calendar": { title: "Calendar", subtitle: "Trying window & priority days" },
  "/tasks": { title: "Tasks", subtitle: "Her · His · Together" },
  "/chat": { title: "Ask Mariposa", subtitle: "Answers grounded in your data" },
};

function metaFor(pathname: string): ScreenMeta {
  const key = Object.keys(SCREEN_META).find(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
  return key ? SCREEN_META[key] : { title: "Mariposa" };
}

/** A small signed-in identity pill that lets the partner switch (sign out). */
function IdentityButton({
  name,
  onSwitch,
}: {
  name: string;
  onSwitch: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSwitch}
      aria-label={`Signed in as ${name}. Switch user.`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pl-1 pr-2.5 text-xs font-medium text-secondary-foreground",
        "transition-colors duration-150 ease-out hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-full bg-primary text-[0.625rem] font-semibold text-primary-foreground"
      >
        {name.slice(0, 1)}
      </span>
      {name}
      <RefreshCw className="size-3 text-muted-foreground" strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

/**
 * Composes the phone-frame chrome around tab content: a per-screen sticky
 * header (with the signed-in identity + switch control), a single scrollable
 * content region (scrollbar hidden), the disclaimer line, and the bottom tab
 * bar. The header and tabs stay pinned; only the content scrolls.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/home";
  const { title, subtitle } = metaFor(pathname);
  const { perspective, signOut } = usePerspective();

  return (
    <PhoneFrame>
      <StickyHeader
        title={title}
        subtitle={subtitle}
        action={
          perspective ? (
            <IdentityButton name={PARTNER_NAME[perspective]} onSwitch={signOut} />
          ) : undefined
        }
      />
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        <main key={pathname} className="mariposa-rise flex-1 px-5 py-4">
          {children}
        </main>
        <DisclaimerFooter />
      </div>
      <BottomTabs />
    </PhoneFrame>
  );
}
