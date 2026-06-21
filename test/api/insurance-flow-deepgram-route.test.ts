import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transcript = [{ speaker: "agent" as const, text: "Hi from Deepgram." }];
  const flowResult = {
    workflowName: "mariposa-insurance-flow",
    orchestrationMode: "local",
    coupleId: "couple_001",
    providers: {
      voice: "deepgram-transcript",
      model: "mock",
      web: "portal-snapshot",
    },
    transcript,
  };

  return {
    transcript,
    transcribeAudioWithDeepgram: vi.fn(async () => ({
      raw: { utterances: [{ speaker: 0, transcript: "Hi from Deepgram." }] },
      transcript,
    })),
    runInsuranceFlow: vi.fn(async () => flowResult),
  };
});

vi.mock("@/lib/agent/deepgram-voice", () => ({
  transcribeAudioWithDeepgram: mocks.transcribeAudioWithDeepgram,
}));

vi.mock("@/lib/orkes/insurance-flow", () => ({
  runInsuranceFlow: mocks.runInsuranceFlow,
}));

import { POST } from "@/app/api/demo/insurance-flow/deepgram/route";

describe("POST /api/demo/insurance-flow/deepgram", () => {
  it("transcribes uploaded audio and runs the insurance flow with the payload", async () => {
    const formData = new FormData();
    const file = new File(["audio"], "call.wav", { type: "audio/wav" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    formData.set("audio", file);

    const response = await POST({ formData: async () => formData } as Request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.transcribeAudioWithDeepgram).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "audio/wav",
      }),
    );
    expect(mocks.runInsuranceFlow).toHaveBeenCalledWith({
      transcriptPayload: {
        utterances: [{ speaker: 0, transcript: "Hi from Deepgram." }],
      },
      orchestration: "local",
    });
    expect(json.result.providers.voice).toBe("deepgram-transcript");
    expect(json.deepgram.transcriptTurns).toBe(1);
  });

  it("rejects non-audio uploads", async () => {
    const formData = new FormData();
    formData.set("audio", new File(["nope"], "notes.txt", { type: "text/plain" }));

    const response = await POST({ formData: async () => formData } as Request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("Upload an audio file");
  });
});
