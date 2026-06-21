# Mariposa

Mariposa is an agentic fertility-preparation workspace for couples who are
trying to move from uncertainty to care. It turns intake details, cycle timing,
male-factor readiness, insurance facts, web-verified benefits, and grounded
reference context into concrete tasks, calendar guidance, and a doctor-facing
summary.

The project is built around one social-impact premise: fertility care is not
only a medical problem. It is also an information, coordination, cost, and
access problem. WHO estimates that around 17.5% of adults, roughly 1 in 6
people globally, experience infertility in their lifetime, and notes that high
costs, stigma, and limited availability keep care inaccessible for many people
([WHO](https://www.who.int/news/item/04-04-2023-1-in-6-people-globally-affected-by-infertility)).
In the U.S., CDC NSFG data reports impaired fecundity for 12.1% of women ages
15-44, and 12.0% of women ages 15-44 have ever received infertility services
([CDC/NCHS](https://www.cdc.gov/nchs/nsfg/key_statistics/i.htm)). KFF also
reports that fertility care is often not covered by public or private insurers,
that many patients pay out of pocket, and that treatment can exceed $10,000
depending on services received
([KFF](https://www.kff.org/womens-health-policy/coverage-and-use-of-fertility-services-in-the-u-s/)).

Mariposa does not diagnose infertility or recommend treatment. It helps couples
prepare: what information is missing, what questions to ask, what insurance
facts matter, what tasks should happen next, and what should be summarized for a
clinician.

## What It Does

- Collects partner-specific fertility intake for her, him, and the couple
  together.
- Supports direct microphone voice intake with Deepgram STT and TTS on
  `/intake`.
- Calculates cycle-aware calendar reminders and male-factor preparation tasks.
- Runs an insurance verification workflow for the seed couple.
- Uses Redis vector retrieval to ground the workflow in reference context.
- Uses Browserbase to verify a synthetic member benefits portal when the app is
  reachable from a public URL, with a local snapshot fallback for localhost.
- Uses Claude to extract structured coverage facts from transcript + retrieved
  context + portal context.
- Writes agent memory to Redis so later interactions can know what happened.
- Persists the workflow result into product surfaces: `/tasks` and `/summary`.
- Captures workflow/API errors through Sentry when `SENTRY_DSN` is configured.

## Why It Matters

Infertility workups often involve both partners, but real-world tools and
clinic workflows still tend to make one partner carry the administrative load.
Mariposa treats fertility preparation as a shared workflow:

- **Female-cycle context**: cycle length, irregularity, missing labs, fertile
  window, and care-prep timing.
- **Male-factor context**: semen analysis status, parameters, lifestyle factors,
  and re-test timing.
- **Insurance context**: diagnostic coverage, in-network labs, deductible,
  coinsurance, prior authorization, pharmacy benefit gaps.
- **Care coordination**: task ownership, calendar reminders, and a concise
  doctor summary.

This is especially important because insurance uncertainty changes behavior.
When couples do not know whether diagnostic testing, semen analysis, hormone
labs, IUI, IVF, or medication benefits are covered, they can delay care, book
the wrong lab, miss prior authorization, or receive surprise bills.

## Demo Flow

Recommended judge path:

1. Open `/intake`.
2. Use **Voice intake** to speak a natural turn such as:

   ```text
   I am 33, we have been trying for 8 months, and my cycles are irregular.
   ```

   Deepgram transcribes the turn, Mariposa extracts draft intake fields, and
   Deepgram TTS responds with the next question.

3. Open `/demo/insurance-flow`.

   This is a workflow inspector, not a normal user page. In the real product,
   the insurance workflow would run after intake or after a user action like
   "Check my coverage." The page exists so judges can see which agent tools ran.

4. Open `/tasks`.

   The insurance result becomes action items such as confirming CPT codes,
   using the in-network lab, submitting prior authorization, or checking the
   pharmacy formulary.

5. Open `/summary`.

   The doctor-facing summary includes verified coverage facts and unresolved
   preparation items.

6. Open `/calendar`.

   The calendar shows fertility-prep timing and partner-specific reminders.

## How The Insurance Workflow Works

The seed demo currently models a Pacific Crest Health member benefits flow.

1. **Agentspan orchestrates**

   When `USE_AGENTSPAN=true` and the local Agentspan server is healthy, Mariposa
   creates an agent called `mariposa_insurance_orchestrator`. The agent has one
   required tool: `run_mariposa_insurance_flow`. Agentspan records the execution
   and exposes the execution ID in the demo UI.

2. **Redis retrieves context**

   The workflow queries Redis vector search for insurance and fertility-reference
   context. The demo displays the retrieval mode and chunk count, for example:
   `vector (8 chunks)`.

3. **Transcript enters the flow**

   The insurance demo uses a deterministic transcript by default so the judged
   run is repeatable. A developer-only Deepgram transcript test remains collapsed
   at the bottom of `/demo/insurance-flow`, but the user-facing Deepgram
   experience is the live voice intake on `/intake`.

4. **Browserbase verifies web context**

   On a public deployment, Browserbase fetches the synthetic member portal and
   returns portal markdown to the workflow. On localhost, the workflow uses the
   same local portal snapshot because Browserbase cannot fetch a private local
   URL.

5. **Claude extracts structured coverage**

   Claude receives the transcript, Redis context, and portal excerpt, then
   returns validated structured data: covered diagnostics, semen analysis,
   hormone labs, in-network lab, deductible, coinsurance, out-of-pocket max,
   referral requirement, and follow-up tasks.

6. **Redis stores memory**

   The workflow writes an agent memory event to
   `mariposa:memory:{coupleId}` with retrieval/provider metadata and workflow
   outcome context.

7. **The app updates**

   The workflow persists a call record, creates follow-up tasks, and updates the
   doctor summary. The value is not just an agent trace; it lands in the couple's
   workspace.

## Tool Use

| Tool | How Mariposa Uses It |
| --- | --- |
| **Orkes Agentspan** | Durable local orchestration for the insurance workflow, with an inspectable execution ID and fallback to the same local runner when Agentspan is disabled or unhealthy. |
| **Redis** | Vector search over fertility/insurance context, plus agent memory writes at `mariposa:memory:{coupleId}`. |
| **Anthropic Claude** | Structured extraction of insurance coverage facts from transcript + retrieved context + portal context; also used through the AI provider seam when configured. |
| **Browserbase** | Fetches the synthetic member portal from a public app URL for web verification; local snapshot fallback is used on localhost. |
| **Deepgram** | Direct microphone voice intake with speech-to-text and text-to-speech on `/intake`; optional developer transcript test for insurance-call audio. |
| **Sentry** | Server-side workflow/API error capture through `@sentry/nextjs` when `SENTRY_DSN` is set. |
| **Arize** | No-op-safe trace hooks are present, but live Arize SDK/API emission is not claimed as complete. |

## Main Screens

- `/intake` - partner intake plus Deepgram voice intake.
- `/home` - couple workspace overview and progress.
- `/demo/insurance-flow` - workflow inspector for the insurance automation.
- `/demo/pacific-crest-benefits` - synthetic member portal used for web
  verification.
- `/tasks` - follow-up tasks created from intake and insurance results.
- `/summary` - doctor-facing summary.
- `/calendar` - cycle-aware and partner-prep reminders.

## Local Setup

```bash
npm install
cp .env_example .env.local
npm run dev
```

Open:

```text
http://localhost:3000/intake
http://localhost:3000/demo/insurance-flow
http://localhost:3000/tasks
http://localhost:3000/summary
http://localhost:3000/calendar
```

The app has deterministic fallbacks, so it can run without all sponsor
credentials. Live paths activate when the corresponding keys and flags are set
in `.env.local`.

## Local Agentspan Demo

Agentspan runs locally without an Agentspan API key. Start it in a separate
terminal:

```bash
npm run agentspan:start
```

Then run the app:

```bash
npm run dev
```

Expected local URLs:

```text
http://localhost:3000/demo/insurance-flow
http://localhost:6767
```

For production, Vercel cannot run the long-lived Agentspan server inside a
serverless function. A production Agentspan path requires a separately hosted
Agentspan server URL configured as `AGENTSPAN_SERVER_URL`.

## Useful Commands

```bash
npm run demo:present          # presenter script and integration status
npm run demo:insurance-flow   # CLI insurance workflow run
npm run verify:redis          # confirm Redis connection/index status
npm run seed:redis            # seed Redis reference vectors
npm run typecheck
npm test
npm run build
```

## Environment Variables

See `.env_example` for the full list. The most important live-demo variables
are:

```bash
ANTHROPIC_API_KEY=
DEEPGRAM_API_KEY=
REDIS_URL=
REDIS_VECTOR_INDEX=mariposa-rag
USE_AGENTSPAN=true
AGENTSPAN_SERVER_URL=http://localhost:6767
USE_BROWSERBASE=true
BROWSERBASE_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
SENTRY_DSN=
```

Notes:

- Use `NEXT_PUBLIC_APP_URL=https://your-deployed-app.vercel.app` for Browserbase
  live-fetch on Vercel.
- Use `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local development; this
  will intentionally use the portal snapshot fallback.
- `USE_MOCK_AI=true` forces deterministic model fallback for rehearsal.

## Architecture

```text
Intake / Voice
  -> Deepgram STT
  -> draft field extraction
  -> Deepgram TTS response

Insurance workflow
  -> Agentspan orchestrator
  -> Redis vector retrieval
  -> deterministic or Deepgram transcript
  -> Browserbase portal fetch or local portal snapshot
  -> Claude structured extraction
  -> Redis agent memory
  -> tasks + doctor summary persistence
```

The app is built with Next.js App Router, React, TypeScript, Tailwind, Zod, and
Vitest. Shared provider seams keep live sponsor integrations and deterministic
fallbacks testable.

## Reliability And Safety

- Medical-decision requests are declined; Mariposa prepares and summarizes, but
  does not diagnose or prescribe.
- Structured outputs are validated before they update the workspace.
- Sponsor paths have deterministic fallbacks so demos are repeatable.
- Server-side workflow/API errors are captured through Sentry when configured.
- Tests cover intake validation, retrieval, extraction, workflow routing,
  persistence, UI behavior, and sponsor fallback behavior.

## Current Verification

Recent local verification has passed:

```bash
npm run typecheck
npm test
npm run build
```

`PROGRESS.md` records implementation status and the latest verified behavior
without claiming unfinished integrations as complete.
