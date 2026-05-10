# Hackathon submissions

Director's Canvas was built for two synchronous events. Each rubric is
mapped below.

## Generative UI Global Hackathon — *Agentic Interfaces*

> Build AI agents that don't just return text — they render complete,
> interactive interfaces on the fly.

| Criterion              | How we hit it                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| **Interactive UI**     | Storyboard timeline, shot cards, video players, detail panel — all generated from agent state, not chat |
| **Agentic loop**       | LangGraph Deep Agent plans → calls Runway → mutates state → user can intervene at any step |
| **Reference stack**    | CopilotKit + AG-UI + MCP Apps + LangGraph + A2UI primitives — extended into a real creative workflow |
| **End-to-end demo**    | Working `/director` route, MOCK mode for instant demo, LIVE mode with Runway key |

Stack: CopilotKit Intelligence (threads), AG-UI (transport), LangGraph
Deep Agents (planner), A2UI / `useFrontendTool` (rendering),
`Command(update=)` for state-as-output, MCP server for cross-host
deployment.

## Runway API Hackathon

> Build agents and applications that create, manipulate, or orchestrate
> media using AI.

| Criterion           | How we hit it                                                       |
| ------------------- | ------------------------------------------------------------------- |
| **Creativity**      | Reframes video production as a director-agent collaboration, not a prompt box |
| **Technical depth** | Chains text→image→video across N shots, with per-shot regeneration and prompt rewrite — beyond a single call |
| **Impact**          | Real workflow for solo creators / marketing teams; clear path to product |
| **Polish**          | End-to-end working demo on a live canvas; MOCK mode means anyone can try it without a key |

Runway API surface used:

- **Gen-4 text-to-image** (`text_to_image.create` with `model="gen4_image"`) — reference stills
- **Gen-4 image-to-video** (`image_to_video.create` with `model="gen4_turbo"`) — animated shots
- **`wait_for_task_output()`** — async polling handled by the SDK

Planned next: Runway Characters API for cast continuity, video-to-video
for shot-level restyling.

## Project structure

The submission lives in this monorepo:

```
apps/
├── agent/        ← Director graph (Python, LangGraph)
│   ├── director.py
│   └── src/runway_*.py, storyboard_*.py
├── frontend/     ← /director canvas (Next.js, React)
│   └── src/app/director, components/storyboard, lib/storyboard
├── bff/          ← CopilotKit runtime (Hono)
└── mcp/          ← MCP server for Claude / ChatGPT (mcp-use)
```

The retained `/leads` route is the upstream CopilotKit starter, kept as
a working second example of the same primitives.
