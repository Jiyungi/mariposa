"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Home,
  ListChecks,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface TabDef {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** The four primary destinations (Req 13.4). Order is intentional: the
 *  daily glance (Home), then timing (Calendar), then doing (Tasks), then
 *  asking (Chat). */
export const TABS: readonly TabDef[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Chat", href: "/chat", icon: MessageCircle },
] as const;

/**
 * Bottom tab navigation pinned to the base of the phone frame. The active
 * tab is derived from the current path so the user always knows where they
 * are (recognition over recall).
 */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-tabs border-t border-border/70 bg-background/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[0.6875rem] font-medium transition-colors duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-150 ease-out",
                    active ? "bg-secondary" : "bg-transparent",
                  )}
                >
                  <Icon
                    className="size-5"
                    strokeWidth={active ? 2.4 : 1.9}
                    aria-hidden="true"
                  />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
