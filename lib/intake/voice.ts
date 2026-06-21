export interface VoiceIntakeDraft {
  her?: {
    age?: number;
    months_trying?: number;
    cycle_regular?: boolean;
    avg_cycle_length?: number;
  };
  his?: {
    semen_analysis_status?: "not_started" | "in_progress" | "completed";
  };
  together?: {
    goal?: string;
    top_concern?: string;
    insurance_provider?: string;
  };
}

function numberFromMatch(match: RegExpMatchArray | null): number | undefined {
  if (!match?.[1]) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactDraft(draft: VoiceIntakeDraft): VoiceIntakeDraft {
  return JSON.parse(JSON.stringify(draft)) as VoiceIntakeDraft;
}

export function extractVoiceIntakeDraft(text: string): VoiceIntakeDraft {
  const normalized = text.toLowerCase();
  const draft: VoiceIntakeDraft = { her: {}, his: {}, together: {} };

  const age =
    numberFromMatch(text.match(/\b(?:i am|i'm|age is|age)\s+(\d{2})\b/i)) ??
    numberFromMatch(text.match(/\b(\d{2})\s+years?\s+old\b/i));
  if (age !== undefined) draft.her!.age = age;

  const monthsTrying =
    numberFromMatch(text.match(/\b(?:trying|been trying)\s+(?:for\s+)?(\d{1,2})\s+months?\b/i)) ??
    numberFromMatch(text.match(/\b(\d{1,2})\s+months?\s+(?:of\s+)?trying\b/i));
  if (monthsTrying !== undefined) draft.her!.months_trying = monthsTrying;

  const cycleLength =
    numberFromMatch(text.match(/\b(\d{2})\s*(?:day|days)\s+cycle\b/i)) ??
    numberFromMatch(text.match(/\bcycle\s+(?:is\s+)?(\d{2})\s*(?:days?)\b/i));
  if (cycleLength !== undefined) draft.her!.avg_cycle_length = cycleLength;

  if (/\birregular\s+cycles?\b|\bcycles?\s+are\s+irregular\b/i.test(text)) {
    draft.her!.cycle_regular = false;
  } else if (/\bregular\s+cycles?\b|\bcycles?\s+are\s+regular\b/i.test(text)) {
    draft.her!.cycle_regular = true;
  }

  if (/\bsemen analysis\b.*\b(done|complete|completed|finished)\b/i.test(text)) {
    draft.his!.semen_analysis_status = "completed";
  } else if (/\bsemen analysis\b.*\b(scheduled|started|pending|waiting)\b/i.test(text)) {
    draft.his!.semen_analysis_status = "in_progress";
  } else if (/\b(no|not|haven't|have not)\b.*\bsemen analysis\b/i.test(text)) {
    draft.his!.semen_analysis_status = "not_started";
  }

  if (/\bivf\b/i.test(text)) {
    draft.together!.goal = "Explore IVF options";
  } else if (/\biui\b/i.test(text)) {
    draft.together!.goal = "Explore IUI options";
  } else if (/\bfertility testing\b|\bdiagnostic testing\b|\bworkup\b/i.test(text)) {
    draft.together!.goal = "Complete fertility testing";
  }

  if (/\binsurance\b|\bcoverage\b|\bcost\b|\bout of pocket\b/i.test(text)) {
    draft.together!.top_concern = "Insurance and cost clarity";
  } else if (/\btiming\b|\bschedule\b|\bcalendar\b/i.test(text)) {
    draft.together!.top_concern = "Timing and scheduling";
  }

  const insurance = text.match(/\binsurance\s+(?:is|with|through)\s+([A-Za-z][A-Za-z\s&.-]{2,40})/i);
  if (insurance?.[1]) {
    draft.together!.insurance_provider = insurance[1].trim().replace(/[.!,]$/, "");
  }

  if (Object.keys(draft.her ?? {}).length === 0) delete draft.her;
  if (Object.keys(draft.his ?? {}).length === 0) delete draft.his;
  if (Object.keys(draft.together ?? {}).length === 0) delete draft.together;

  if (!normalized.trim()) return {};
  return compactDraft(draft);
}

export function summarizeVoiceIntakeDraft(draft: VoiceIntakeDraft): string[] {
  const summary: string[] = [];

  if (draft.her?.age !== undefined) summary.push(`Age: ${draft.her.age}`);
  if (draft.her?.months_trying !== undefined) {
    summary.push(`Trying for: ${draft.her.months_trying} months`);
  }
  if (draft.her?.cycle_regular !== undefined) {
    summary.push(`Cycles: ${draft.her.cycle_regular ? "regular" : "irregular"}`);
  }
  if (draft.her?.avg_cycle_length !== undefined) {
    summary.push(`Average cycle: ${draft.her.avg_cycle_length} days`);
  }
  if (draft.his?.semen_analysis_status) {
    summary.push(`Semen analysis: ${draft.his.semen_analysis_status.replace("_", " ")}`);
  }
  if (draft.together?.goal) summary.push(`Goal: ${draft.together.goal}`);
  if (draft.together?.top_concern) summary.push(`Concern: ${draft.together.top_concern}`);
  if (draft.together?.insurance_provider) {
    summary.push(`Insurance: ${draft.together.insurance_provider}`);
  }

  return summary;
}

export function buildVoiceIntakeReply(draft: VoiceIntakeDraft): string {
  const captured = summarizeVoiceIntakeDraft(draft);

  if (captured.length === 0) {
    return "I heard you. Tell me your age, how many months you have been trying, and whether cycles are regular.";
  }
  if (draft.her?.age === undefined) {
    return "Got it. How old is the partner whose cycle we are tracking?";
  }
  if (draft.her?.months_trying === undefined) {
    return "Got it. How many months have you been trying?";
  }
  if (draft.her?.cycle_regular === undefined) {
    return "Got it. Are cycles regular or irregular?";
  }

  return `Got it. I captured ${captured.slice(0, 3).join(", ")}. You can review this before continuing.`;
}
