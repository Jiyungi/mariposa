import * as React from "react";

import { PerspectiveProvider } from "@/components/mariposa/PerspectiveProvider";
import { AppGate } from "@/components/mariposa/AppGate";

/**
 * Wraps every tab screen (Home / Calendar / Tasks / Summary / Chat) in the shared
 * phone-frame chrome behind the sign-in perspective gate: each partner signs in
 * as themselves and sees only their own view + the shared Together view
 * (Req 1.2). The 390px frame, per-screen sticky header, bottom tabs, and the
 * single disclaimer line all live in the AppShell the gate renders once signed
 * in.
 */
export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PerspectiveProvider>
      <AppGate>{children}</AppGate>
    </PerspectiveProvider>
  );
}
