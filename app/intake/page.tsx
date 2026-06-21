import * as React from "react";

import { PhoneFrame } from "@/components/mariposa/PhoneFrame";
import { StickyHeader } from "@/components/mariposa/StickyHeader";
import { DisclaimerFooter } from "@/components/mariposa/DisclaimerFooter";
import { IntakeForm } from "@/components/mariposa/IntakeForm";
import { VoiceIntakePanel } from "@/components/mariposa/VoiceIntakePanel";

export const metadata = {
  title: "Intake · Mariposa",
};

/**
 * The dual intake screen (Task 13). It lives outside the (tabs) route group —
 * this is the pre-onboarding step before the four-tab workspace — so it brings
 * its own phone-frame chrome and the single disclaimer line (Req 14.1). No
 * bottom tabs here: the screen is a focused, one-task flow.
 */
export default function IntakePage() {
  return (
    <PhoneFrame>
      <StickyHeader
        title="Tell Mariposa about you both"
        subtitle="Her · His · Together"
      />
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        <main className="mariposa-rise flex-1 px-5 py-4">
          <VoiceIntakePanel />
          <IntakeForm />
        </main>
        <DisclaimerFooter />
      </div>
    </PhoneFrame>
  );
}
