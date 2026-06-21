export class LiveVoiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveVoiceUnavailableError";
  }
}
