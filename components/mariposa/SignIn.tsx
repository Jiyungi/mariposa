"use client";

import * as React from "react";
import { ChevronRight, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { PhoneFrame } from "./PhoneFrame";
import { DisclaimerFooter } from "./DisclaimerFooter";
import {
  PARTNER_NAME,
  PARTNER_ROLE,
  usePerspective,
  type Perspective,
} from "./PerspectiveProvider";

/*
  SignIn — the perspective gate (Req 1.2). Each partner signs in as themselves;
  after sign-in they see only their own view + the shared Together view. Built
  via the Impeccable design system (same OKLCH tokens, no generic Tailwind
  fallback), fits the fixed phone frame with no page scroll, and carries the
  single disclaimer line.
*/

const CHOICES: readonly Perspective[] = ["her", "him"];

function initialOf(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

export function SignIn() {
  const { signIn } = usePerspective();

  return (
    <PhoneFrame>
      <div className="flex min-h-0 flex-1 flex-col px-6">
        {/* Brand / welcome */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="mariposa-rise">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
              <Sparkles className="size-6" strokeWidth={2} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold leading-tight text-foreground">
              Welcome to Mariposa
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your shared fertility prep, one step at a time. Sign in as yourself
              — you&apos;ll see your own view and everything you share together.
            </p>
          </div>

          {/* Who's signing in */}
          <div className="mt-8 flex flex-col gap-3" role="group" aria-label="Choose who is signing in">
            {CHOICES.map((choice) => {
              const name = PARTNER_NAME[choice];
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => signIn(choice)}
                  className={cn(
                    "mariposa-rise group flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-card transition-colors duration-150 ease-out",
                    "hover:border-primary/40 hover:bg-accent/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-semibold text-secondary-foreground"
                  >
                    {initialOf(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {PARTNER_ROLE[choice]} · Together view
                    </span>
                  </span>
                  <ChevronRight
                    className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>

        <DisclaimerFooter className="px-0" />
      </div>
    </PhoneFrame>
  );
}
