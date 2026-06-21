import { describe, expect, it, vi } from "vitest";

import {
  parseDeepgramTranscript,
  runDeepgramInsuranceSession,
  transcribeAudioWithDeepgram,
} from "@/lib/agent/deepgram-voice";
import { mockInsuranceCall } from "@/lib/agent/mock-fallback";
import { extractInsuranceResult } from "@/lib/core/extract";
import { SEED_AUTH_PACKET } from "@/lib/reference";

describe("Deepgram transcript parsing", () => {
  it("parses prefixed transcript text into Turn[]", () => {
    expect(
      parseDeepgramTranscript("Agent: Can I verify benefits?\nResponder: Yes."),
    ).toEqual([
      { speaker: "agent", text: "Can I verify benefits?" },
      { speaker: "responder", text: "Yes." },
    ]);
  });

  it("parses Deepgram utterances with speaker labels", () => {
    expect(
      parseDeepgramTranscript({
        utterances: [
          { speaker: "agent", transcript: "I am calling about fertility coverage." },
          { speaker: "rep", transcript: "Diagnostic evaluation is covered." },
        ],
      }),
    ).toEqual([
      { speaker: "agent", text: "I am calling about fertility coverage." },
      { speaker: "responder", text: "Diagnostic evaluation is covered." },
    ]);
  });

  it("groups diarized Deepgram words by speaker", () => {
    expect(
      parseDeepgramTranscript({
        results: {
          channels: [
            {
              alternatives: [
                {
                  words: [
                    { speaker: 0, punctuated_word: "Hello" },
                    { speaker: 0, punctuated_word: "there." },
                    { speaker: 1, punctuated_word: "Covered" },
                    { speaker: 1, punctuated_word: "with" },
                    { speaker: 1, punctuated_word: "prior auth." },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ).toEqual([
      { speaker: "agent", text: "Hello there." },
      { speaker: "responder", text: "Covered with prior auth." },
    ]);
  });
});

describe("runDeepgramInsuranceSession()", () => {
  it("uses a provided Deepgram-shaped transcript payload when present", async () => {
    await expect(
      runDeepgramInsuranceSession(SEED_AUTH_PACKET, {
        transcript: "Agent: First\nResponder: Second",
      }),
    ).resolves.toEqual([
      { speaker: "agent", text: "First" },
      { speaker: "responder", text: "Second" },
    ]);
  });

  it("falls back to the deterministic insurance transcript", async () => {
    const transcript = await runDeepgramInsuranceSession(SEED_AUTH_PACKET);
    const outcome = extractInsuranceResult(transcript);

    expect(transcript).toEqual(mockInsuranceCall(SEED_AUTH_PACKET).transcript);
    expect(outcome.unresolved).toEqual([]);
  });
});

describe("transcribeAudioWithDeepgram()", () => {
  it("posts audio to Deepgram and parses the response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        utterances: [
          { speaker: 0, transcript: "I am calling about fertility coverage." },
          { speaker: 1, transcript: "Diagnostic evaluation is covered." },
        ],
      }),
    );

    const result = await transcribeAudioWithDeepgram({
      audio: new Uint8Array([1, 2, 3]),
      contentType: "audio/wav",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        DEEPGRAM_API_KEY: "dg_test",
        DEEPGRAM_MODEL: "nova-3",
      } as NodeJS.ProcessEnv,
    });

    expect(result.transcript).toEqual([
      { speaker: "agent", text: "I am calling about fertility coverage." },
      { speaker: "responder", text: "Diagnostic evaluation is covered." },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("https://api.deepgram.com/v1/listen?"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Token dg_test",
          "Content-Type": "audio/wav",
        }),
      }),
    );
    expect(fetchImpl.mock.calls[0][0]).toContain("diarize=true");
    expect(fetchImpl.mock.calls[0][0]).toContain("utterances=true");
  });

  it("requires a Deepgram API key", async () => {
    await expect(
      transcribeAudioWithDeepgram({
        audio: "audio",
        env: {} as NodeJS.ProcessEnv,
      }),
    ).rejects.toThrow("DEEPGRAM_API_KEY");
  });
});
