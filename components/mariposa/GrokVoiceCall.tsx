"use client";

// ===========================================================================
// Live Grok Voice call console (components/mariposa/GrokVoiceCall.tsx)
//
// A REAL, in-browser Grok Voice phone call. You (the presenter) speak into the
// mic as the insurance rep / clinic scheduler; Grok Voice talks back live as
// the Mariposa agent — no scripted responder, 100% xAI Grok Voice.
//
// Protocol (xAI Voice Agent API, OpenAI-Realtime compatible):
//   • GET /api/voice/token mints a short-lived ephemeral token (API key stays
//     on the server).
//   • Browser opens wss://api.x.ai/v1/realtime?model=... authenticating via the
//     `xai-client-secret.<token>` WebSocket subprotocol.
//   • session.update sets the Mariposa system prompt, voice, server_vad turn
//     detection, and PCM16 @ 24kHz audio in/out.
//   • Mic audio is streamed as base64 PCM16 via input_audio_buffer.append.
//   • Grok audio arrives as response.output_audio.delta (base64 PCM16) and is
//     played back; transcripts arrive as events and render live.
//
// No telephony, no Twilio, no PHI — pure browser audio + Grok Voice.
// ===========================================================================

import { useCallback, useRef, useState } from "react";

type CallType = "insurance" | "clinic";
type Speaker = "agent" | "responder";
type Status = "idle" | "connecting" | "live" | "ended" | "error";

interface TranscriptTurn {
  speaker: Speaker;
  text: string;
}

const SAMPLE_RATE = 24000;

// --- base64 <-> PCM helpers -------------------------------------------------

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function float32ToBase64PCM16(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function GrokVoiceCall() {
  const [callType, setCallType] = useState<CallType>("insurance");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playheadRef = useRef<number>(0);
  // Tracks the in-progress human transcript bubble so cumulative updates
  // replace it rather than appending new bubbles.
  const liveHumanRef = useRef<boolean>(false);

  const appendAgent = useCallback((text: string) => {
    if (!text.trim()) return;
    liveHumanRef.current = false;
    setTurns((prev) => [...prev, { speaker: "agent", text: text.trim() }]);
  }, []);

  const upsertHuman = useCallback((text: string) => {
    if (!text.trim()) return;
    setTurns((prev) => {
      const next = [...prev];
      if (liveHumanRef.current && next.length > 0 && next[next.length - 1].speaker === "responder") {
        next[next.length - 1] = { speaker: "responder", text: text.trim() };
      } else {
        next.push({ speaker: "responder", text: text.trim() });
      }
      return next;
    });
    liveHumanRef.current = true;
  }, []);

  const playAudioDelta = useCallback((b64: string) => {
    const outCtx = outCtxRef.current;
    if (!outCtx) return;
    const pcm = base64ToInt16(b64);
    if (pcm.length === 0) return;
    const buffer = outCtx.createBuffer(1, pcm.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const src = outCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(outCtx.destination);
    const now = outCtx.currentTime;
    const startAt = Math.max(now, playheadRef.current);
    src.start(startAt);
    playheadRef.current = startAt + buffer.duration;
  }, []);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    inCtxRef.current?.close().catch(() => {});
    inCtxRef.current = null;
    outCtxRef.current?.close().catch(() => {});
    outCtxRef.current = null;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      wsRef.current.close();
    }
    wsRef.current = null;
    playheadRef.current = 0;
  }, []);

  const endCall = useCallback(() => {
    cleanup();
    setStatus((s) => (s === "error" ? s : "ended"));
  }, [cleanup]);

  const startCall = useCallback(async () => {
    setError(null);
    setTurns([]);
    setStatus("connecting");
    try {
      // 1. Mint an ephemeral token (server keeps the API key).
      const tokenRes = await fetch("/api/voice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callType }),
      });
      if (!tokenRes.ok) {
        const body = (await tokenRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Token request failed (${tokenRes.status})`);
      }
      const { token, systemPrompt, model, wsUrl } = (await tokenRes.json()) as {
        token: string;
        systemPrompt?: string;
        model: string;
        wsUrl: string;
      };

      // 2. Start mic capture immediately (parallel with WS connect).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const inCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      inCtxRef.current = inCtx;
      const outCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      outCtxRef.current = outCtx;
      const source = inCtx.createMediaStreamSource(stream);
      const processor = inCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(inCtx.destination);

      // 3. Open the Grok Voice WebSocket (ephemeral token via subprotocol).
      const url = `${wsUrl}?model=${encodeURIComponent(model)}`;
      const ws = new WebSocket(url, [`xai-client-secret.${token}`]);
      wsRef.current = ws;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: float32ToBase64PCM16(new Float32Array(input)),
          }),
        );
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              voice: "eve",
              instructions:
                systemPrompt ??
                "You are Mariposa, an authorized assistant verifying fertility benefits on behalf of a couple. Ask your questions one at a time and confirm answers.",
              turn_detection: { type: "server_vad" },
              audio: {
                input: { format: { type: "audio/pcm", rate: SAMPLE_RATE }, transcription: { model: "grok-transcribe" } },
                output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
              },
            },
          }),
        );
        // Let Grok open the call (it speaks first, as the Mariposa agent).
        ws.send(JSON.stringify({ type: "response.create" }));
        setStatus("live");
      };

      ws.onmessage = (ev) => {
        let event: { type?: string; transcript?: string; delta?: string };
        try {
          event = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        switch (event.type) {
          case "response.output_audio.delta":
            if (typeof event.delta === "string") playAudioDelta(event.delta);
            break;
          case "response.output_audio_transcript.done":
            if (typeof event.transcript === "string") appendAgent(event.transcript);
            break;
          case "conversation.item.input_audio_transcription.updated":
            if (typeof event.transcript === "string") upsertHuman(event.transcript);
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        setError("Live Grok Voice connection error. Check XAI_API_KEY / voice access.");
        setStatus("error");
        cleanup();
      };
      ws.onclose = () => {
        setStatus((s) => (s === "error" ? s : "ended"));
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the live call.");
      setStatus("error");
      cleanup();
    }
  }, [callType, appendAgent, upsertHuman, playAudioDelta, cleanup]);

  const live = status === "live";
  const connecting = status === "connecting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 390, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Live Grok Voice call</h1>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            color: live ? "#0a7d33" : "#666",
            background: live ? "#d7f5e1" : "#eee",
          }}
        >
          {live ? "● LIVE" : status.toUpperCase()}
        </span>
      </header>

      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ fontSize: 13 }}>
          Call:&nbsp;
          <select
            value={callType}
            onChange={(e) => setCallType(e.target.value as CallType)}
            disabled={live || connecting}
          >
            <option value="insurance">Insurance verification</option>
            <option value="clinic">Clinic booking</option>
          </select>
        </label>
      </div>

      <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
        Speak as the {callType === "insurance" ? "insurance rep" : "clinic scheduler"}. Mariposa
        (Grok Voice) will lead the call and ask its questions out loud.
      </p>

      {!live && !connecting ? (
        <button
          onClick={startCall}
          style={{ padding: "12px 16px", borderRadius: 12, background: "#111", color: "#fff", border: 0, fontWeight: 600 }}
        >
          {status === "ended" || status === "error" ? "Start a new call" : "Start live call"}
        </button>
      ) : (
        <button
          onClick={endCall}
          disabled={connecting}
          style={{ padding: "12px 16px", borderRadius: 12, background: "#b00020", color: "#fff", border: 0, fontWeight: 600 }}
        >
          {connecting ? "Connecting…" : "End call"}
        </button>
      )}

      {error ? <p style={{ color: "#b00020", fontSize: 13 }}>{error}</p> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {turns.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>Transcript will appear here as you talk…</p>
        ) : (
          turns.map((t, i) => (
            <div
              key={i}
              style={{
                alignSelf: t.speaker === "agent" ? "flex-start" : "flex-end",
                maxWidth: "85%",
                background: t.speaker === "agent" ? "#eef2ff" : "#f1f1f1",
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 14,
              }}
            >
              <strong style={{ fontSize: 11, color: "#777", display: "block" }}>
                {t.speaker === "agent" ? "Mariposa (Grok)" : "You (rep)"}
              </strong>
              {t.text}
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
        Mariposa provides educational fertility information, not medical advice.
      </p>
    </div>
  );
}

export default GrokVoiceCall;
