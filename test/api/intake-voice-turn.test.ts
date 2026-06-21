import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transcribeAudioWithDeepgram: vi.fn(async () => ({
    raw: { transcript: "User: I'm 33 and we have been trying for 8 months." },
    transcript: [
      {
        speaker: "responder" as const,
        text: "I'm 33 and we have been trying for 8 months.",
      },
    ],
  })),
  speakTextWithDeepgram: vi.fn(async () => ({
    audio: new Uint8Array([1, 2, 3]).buffer,
    contentType: "audio/mpeg",
  })),
}));

vi.mock("@/lib/agent/deepgram-voice", () => ({
  transcribeAudioWithDeepgram: mocks.transcribeAudioWithDeepgram,
  speakTextWithDeepgram: mocks.speakTextWithDeepgram,
}));

import { POST } from "@/app/api/intake/voice-turn/route";

describe("POST /api/intake/voice-turn", () => {
  it("transcribes speech, extracts draft fields, and returns spoken reply audio", async () => {
    const formData = new FormData();
    const file = new File(["audio"], "turn.webm", { type: "audio/webm" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    formData.set("audio", file);

    const response = await POST({ formData: async () => formData } as Request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.transcribeAudioWithDeepgram).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "audio/webm",
      }),
    );
    expect(mocks.speakTextWithDeepgram).toHaveBeenCalledWith({
      text: expect.stringContaining("cycles regular or irregular"),
    });
    expect(json.transcript).toContain("trying for 8 months");
    expect(json.extracted.her).toMatchObject({
      age: 33,
      months_trying: 8,
    });
    expect(json.audio).toEqual({
      mimeType: "audio/mpeg",
      base64: "AQID",
    });
  });

  it("rejects non-audio turns", async () => {
    const formData = new FormData();
    formData.set("audio", new File(["nope"], "turn.txt", { type: "text/plain" }));

    const response = await POST({ formData: async () => formData } as Request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("must be audio");
  });
});
