"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import { PhoneFrame } from "./PhoneFrame";
import { AppShell } from "./AppShell";
import { SignIn } from "./SignIn";
import { usePerspective } from "./PerspectiveProvider";

/*
  AppGate — decides what the (tabs) app shows:
   • before hydration: a neutral splash inside the phone frame (no flash, no
     SSR/client mismatch);
   • signed out: the SignIn perspective chooser (Req 1.2);
   • signed in: the full AppShell chrome with the tab content.
*/
export function AppGate({ children }: { children: React.ReactNode }) {
  const { perspective, hydrated } = usePerspective();

  if (!hydrated) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="size-6" strokeWidth={2} aria-hidden="true" />
          </span>
        </div>
      </PhoneFrame>
    );
  }

  if (!perspective) {
    return <SignIn />;
  }

  return <AppShell>{children}</AppShell>;
}
