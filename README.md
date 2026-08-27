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

Open <http://localhost:3000> → pick a door (or **Run HyperFrames demo**) → `/director`.
After stitch: **Watch · HyperFrames · Share** — download the HF kit.zip for `hyperframes init`.

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
| [Demo script](./docs/demo-script.md) | Partner walkthrough |
| [Golden Challenge Cut](./docs/demos/golden-challenge-cut.md) | Genblaze+B2 brief |
| [Providers](./docs/providers.md) | Inference + AG-UI foundation |
| [DevCut × HyperFrames](./docs/hyperframes.md) | How we feed HF (BRIEF + assets) |
| [x402 jobs](./docs/x402.md) | Pay-per-job API for agents |
| [Hackathon / B2 notes](./docs/hackathon-backblaze.md) | Genblaze + B2 submission notes |
| [Genblaze feedback issue](./docs/genblaze-feedback-issue.md) | Draft issue to file on Genblaze repo |
| [Architecture](./docs/architecture.md) | Pipeline internals |
| [Roadmap](./docs/roadmap.md) | Shipped / next |
| [Setup](./docs/setup.md) | Full local setup |

## WebMCP integration

DevCut's `/director` canvas is a genuinely mutable surface — agent actions
visibly change what the human sees in real time (shot plan → stills → clips →
stitch). We expose that canvas to **external agents** (e.g. ChatGPT's in-app
browser) via the draft [WebMCP](https://webmcp.org) `document.modelContext`
API, so an agent and a human can work the same cut together.

**Design (full rationale + day-by-day plan:** [`docs/webmcp-playbook.md`](./docs/webmcp-playbook.md)**):**

1. **Start-don't-block.** Mutating tools kick off a generation run and return
   immediately — video pipelines take minutes, WebMCP tool calls must not
   block. Agents poll `get_storyboard_state`.
2. **Auth-gate mutation.** Read-only tools register always (anonymous browsing
   preserved). Mutating tools register only when signed in (ADR-0002), or
   always when auth is disabled.
3. **One tool = one thing a human already does on the canvas.** No kitchen-sink
   tools; descriptions are written for how agents actually behave.

### Tools

| Tool | Mode | What it does |
| --- | --- | --- |
| `get_storyboard_state` | read | Brief + every shot (status / error / prompt / urls), whether a run is active, final cut URL. Poll after starting work. |
| `get_export` | read | MP4 URLs (final + durable B2), sha256, HyperFrames builder-kit availability. |
| `start_cutdown` | mutate | Commission a Challenge Cut from a text brief; starts generation, returns immediately. Fails if a run is already active. |
| `regenerate_shot` | mutate | Re-generate one shot by id (after an error or to improve it). |
| `cancel_run` | mutate | Cancel the in-flight run; completed shots stay visible. |

### How it's wired (no BFF / agent changes)

A thin controller singleton decouples the React canvas from browser-context
tools — tools cannot reach into component closures:

- `apps/frontend/src/lib/webmcp/types.d.ts` — ambient typing for the draft
  `document.modelContext` API (adjust to the observed runtime surface).
- `apps/frontend/src/lib/webmcp/controller.ts` — `directorController`
  singleton; the page publishes its handlers + latest storyboard snapshot,
  tools read them back at execute time.
- `apps/frontend/src/lib/webmcp/register-tools.ts` — the 5 tool definitions
  (2 read-only + 3 auth-gated mutating), start-don't-block semantics baked into
  the descriptions.
- `apps/frontend/src/app/director/page.tsx` — wires the controller + registers
  tools on mount (`DirectorCanvas`). The page keeps using its own callbacks, so
  there is zero human-UX regression.

WebMCP executes in-page with the user's cookies, so BYOK vault decryption,
`budgetKey(userId, threadId)` budgets, and `ui_thread_id` billing all work
unchanged. The `isRunning` guard is ref-backed (not state captured at
effect-registration time) so a stale closure can never report a finished run as
"still running" — see "bug class #1" in the playbook.

### Try it

1. Enable the WebMCP flag in Chrome (`chrome://flags/#enable-webmcp-testing`)
   or use an agent browser that surfaces `document.modelContext`.
2. Open <https://devcut.thisyearnofear.com/director>, sign in with GitHub.
3. In the agent, ask it to commission a cut, inspect the storyboard, diagnose
   a failing shot, regenerate it, then export — all while you watch the canvas.

