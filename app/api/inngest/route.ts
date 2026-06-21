// ===========================================================================
// Inngest serve endpoint (app/api/inngest/route.ts) — Req 7, 15.3
//
// Serves the Mariposa seven-step workflow function(s) to the Inngest runtime. When
// the Inngest dev server is running locally it discovers this endpoint and
// triggers `mariposaIntakeWorkflow` on the `fertility.intake.completed` event,
// making the workflow run "for real" with durable, per-step status tracking.
//
// inngest 3.x exposes the Next.js App Router adapter at `inngest/next`, which
// returns the GET / POST / PUT handlers this route re-exports.
//
// NOTE: a running Inngest dev server is OPTIONAL for the demo. The intake route
// also exposes a direct, awaitable inline path (runWorkflowNow / ?mode=inline)
// so the full chain executes without any Inngest server. See app/api/intake.
// ===========================================================================

import { serve } from "inngest/next";

import { functions, inngest } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
