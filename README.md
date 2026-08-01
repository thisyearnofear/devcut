# DevCut

> The x402-metered video desk for hackathons.

Organizers commission a **Challenge Cut** (visual spec of what winning looks like).
Builders run **Submit Ready** (HyperFrames / repo / product URL → Devpost-ready MP4).
Agents pay per job via **x402** — no Runway key paste as the default path.

**North star:** [`docs/devcut-thesis.md`](docs/devcut-thesis.md)

Formerly “Director’s Canvas” — same agent pipeline (storyboard → Runway stills → clips → stitch), **hackathon-shaped** product.

## What's here

| Route | What it is |
| --- | --- |
| `/` | DevCut landing — three doors |
| `/director` | Live storyboard canvas (Challenge Cut / Submit Ready) |
| `/leads` | Legacy CopilotKit lead-triage starter |
| MCP | Expose the agent to Claude / ChatGPT |

## Quickstart

```bash
npx @copilotkit/cli@latest init   # Intelligence
cp .env.example .env
# Set NVIDIA_API_KEY (primary). Optional: VENICE_API_KEY, GEMINI_API_KEY.
# Optionally RUNWAY_API_KEY (else MOCK). GENBLAZE_ENABLED=1 + B2_* for durable exports.
npm install && npm run dev
```

Open <http://localhost:3000> → pick a door → `/director`.

## Stack

| Layer | Technology |
| --- | --- |
| Agent | LangGraph + CopilotKit / AG-UI |
| Planner | NVIDIA → Venice → Gemini ([`docs/providers.md`](./docs/providers.md)) |
| Image / video / audio | Runway (`gen4_image_turbo`, `gen4.5`, TTS/SFX) |
| Composition handoff | HyperFrames (external OS — we feed assets / BRIEF seeds) |
| Payments | x402 job meter — see [`docs/x402.md`](./docs/x402.md) |
| Durable export | Backblaze B2 via Genblaze when enabled |
| UI | Next.js + CopilotKit / AG-UI |

## Docs

| | |
| --- | --- |
| [**DevCut thesis**](./docs/devcut-thesis.md) | North star |
| [Providers](./docs/providers.md) | Inference + AG-UI foundation |
| [x402 jobs](./docs/x402.md) | Pay-per-job API for agents |
| [Hackathon / B2 notes](./docs/hackathon-backblaze.md) | Genblaze + B2 submission notes |
| [Architecture](./docs/architecture.md) | Pipeline internals |
| [Roadmap](./docs/roadmap.md) | Shipped / next |
| [Setup](./docs/setup.md) | Full local setup |
