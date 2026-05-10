# Director's Canvas

> Agent-directed video production as a generative interface.

Type a one-line brief — *"direct a 30s sci-fi opener: lone astronaut on
a glass-domed alien city at golden hour"* — and watch a LangGraph Deep
Agent decompose it into shots, generate a Runway reference still for
each, then animate every still into a clip on a live storyboard canvas.
No chat-wrapper: the agent's output **is** the interface.

Built for the **Generative UI Global Hackathon** (CopilotKit + AG-UI +
LangGraph + A2UI) and the **Runway API Hackathon** (Gen-4 image + Gen-4
image-to-video, chained across shots).

![Hackathon Banner](apps/frontend/public/banner.jpg)

## What's here

- **`/director`** — the storyboard canvas. The headline experience.
- **`/leads`** — the upstream CopilotKit lead-triage starter, retained
  as a working second example of the same primitives.
- **MCP server** — exposes the agent to Claude / ChatGPT.

## Docs

- [`docs/`](./docs/README.md) — concept, architecture, roadmap, hackathon notes
- [`dev-docs/`](./dev-docs/README.md) — setup, model switching, troubleshooting

## Run it

1. `npx @copilotkit/cli@latest init` and pick **Intelligence**.
2. Drop a Gemini key into `.env` and `apps/agent/.env`. Optionally add
   `RUNWAY_API_KEY` (without it, the director runs in deterministic
   MOCK mode — same UI, placeholder media).
3. `npm install && npm run dev`.

Open <http://localhost:3000> → land on `/director`. Try a suggestion
chip, or paste a brief.

> Need Notion / detailed setup? See [`dev-docs/setup.md`](./dev-docs/setup.md).

## Stack

CopilotKit Intelligence (durable threads) · AG-UI (transport) ·
LangGraph Deep Agents (planner) · Gemini 3.1 Flash-Lite (default) ·
Runway Gen-4 (image + video) · A2UI (declarative components) ·
mcp-use (MCP server) · Daytona-ready sandboxes for code execution.

Swap any one with a one-line edit — see
[`dev-docs/model-switching.md`](./dev-docs/model-switching.md) and
[`dev-docs/customization.md`](./dev-docs/customization.md).

## License

MIT.
