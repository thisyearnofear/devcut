# Architecture

A single brief flows through five layers. Every Runway call returns a
state mutation, not a chat message — that's why the canvas paints live.

```diagram
╭───────────────╮      ╭──────────────────╮      ╭─────────────────────╮
│  User brief   │─────▶│  Director Agent  │─────▶│  Runway Gen-4 API   │
│  (chat)       │      │  (LangGraph +    │      │  text→image         │
╰───────────────╯      │   Deep Agents)   │      │  image→video        │
                       ╰────────┬─────────╯      ╰──────────┬──────────╯
                                │                           │
                                ▼                           │
                       ╭──────────────────╮                 │
                       │ Storyboard state │◀────────────────╯
                       │ (LangGraph TD)   │   Command(update=...)
                       ╰────────┬─────────╯
                                │ STATE_SNAPSHOT
                                ▼
                       ╭──────────────────╮
                       │  Director Canvas │
                       │  (React / A2UI)  │
                       ╰──────────────────╯
```

## Surfaces

- **`/director`** — the storyboard canvas (Next.js, React).
- **`/leads`** — the original CopilotKit lead-triage demo, retained as
  a working second example.
- **MCP server** (`apps/mcp/`) — exposes the same capabilities to
  Claude / ChatGPT.

## Backend agent

`apps/agent/director.py` registers a `director` graph alongside the
`default` (leads) graph in `langgraph.json`. Both share the same
LangGraph deployment and the same Postgres-backed Intelligence threads,
but each has:

- its own **system prompt** ([`storyboard_prompts.py`](../apps/agent/src/storyboard_prompts.py))
- its own **state schema** middleware ([`storyboard_state.py`](../apps/agent/src/storyboard_state.py))
- its own **tools** ([`runway_tools.py`](../apps/agent/src/runway_tools.py))

### Tools the director can call

| Tool                        | Side effect                                                  |
| --------------------------- | ------------------------------------------------------------ |
| `generate_storyboard_plan`  | Lays out N shots as `pending` (no media yet)                 |
| `generate_shot_reference`   | Runway text→image; sets `ref_image_url`, status → `image`    |
| `generate_shot_video`       | Runway image→video; sets `video_url`, status → `ready`       |
| `regenerate_shot`           | Resets one shot, optionally rewrites its prompt              |

Each tool returns a `Command(update={...})`. LangGraph propagates the
update; the AG-UI runtime emits `STATE_SNAPSHOT`; the React canvas
re-renders. The agent never tells the UI what to draw — the UI reads
the new state and draws itself.

### Runway client modes

[`runway_client.py`](../apps/agent/src/runway_client.py) is mode-switched:

- **LIVE** — `RUNWAY_API_KEY` set → real Gen-4 calls.
- **MOCK** — no key → deterministic placeholder image+video URLs so
  the entire pipeline (state, prompts, UI) runs end-to-end without
  burning credits or blocking dev.

A pill in the canvas header shows which mode is active.

## Frontend canvas

[`apps/frontend/src/app/director/page.tsx`](../apps/frontend/src/app/director/page.tsx)
mounts the director agent at `agentId="director"` via
`CopilotChatConfigurationProvider`. State flows in via `useAgent()`;
mutations flow out via `useFrontendTool()` handlers and an
`injectPrompt` round-trip for actions that need the agent (e.g.
"regenerate this shot").

Components:

- `BriefHeader` — title, logline, Runway-mode pill, progress
- `StoryboardTimeline` → `ShotCard[]` — horizontal scroller of shots
- `ShotPreview` — inline mini-card the agent renders in chat
- Selected-shot detail panel — full-size preview + regenerate /
  rewrite controls

## Why `Command(update=)` instead of frontend tools for media

We learned from the leads canvas (issue 006) that asking the model to
construct a `setShots(shots=[...])` tool call with full payloads
*after* generating media stalls Gemini for minutes. Routing media URLs
into state via `Command(update=)` from the backend tool sidesteps
that — the model only chooses **which shot**, never reconstructs the
shot list.
