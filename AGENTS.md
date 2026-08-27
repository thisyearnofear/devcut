# DevCut — Agent-Directed Hackathon Video

## Project Goal
**DevCut** is the x402-metered video desk for hackathons. Organizers commission Challenge Cuts (visual specs of winning work); builders enhance HyperFrames submissions into Devpost-ready cuts; founders/PMs commission Product Launch Cuts; agents pay per job.

North star: `docs/devcut-thesis.md`

Engine (unchanged): LangGraph agent → shot plan → Runway stills/clips → VO/SFX → stitch MP4 on a live storyboard canvas. Product shape is hackathon-only — not a general film studio. HyperFrames owns composition; DevCut feeds BRIEF + assets (see `docs/hyperframes.md`).

Built for the **Runway API Hackathon** lineage; now aimed at hackathon organizers + HyperFrames builders (+ Backblaze Generative Media / x402 tracks).

## Architecture
- **Frontend**: Next.js standalone (`apps/frontend/`) — DevCut landing + storyboard canvas at `/director`; WebMCP tools on `document.modelContext` expose the canvas to external agents (ADR-0004)
- **BFF**: Hono / CopilotKit runtime (`apps/bff/`) — proxies agent + intelligence + x402
- **Agent**: Python LangGraph (`apps/agent/`) — plans shots, calls Runway, assembles MP4s
- **Planner LLM**: NVIDIA (primary) → Venice → Gemini — see `docs/providers.md` (AISA removed)
- **MCP**: mcp-use server (`apps/mcp/`) — exposes agent to Claude / ChatGPT
- **Infrastructure**: Postgres, Redis, CopilotKit Intelligence (Docker containers)
- **Source**: https://github.com/thisyearnofear/devcut (renamed from gen-ui, Aug 2026)

## Server Infrastructure (nuncio-vultr)
- **Server**: nuncio-vultr (`144.202.117.160`), user `linuxuser`, 109GB disk
- **Project dir**: `/opt/gen-ui/` with `current` symlink → `releases/<timestamp>/`
- **PM2 processes**: `director-frontend` (3100), `director-bff` (4010), `director-agent` (8123), `director-mcp` (3011)
- **Docker infra**: `docker-compose.infra.yml` runs postgres (5433), redis (6381), intelligence (4203/4403)
- **Python agent venv**: `/opt/gen-ui/current/apps/agent/.venv/` (managed by `uv`, Python 3.12)
- **uv binary**: `/home/linuxuser/.local/bin/uv`
- **TLS/proxy**: Coolify Traefik — **primary** `devcut.thisyearnofear.com`, **legacy** `director.thisyearnofear.com` during cutover → `host.docker.internal:3100` (dynamic config under `/data/coolify/proxy/dynamic/`). Cutover checklist: `docs/ops-cutover.md`
- **UFW**: Docker subnet `10.0.0.0/8` allowed to ports 3100, 4010, 8123, 3011

## Commands
- **Dev**: `npm run dev` (frontend), `cd apps/bff && npm run dev` (BFF), `cd apps/agent && uv run langgraph dev` (agent)
- **Build**: `npm run build` (frontend), `cd apps/bff && npx tsc` (BFF), `cd apps/mcp && npx mcp-use build --no-typecheck` (MCP)
- **Deploy**: `bash scripts/deploy-local.sh` (selective restarts, drain gate, known-good rollback, import gate — targets nuncio-vultr). `FORCE_BUILD=1` forces a full rebuild (needed when build-time env flags like `NEXT_PUBLIC_AUTH_ENABLED` change). `FORCE_DEPLOY=1` skips the drain gate (interrupts in-flight runs).
- **Auth activation**: set `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` + `AUTH_SECRET` + `AUTH_TRUST_HOST=true` + `AUTH_URL=https://devcut.thisyearnofear.com` in `/opt/gen-ui/.env`, then `FORCE_BUILD=1 bash scripts/deploy-local.sh`. Verify: `curl /api/auth-probe`.
- **License renewal**: `npx copilotkit license create --write` (free Developer tier, expires every 30 days)

## CopilotKit Intelligence
- **Image**: `ghcr.io/copilotkit/intelligence/composite:0.2.0`
- **License**: Free Developer tier — expires every 30 days, renew with `npx copilotkit license create --write`
- **BAKED_LICENSE_KEYS_JSON**: Must be set in docker-compose env — the image ships without baked keys. Value: `{"kid-2026-03":"MCowBQYDK2VwAyEAEApX4iacGTrtqKX+5GGN6l0NuPkmrfDvJjRWVPGhIM0="}`
- **License renewal steps**: (1) run `npx copilotkit license create --write` locally, (2) copy new `COPILOTKIT_LICENSE_TOKEN` to `/opt/gen-ui/.env` on server, (3) `docker compose -f docker-compose.infra.yml restart intelligence`
- **Seed data**: Container seeds 3 demo orgs (casa-de-erlang, haus-von-haskell, cafe-du-caml) with API keys

## Key Decisions
- App services run via PM2 (not in Docker) — only infrastructure (postgres, redis, intelligence) runs in Docker
- Caddy was removed from the stack — Coolify's Traefik handles TLS/proxy on ports 80/443
- `docker-compose.infra.yml` is a custom infra-only compose (not the full `docker-compose.prod.yml`) with port mappings to localhost for PM2 services to connect
- MCP build uses `--no-typecheck` flag (mcp-use build fails on typecheck due to monorepo peer-dep resolution)
- `uv.lock` is not in the repo — generated locally with `uv lock` and uploaded to server during first deploy
- Deploy script uses `host.docker.internal` for Traefik routing (not `127.0.0.1`, which refers to the container itself)
- **Auth (ADR-0002)**: GitHub OAuth via Auth.js v5, env-gated. Anonymous browsing preserved; commissioning requires sign-in. Per-user threads/budgets/BYOK vault.
- **BYOK vault**: Runway keys encrypted at rest (AES-256-GCM) in Postgres `devcut_credentials` table; BFF decrypts at run time. Legacy `X-Runway-Api-Key` header kept as fallback.
- **B2 state snapshots**: agent writes `snapshots/<ui_thread_id>.json` to B2 after each mutating tool; BFF `/api/thread-state` falls back to them when LangGraph state is wiped (agent restart).
- **CopilotKit 1.66.0** + `@ag-ui/langgraph@0.0.42` (upgraded from 1.57.1 to fix the `configurable`+`context` 400 dual-send bug).
- **langgraph-api 0.11.2** (upgraded from EOL 0.8.7); `--n-jobs-per-worker 4` for concurrent runs.
- **ffmpeg** installed on nuncio-vultr for LIVE stitch mode (without it, stitches return the MOCK Big Buck Bunny placeholder).
- **WebMCP (ADR-0004)**: `/director` registers 5 tools on `document.modelContext` (read: `get_storyboard_state`/`get_export`; auth-gated mutating: `start_cutdown`/`regenerate_shot`/`cancel_run`). Start-don't-block semantics — agents poll state, tools never block on the minutes-long pipeline. Merged via PR #1 (2026-08-27).
- **Four doors / SKUs**: challenge_film, submission_polish, hero_shot_pack, product_launch ($1.50, founders/PMs). Doors: challenge/submit/product/agent ("Product Launch Cut" mode prompt in `storyboard_prompts.py` + x402 SKU in `apps/bff/src/x402/skus.ts`).
- **Deploy safety**: selective restarts (per-app fingerprinting), drain gate (inflight==0 before agent restart), known-good rollback (`.health-ok` marker), agent import gate, `node --check` config gate, pid-change verification with `delete+start` fallback.

## Important Files
- `scripts/deploy-local.sh`: Build + rsync deploy script (selective restarts, drain gate, import gate, known-good rollback)
- `scripts/dirhash.py`: Content-addressed per-app fingerprinting for selective restarts
- `ecosystem.config.js`: PM2 config for all 4 services (frontend, bff, agent, mcp); agent `--n-jobs-per-worker` env-tunable
- `apps/agent/src/main.py`: LangGraph agent entry point
- `apps/agent/src/state_snapshots.py`: B2 state snapshots (cross-restart canvas restore)
- `apps/agent/src/runway_client.py`: Runway API client + billing (`_billing_thread_id`, `_billing_subject`)
- `apps/agent/src/genblaze_bridge.py`: Genblaze Pipeline bridge (Runway image→video)
- `apps/bff/src/server.ts`: CopilotKit runtime BFF (BYOK injection, budget, resume ledger, cost alert, auth, vault, organizer)
- `apps/bff/src/auth.ts`: Auth.js v5 session-cookie JWE decode + ensure-user
- `apps/bff/src/vault.ts`: BYOK credential vault (AES-256-GCM, Postgres)
- `apps/bff/src/organizer.ts`: Org-scoped thread list for organizer dashboard
- `apps/bff/src/health.ts`: Liveness, readiness, WS URL rewrite, error rewriting
- `apps/frontend/src/auth.ts`: Auth.js v5 config (GitHub OAuth, env-gated)
- `apps/frontend/src/components/auth/AuthSessionProvider.tsx`: ALWAYS mounts SessionProvider (auth-off ⇒ `session={null}`, no fetch) — useSession crashes without it
- `apps/frontend/src/lib/webmcp/`: WebMCP integration — `controller.ts` (DirectorController singleton), `register-tools.ts` (5 canvas tools), `types.d.ts` (draft-spec typings; verify vs real runtime)
- `apps/frontend/src/app/organizer/`: Organizer dashboard (org-scoped thread list)
- `apps/mcp/src/index.ts`: MCP server with widget definitions
- `apps/frontend/`: Next.js app with storyboard canvas

## Ops Knowledge (August 2026)
- **WS topology**: browser → `wss://devcut.thisyearnofear.com/ws/client/websocket` → Traefik `PathPrefix(/ws)` + StripPrefix → Intelligence Phoenix gateway (4403) mounts `/client/websocket`. Phoenix JS appends `/websocket` to whatever base it's given; `PUBLIC_INTELLIGENCE_WS_URL` (ecosystem override for director-bff) must therefore end in `/ws/client`.
- **Twin-thread model (Intelligence mode)**: runs execute on an internal execution thread while the UI owns another id. Budget/billing keys: the BFF injects `ui_thread_id` and the agent bills THAT (`_billing_thread_id()` in runway_client.py), matching BFF budget checks.
- **langgraph runs in-memory**: restarts wipe all thread checkpoints. Restores survive via B2 snapshots (`snapshots/<thread>.json`, written by `state_snapshots.py` after each mutating tool) — BFF `/api/thread-state` falls back to them automatically.
- **Deploy safety**: `deploy-local.sh` does per-app fingerprinting (scripts/dirhash.py) → selective PM2 restarts only for changed services; agent restarts wait for `/readyz.inflight==0` (FORCE_DEPLOY=1 overrides); rollback restores the exact pre-deploy symlink target only if it carries `.health-ok`; agent `import main, director` is gated pre-ship; `node --check ecosystem.config.js` pre-rsync; per-service pid-change verification with `delete+start` fallback when `startOrReload` silently no-ops.
- **Diagnostic traps**: never `GET /` on the intelligence app-api (unhandled rejection → s6 restart masquerades as a crash loop); its Phoenix gateway 500s unmatched WS paths instead of 404; langgraph thread-culler 'permission denied' spam is non-fatal.
- **ffmpeg is required for stitcher LIVE mode** (installed on nuncio-vultr Aug 2026); without it stitches return the MOCK placeholder (Big Buck Bunny).
- **langgraph-api 0.11.2** (upgraded from EOL 0.8.7 on 2026-08-04); runtime-inmem 0.31.2; `--n-jobs-per-worker 4` (env `LANGGRAPH_JOBS_PER_WORKER`). Postgres checkpointer adopted 2026-08-05 (`--runtime-edition postgres`, ADR-0001).
- **Auth (ADR-0002)**: GitHub OAuth via Auth.js v5, env-gated. Anonymous browsing preserved; commissioning requires sign-in. Per-user threads/budgets/BYOK vault. `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`/`AUTH_SECRET`/`AUTH_TRUST_HOST`/`AUTH_URL` in `.env`.
- **BYOK vault**: Runway keys encrypted at rest (AES-256-GCM) in Postgres `devcut_credentials` table; BFF decrypts at run time. Legacy `X-Runway-Api-Key` header kept as fallback.
- **B2 state snapshots**: agent writes `snapshots/<ui_thread_id>.json` to B2 after each mutating tool; BFF `/api/thread-state` falls back to them when LangGraph state is wiped (agent restart).
- **CopilotKit 1.66.0** + `@ag-ui/langgraph@0.0.42` (upgraded from 1.57.1 to fix the `configurable`+`context` 400 dual-send bug).
- **Organizer dashboard** (`/organizer`): org-scoped thread list with B2-snapshot enrichment (ADR-0003 interim).
- **Deploy artifact pitfall**: `deploy-local.sh` decides "build needed" by *existence* of `apps/frontend/.next` + `apps/bff/dist` — stale artifacts from a previous build get shipped silently. After changing frontend/bff sources with artifacts present, delete them or run `FORCE_BUILD=1`. (Bitten 2026-08-27: a killed mid-build left a partial `.next` that skipped the build then failed the standalone check.)
- **Smoke-test false negative**: the deploy script's "Intelligence container" probe can report `n/a` while the container is healthy (verified 2026-08-27 ×2 via `docker ps` + port 4203). Don't treat it as a failed deploy; verify the container directly.
- **WebMCP live (2026-08-27)**: the 5 canvas tools ship in the `/director` client bundle on prod (verified: tool names present in served chunks; `modelContext` referenced). Runtime flag/in-app-browser behavior still unverified — playbook Phase 1 spike pending.
- **Long deploys**: run `deploy-local.sh` inside `screen -dmS` — plain background (`nohup … &`) gets reaped when the invoking shell ends, and a mid-build kill leaves partial artifacts (see pitfall above).

## Migration Notes (July 2026)
- Migrated from snel-bot (user `deploy`) to nuncio-vultr (user `linuxuser`)
- Port conflicts resolved: Coolify owns 80/443/8000, directors-canvas services use 3100/4010/8123/3011
- Postgres data started fresh (no migration from snel-bot)
- snel-bot cleanup: removed `/opt/gen-ui`, Docker containers, volumes, and nginx config
