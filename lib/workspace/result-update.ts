import { z } from "zod";

import {
  getTasks,
  saveTasks,
  updateHerProfile,
  updateHimProfile,
} from "@/lib/db";
import { writeAgentMemoryEvent } from "@/lib/rag/agent-memory";
import type { HimProfile, Task } from "@/lib/types";

export const RESULT_UPDATE_CATEGORIES = [
  "her_labs",
  "semen_analysis",
  "insurance",
  "clinic",
] as const;

export type ResultUpdateCategory = (typeof RESULT_UPDATE_CATEGORIES)[number];

export const resultUpdateSchema = z.object({
  coupleId: z.string().min(1).default("couple_001"),
  category: z.enum(RESULT_UPDATE_CATEGORIES),
  note: z.string().min(3).max(3000),
});

export interface ResultUpdateApplyResult {
  coupleId: string;
  category: ResultUpdateCategory;
  extracted: Record<string, number | string | boolean>;
  task: Task;
  memory: {
    written: boolean;
    eventId: string | null;
    redisKey: string | null;
  };
}

const HER_LAB_PATTERNS: Array<[string, RegExp]> = [
  ["amh", /\bamh\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i],
  ["tsh", /\btsh\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i],
  ["day3_fsh", /\b(?:day\s*3\s*)?fsh\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i],
  [
    "day3_estradiol",
    /\b(?:day\s*3\s*)?(?:estradiol|e2)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i,
  ],
  [
    "mid_luteal_progesterone",
    /\b(?:mid[-\s]*luteal\s*)?progesterone\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i,
  ],
  ["prolactin", /\bprolactin\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i],
];

const SEMEN_PATTERNS: Array<[keyof HimProfile, RegExp]> = [
  ["volume_ml", /\bvolume\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:ml)?/i],
  [
    "concentration_million_ml",
    /\bconcentration\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:million)?/i,
  ],
  [
    "total_count_million",
    /\btotal\s+count\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:million)?/i,
  ],
  [
    "progressive_motility_pct",
    /\bprogressive\s+motility\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*%?/i,
  ],
  [
    "total_motility_pct",
    /\btotal\s+motility\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*%?/i,
  ],
  ["morphology_normal_pct", /\bmorphology\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*%?/i],
  ["vitality_pct", /\bvitality\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*%?/i],
  ["ph", /\bpH\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/],
];

function numberFrom(pattern: RegExp, text: string): number | undefined {
  const value = text.match(pattern)?.[1];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractHerLabs(note: string): Record<string, number> {
  const extracted: Record<string, number> = {};
  for (const [key, pattern] of HER_LAB_PATTERNS) {
    const value = numberFrom(pattern, note);
    if (value !== undefined) extracted[key] = value;
  }
  return extracted;
}

function extractSemenAnalysis(note: string): Partial<HimProfile> {
  const extracted: Partial<HimProfile> = {
    semen_analysis_status: "completed",
  };

  const date = note.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (date) extracted.semen_analysis_date = date;

  for (const [key, pattern] of SEMEN_PATTERNS) {
    const value = numberFrom(pattern, note);
    if (value !== undefined) {
      (extracted as Record<string, unknown>)[key] = value;
    }
  }

  return extracted;
}

function extractInsuranceUpdate(note: string): Record<string, string | boolean> {
  const normalized = note.toLowerCase();
  return {
    prior_auth_approved: /\bprior auth(?:orization)?\b.*\bapproved\b/i.test(note),
    prior_auth_denied: /\bprior auth(?:orization)?\b.*\bdenied\b/i.test(note),
    formulary_mentioned: /\bformulary|pharmacy benefit|medication\b/i.test(note),
    note: normalized.slice(0, 500),
  };
}

function taskForCategory(
  coupleId: string,
  category: ResultUpdateCategory,
  extracted: Record<string, unknown>,
): Task {
  const id = `task_${coupleId}_result_update_${category}`;
  const titles: Record<ResultUpdateCategory, string> = {
    her_labs: "Review updated lab result with clinic",
    semen_analysis: "Review updated semen analysis with clinician",
    insurance: "Review updated insurance decision",
    clinic: "Review new clinic instruction",
  };

  return {
    id,
    couple_id: coupleId,
    column: category === "semen_analysis" ? "him" : category === "her_labs" ? "her" : "together",
    title: titles[category],
    completed: false,
    weight: Object.keys(extracted).length > 0 ? 3 : 1,
    source_call_record_id: null,
  };
}

async function upsertResultTask(coupleId: string, task: Task): Promise<Task> {
  const existing = await getTasks(coupleId);
  const next = [
    ...existing.filter((item) => item.id !== task.id),
    task,
  ];
  await saveTasks(coupleId, next);
  return task;
}

export async function applyResultUpdate(
  input: z.input<typeof resultUpdateSchema>,
): Promise<ResultUpdateApplyResult> {
  const parsed = resultUpdateSchema.parse(input);
  let extracted: Record<string, number | string | boolean> = {};

  if (parsed.category === "her_labs") {
    extracted = extractHerLabs(parsed.note);
    if (Object.keys(extracted).length > 0) {
      await updateHerProfile(parsed.coupleId, extracted);
    }
  } else if (parsed.category === "semen_analysis") {
    const semen = extractSemenAnalysis(parsed.note);
    extracted = semen as Record<string, number | string | boolean>;
    await updateHimProfile(parsed.coupleId, semen);
  } else if (parsed.category === "insurance") {
    extracted = extractInsuranceUpdate(parsed.note);
  } else {
    extracted = { note: parsed.note.slice(0, 500) };
  }

  const task = await upsertResultTask(
    parsed.coupleId,
    taskForCategory(parsed.coupleId, parsed.category, extracted),
  );
  const memory = await writeAgentMemoryEvent({
    coupleId: parsed.coupleId,
    flow: "mariposa-result-update",
    step: parsed.category,
    summary: `User added ${parsed.category.replace("_", " ")} result context.`,
    metadata: {
      extracted,
      note: parsed.note,
    },
  });

  return {
    coupleId: parsed.coupleId,
    category: parsed.category,
    extracted,
    task,
    memory,
  };
}
