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
- **Server**: nuncio-vultr (`144.202.117.160`), user `linuxuser`, 4 vCPU / 7 GB RAM / 150 GB disk. Connect with the `ssh nuncio-vultr` alias — it carries the IdentityFile; `ssh linuxuser@144.202.117.160` auth-rejects.
- **Project dir**: `/opt/gen-ui/` with `current` symlink → `releases/<timestamp>/`
- **PM2 processes**: `director-frontend` (3100), `director-bff` (4010), `director-agent` (8123), `director-mcp` (3011)
- **Docker infra**: `docker-compose.infra.yml` runs postgres (5433), redis (6381), intelligence (4203/4403) — all bound to `127.0.0.1` (plus `10.0.0.1:4403` for Traefik); the file lives **only** on nuncio-vultr, it is not tracked in git
- **Python agent venv**: `/opt/gen-ui/current/apps/agent/.venv/` (managed by `uv`, Python 3.12)
- **uv binary**: `/home/linuxuser/.local/bin/uv`
- **TLS/proxy**: Coolify Traefik → `host.docker.internal:3100` for `devcut.thisyearnofear.com` (dynamic config under `/data/coolify/proxy/dynamic/`). The legacy `director.thisyearnofear.com` host is **retired** — DNS removed 2026-08-01, NXDOMAIN. Cutover checklist: `docs/ops-cutover.md`
- **UFW**: Docker subnet `10.0.0.0/8` allowed to ports 3100, 4010, 8123, 3011
- **UFW does NOT gate Docker-published ports (fixed 2026-10-03)**: `docker-compose.infra.yml` used to map `"5433:5432"` etc. without an IP prefix, so Postgres 5433, Redis 6381 and Intelligence 4203/4403 answered from the public internet unauthenticated (proved: `PING` → `+PONG`). Now loopback-bound — except `10.0.0.1:4403`, which must stay published because Coolify Traefik reaches the WS gateway as `host.docker.internal` = **10.0.0.1**; a pure `127.0.0.1` bind there kills every websocket. A `DOCKER-USER` drop rule does NOT help: `docker-proxy` answers published ports in the INPUT path, so the rule counted 0 packets while Redis kept replying. Any new service added to that compose file inherits the trap. Recreating Redis also zeroes the Runway budget counters and `/cut` brief records — details in `docs/deployment.md`.

## Commands
- **Dev**: `npm run dev` (frontend), `cd apps/bff && npm run dev` (BFF), `cd apps/agent && uv run langgraph dev` (agent)
- **Build**: `npm run build` (frontend), `cd apps/bff && npx tsc` (BFF), `cd apps/mcp && npx mcp-use build --no-typecheck` (MCP)
- **Deploy**: `bash scripts/deploy-local.sh` (selective restarts, drain gate, known-good rollback, import gate — targets nuncio-vultr). `FORCE_BUILD=1` forces a full rebuild (needed when build-time env flags like `NEXT_PUBLIC_AUTH_ENABLED` change). `FORCE_DEPLOY=1` skips the drain gate (interrupts in-flight runs).
- **Auth activation**: set `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` + `AUTH_SECRET` + `AUTH_TRUST_HOST=true` + `AUTH_URL=https://devcut.thisyearnofear.com` in `/opt/gen-ui/.env`, then `FORCE_BUILD=1 bash scripts/deploy-local.sh`. Verify: `curl /api/auth-probe`.
- **License renewal**: `npx copilotkit license create --write` (free Developer tier, expires every 30 days)

## CopilotKit Intelligence
- **Image**: `ghcr.io/copilotkit/intelligence/composite:0.2.0` on prod (infra compose). Local dev infra (`deployment/docker-compose.yml`) still pins `0.1.0`, so "works locally, breaks on prod" around the Intelligence surface is a version question first.
- **License**: Free Developer tier — expires every 30 days, renew with `npx copilotkit license create --write`
- **BAKED_LICENSE_KEYS_JSON**: Must be set in docker-compose env — the image ships without baked keys. Value: `{"kid-2026-03":"MCowBQYDK2VwAyEAEApX4iacGTrtqKX+5GGN6l0NuPkmrfDvJjRWVPGhIM0="}`
- **License renewal steps**: (1) `npx copilotkit license create --print > /tmp/new_lic.txt` locally — browser sign-in (one-time code), then it asks which email the license belongs to. `--print` sends the token line to stdout instead of touching `./.env`; `--write` (what `npm run license` uses) writes it to the **local** `./.env`, which is not the server's. (2) Copy the token into `/opt/gen-ui/.env` on the server as `COPILOTKIT_LICENSE_TOKEN`, (3) `docker compose -f docker-compose.infra.yml up -d intelligence` — **`restart` is not enough**: it reuses the existing container, so the env interpolated from `.env` stays the old (expired) token. Verify the container actually holds the new one (`docker inspect -f "{{json .Config.Env}}" intelligence`) before believing the renewal worked. (4) Confirm `licenseValid":true` in the container logs. (5) **`cd /opt/gen-ui && pm2 startOrReload ecosystem.config.js --only director-bff`** — the banner the browser shows is decided by the **BFF's** copy of the token (`server.ts:237` → the runtime info response the frontend reads `licenseStatus` from), and PM2 froze each process's env at start. Steps 1–4 alone leave a valid container next to a still-expired banner: this is exactly how prod sat from 2026-09-02 to 2026-10-03, all four PM2 processes holding the lapsed token while the container was fine. Check the process env, not just the container: `sudo tr '\0' '\n' < /proc/$(pm2 pid director-bff)/environ | grep COPILOTKIT_LICENSE_TOKEN | cut -d. -f2 | base64 -d`.
- **Current license**: issued 2026-10-03 to `papaandthejimjams@gmail.com` (org "Papa's organization"), expires **2026-11-02**, tier free, `kid-2026-03` (same key id across renewals → `BAKED_LICENSE_KEYS_JSON` unchanged). Prior license belonged to `ungethe@gmail.com`.
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
- **Four doors / six SKUs**: challenge_film, submission_polish, hero_shot_pack, product_launch ($1.50, founders/PMs), variant_pack ($1, builder platform cuts), recap_reel ($4, organizer recap) (ADR-0005). Doors: challenge/submit/product/agent ("Product Launch Cut" + "Variant Pack" mode prompts in `storyboard_prompts.py` + x402 SKUs in `apps/bff/src/x402/skus.ts`).
- **Variant pack (ADR-0005)**: `cut_variant_pack` agent tool + plan-driven `stitch_plan()` in the stitcher — judge 16:9 / customer 1:1 captions / teaser 9:16 ≤15s, re-stitch only (zero Runway generation by default). Captions degrade libass → drawtext → SRT sidecar; never fail a paid job. `variants` + `brand_kit` in canvas state + B2 snapshots.
- **Hackathon graph + recap (ADR-0005)**: Postgres `devcut_thread_links` (submission → `hackathon_thread_id`, org-scoped) written via `POST /api/thread-links` when a `&hackathon=` run settles on the canvas; organizer dashboard groups entries per event. `recap_reel` SKU ($4, auth-gated `POST /api/organizer/recap` → `fulfillPaidJob`) validates same-org + ready threads, then agent tool `generate_recap` cross-reads B2 snapshots and `build_recap_plan` + `stitch_plan` deliver a 60–90s silent reel — re-stitch only.
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
- `apps/bff/src/organizer.ts`: Org-scoped thread list for organizer dashboard; recap-request validation
- `apps/bff/src/thread-links.ts`: Hackathon graph edges (`devcut_thread_links` Postgres table, ADR-0005)
- `apps/agent/src/variant_plan.py`: Variant/recap plan builders — reframe/caption/overlay plans + ASS/SRT writers
- `apps/agent/src/recap_sources.py`: Cross-thread B2 snapshot reads for recap reels
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
- **WebMCP live + spike-verified (2026-08-27 → 2026-10-03)**: the 5 canvas tools ship in the `/director` client bundle — proven on prod by fetching `/_next/static/chunks/0b5sytof3fq0r.js` (contains `document.modelContext` + all five tool names), **not** by loading prod in a flagged browser. Chrome 154 behind `chrome://flags/#enable-webmcp-testing` (needs a **full browser restart**, in-page Relaunch doesn't apply under `--headless=new`; and the flag cannot be re-enabled by script — `flags-select` isn't a native `<select>` and a hand-written `enabled_labs_experiments` key is ignored): `document.modelContext` = `registerTool/getTools/executeTool/unregisterTool/ontoolchange`; **`executeTool(registeredToolObject, jsonString)`** — a tool *name* or an object arg throws; no COOP/COEP needed. All runtime observations are from the **local dev build** (`localhost:3010`).
- **Expired CopilotKit license → license banner + entitlement culler**: when the Developer-tier token lapses, intelligence logs `licenseValid:false, licenseError:"expired"` and the `/director` UI shows a license-expired banner. Renew per "License renewal steps" above — `restart` will NOT apply the new token, and `up -d intelligence` alone is still not enough (step 5): the banner comes from `licenseStatus` in the BFF's runtime-info response, so a valid container next to a stale PM2 env keeps the banner up — observed 2026-09-02 → 2026-10-03. **Unproven**: that the culler actually wiped our LangGraph checkpoints — post-renewal logs show `Found threads over cutoff: 10` then `culled:0, skipped:10` with `permission denied for table threads`, so the culler cannot delete anything on this stack. The wiped-state threads (2026-10-03) came from a separate cause (likely an agent restart / retention elsewhere) and are still restored by the B2 snapshot path.
- **Re-stitch tools survive a wiped checkpoint**: `cut_variant_pack` / `stitch_final_cut` call `_state_or_snapshot()` (reads the thread's own `snapshots/<tid>.json`) and write the recovered keys back; such a publish is flagged `partial` so `state_snapshots._inherit_prior()` re-reads the prior object and keeps keys the run never saw (`final_video_url`, `export_status`, `builder_kit`). Losing `export_status` makes a thread recap-ineligible.
- **ASS caption arity**: `variant_plan.ASS_EVENT_FORMAT` (10 fields) is the single declaration paired with `ass_event()`; any writer of `Dialogue:` must use both. A short `Format:` line makes libass render the margin/effect commas as text (shipped once: ",0,0,0,,Problem").
- **Long deploys**: run `deploy-local.sh` inside `screen -dmS` — plain background (`nohup … &`) gets reaped when the invoking shell ends, and a mid-build kill leaves partial artifacts (see pitfall above).

## Migration Notes (July 2026)
- Migrated from snel-bot (user `deploy`) to nuncio-vultr (user `linuxuser`)
- Port conflicts resolved: Coolify owns 80/443/8000, directors-canvas services use 3100/4010/8123/3011
- Postgres data started fresh (no migration from snel-bot)
- snel-bot cleanup: removed `/opt/gen-ui`, Docker containers, volumes, and nginx config
