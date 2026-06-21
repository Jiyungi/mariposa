"use client";

import { Mic, Square, Volume2 } from "lucide-react";
import * as React from "react";

import { Card, CardHeader } from "@/components/mariposa/Card";
import { Button } from "@/components/ui/button";
import type { VoiceIntakeDraft } from "@/lib/intake/voice";
import { cn } from "@/lib/utils";

type VoiceStatus = "idle" | "recording" | "processing";

interface VoiceTurnResponse {
  transcript: string;
  extracted: VoiceIntakeDraft;
  extractedSummary: string[];
  replyText: string;
  audio: {
    mimeType: string;
    base64: string;
  } | null;
  deepgram: {
    sttModel: string;
    ttsModel: string;
    transcriptTurns: number;
  };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function VoiceIntakePanel({
  onDraft,
}: {
  onDraft?: (draft: VoiceIntakeDraft) => void;
}) {
  const [status, setStatus] = React.useState<VoiceStatus>("idle");
  const [isSupported, setIsSupported] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<VoiceTurnResponse | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const audioUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setIsSupported(
      typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined",
    );

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const playReply = React.useCallback((voiceResult: VoiceTurnResponse) => {
    if (!voiceResult.audio) return;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);

    const blob = base64ToBlob(voiceResult.audio.base64, voiceResult.audio.mimeType);
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    void new Audio(url).play().catch(() => {
      setError("I captured the response, but the browser blocked audio playback.");
    });
  }, []);

  const submitTurn = React.useCallback(
    async (blob: Blob) => {
      setStatus("processing");
      setError(null);

      const formData = new FormData();
      formData.set("audio", blob, "voice-intake.webm");

      const response = await fetch("/api/intake/voice-turn", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Voice turn failed.");
      }

      const voiceResult = json as VoiceTurnResponse;
      setResult(voiceResult);
      onDraft?.(voiceResult.extracted);
      playReply(voiceResult);
      setStatus("idle");
    },
    [onDraft, playReply],
  );

  const stopTracks = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = React.useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stopTracks();
        void submitTurn(blob).catch((submitError: unknown) => {
          setError(
            submitError instanceof Error
              ? submitError.message
              : "Voice turn failed.",
          );
          setStatus("idle");
        });
      };

      recorder.start();
      setStatus("recording");
    } catch (startError) {
      stopTracks();
      setStatus("idle");
      setError(
        startError instanceof Error
          ? startError.message
          : "Microphone access was not available.",
      );
    }
  }, [stopTracks, submitTurn]);

  const stopRecording = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const action =
    status === "recording" ? (
      <Button type="button" variant="outline" onClick={stopRecording}>
        <Square aria-hidden="true" />
        Stop and listen
      </Button>
    ) : (
      <Button
        type="button"
        onClick={startRecording}
        disabled={!isSupported || status === "processing"}
      >
        <Mic aria-hidden="true" />
        {status === "processing" ? "Listening back..." : "Start speaking"}
      </Button>
    );

  return (
    <Card className="mb-4">
      <CardHeader
        title="Voice intake"
        description="Speak naturally. Mariposa will capture draft details for review."
        action={action}
      />

      <div className="mt-4 space-y-3">
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            status === "recording"
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border/70 bg-muted/40 text-muted-foreground",
          )}
        >
          {status === "recording"
            ? "Recording. Share one thought, then stop."
            : status === "processing"
              ? "Processing your voice turn..."
              : "Try: I am 33, we have been trying for 8 months, and my cycles are irregular."}
        </div>

        {!isSupported ? (
          <p className="text-sm text-destructive">
            This browser does not support direct microphone recording.
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {result ? (
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-foreground">Heard</p>
              <p className="mt-1 rounded-lg bg-muted/40 p-3 text-muted-foreground">
                {result.transcript}
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground">Draft fields</p>
              {result.extractedSummary.length > 0 ? (
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {result.extractedSummary.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  No structured fields yet. Try one more voice turn.
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3">
              <Volume2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="text-muted-foreground">{result.replyText}</p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
