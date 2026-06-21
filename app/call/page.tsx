// Live Grok Voice call page — speak to the Mariposa agent in real time.
// Reachable at /call. Uses the browser mic + xAI Grok Voice realtime WebSocket
// (ephemeral token from /api/voice/route). No telephony.
import { GrokVoiceCall } from "@/components/mariposa/GrokVoiceCall";

export const metadata = {
  title: "Mariposa — Live Grok Voice call",
};

export default function CallPage() {
  return <GrokVoiceCall />;
}
