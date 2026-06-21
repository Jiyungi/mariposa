# Mariposa

Mariposa helps a synthetic couple prepare for fertility care by turning intake
data, insurance facts, clinic logistics, and reference context into tasks,
calendar events, grounded chat, and a doctor-facing summary.

## Stack

| Concern | Integration |
| --- | --- |
| Agent/workflow orchestration | Orkes Agentspan, with local fallback |
| Retrieval and memory | Redis vector search, semantic cache, agent memory |
| Voice/transcript | Deepgram STT (upload on `/demo/insurance-flow`) |
| Reasoning/extraction/summaries | Anthropic Claude, with deterministic mock fallback |
| AI observability/evals | Arize |
| Error monitoring | Sentry |
| Web verification | Browserbase against synthetic pages |

## Demo surfaces

- `/demo/insurance-flow` — insurance admin workflow (default deterministic transcript; optional audio upload for live Deepgram STT)
- `/demo/pacific-crest-benefits` — synthetic member portal used by Browserbase verification
- `/tasks`, `/calendar`, `/summary` — workspace views for the seed couple

CLI helpers:

```bash
npm run demo:insurance-flow
npm run demo:present
```

## Local development

```bash
npm install
cp .env_example .env.local   # then fill in keys
npm run dev
npm run typecheck
npm test
```

The app runs without sponsor credentials through deterministic fallbacks. See
`.env_example` for integration keys and `PROGRESS.md` for implementation status.
