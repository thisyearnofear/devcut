# Troubleshooting

`npm run dev` runs `scripts/check-env.sh` before anything boots — most of the problems below are caught there with the exact fix in the output. The table maps every known failure mode to its fix; entries below it are the older expanded explanations.

| Symptom | Cause | Fix |
|---|---|---|
| `npm run dev` aborts with "Docker isn't running" | Docker Desktop not started | Start Docker Desktop and re-run. The pre-flight retries automatically. |
| Pre-flight prints no planner API key | None of `NVIDIA_API_KEY` / `VENICE_API_KEY` / `GEMINI_API_KEY` set | Primary: https://build.nvidia.com · fallbacks: Venice + Gemini — see [`providers.md`](./providers.md). |
| Pre-flight prints "NOTION_TOKEN is unset" | Notion token not pasted | Create an integration at [notion.so/profile/integrations/internal](https://www.notion.so/profile/integrations/internal) and paste the Internal Integration Token into `apps/agent/.env`. |
| Chat replies with a setup pointer, no tools | All planner keys missing/stub → noop graph | Set at least `NVIDIA_API_KEY` (or a fallback) and restart the agent. |
| Toast: "Run `npm run seed` to seed the default user" | Postgres `default` / `1_default` user not seeded | Run `npm run seed`. The BFF rewrites the upstream `threads_user_id_fkey` 500 into this hint automatically. |
| Notion health check returns "0 rows" or "shared with this integration" | Database not shared with your integration | Open the database in Notion → `...` menu → **Connections** → **+ Add connection** → pick your integration **directly** (not via parent-page inheritance — that's the most common gotcha). |
| `Could not find database with ID …` | Wrong `NOTION_LEADS_DATABASE_ID` *or* not shared | Both — verify by running `cd apps/agent && uv run python -m src.notion_tools --check`. The output names which one is wrong. |
| `Failed to initialize thread` (raw error, no hint) | BFF couldn't reach Intelligence at all | `docker compose ps` should show `intelligence`, `postgres`, `redis` healthy; if not, `npm run dev:infra:down && npm run dev:infra`. |
| Empty canvas, no errors anywhere | Agent booted without the integration prompt | Restart the agent (`npm run dev:agent`). The boot log should print `[notion_health_check] db="…" rows=50 …`. |
| Director canvas stays in initial state for ~40 s then resets, no console errors | `useAgent()` was called without `{ agentId: "director" }` so the **leads** agent ran on the director route | Pass `{ agentId: "director" }` to **every** `useAgent()` call on `/director` (see `apps/frontend/src/app/director/page.tsx`). The default `agentId` is `"default"` (the leads graph), which never emits storyboard updates. |
| Director chat: "An internal error occurred" at event seq ≈ 20 on every fresh run (LIVE only) | `langgraph dev`'s blockbuster middleware trapped a sync `os.access` call inside `before_agent` (via `shutil.which("ffmpeg")`) | Already fixed: `apps/agent/src/stitcher.py` caches `_FFMPEG_AVAILABLE` at module-import time. If you reintroduce a sync syscall in a middleware hook, blockbuster will surface it the same way — cache the result at import or wrap in `asyncio.to_thread`. |
| Production chat throws `First event must be 'RUN_STARTED'` after deploy | The Intelligence runner publishes `RUN_STARTED` to the ingestion channel before the browser joins `thread:${id}`; without `last_seen_event_id` in the run-mode channel join, that event is lost | Ensure `scripts/patches/fix-ag-ui-langgraph-configurable-context.sh` ran during the deploy (see deploy log for `[patch] @copilotkit/core run-mode replay patched`). Patch 4 is the real fix — it requests an event replay so `RUN_STARTED` always arrives first. |
| Patched node_modules code does not appear in production after deploy | Next.js standalone build re-used the cached chunk from before patches ran, or the patch ran against the wrong `node_modules` (workspace hoisting) | `scripts/deploy.sh` now runs patches against `./node_modules`, `apps/frontend/node_modules`, and `apps/bff/node_modules` **before** the frontend build, and `rm -rf apps/frontend/.next` before `next build`. If you build by hand, do the same. |
| `[patch] WARNING: @ag-ui/langgraph is v0.0.X (expected v0.0.31)` | The package was upgraded; the bundle layout may have changed | Re-read `scripts/patches/fix-ag-ui-langgraph-configurable-context.sh`, verify each pattern still exists in the new bundle, then bump `EXPECTED_VERSION`. Don't blindly re-run sed on a new minified bundle. |
| `deploy.sh` warns `BFF: 503 / Agent: 000` immediately after deploy but the site works | Health check sleep (3 s) is shorter than the agent's `uv` Python boot time | Re-run `pm2 list` after ~15 s — services should be `online`. Bump the `sleep` in `scripts/deploy.sh` if the noise is bothersome. |
| Production canvas spams `HTTP 409: Thread lock denied` + browser shows `ERR_INSUFFICIENT_RESOURCES` and `/api/copilotkit/info` 404s | The agent process restarted mid-run (typically because `langgraph dev` hot-reloaded on a `__pycache__` touch) and Intelligence's thread lock was never released. CopilotKit then retries `/run` in a tight loop, exhausting browser sockets and racing the BFF's `/info` endpoint. | Two parts: **(a)** prevent the cause — `ecosystem.config.js` must run the agent with `--no-reload` (`uv run langgraph dev --no-reload …`). Without it, watchfiles will reload on any file change in `apps/agent/`. **(b)** recover the locked thread — start a new conversation (sidebar → +). The BFF already maps `AgentThreadLockedError` to a "new-thread" toast. The lock can only be cleared from outside by restarting the Intelligence container (loses all in-flight runs). |

<details>
<summary><strong>Threads don't persist across reloads</strong></summary>

Intelligence isn't running. Check:
- Docker is running.
- `docker compose ps` shows `intelligence`, `postgres`, `redis` healthy.
- `COPILOTKIT_LICENSE_TOKEN` is set in `.env`.
- The runtime route includes `intelligence: new CopilotKitIntelligence({...})`.

</details>

<details>
<summary><strong>Planner quota / auth errors</strong></summary>

The director uses NVIDIA → Venice → Gemini (`with_fallbacks`). A 401/429 on NVIDIA should fall through if Venice/Gemini keys are set. To force a provider, set `AGENT_RUNTIME=venice-react` or `gemini-flash-react`. Model ids: `NVIDIA_MODEL`, `VENICE_MODEL`, `GEMINI_MODEL` — see [`providers.md`](./providers.md).

</details>

<details>
<summary><strong>Agent says "I'm having trouble connecting to my tools"</strong></summary>

1. Is the agent running? Check the `agent` log line in your terminal — it should print `Application startup complete` and bind to `:8133`.
2. Is `GEMINI_API_KEY` set in `apps/agent/.env`?
3. Run `cd apps/agent && uv run langgraph dev --port 8133` directly to see the actual error.

</details>

<details>
<summary><strong>Notion import returns 0 rows or "unauthorized"</strong></summary>

1. Verify `NOTION_TOKEN` is set in `apps/agent/.env` and starts with `secret_` or `ntn_`. Get one at [notion.so/profile/integrations/internal](https://www.notion.so/profile/integrations/internal).
2. **Share the database with your integration.** This is the most common point of failure — Notion's per-database access model means a fresh integration token sees zero databases until they're explicitly shared with it. In the database in Notion: `...` menu → **Connections** → add your integration.
3. Verify `NOTION_LEADS_DATABASE_ID` matches the database (paste it from the Notion URL, hyphens optional).
4. From `apps/agent/`, run `uv run python -c "from src.notion_integration import health_check; import json; print(json.dumps(health_check(), indent=2))"` to see the failure verbatim.

</details>

<details>
<summary><strong>Manufact tunnel won't bind</strong></summary>

The `--tunnel` flag needs network egress. If you're on a VPN or restrictive corporate network, deploy instead: `npm run -w mcp deploy`.

</details>

<details>
<summary><strong>Port already in use</strong></summary>

```bash
lsof -ti:3010 | xargs kill -9   # frontend (Next.js)
lsof -ti:4010 | xargs kill -9   # BFF (Hono runtime; BFF_URL / PORT in .env)
lsof -ti:8133 | xargs kill -9   # agent (langgraph dev)
lsof -ti:3011 | xargs kill -9   # mcp
lsof -ti:4213 | xargs kill -9   # intelligence app-api (APP_API_HOST_PORT in .env)
lsof -ti:4413 | xargs kill -9   # intelligence realtime gateway (REALTIME_GATEWAY_HOST_PORT)
lsof -ti:5436 | xargs kill -9   # postgres (POSTGRES_HOST_PORT)
lsof -ti:6382 | xargs kill -9   # redis (REDIS_HOST_PORT)
```

</details>

<details>
<summary><strong>Intelligence container failed to start</strong></summary>

```bash
docker compose logs intelligence
```

Most common causes: license token missing/invalid, port collision on `:4213` / `:4413` / `:5436` / `:6382` (or whatever you set in `.env`), or Postgres failed to initialize. Try `npm run dev:infra:down` then `npm run dev:infra`.

</details>

<details>
<summary><strong>Python import errors after install</strong></summary>

```bash
cd apps/agent
rm -rf .venv
uv venv
uv sync
```

</details>
