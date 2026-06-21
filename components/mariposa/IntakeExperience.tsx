"use client";

import * as React from "react";

import { IntakeForm } from "@/components/mariposa/IntakeForm";
import { VoiceIntakePanel } from "@/components/mariposa/VoiceIntakePanel";
import type { VoiceIntakeDraft } from "@/lib/intake/voice";

export function IntakeExperience() {
  const [voiceDraft, setVoiceDraft] = React.useState<VoiceIntakeDraft>({});

  return (
    <>
      <VoiceIntakePanel onDraft={setVoiceDraft} />
      <IntakeForm voiceDraft={voiceDraft} />
    </>
  );
}
