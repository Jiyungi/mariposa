import { NextResponse } from "next/server";

import { transcribeAudioWithDeepgram } from "@/lib/agent/deepgram-voice";
import { resolveDeepgramModel } from "@/lib/config";
import { runInsuranceFlow } from "@/lib/orkes/insurance-flow";
import { captureWorkflowError } from "@/lib/observability/sentry";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(mp3|m4a|wav|webm|ogg)$/i.test(file.name);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("audio");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload an audio file in the `audio` form field." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded audio file is empty." },
        { status: 400 },
      );
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Uploaded audio file must be 20 MB or smaller." },
        { status: 413 },
      );
    }

    if (!isAudioFile(file)) {
      return NextResponse.json(
        { error: "Upload an audio file (.mp3, .m4a, .wav, .webm, or .ogg)." },
        { status: 400 },
      );
    }

    const transcription = await transcribeAudioWithDeepgram({
      audio: await file.arrayBuffer(),
      contentType: file.type || "application/octet-stream",
    });

    const result = await runInsuranceFlow({
      transcriptPayload: transcription.raw,
      orchestration: "local",
    });

    return NextResponse.json(
      {
        result,
        deepgram: {
          model: resolveDeepgramModel(),
          fileName: file.name,
          fileSize: file.size,
          transcriptTurns: transcription.transcript.length,
          transcript: transcription.transcript,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const captured = captureWorkflowError(error, {
      flow: "mariposa-insurance-flow",
      step: "deepgram-upload-route",
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
