# Director's Canvas

> Agent-directed video production on the Runway API.

Type a one-line brief — *"direct a 30s sci-fi opener: lone astronaut on
a glass-domed alien city at golden hour"* — and watch a LangGraph Deep
Agent decompose it into shots, generate Runway reference stills, animate
every still into a clip, lay in voiceover + sound, and stitch the whole
thing into a deliverable MP4 — all on a live storyboard canvas.
No chat-wrapper: the agent's output **is** the interface.

Built for the **[Runway API Hackathon](https://runwayml.com/api-hackathon)**.

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

> Full setup (Notion, Docker-free, manual CLI): [`docs/setup.md`](./docs/setup.md)

## Key features

- **Brief → storyboard → video → audio → final cut** in one agent loop, no prompt engineering required
- **Cross-shot character consistency** — shot 0's reference image anchors all subsequent shots via Runway `gen4_image_turbo` `referenceImages`
- **Model-aware generation** — `gen4_image` for shot 0, `gen4_image_turbo` for shots 1+, `gen4.5` for video, `gen4_aleph` for restyle, `eleven_multilingual_v2` for voiceover, `eleven_text_to_sound_v2` for ambient sound — all through the same Runway key
- **Stitched export with audio** — FFmpeg concat of all clips into one MP4 with per-shot voiceover + ambient sound bed muxed in, served directly from the frontend
- **BYOK** — users supply their own Runway API key via the canvas header; stored in localStorage, never logged
- **Per-thread budget guard** — default 20 Runway calls per conversation when using the shared server key
- **MOCK mode** — full pipeline runs without any API keys; deterministic placeholder media

## Stack

| Layer | Technology |
| --- | --- |
| Agent | LangGraph Deep Agents + Gemini 3.1 Flash-Lite (default) |
| Image | Runway `gen4_image` (shot 0) + `gen4_image_turbo` (shots 1+, with `referenceImages` for cross-shot character anchoring) |
| Video | Runway `gen4.5` (image→video) + `gen4_aleph` (video→video restyle) |
| Audio | Runway `eleven_multilingual_v2` (voiceover) + `eleven_text_to_sound_v2` (ambient sound) |
| Avatar | Runway `gwm1_avatars` realtime WebRTC director persona |
| Transport | AG-UI + CopilotKit Intelligence (durable threads) |
| UI | Next.js + React + A2UI declarative components |
| BFF | Hono (CopilotKit runtime + BYOK injection + budget guard) |
| Export | FFmpeg concat + per-shot audio mux (LIVE) / placeholder URL (MOCK) |
| MCP | mcp-use server for Claude / ChatGPT |

Swap any layer with a one-line edit — see [`docs/setup.md`](./docs/setup.md) (model switching section).

## Docs

### Product
| | |
| --- | --- |
| [Concept](./docs/concept.md) | What it is, who it's for, why it's not just a Runway wrapper |
| [Architecture](./docs/architecture.md) | How brief → storyboard → video flows through the stack |
| [Roadmap](./docs/roadmap.md) | What's shipped, what's next |
| [Hackathons](./docs/hackathons.md) | Runway API hackathon submission notes |

### Developer
| | |
| --- | --- |
| [Setup](./docs/setup.md) | Prerequisites, keys, Docker-free mode, model switching, threads |
| [Customization](./docs/customization.md) | Add tools, swap MCP servers, suggestion chips, demo prompts |
| [MCP server](./docs/mcp-server.md) | Run, tunnel, deploy |
| [Deployment](./docs/deployment.md) | Deploy to Hetzner with Docker + Caddy |
| [Scripts](./docs/scripts.md) | `npm run` cheat sheet |
| [Troubleshooting](./docs/troubleshooting.md) | Known failure modes + fixes |

## License

MIT.
