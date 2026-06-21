import { mockInsuranceCall } from "@/lib/agent/mock-fallback";
import {
  resolveDeepgramApiKey,
  resolveDeepgramModel,
  resolveDeepgramTtsModel,
} from "@/lib/config";
import type { AuthPacket, Turn } from "@/lib/types";

export class DeepgramVoiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepgramVoiceUnavailableError";
  }
}

type Speaker = Turn["speaker"];

interface DeepgramWord {
  punctuated_word?: unknown;
  word?: unknown;
  speaker?: unknown;
}

interface DeepgramUtterance {
  transcript?: unknown;
  speaker?: unknown;
}

export interface DeepgramAudioTranscription {
  raw: unknown;
  transcript: Turn[];
}

export interface TranscribeAudioWithDeepgramInput {
  audio: BodyInit;
  contentType?: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

export interface DeepgramSpeechSynthesis {
  audio: ArrayBuffer;
  contentType: string;
}

export interface SpeakTextWithDeepgramInput {
  text: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

function speakerFromLabel(label: string): Speaker | null {
  const normalized = label.trim().toLowerCase();
  if (["agent", "assistant", "ai"].includes(normalized)) return "agent";
  if (["responder", "user", "human", "caller", "rep"].includes(normalized)) {
    return "responder";
  }
  return null;
}

function parsePrefixedTranscript(raw: string): Turn[] {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(agent|assistant|responder|user|caller|rep)\s*:\s*(.+)$/i);
      if (match) {
        return {
          speaker: speakerFromLabel(match[1]) ?? "responder",
          text: match[2].trim(),
        };
      }

      return {
        speaker: index === 0 ? "agent" : "responder",
        text: line,
      } satisfies Turn;
    });
}

function roleForDiarizedSpeaker(
  diarizedSpeaker: string,
  speakerRoles: Map<string, Speaker>,
): Speaker {
  const existing = speakerRoles.get(diarizedSpeaker);
  if (existing) return existing;

  const nextRole = speakerRoles.size === 0 ? "agent" : "responder";
  speakerRoles.set(diarizedSpeaker, nextRole);
  return nextRole;
}

function parseUtterances(utterances: DeepgramUtterance[]): Turn[] {
  const speakerRoles = new Map<string, Speaker>();

  return utterances
    .map((utterance, index): Turn | null => {
      if (typeof utterance.transcript !== "string") return null;
      const text = utterance.transcript.trim();
      if (!text) return null;

      let speaker: Speaker = index === 0 ? "agent" : "responder";
      if (typeof utterance.speaker === "string" && utterance.speaker.trim()) {
        speaker =
          speakerFromLabel(utterance.speaker) ??
          roleForDiarizedSpeaker(utterance.speaker, speakerRoles);
      } else if (typeof utterance.speaker === "number") {
        speaker = roleForDiarizedSpeaker(String(utterance.speaker), speakerRoles);
      }

      return { speaker, text };
    })
    .filter((turn): turn is Turn => turn !== null);
}

function parseWords(words: DeepgramWord[]): Turn[] {
  const speakerRoles = new Map<string, Speaker>();
  const turns: Turn[] = [];

  for (const word of words) {
    const token =
      (typeof word.punctuated_word === "string" && word.punctuated_word) ||
      (typeof word.word === "string" && word.word) ||
      "";
    if (!token.trim()) continue;

    const diarizedSpeaker =
      typeof word.speaker === "number" || typeof word.speaker === "string"
        ? String(word.speaker)
        : "0";
    const speaker = roleForDiarizedSpeaker(diarizedSpeaker, speakerRoles);
    const current = turns[turns.length - 1];

    if (current?.speaker === speaker) {
      current.text = `${current.text} ${token}`.trim();
    } else {
      turns.push({ speaker, text: token.trim() });
    }
  }

  return turns;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Map common Deepgram transcript payloads to Mariposa's Turn[] contract.
 * Supports prefixed text, `utterances`, and diarized `words` from prerecorded
 * STT responses. When diarized speakers are numeric, the first speaker is
 * treated as the agent and the next distinct speaker as the responder.
 */
export function parseDeepgramTranscript(raw: unknown): Turn[] {
  if (!raw) return [];

  if (typeof raw === "string") return parsePrefixedTranscript(raw);

  if (Array.isArray(raw)) {
    if (raw.every((entry) => asRecord(entry)?.transcript !== undefined)) {
      return parseUtterances(raw as DeepgramUtterance[]);
    }
    return [];
  }

  const record = asRecord(raw);
  if (!record) return [];

  if (typeof record.transcript === "string") {
    return parsePrefixedTranscript(record.transcript);
  }

  if (Array.isArray(record.utterances)) {
    const turns = parseUtterances(record.utterances as DeepgramUtterance[]);
    if (turns.length > 0) return turns;
  }

  const results = asRecord(record.results);
  const channels = Array.isArray(results?.channels) ? results.channels : [];
  const firstChannel = asRecord(channels[0]);
  const alternatives = Array.isArray(firstChannel?.alternatives)
    ? firstChannel.alternatives
    : [];
  const firstAlternative = asRecord(alternatives[0]);

  if (Array.isArray(firstAlternative?.words)) {
    const turns = parseWords(firstAlternative.words as DeepgramWord[]);
    if (turns.length > 0) return turns;
  }

  if (typeof firstAlternative?.transcript === "string") {
    return parsePrefixedTranscript(firstAlternative.transcript);
  }

  return [];
}

export async function transcribeAudioWithDeepgram({
  audio,
  contentType = "application/octet-stream",
  fetchImpl = fetch,
  env = process.env,
}: TranscribeAudioWithDeepgramInput): Promise<DeepgramAudioTranscription> {
  const apiKey = resolveDeepgramApiKey(env);
  if (!apiKey) {
    throw new DeepgramVoiceUnavailableError("DEEPGRAM_API_KEY is not configured.");
  }

  const params = new URLSearchParams({
    model: resolveDeepgramModel(env),
    diarize: "true",
    punctuate: "true",
    smart_format: "true",
    utterances: "true",
  });

  const response = await fetchImpl(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": contentType,
    },
    body: audio,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new DeepgramVoiceUnavailableError(
      `Deepgram transcription failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }

  const raw = await response.json();
  const transcript = parseDeepgramTranscript(raw);
  if (transcript.length === 0) {
    throw new DeepgramVoiceUnavailableError(
      "Deepgram transcription returned no parseable transcript turns.",
    );
  }

  return { raw, transcript };
}

export async function speakTextWithDeepgram({
  text,
  fetchImpl = fetch,
  env = process.env,
}: SpeakTextWithDeepgramInput): Promise<DeepgramSpeechSynthesis> {
  const apiKey = resolveDeepgramApiKey(env);
  if (!apiKey) {
    throw new DeepgramVoiceUnavailableError("DEEPGRAM_API_KEY is not configured.");
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new DeepgramVoiceUnavailableError("Deepgram speech text is empty.");
  }

  const params = new URLSearchParams({
    model: resolveDeepgramTtsModel(env),
  });

  const response = await fetchImpl(`https://api.deepgram.com/v1/speak?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: trimmed }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new DeepgramVoiceUnavailableError(
      `Deepgram speech failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }

  return {
    audio: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

/**
 * MVP insurance-session seam for Deepgram. Today this is transcript-first:
 * callers may provide a Deepgram-shaped transcript payload, and absent that we
 * return the deterministic insurance transcript. Real STT/TTS can later replace
 * the fallback without changing the Turn[] contract.
 */
export async function runDeepgramInsuranceSession(
  packet: AuthPacket,
  transcriptPayload?: unknown,
): Promise<Turn[]> {
  const parsed = parseDeepgramTranscript(transcriptPayload);
  if (parsed.length > 0) return parsed;

  return mockInsuranceCall(packet).transcript;
}
