import { NextResponse } from "next/server";

import {
  speakTextWithDeepgram,
  transcribeAudioWithDeepgram,
} from "@/lib/agent/deepgram-voice";
import { resolveDeepgramModel, resolveDeepgramTtsModel } from "@/lib/config";
import {
  buildVoiceIntakeReply,
  extractVoiceIntakeDraft,
  summarizeVoiceIntakeDraft,
} from "@/lib/intake/voice";
import { captureWorkflowError } from "@/lib/observability/sentry";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(mp3|m4a|wav|webm|ogg)$/i.test(file.name);
}

function encodeBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("audio");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Speak first, then send the recorded audio as `audio`." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "The recorded audio was empty. Try speaking again." },
        { status: 400 },
      );
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Keep each voice turn under 20 MB." },
        { status: 413 },
      );
    }

    if (!isAudioFile(file)) {
      return NextResponse.json(
        { error: "The recorded turn must be audio." },
        { status: 400 },
      );
    }

    const transcription = await transcribeAudioWithDeepgram({
      audio: await file.arrayBuffer(),
      contentType: file.type || "application/octet-stream",
    });
    const transcript = transcription.transcript.map((turn) => turn.text).join(" ");
    const extracted = extractVoiceIntakeDraft(transcript);
    const extractedSummary = summarizeVoiceIntakeDraft(extracted);
    const replyText = buildVoiceIntakeReply(extracted);

    let audio:
      | {
          mimeType: string;
          base64: string;
        }
      | null = null;

    try {
      const spokenReply = await speakTextWithDeepgram({ text: replyText });
      audio = {
        mimeType: spokenReply.contentType,
        base64: encodeBase64(spokenReply.audio),
      };
    } catch (error) {
      captureWorkflowError(error, {
        flow: "mariposa-intake-voice",
        step: "deepgram-tts",
      });
    }

    return NextResponse.json(
      {
        transcript,
        turns: transcription.transcript,
        extracted,
        extractedSummary,
        replyText,
        audio,
        deepgram: {
          sttModel: resolveDeepgramModel(),
          ttsModel: resolveDeepgramTtsModel(),
          transcriptTurns: transcription.transcript.length,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const captured = captureWorkflowError(error, {
      flow: "mariposa-intake-voice",
      step: "voice-turn-route",
    });

    return NextResponse.json(
      {
        error: captured.message,
        sentryEventId: captured.eventId,
      },
      { status: 500 },
    );
  }
}
