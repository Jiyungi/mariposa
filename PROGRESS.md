# Mariposa Progress

Last updated: 2026-06-21

This file records only work that has been implemented and verified in this
repository. It separates completed local/demo behavior from sponsor integrations
that still need real service wiring.

## Done And Verified

### Sponsor Configuration Helpers

- Added central config helpers for:
  - Anthropic: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
  - Deepgram: `DEEPGRAM_API_KEY`, `USE_DEEPGRAM_VOICE`
  - Redis: `REDIS_URL`, `REDIS_VECTOR_INDEX`
  - Browserbase: `BROWSERBASE_API_KEY`, `USE_BROWSERBASE`, `NEXT_PUBLIC_APP_URL`
  - Agentspan: `USE_AGENTSPAN`, `AGENTSPAN_SERVER_URL`, `AGENTSPAN_API_KEY`
  - Orkes (legacy aliases): `USE_ORKES`, `ORKES_API_KEY`, `ORKES_BASE_URL`
  - Arize: `ENABLE_ARIZE`, `ARIZE_API_KEY`
  - Sentry: `SENTRY_DSN`
- `resolveAppBaseUrl()` falls back to `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`
  on Vercel so Browserbase live fetch works without manually setting
  `NEXT_PUBLIC_APP_URL`.
- Added tests for enabled/disabled behavior.

Files changed:

- `lib/config.ts`
- `lib/config.key-resolution.test.ts`

### AI Provider Seam

- Added a small JSON-generation provider interface.
- Added a Claude provider using the Anthropic Messages API through `fetch`.
- Added a deterministic mock provider.
- Added provider selection:
  - Claude when Anthropic is configured and `USE_MOCK_AI` is not forced.
  - Mock when Anthropic is missing or `USE_MOCK_AI=true`.
- Added tests with no live Anthropic network call.

Files added:

- `lib/ai/provider.ts`
- `lib/ai/claude.ts`
- `lib/ai/mock.ts`
- `lib/ai/provider.test.ts`

### Insurance Extraction Through AI Provider

- Added `extractInsuranceWithAi(...)`.
- It builds a transcript/context prompt, calls the selected AI provider, and
  validates the returned JSON with `zod`.
- It currently supports the `InsuranceResult` schema only.
- Added tests for mock extraction, prompt contents, and malformed JSON rejection.

Files added:

- `lib/ai/insurance-extraction.ts`
- `lib/ai/insurance-extraction.test.ts`

### Deepgram Transcript Seam

- Added a Deepgram-compatible transcript parser for:
  - prefixed transcript strings
  - Deepgram-style `utterances`
  - diarized `words`
- Added `runDeepgramInsuranceSession(...)`.
- Current behavior is transcript-first. If no transcript payload is provided, it
  returns the deterministic insurance transcript.
- Exported the seam from the agent public API.

Files added or changed:

- `lib/agent/deepgram-voice.ts`
- `lib/agent/index.ts`
- `test/agent/deepgram-voice.test.ts`

### Voice Intake Turn

- Added a push-to-talk voice panel on `/intake`.
- The panel records directly from the browser microphone using `MediaRecorder`;
  it does not require a visible file upload control.
- Added `POST /api/intake/voice-turn`:
  1. Accepts one recorded audio turn.
  2. Transcribes it with Deepgram STT.
  3. Extracts a conservative draft of intake fields for review.
  4. Builds a short next-question response.
  5. Attempts Deepgram TTS playback for the response.
- The panel shows the transcript, draft fields, and response text. It plays the
  TTS response when the browser allows audio playback.
- The extracted draft now auto-populates the matching validated intake fields for
  review: her age/months/cycle details, his semen-analysis status, shared
  goal/top concern, and insurance provider. Invalid patches are rejected by the
  existing intake schema instead of being committed.

Files added or changed:

- `components/mariposa/VoiceIntakePanel.tsx`
- `components/mariposa/IntakeExperience.tsx`
- `components/mariposa/IntakeForm.tsx`
- `components/mariposa/intake/IntakeSection.tsx`
- `components/mariposa/intake/useIntakeSection.ts`
- `app/intake/page.tsx`
- `app/api/intake/voice-turn/route.ts`
- `lib/intake/voice.ts`
- `lib/intake/voice.test.ts`
- `lib/agent/deepgram-voice.ts`
- `test/api/intake-voice-turn.test.ts`

### Live Voice Routing

- Updated `lib/agent/live.ts` so insurance calls try Deepgram first when
  `USE_DEEPGRAM_VOICE=true` and `DEEPGRAM_API_KEY` is set.
- Existing Grok/AgentPhone paths remain as fallbacks.
- Clinic calls were not migrated to Deepgram.
- Added a routing test proving Deepgram takes precedence for insurance when both
  Deepgram and Grok are configured.

Files added or changed:

- `lib/agent/live.ts`
- `test/agent/live-routing.test.ts`

### Observability Hooks

- Added no-op-safe Arize-style trace helpers:
  - `traceAgentStep(...)`
  - `traceModelCall(...)`
  - `traceRetrieval(...)`
- Added a no-op-safe Sentry error capture helper:
  - `captureWorkflowError(...)`
- Arize helpers still return local trace metadata only.
- Sentry is wired server-side through `@sentry/nextjs` when `SENTRY_DSN` is set.
- Added tests for disabled/enabled behavior and stable local IDs.

Files added or changed:

- `lib/observability/arize.ts`
- `lib/observability/sentry.ts`
- `lib/observability/observability.test.ts`
- `sentry.server.config.ts`
- `instrumentation.ts`
- `package.json`
- `package-lock.json`

### Local Orkes-Shaped Insurance Flow

- Added a local workflow runner named `mariposa-insurance-flow`.
- The flow:
  1. Retrieves insurance context with Redis if available, otherwise local keyword
     fallback.
  2. Verifies the synthetic Pacific Crest member portal via Browserbase Fetch API
     when enabled and the app URL is public; otherwise uses a local portal
     snapshot (`fallback-snapshot`).
  3. Runs the Deepgram transcript seam.
  4. Extracts an `InsuranceResult` through the AI provider seam (portal context
     merged into the extraction prompt).
  5. Writes agent memory when Redis is available.
  6. Persists call record, tasks, and summary coverage by default.
  7. Emits no-op-safe trace hooks.
  8. Returns transcript, insurance result, retrieval mode, provider names,
     web verification, fallback flags, persistence summary, and traces.
- Runs locally without Agentspan credentials; Agentspan is optional when the local
  server is healthy.

Files added:

- `lib/orkes/insurance-flow.ts`
- `lib/orkes/insurance-flow.test.ts`

### Demo API Route

- Added `GET /api/demo/insurance-flow`.
- The route runs the local insurance flow for the seed couple and returns JSON.
- Added a direct API route test.

Files added:

- `app/api/demo/insurance-flow/route.ts`
- `test/api/insurance-flow-route.test.ts`

### CLI Demo Runner

- Added `npm run demo:insurance-flow`.
- The script runs the local insurance flow without starting Next.
- It prints a compact JSON summary with workflow name, orchestration mode,
  Agentspan execution (when used), retrieval mode, provider names, fallback flags,
  transcript turn count, trace IDs, and the extracted insurance result.
- Verified output on 2026-06-21 (with sponsor credentials):
  - `workflowName`: `mariposa-insurance-flow`
  - `orchestrationMode`: `agentspan` when `USE_AGENTSPAN=true` and local server
    is healthy; otherwise `local`
  - `coupleId`: `couple_001`
  - retrieval mode: `vector` (when Redis seeded)
  - voice provider: `deterministic-fallback` (unless `transcriptPayload` passed)
  - model provider: `claude` (when `ANTHROPIC_API_KEY` set and `USE_MOCK_AI=false`)
  - web provider: `browserbase-fetch` on Vercel; `portal-snapshot` locally unless
    public app URL configured
  - transcript turns: `26`

Files added or changed:

- `scripts/run-insurance-flow.ts`
- `package.json`

### Demo Readiness Pass

- Fixed `npm run demo:insurance-flow` so the process exits cleanly after printing
  output by closing the shared Redis client.
- Updated presenter/env status wording so Deepgram is not overstated: the default
  demo uses a deterministic transcript, while Deepgram is available through the
  audio upload route.
- Updated Sentry presenter wording to reflect real server-side capture through
  `@sentry/nextjs`.
- Installed `@langchain/core` so the Agentspan SDK no longer reports a missing
  LangChain module during build.
- Cleaned Calendar hook dependency warnings by memoizing derived reminder arrays.

Files added or changed:

- `scripts/run-insurance-flow.ts`
- `lib/rag/redis-store.ts`
- `lib/config/env-status.ts`
- `components/mariposa/CalendarView.tsx`
- `package.json`
- `package-lock.json`

### Agent Memory Write

- Added `writeAgentMemoryEvent(...)` for Redis-backed agent memory at
  `mariposa:memory:{coupleId}`.
- The helper is no-op-safe when Redis is unavailable.
- The insurance flow writes a post-extraction memory event with retrieval and
  provider metadata.
- Added tests for key naming and no-Redis behavior.

Files added or changed:

- `lib/rag/agent-memory.ts`
- `lib/rag/agent-memory.test.ts`
- `lib/orkes/insurance-flow.ts`
- `lib/orkes/insurance-flow.test.ts`
- `scripts/run-insurance-flow.ts`
- `test/api/insurance-flow-route.test.ts`

### Insurance Flow Demo UI

- Added `/demo/insurance-flow` as a visual entry point for the local insurance
  workflow.
- The page runs the same local flow as the API route and shows orchestration
  mode, retrieval, provider names (including web verification), portal mode/URL/
  excerpt, fallback flags, Agentspan execution link when applicable, extracted
  coverage, and follow-up tasks.
- Added `InsuranceFlowDemo` and `InsuranceFlowDemoChrome` components.
- The optional prerecorded Deepgram insurance-audio path remains available, but
  is collapsed under a developer transcript test below the main workflow result
  so the judge demo does not imply users upload insurance call files.

Files added:

- `app/demo/insurance-flow/page.tsx`
- `components/mariposa/InsuranceFlowDemo.tsx`
- `components/mariposa/InsuranceFlowDeepgramUpload.tsx`

### Insurance Flow Persistence

- Added `persistInsuranceFlowResult(...)` to store the Mariposa insurance demo
  in the in-memory data layer (no Supabase required).
- Persists:
  - call record at `call_{coupleId}_mariposa_insurance_flow`
  - insurance follow-up tasks (replacing prior mariposa insurance-flow tasks on
    re-run, preserving unrelated tasks)
  - doctor summary coverage section via `refreshDoctorSummaryFromCall(...)`
- `runInsuranceFlow()` persists by default and returns a `persistence` summary.
- Pass `persist: false` to skip persistence for isolated tests.

Files added or changed:

- `lib/orkes/persist-insurance-flow.ts`
- `lib/orkes/persist-insurance-flow.test.ts`
- `lib/orkes/insurance-flow.ts`
- `lib/orkes/insurance-flow.test.ts`
- `scripts/run-insurance-flow.ts`
- `test/api/insurance-flow-route.test.ts`
- `components/mariposa/InsuranceFlowDemo.tsx`

### Demo Presenter Script And Env Status

- Added `describeMariposaEnv(...)` to summarize live vs fallback vs disabled
  integrations (including **Portal verification**) and surface env warnings
  (for example `USE_MOCK_AI` overriding Anthropic).
- Added `npm run demo:present` to print a short presenter script from the
  current environment.
- Added env-status tests.

Files added or changed:

- `lib/config/env-status.ts`
- `lib/config/env-status.test.ts`
- `lib/config.ts` (exported `parseBooleanEnv`)
- `scripts/present-insurance-demo.ts`
- `package.json`

### HTTP Smoke Test (Optional)

- Added an opt-in HTTP smoke test that starts Next and hits
  `/api/demo/insurance-flow` over HTTP.
- Skipped during normal `npm test`; run with `npm run test:http-smoke`.

Files added or changed:

- `test/api/insurance-flow-http.test.ts`
- `package.json`

### Tasks Tab Wiring

- The Tasks tab reads persisted tasks from the in-memory data layer via
  `getTasks(...)`.
- Running `/demo/insurance-flow` creates Together follow-up tasks on `/tasks`.
- Empty state prompts users to run the insurance demo; populated state shows a
  source note.

Files added or changed:

- `app/(tabs)/tasks/page.tsx`
- `components/mariposa/InsuranceTasksPrompt.tsx`
- `components/mariposa/InsuranceFlowDemo.tsx`
- `lib/orkes/persist-insurance-flow.ts`
- `test/workspace/tasks-from-insurance-flow.test.ts`
- `test/components/insurance-tasks-prompt.test.tsx`

### Summary Page Wiring

- Doctor summary overlays persisted call records from the in-memory data layer.
- Running `/demo/insurance-flow` populates verified coverage facts on
  `/summary`.
- `/summary` now lives inside the shared app tab layout and appears as a bottom
  tab beside Tasks.
- Added an `Add a new result` card on `/summary` so a user can add post-intake
  lab, semen-analysis, insurance, or clinic context.
- Added `POST /api/results`, which parses common lab/semen result phrases,
  updates the in-memory partner profile, creates a review task, writes Redis
  agent memory when available, and refreshes the summary context.

Files added or changed:

- `lib/workspace/load-for-summary.ts`
- `lib/workspace/result-update.ts`
- `lib/workspace/result-update.test.ts`
- `app/(tabs)/summary/page.tsx`
- `components/mariposa/BottomTabs.tsx`
- `components/mariposa/AppShell.tsx`
- `app/api/results/route.ts`
- `components/mariposa/AddResultCard.tsx`
- `components/mariposa/InsuranceSummaryPrompt.tsx`
- `test/workspace/summary-from-insurance-flow.test.ts`
- `test/components/insurance-summary-prompt.test.tsx`
- `test/api/results-route.test.ts`

### Redis Verification Script

- Added `npm run verify:redis` to check connectivity and vector index document
  count before seeding.
- Enhanced `npm run demo:present` with rehearsal steps and live demo env
  checklist.

Files added or changed:

- `scripts/verify-redis.ts`
- `scripts/present-insurance-demo.ts`
- `.env_example`
- `package.json`

### Agentspan Orchestration Integration

- Added real Orkes Agentspan integration via `@agentspan-ai/sdk`.
- When `USE_AGENTSPAN=true` (or legacy `USE_ORKES=true`), the local Agentspan
  server is healthy, and `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set, the
  insurance flow runs through a durable Agentspan agent with a
  `run_mariposa_insurance_flow` tool.
- Falls back transparently to the local runner when Agentspan is disabled,
  unhealthy, missing a model credential, or errors.
- Demo UI shows Agentspan execution IDs with a link to the local execution UI
  (`http://localhost:6767`).
- See **Agentspan Reliability And Local Server Script** below for stream-based
  tool completion and `npm run agentspan:start`.

Files added or changed:

- `lib/config.ts`
- `lib/orkes/agentspan-server.ts`
- `lib/orkes/agentspan-insurance-flow.ts`
- `lib/orkes/insurance-flow-local.ts`
- `lib/orkes/insurance-flow-types.ts`
- `lib/orkes/insurance-flow.ts`
- `components/mariposa/InsuranceFlowDemo.tsx`
- `.env_example`
- `scripts/present-insurance-demo.ts`
- `package.json`
- tests under `lib/orkes/` and `lib/config/`

### Browserbase Portal Verification

- Added `@browserbasehq/sdk` Fetch API integration for synthetic member-portal
  verification.
- `verifyInsurancePortal(...)` fetches `/demo/pacific-crest-benefits?member=...`
  when `USE_BROWSERBASE=true`, `BROWSERBASE_API_KEY` is set, and the app base
  URL is public; otherwise returns the same markdown as an offline snapshot.
- Portal markdown lives in `lib/browserbase/pacific-crest-portal.ts`; demo page at
  `/demo/pacific-crest-benefits`.
- Insurance flow merges portal context into Claude extraction; demo UI shows web
  provider, portal mode, URL, and excerpt.
- Verified on Vercel production: `providers.web` = `browserbase-fetch`,
  `webVerification.mode` = `live-fetch`.

Files added or changed:

- `lib/browserbase/insurance-portal-verify.ts`
- `lib/browserbase/pacific-crest-portal.ts`
- `lib/browserbase/insurance-portal-verify.test.ts`
- `app/demo/pacific-crest-benefits/page.tsx`
- `lib/orkes/insurance-flow-local.ts`
- `lib/orkes/insurance-flow-types.ts`
- `lib/orkes/insurance-flow.ts`
- `lib/orkes/agentspan-insurance-flow.ts`
- `components/mariposa/InsuranceFlowDemo.tsx`
- `lib/config/env-status.ts`
- `.env_example`
- `scripts/present-insurance-demo.ts`

### Calendar And Husband Prep

- Added month grid calendar view with fertile-window-driven reminders.
- **His prep** tasks derive from her trying window (`lib/calendar/partner-prep.ts`).
- Prep tasks persist to the Tasks tab with stable ids `task_{coupleId}_his_prep_*`
  (`lib/calendar/persist-his-prep-tasks.ts`); Calendar and Tasks pages call
  `persistHisPrepTasks()`.

Files added or changed:

- `components/mariposa/calendar/MonthGrid.tsx`
- `components/mariposa/CalendarView.tsx`
- `lib/calendar/partner-prep.ts`
- `lib/calendar/persist-his-prep-tasks.ts`
- `app/(tabs)/calendar/page.tsx`
- `app/(tabs)/tasks/page.tsx`

### Agentspan Reliability And Local Server Script

- Orchestrator agent now sets `requiredTools: ["run_mariposa_insurance_flow"]` so
  the LLM must invoke the durable tool (not summarize from memory).
- `runInsuranceFlowViaAgentspan(...)` uses `runtime.start()` + event stream to
  return as soon as the tool completes (~7s), instead of hanging on
  `runtime.run()` waiting for a final LLM turn.
- Added `npm run agentspan:start` — loads `.env.local` and starts the Agentspan
  server so `ANTHROPIC_API_KEY` is available to the Java runtime.
- Verified locally: `orchestrationMode: "agentspan"` with execution link in demo
  UI when server is at `http://localhost:6767`.

Files added or changed:

- `lib/orkes/agentspan-insurance-flow.ts`
- `scripts/start-agentspan-server.ts`
- `scripts/present-insurance-demo.ts`
- `package.json`

### Vercel Production Deployment

- Deployed to Vercel as **https://mariposa-six.vercel.app** (project:
  `jiyun-kims-projects/mariposa`).
- Production env vars synced from `.env.local` (Anthropic, Redis, Browserbase,
  Deepgram, etc.).
- `USE_AGENTSPAN` kept **false** on Vercel (Agentspan server is local-only at
  `localhost:6767`); production uses the local insurance runner fallback.
- Production smoke check (2026-06-21): vector retrieval, Claude extraction,
  Browserbase live-fetch, Redis memory write, task/summary persistence.

## Current Demo Behavior

### Production (Vercel)

```text
https://mariposa-six.vercel.app/demo/insurance-flow
https://mariposa-six.vercel.app/tasks
https://mariposa-six.vercel.app/summary
https://mariposa-six.vercel.app/calendar
https://mariposa-six.vercel.app/demo/pacific-crest-benefits
```

Expected on production (with synced env vars):

- Orchestration: **local** (Agentspan disabled on Vercel)
- Retrieval: **vector** when Redis is seeded
- Voice/transcript: **deterministic fallback** (Deepgram key present; no live STT/TTS)
- Model: **Claude**
- Web verification: **Browserbase live-fetch**
- Agent memory: written to `mariposa:memory:{coupleId}` when Redis available
- Persistence: call record, follow-up tasks, summary coverage

### Local development

Run:

```bash
npm run agentspan:start   # terminal 1 — optional, for Agentspan orchestration
npm run dev               # terminal 2
```

Open:

```text
http://localhost:3000/api/demo/insurance-flow
http://localhost:3000/demo/insurance-flow
http://localhost:3000/tasks
http://localhost:3000/summary
http://localhost:3000/calendar
http://localhost:6767     # Agentspan UI when server running
```

Or run the flow without starting Next:

```bash
npm run demo:insurance-flow
npm run demo:present
```

Expected with sponsor credentials in `.env.local`:

- Orchestration: **agentspan** when `USE_AGENTSPAN=true` and local server healthy;
  otherwise **local**
- Retrieval: Redis vector when seeded; keyword fallback otherwise
- Voice/transcript: deterministic transcript unless `transcriptPayload` passed
  to the flow (Deepgram parser seam)
- Model: Claude when `ANTHROPIC_API_KEY` set and `USE_MOCK_AI=false`
- Web verification: Browserbase live-fetch when public app URL; portal snapshot
  on localhost
- Agent memory + persistence: same as production path

Expected **without** sponsor credentials (rehearsal mode):

- Orchestration: local
- Model: mock
- Retrieval: keyword fallback
- Voice, portal, memory: deterministic / skipped fallbacks
- Persistence: still writes to in-memory data layer

The demo route remains usable credential-free for rehearsals; live sponsor paths
activate when keys and flags are set.

## Verification Run

The latest verification performed after these changes:

```bash
npm run build
npm run demo:insurance-flow   # with USE_AGENTSPAN=true + agentspan server → agentspan mode
npm run typecheck
npm test
```

Result (2026-06-21):

- Production build passed on Vercel and locally.
- CLI demo passed with Claude, vector retrieval, and Agentspan orchestration when
  local server running.
- Production API (`/api/demo/insurance-flow`): Browserbase live-fetch, Claude,
  Redis memory, persistence confirmed.
- Server-side Sentry capture is wired through `@sentry/nextjs` when `SENTRY_DSN`
  is present; local tests mock the SDK and verify workflow tags/context.
- Local verification after Sentry wiring: `npm run typecheck`, `npm test`, and
  `npm run build` passed. Test suite passed: **256 tests** across 62 files
  (1 optional HTTP smoke test skipped).
- Voice intake verification on 2026-06-21:
  - Targeted voice tests passed:
    `npm test -- lib/intake/voice.test.ts test/api/intake-voice-turn.test.ts test/agent/deepgram-voice.test.ts`
  - `npm run typecheck` passed.
  - `npm test` passed: **262 tests** across 64 files (1 optional HTTP smoke test
    skipped).
  - `npm run build` passed. Remaining build warning is the pre-existing
    Agentspan SDK dynamic dependency expression warning; it does not block the
    build.
  - Local route smoke check passed: `HEAD /intake` returned `200 OK` from
    `next dev` on port 3001.
- Result-update verification on 2026-06-21:
  - `npm test -- lib/workspace/result-update.test.ts test/api/results-route.test.ts`
    passed.
  - `npm test -- test/workspace/summary-from-insurance-flow.test.ts test/components/insurance-summary-prompt.test.tsx test/components/workspace.test.tsx lib/workspace/result-update.test.ts test/api/results-route.test.ts`
    passed.
  - `npm run typecheck` passed.
  - `npm run build` passed. Remaining build warning is the pre-existing
    Agentspan SDK dynamic dependency expression warning.
- Demo readiness verification on 2026-06-21:
  - `npm run demo:present` passed.
  - `npm run demo:insurance-flow` passed and exited cleanly.
  - `npm run verify:redis` passed with `mariposa-rag` and 40 indexed docs.
  - `npm run typecheck` passed.
  - `npm test` passed: **256 tests** across 62 files (1 optional HTTP smoke test
    skipped).
  - `npm run build` passed. Remaining build warning is an Agentspan SDK dynamic
    dependency expression warning; it does not block the build.
- Earlier full verification passed: **252 tests** across 61 files (1 optional HTTP smoke test
  skipped).

## Left To Do

### Real Sponsor Wiring

- Exercise the new `/intake` Deepgram STT/TTS path with a real microphone in the
  browser. Unit tests mock Deepgram; the backend route is wired to live Deepgram
  when `DEEPGRAM_API_KEY` is present.
- The insurance-flow demo still uses the deterministic transcript unless an audio
  payload is passed to its Deepgram route.
- Add real Arize SDK/API trace emission. Current hooks return local trace
  metadata only.
- Host Agentspan on a reachable URL if orchestration should run on Vercel (today
  it is local-only via `npm run agentspan:start`).
- Expand Agentspan orchestration beyond the single-tool insurance wrapper if
  judges want multi-step durable workflows visible in the Agentspan UI.

### Demo Product Integration

- Current presentation surfaces: `/demo/insurance-flow`, `/tasks`, `/summary`,
  `/calendar`, `/demo/pacific-crest-benefits`, `/api/demo/insurance-flow`,
  `npm run demo:insurance-flow`, `npm run demo:present`, and Vercel production URL.

### Retrieval And Memory

- Re-run `npm run verify:redis` and `npm run seed:redis` after Redis prefix or
  reference data changes.
- Add semantic cache only after the demo flow is stable.

### Scope And Infrastructure

- The Inngest workflow and optional Grok/AgentPhone voice paths remain available
  alongside the primary Claude + Deepgram + Agentspan insurance flow.
- Sync Vercel **Preview** env vars if branch previews should match production.

### Hardening

- Add real SDK/API emission for Arize when sponsor credentials are present.
- Add a deliberate Sentry test-error route or script only if needed for dashboard
  verification; do not expose it publicly in production without a guard.
- Review npm audit findings separately. They were reported by `npm install` but
  were not addressed in this pass.
