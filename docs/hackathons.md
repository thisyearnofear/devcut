# Hackathon submissions

Director's Canvas was built for two synchronous events. Each rubric is
mapped below.

## Generative UI Global Hackathon — *Agentic Interfaces*

> Build AI agents that don't just return text — they render complete,
> interactive interfaces on the fly.

| Criterion              | How we hit it                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Interactive UI**     | Storyboard timeline, shot cards, video players, export panel — all generated from agent state, not chat |
| **Agentic loop**       | LangGraph Deep Agent plans → calls Runway → mutates state → user can intervene at any step         |
| **Reference stack**    | CopilotKit + AG-UI + MCP Apps + LangGraph + A2UI primitives — extended into a real creative workflow |
| **End-to-end demo**    | Working `/director` route, MOCK mode for instant demo, LIVE mode with Runway key                   |

Stack: CopilotKit Intelligence (threads), AG-UI (transport), LangGraph
Deep Agents (planner), A2UI / `useFrontendTool` (rendering),
`Command(update=)` for state-as-output, MCP server for cross-host
deployment.

## Runway API Hackathon

> Build agents and applications that create, manipulate, or orchestrate
> media using AI.

| Criterion           | How we hit it                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| **Creativity**      | Reframes video production as a director-agent collaboration, not a prompt box                         |
| **Technical depth** | Context-aware model selection, cross-shot character consistency via `referenceImages`, stitched export |
| **Impact**          | Real workflow for solo creators / marketing teams; BYOK so anyone can use their own credits           |
| **Polish**          | End-to-end working demo; MOCK mode means anyone can try it without a key; live smoke test suite       |

### Runway API surface used

| Endpoint / Model          | Usage                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| `gen4_image`              | Shot 0 reference still (no prior refs available)                      |
| `gen4_image_turbo`        | Shots 1+ reference stills with `referenceImages` for character anchor |
| `gen4.5`                  | All image→video animation (upgraded from `gen4_turbo`)                |
| `wait_for_task_output()`  | Async polling handled by the SDK                                       |

### What makes the Runway usage novel

Standard integrations call `image_to_video` once and return a URL.
Director's Canvas:

1. **Chains N calls** across a storyboard with shared state between them.
2. **Uses `referenceImages`** to maintain character consistency — the
   astronaut in shot 4 looks like the astronaut in shot 1 because shot 0's
   reference is passed as `character1` to every subsequent generation.
3. **Selects models by context** — `gen4_image` for shot 0 (no refs),
   `gen4_image_turbo` for shots 1+ (refs available, cheaper + faster),
   `gen4.5` for video (best current model).
4. **Stitches the output** — FFmpeg concat of all clips into a single MP4,
   served directly from the frontend's `public/exports/` path.
5. **BYOK with budget guard** — users can supply their own key; the shared
   server key has a per-thread call budget enforced in the agent.

### Planned next

- ElevenLabs audio (TTS + sound effects) via the same Runway API key
- `gen4_aleph` video-to-video restyle per shot
- Runway Characters (`gwm1_avatars`) as the Director avatar in the sidebar

## Project structure

```
apps/
├── agent/        ← Director graph (Python, LangGraph)
│   ├── director.py
│   ├── src/runway_client.py   ← model selection, BYOK, budget guard
│   ├── src/runway_tools.py    ← all 7 director tools
│   ├── src/stitcher.py        ← FFmpeg concat
│   └── src/storyboard_*.py
├── frontend/     ← /director canvas (Next.js, React)
│   └── src/app/director, components/storyboard, lib/storyboard
├── bff/          ← CopilotKit runtime + BYOK injection (Hono)
└── mcp/          ← MCP server for Claude / ChatGPT (mcp-use)
```

The retained `/leads` route is the upstream CopilotKit starter, kept as
a working second example of the same primitives.
