# Director's Canvas

> Agent-directed video production as a generative interface.

Type a one-line brief — *"direct a 30s sci-fi opener: lone astronaut on
a glass-domed alien city at golden hour"* — and watch a LangGraph Deep
Agent decompose it into shots, generate Runway reference stills, then
animate every still into a clip on a live storyboard canvas.
No chat-wrapper: the agent's output **is** the interface.

Built for the **Generative UI Global Hackathon** (CopilotKit + AG-UI +
LangGraph + A2UI) and the **Runway API Hackathon**.

![Hackathon Banner](apps/frontend/public/banner.jpg)

## What's here

| Route | What it is |
| --- | --- |
| `/director` | The storyboard canvas — the headline experience |
| `/leads` | The upstream CopilotKit lead-triage starter, kept as a second working example |
| MCP server | Exposes the director agent to Claude / ChatGPT |

## Quickstart

```bash
# 1. Init CopilotKit Intelligence (durable threads)
npx @copilotkit/cli@latest init   # pick Intelligence

# 2. Add keys
cp .env.example .env
cp .env apps/agent/.env
# Set GEMINI_API_KEY in both files.
# Optionally set RUNWAY_API_KEY — without it the director runs in
# MOCK mode (same UI, deterministic placeholder media, no credits burned).

# 3. Install + run
npm install && npm run dev
```

Open <http://localhost:3000> → `/director`. Try a suggestion chip or paste a brief.

> Full setup (Notion, Docker-free, manual CLI): [`dev-docs/setup.md`](./dev-docs/setup.md)

## Key features

- **Brief → storyboard → video** in one agent loop, no prompt engineering required
- **Cross-shot character consistency** — shot 0's reference image anchors all subsequent shots via Runway `gen4_image_turbo` `referenceImages`
- **Model-aware generation** — `gen4_image` for shot 0, `gen4_image_turbo` for shots 1+, `gen4.5` for video
- **Stitched export** — FFmpeg concat of all clips into one MP4, served directly from the frontend
- **BYOK** — users supply their own Runway API key via the canvas header; stored in localStorage, never logged
- **Per-thread budget guard** — default 20 Runway calls per conversation when using the shared server key
- **MOCK mode** — full pipeline runs without any API keys; deterministic placeholder media

## Stack

| Layer | Technology |
| --- | --- |
| Agent | LangGraph Deep Agents + Gemini 3.1 Flash-Lite (default) |
| Video | Runway Gen-4 Image / Gen-4 Image Turbo / Gen-4.5 |
| Transport | AG-UI + CopilotKit Intelligence (durable threads) |
| UI | Next.js + React + A2UI declarative components |
| BFF | Hono (CopilotKit runtime + BYOK injection + budget guard) |
| Export | FFmpeg concat (LIVE) / placeholder URL (MOCK) |
| MCP | mcp-use server for Claude / ChatGPT |

Swap any layer with a one-line edit — see [`dev-docs/model-switching.md`](./dev-docs/model-switching.md).

## Docs

### Product
| | |
| --- | --- |
| [Concept](./docs/concept.md) | What it is, who it's for, why it's not just a Runway wrapper |
| [Architecture](./docs/architecture.md) | How brief → storyboard → video flows through the stack |
| [Roadmap](./docs/roadmap.md) | What's shipped, what's next |
| [Hackathons](./docs/hackathons.md) | Runway API + Generative UI submission notes |

### Developer
| | |
| --- | --- |
| [Setup](./dev-docs/setup.md) | Prerequisites, keys, Docker-free mode |
| [Model switching](./dev-docs/model-switching.md) | Swap Gemini tier, OpenAI, Anthropic |
| [Architecture (dev)](./dev-docs/architecture.md) | Service diagram, BFF rationale, port map |
| [Customization](./dev-docs/customization.md) | Add tools, swap MCP servers, suggestion chips |
| [Threads](./dev-docs/threads.md) | Durable thread walkthrough |
| [Scripts](./dev-docs/scripts.md) | `npm run` cheat sheet |
| [Demo prompts](./dev-docs/demo-prompts.md) | Try each layer |
| [Troubleshooting](./dev-docs/troubleshooting.md) | Known failure modes + fixes |
| [MCP server](./dev-docs/mcp-server.md) | Run, tunnel, deploy |

## License

MIT.
