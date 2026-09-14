# Providers & agent foundation

One page. Inference + media + what the UI owes the user.

## Planner LLM (priority order)

| Priority | Provider | Env | Default model |
| --- | --- | --- | --- |
| **1 · primary** | [NVIDIA NIM](https://docs.api.nvidia.com/) | `NVIDIA_API_KEY` | `NVIDIA_MODEL` → `nvidia/llama-3.1-nemotron-70b-instruct` |
| **2 · fallback** | [Venice](https://docs.venice.ai/overview/about-venice) | `VENICE_API_KEY` | `VENICE_MODEL` → `zai-org-glm-5-1` |
| **3 · fallback** | [Gemini](https://ai.google.dev/gemini-api/docs) | `GEMINI_API_KEY` | `GEMINI_MODEL` → `gemini-3.1-flash-lite` |

Both NVIDIA and Venice are **OpenAI-compatible** (`ChatOpenAI` + `base_url`). Gemini uses `ChatGoogleGenerativeAI`.

**Default chain:** NVIDIA → Venice → Gemini via LangChain `with_fallbacks`. Missing keys are skipped. If none are set, the agent boots a **noop** graph (setup message, no hang).

```bash
AGENT_RUNTIME=nvidia-react   # default — chain above + create_agent
# AGENT_RUNTIME=nvidia-deep  # same chain + deepagents
# AGENT_RUNTIME=venice-react # Venice → Gemini only
# AGENT_RUNTIME=gemini-flash-react | gemini-flash-deep
```

| Base URL | |
| --- | --- |
| NVIDIA | `https://integrate.api.nvidia.com/v1` |
| Venice | `https://api.venice.ai/api/v1` |

AISA is **removed** (no longer available).

## Media

| Stage | Provider |
| --- | --- |
| Stills / clips / VO / SFX | Runway (primary) → fal.ai (fallback) — see [`media_provider.py`](../apps/agent/src/media_provider.py) |
| Durable URL + provenance | B2 via Genblaze (optional) |
| Composition handoff | HyperFrames (default) or Remotion (React) — [`hyperframes.md`](./hyperframes.md) / [`remotion.md`](./remotion.md) |

Routing is server-side only: `DEVCUT_MEDIA_PROVIDER=auto|runway|fal`
(default `auto`: prefer Runway → fal → MOCK) and
`DEVCUT_MEDIA_FALLBACK=1` retries a failed call once via the other
provider. The UI only ever sees LIVE/MOCK — planner modernization ≠
media marketplace, and we never expose a model picker to end users.

```bash
FAL_KEY=…                          # fal.ai (fallback) — https://fal.ai/dashboard/keys
# FAL_IMAGE_MODEL=fal-ai/flux/schnell
# FAL_VIDEO_MODEL=fal-ai/kling-video/v2.1/master/image-to-video
DEVCUT_MEDIA_PROVIDER=auto         # auto | runway | fal
DEVCUT_MEDIA_FALLBACK=1            # 0 disables cross-provider retry
```

## Payments

| Meter | Where |
| --- | --- |
| DevCut jobs (`challenge_film`, …) | BFF x402 — [`x402.md`](./x402.md) |
| Venice inference (optional later) | Venice native x402 / wallet auth — not required for planner default |

## Agent ↔ UI foundation (LangGraph + CopilotKit)

Spine we keep:

- `create_agent` / `create_deep_agent` + `CopilotKitMiddleware`
- Shared storyboard state → canvas (`useAgent`)
- Backend tools mutate state via `Command(update=…)` → AG-UI `STATE_SNAPSHOT`

**UX bar** (conference / CopilotKit generative UI): users must **see the job as a run ledger**, not a black box.

| Surface | Job |
| --- | --- |
| Canvas | Artifacts (shots, player, export) |
| Chat / ledger | Process (unlock → plan → stills → clips → stitch) |
| Tool cards | One-line human status; payload collapsed |

Implemented: run ledger (`devcut-ledger.ts`) + **JobOutcomePanel** (Watch / Handoff / Share + kit.zip). Prefer controlled generative UI over open-ended HTML dumps. See [`hyperframes.md`](./hyperframes.md).

## Non-goals

- Multi-provider **marketplace** UI (model picker for end users)
- Replacing Runway with Venice/NVIDIA video as default
- BYOK LLM keys as the hero path (server keys + x402 jobs)

## Code

| File | Role |
| --- | --- |
| `apps/agent/src/llm_providers.py` | Chain factory + env defaults |
| `apps/agent/director.py` | Director graph |
| `apps/agent/src/runtime.py` | Leads graph |
| `apps/agent/src/fal_client.py` | fal.ai client (images + video queue) |
| `apps/agent/src/media_provider.py` | Runway→fal router (`DEVCUT_MEDIA_PROVIDER`) |
| `apps/agent/src/remotion_kit.py` | Remotion composition scaffold |
