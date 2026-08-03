# DevCut — Agent-Directed Hackathon Video

## Project Goal
**DevCut** is the x402-metered video desk for hackathons. Organizers commission Challenge Cuts (visual specs of winning work); builders enhance HyperFrames submissions into Devpost-ready cuts; agents pay per job.

North star: `docs/devcut-thesis.md`

Engine (unchanged): LangGraph agent → shot plan → Runway stills/clips → VO/SFX → stitch MP4 on a live storyboard canvas. Product shape is hackathon-only — not a general film studio. HyperFrames owns composition; DevCut feeds BRIEF + assets (see `docs/hyperframes.md`).

Built for the **Runway API Hackathon** lineage; now aimed at hackathon organizers + HyperFrames builders (+ Backblaze Generative Media / x402 tracks).

## Architecture
- **Frontend**: Next.js standalone (`apps/frontend/`) — DevCut landing + storyboard canvas at `/director`
- **BFF**: Hono / CopilotKit runtime (`apps/bff/`) — proxies agent + intelligence + x402
- **Agent**: Python LangGraph (`apps/agent/`) — plans shots, calls Runway, assembles MP4s
- **Planner LLM**: NVIDIA (primary) → Venice → Gemini — see `docs/providers.md` (AISA removed)
- **MCP**: mcp-use server (`apps/mcp/`) — exposes agent to Claude / ChatGPT
- **Infrastructure**: Postgres, Redis, CopilotKit Intelligence (Docker containers)
- **Source**: https://github.com/thisyearnofear/gen-ui

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
- **Deploy**: `bash scripts/deploy-local.sh` (build-local → rsync → server-side install → symlink flip → PM2 reload, targets nuncio-vultr)
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

## Important Files
- `scripts/deploy-local.sh`: Build + rsync deploy script (targets nuncio-vultr)
- `ecosystem.config.js`: PM2 config for all 4 services (frontend, bff, agent, mcp)
- `scripts/gen_ecosystem.py`: Generates ecosystem.config.js from .env
- `apps/agent/src/main.py`: LangGraph agent entry point
- `apps/bff/src/index.ts`: CopilotKit runtime BFF
- `apps/mcp/src/index.ts`: MCP server with widget definitions
- `apps/frontend/`: Next.js app with storyboard canvas

## Ops Knowledge (August 2026)
- **WS topology**: browser → `wss://devcut.thisyearnofear.com/ws/client/websocket` → Traefik `PathPrefix(/ws)` + StripPrefix → Intelligence Phoenix gateway (4403) mounts `/client/websocket`. Phoenix JS appends `/websocket` to whatever base it's given; `PUBLIC_INTELLIGENCE_WS_URL` (ecosystem override for director-bff) must therefore end in `/ws/client`.
- **Twin-thread model (Intelligence mode)**: runs execute on an internal execution thread while the UI owns another id. Budget/billing keys: the BFF injects `ui_thread_id` and the agent bills THAT (`_billing_thread_id()` in runway_client.py), matching BFF budget checks.
- **langgraph runs in-memory**: restarts wipe all thread checkpoints. Restores survive via B2 snapshots (`snapshots/<thread>.json`, written by `state_snapshots.py` after each mutating tool) — BFF `/api/thread-state` falls back to them automatically.
- **Deploy safety**: `deploy-local.sh` does per-app fingerprinting (scripts/dirhash.py) → selective PM2 restarts only for changed services; agent restarts wait for `/readyz.inflight==0` (FORCE_DEPLOY=1 overrides); rollback restores the exact pre-deploy symlink target only if it carries `.health-ok`; agent `import main, director` is gated pre-ship.
- **Diagnostic traps**: never `GET /` on the intelligence app-api (unhandled rejection → s6 restart masquerades as a crash loop); its Phoenix gateway 500s unmatched WS paths instead of 404; langgraph thread-culler 'permission denied' spam is non-fatal.
- **ffmpeg is required for stitcher LIVE mode** (installed on nuncio-vultr Aug 2026); without it stitches return the MOCK placeholder (Big Buck Bunny).
- **langgraph-api 0.8.7 is EOL** — upgrade tracked in `docs/adr/0001-agent-runtime.md`.

## Migration Notes (July 2026)
- Migrated from snel-bot (user `deploy`) to nuncio-vultr (user `linuxuser`)
- Port conflicts resolved: Coolify owns 80/443/8000, directors-canvas services use 3100/4010/8123/3011
- Postgres data started fresh (no migration from snel-bot)
- snel-bot cleanup: removed `/opt/gen-ui`, Docker containers, volumes, and nginx config
