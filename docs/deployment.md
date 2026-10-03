# Deploying to a Linux VPS

Build locally, deploy lightweight artifacts to the server via rsync. The four
**app services** (frontend, BFF, agent, MCP) run under PM2; the **infrastructure**
(Postgres, Redis, CopilotKit Intelligence) runs in Docker under
`docker-compose.infra.yml`. Both are required — the BFF cannot reach Intelligence
or the BYOK vault without them.

The production host is **nuncio-vultr** (`144.202.117.160`, user `linuxuser`,
`ssh nuncio-vultr` — the Host alias carries the identity file; the raw IP
auth-rejects). TLS/proxy is **Coolify's Traefik** on 80/443; there is no Nginx or
Caddy in this stack (Caddy was removed).

## Architecture

```
Local machine                  Vultr server (nuncio-vultr)
┌─────────────┐   rsync       /opt/gen-ui/
│ npm run build├──────────▶   ├── .env              (real file)
│ BFF tsc      │              ├── current -> releases/<ts>/
│ mcp-use build│              │   ├── apps/frontend  (Next.js standalone)
│              │              │   ├── apps/bff        (Hono + 5 prod deps)
│              │              │   ├── apps/mcp        (mcp-use widgets + node_modules)
│              │              │   └── apps/agent      (src + .venv via uv sync)
│              │              ├── releases/           (keep last 3)
│              │              └── logs/               (PM2 logs, shared)
└─────────────┘               PM2: frontend :3100, BFF :4010, agent :8123, MCP :3011

Docker (docker-compose.infra.yml, same .env):
  postgres     :5433 → localhost   (langgraph checkpoints + devcut_* tables)
  redis        :6381 → localhost   (budget counters, run state)
  intelligence :4203 / :4403       (CopilotKit app-api + WS gateway)
Coolify Traefik: 80/443 → host.docker.internal:3100 (devcut.thisyearnofear.com)
```

## Prerequisites on the server

```bash
# Node.js 22+ (for PM2 and services)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# PM2
npm install -g pm2
pm2 startup   # follow the printed instructions

# uv (Python package manager, for the agent)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Docker + compose plugin — REQUIRED for the infra stack (postgres, redis, intelligence)
# rsync (usually pre-installed)
sudo apt install -y rsync docker-compose-plugin

# ffmpeg — REQUIRED for LIVE stitch mode. Without it every stitch silently
# returns the MOCK Big Buck Bunny placeholder instead of the real cut.
sudo apt install -y ffmpeg
# ADR-0005 captions need libass + drawtext in that build — check before
# enabling a variant_pack/recap_reel rendition, and install a full build if not:
ffmpeg -filters 2>/dev/null | grep -E 'subtitles|drawtext'
```

`ffmpeg -filters` printing both filters is the deploy gate for captioned
renditions. If a filter is missing the code degrades to an SRT sidecar rather
than failing the paid job — so the job still ships, just without burned-in
captions. (Prod verified 2026-10-03: ffmpeg 6.1.1, both filters present.)

## 1. Set up SSH access

```bash
# On your local machine — add to ~/.ssh/config
Host nuncio-vultr
    HostName <server-ip>
    HostName 144.202.117.160
    User linuxuser
    IdentityFile ~/.ssh/nuncio_vultr

# Copy the .env to the server (one-time)
scp .env nuncio-vultr:/opt/gen-ui/.env
```

The `.env` file lives at `/opt/gen-ui/.env` on the server. Each release
symlinks to it — never shipped in the artifact.

## 2. Deploy

```bash
# From the project root on your local machine
bash scripts/deploy-local.sh
```

This single command:

1. **Builds** frontend (.next), BFF (tsc), and MCP (mcp-use build) locally
2. **Creates a release** with only runtime artifacts (~570 MB)
3. **Rsyncs** to the server (`/opt/gen-ui/releases/<timestamp>/`)
4. **Installs** BFF production deps (5 packages, ~5 MB), agent Python deps (uv sync)
5. **Symlinks** `.env` at both `release/.env` and `release/apps/agent/.env`
6. **Flips** `current/` symlink to the new release
7. **Reloads** PM2 (`pm2 startOrReload ecosystem.config.js --update-env`)
8. **Health checks** all 4 services (Frontend, BFF, Agent, MCP) with retries
9. **Rolls back** automatically if any health check fails
10. **Prunes** old releases (keeps 3)
11. **Cleans** old monorepo artifacts on first deploy

## 3. Verify

```bash
# SSH to the server
ssh nuncio-vultr

# Check all services are up
pm2 list

# Check health endpoints
curl http://localhost:3100/      # Frontend
curl http://localhost:4010/health # BFF (returns service status JSON)
curl http://localhost:8123/ok    # Agent (LangGraph)
curl http://localhost:3011/mcp   # MCP server

# Check disk usage
df -h /opt/gen-ui
```

## Production ports

| Service | Port | Notes |
| --- | --- | --- |
| Frontend (Next.js standalone) | 3100 | Internal only — Coolify Traefik routes here over 443 |
| BFF (CopilotKit runtime) | 4010 | Internal only — frontend proxies to it |
| Agent (LangGraph) | 8123 | Internal only — BFF connects to it |
| MCP (mcp-use widgets) | 3011 | Internal only — BFF connects to it |

## Environment variables

The server reads all secrets from `/opt/gen-ui/.env`. Key variables:

| Variable | Where to get it |
| --- | --- |
| `DOMAIN` | Your domain — prod is `devcut.thisyearnofear.com` (`/director` is the canvas path) |
| `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com) — **primary planner**; `GEMINI_API_KEY` below is only the 3rd fallback |
| `VENICE_API_KEY` / `GEMINI_API_KEY` | Optional planner fallbacks — see [`providers.md`](./providers.md) |
| `RUNWAY_API_KEY` | [dev.runwayml.com](https://dev.runwayml.com) → leave blank for MOCK mode |
| `GENBLAZE_ENABLED` | `1` to route video through Genblaze Pipeline + persist to B2 |
| `GENBLAZE_AGENT_LOOP` | `1` (default) AgentLoop quality gate on Winning artifact beat |
| `B2_KEY_ID` / `B2_APP_KEY` | [B2 Application Keys](https://secure.backblaze.com/app_keys.htm) (not master key) |
| `B2_BUCKET` / `B2_REGION` | Public bucket name + region from endpoint (prod: `devcut-media`, `us-east-005`) |
| `B2_PUBLIC_URL_BASE` | Friendly public base for durable `<video src>` URLs |
| `B2_REQUIRE_DURABLE` | `1` for demo/golden — fail loudly if B2 upload fails |
| `B2_AUTO_LIFECYCLE` | `1` apply Genblaze lifecycle defaults |
| `B2_MANIFEST_LOCK_DAYS` | Object Lock GOVERNANCE days on manifests (`0` = off) |
| `DISCORD_WEBHOOK_URL` | Optional: B2 Event Notifications → `/api/b2-events` → Discord |
| `COPILOTKIT_LICENSE_TOKEN` | `npm run license` locally, copy the token. **Expires every 30 days** — renew before the UI starts showing the license banner, and apply it with `up -d`, not `restart`. `up -d` only reaches the intelligence container: the **BFF** is the process that answers the frontend's license check (`apps/bff/src/server.ts:237`), so also `pm2 startOrReload ecosystem.config.js --only director-bff` or the banner stays up on a valid container |
| `BAKED_LICENSE_KEYS_JSON` | Infra-compose env only — the composite image ships without baked keys (value in `AGENTS.md`) |
| `INTELLIGENCE_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_RUNNER_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_SECRET_KEY_BASE` | `openssl rand -base64 64` |
| `PUBLIC_INTELLIGENCE_WS_URL` | Must end in `/ws/client` — Phoenix appends `/websocket` to whatever base it gets (WS topology in `AGENTS.md`) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` / `AUTH_SECRET` / `AUTH_TRUST_HOST` / `AUTH_URL` | Auth.js v5 (ADR-0002). **Server-runtime** env, read by the BFF, `/api/auth/*` and `auth()`. A laptop rebuild never sees these (`deploy-local.sh` forwards only the build machine's `^NEXT_PUBLIC_` lines), so they cannot activate the client UI |
| `NEXT_PUBLIC_AUTH_ENABLED` | **Build-machine** `.env`, not the server's — `1` renders the sign-in button, the API-key panel and the composer's auth gate in the client bundles. Since 2026-10-04 `next.config.ts` lets this explicit value win over its own `AUTH_*` derivation; before that the config recomputed it from `AUTH_*` and silently reset it to `""` on every laptop build. Public flag, safe to commit-less: it reveals nothing, the real check stays server-side |
| `DATABASE_URI` | `postgresql://…@localhost:5433/langgraph_app` — **read by nothing in `apps/`** (measured 2026-10-03: `langgraph_app` has 0 tables; the agent runs on the in-memory checkpointer per ADR-0001). Kept in `.env` only so old scripts don't break |
| `POSTGRES_PASSWORD` | **Required** — `docker-compose.infra.yml` interpolates it with no default, so `up -d` fails or ships an empty password if it is missing. This is the one authority on the DB credential; it is not in this repository (rotated out of the repo 2026-10-03) |
| `INTELLIGENCE_PG_URL` | The DSN the **BFF** uses for the BYOK vault, organizer thread list, hackathon thread links and lazy user seeding (`apps/bff/src/pg-url.ts`, one constant shared by four modules). Prod MUST set it — the code fallback is a local-dev DSN on `localhost:5433` |
| `RUNWAY_JOBS_DSN` | The DSN the **agent** uses for `public.runway_jobs` (job ledger / resume-after-restart) |
| `X402_MODE` / `X402_PAY_TO` / `X402_NETWORK` / `X402_UNLOCK_SECRET` / `FACILITATOR_URL` | x402 job meter. Prod runs `demo` on Base testnet (`eip155:84532`) — see [`x402.md`](./x402.md) |
| `STITCH_MODE` | `mock` returns the Big Buck Bunny placeholder; live stitching requires ffmpeg |
| `LANGGRAPH_JOBS_PER_WORKER` | `4` on prod (concurrent runs per worker) |

## Database credentials

Single login role (`intelligence`), two live databases: `intelligence_app` holds CopilotKit
Intelligence's `cpki.*` schema plus `public.runway_jobs`, and that is also where the BFF's
`devcut_credentials` / `devcut_thread_links` tables self-create. `postgres` and
`langgraph_app` are effectively unused.

Auth is `scram-sha-256` for anything arriving over the network, but `pg_hba.conf` inside the
container grants **`trust` to `127.0.0.1/32`** (the postgres image default). So:

```bash
# MEANINGLESS — loopback inside the container is trust, the password is never checked
docker exec directors-canvas-prod-postgres-1 psql "postgresql://intelligence:anything@127.0.0.1:5432/intelligence_app" -c "select 1"

# MEANINGFUL — the path the BFF/agent actually take (published port → bridge IP → scram)
PGPASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' /opt/gen-ui/.env | cut -d= -f2-)" \
  psql -h 127.0.0.1 -p 5433 -U intelligence -d intelligence_app -Atc "select current_user"
```

A credential probe that "passes" via the first form passes whether or not the password is
correct — that false positive rolled back a healthy rotation on 2026-10-03 before the real
test was written.

**Rotating** (what was done 2026-10-03; ~15 s of new-connection failures, run at
`inflight:0`): set `POSTGRES_PASSWORD` + `INTELLIGENCE_PG_URL` + `RUNWAY_JOBS_DSN` +
`DATABASE_URI` in `/opt/gen-ui/.env` (0600), `ALTER USER intelligence WITH PASSWORD …` via
`docker exec` (the only path that still works if you lock yourself out — socket auth is
`trust`), `docker compose -f docker-compose.infra.yml up -d`, then
`pm2 startOrReload ecosystem.config.js --only director-bff` and the same for
`director-agent`. `POSTGRES_PASSWORD` in the compose is only read at `initdb`; on an
already-initialised volume `ALTER USER` is the authority. Keep the `.env` + compose backups
the run produced (`/opt/gen-ui/.env.bak-rot-*`).

### Open since the rotation (measured 2026-10-03)

- **`devcut_credentials` and `devcut_thread_links` do not exist on the prod database.** Both
  self-create on first write, so the BYOK vault and the ADR-0005 hackathon graph have never
  actually run against prod. Not a bug — an untested path.
- **The agent's `public.runway_jobs` ledger has never written (0 rows).** Root cause was
  `runway_jobs.py` importing **psycopg2** while `pyproject.toml` declares **psycopg v3**
  (`psycopg[binary]>=3.2.0`, and 3.3.4 confirmed importable in the prod agent venv). The
  ImportError was swallowed by the module's own try/except, so every write was silently skipped
  rather than raising. Fixed in `runway_jobs.py:_load_driver()` (prefer psycopg v3, psycopg2 as
  fallback). Verify on prod with:

  ```bash
  sudo docker exec directors-canvas-prod-postgres-1 psql -U intelligence -d intelligence_app \
    -Atc "select count(*) from public.runway_jobs"   # >0 after the next real run
  ```

  No dependency change and no venv touch was needed — the driver was installed all along.

## Firewall rules

DevCut only needs these three inbound:

| Protocol | Port | Source |
| --- | --- | --- |
| TCP | 22 | Your IP (SSH) |
| TCP | 80 | Any (HTTP→HTTPS redirect) |
| TCP | 443 | Any (HTTPS — Coolify Traefik terminates TLS here) |

Internal service ports (3100, 4010, 8123, 3011) are not for the public internet;
Traefik reaches the frontend via `host.docker.internal:3100`. UFW allows the Docker
subnet `10.0.0.0/8` to those four ports so containers can reach the PM2 services.

Infra ports (postgres 5433, redis 6381, intelligence 4203/4403) are bound to `127.0.0.1` in
`docker-compose.infra.yml` — **as of 2026-10-03**; before that the sentence in this paragraph was
a claim, not a fact (see below), and 4403 additionally answers on `10.0.0.1` for Traefik.

### Fixed 2026-10-03: UFW does not gate Docker-published ports

`docker-compose.infra.yml` published the infra ports as `"5433:5432"` etc. (no
`127.0.0.1:` prefix, so they bind `0.0.0.0`), and UFW has **no** rule for
5433 / 6381 / 4203 / 4403. All four answered from outside — proved, not inferred:
an unauthenticated `PING` from a laptop returned `+PONG` on 6381. That meant
Postgres (holding `devcut_credentials`, the BYOK vault), Redis (budget counters and
run state) and the Intelligence gateway were open to the internet with no auth at
the transport layer. Any older doc saying "infra ports are bound to localhost only"
was false.

**Why the obvious mitigations don't work.** `docker-proxy` binds the published port
on the host and completes the TCP handshake in the **INPUT** path, so a
`DOCKER-USER`/FORWARD drop rule is simply never consulted — one was added, counted
`0 packets`, and Redis kept replying `+PONG`. UFW's own `deny (incoming)` rule for
the port failed to gate it for the same reason. Only narrowing the binding fixes it.
The same trap applies to any service added to that compose file.

**One binding must stay reachable from the Docker bridge.** Coolify's Traefik reaches
the Intelligence WS gateway via `/data/coolify/proxy/dynamic/director.yaml` →
`http://host.docker.internal:4403`, and inside `coolify-proxy` that name resolves to
**10.0.0.1** (the bridge gateway), not 127.0.0.1. A pure loopback bind on 4403 would
have broken every websocket. Applied mapping (backup
`docker-compose.infra.yml.bak-20261003_190630`):

```yaml
- "127.0.0.1:5433:5432"
- "127.0.0.1:6381:6379"
- "127.0.0.1:4203:4201"
- "127.0.0.1:4403:4401"
- "10.0.0.1:4403:4401"   # Traefik → WS gateway (host.docker.internal = 10.0.0.1)
```

Applied behind a drain check (`GET :4010/readyz` → `inflight:0`) then
`docker compose -f docker-compose.infra.yml up -d`, which recreates the containers.

Verified after the change:
- `ss -ltn` — the four ports appear only on `127.0.0.1` (plus `10.0.0.1:4403`).
- External TCP probes to 5433 / 6381 / 4203 / 4403 from a laptop all time out.
- Host → `127.0.0.1:6381` `PING` → `+PONG`; `/readyz` healthy (mcp/agent `ok`);
  `/director` HTTP 200; intelligence logs `licenseValid":true` and a
  `CONNECTED TO RealtimeGateway.Client.Socket … Transport: :websocket`.
- `docker exec coolify-proxy wget http://host.docker.internal:4403/client/websocket`
  → HTTP 403 (upstream reachable, same semantics as before).

**Collateral damage to expect from a recreate.** Redis is the store for the per-user/thread
Runway budget counters (`runway:budget:<user>:<thread>`, 7-day TTL), the 48h cost-alert
counters, and the `/cut` brief records (`devcut:brief:<hash>`, 7-day TTL) — all wiped with
the container, so a thread that had spent 18 of its 20 Runway calls is back at 0, and any
`/cut/<hash>` short link only in Redis is gone. None of it is mirrored in Postgres.
The recreate also produced ~2 min of `ECONNREFUSED 127.0.0.1:6381` in `logs/bff-error.log`
while Redis was down — transient, gone after the BFF came back.

**This hardening is now in git — it wasn't when it happened.** The prod infra definition is
tracked as [`docker-compose.infra.yml`](../docker-compose.infra.yml) (repo root, mirroring its
server path `/opt/gen-ui/docker-compose.infra.yml`). Until 2026-10-03 that file existed **only**
on the server, so no clone could reproduce prod and provisioning from either tracked compose file
reintroduced the wide bindings. Nothing deploys the repo copy — **you must push it and `up -d`
it yourself**:

```bash
scp docker-compose.infra.yml nuncio-vultr:/opt/gen-ui/docker-compose.infra.yml
ssh nuncio-vultr 'curl -s localhost:4010/readyz'          # require "inflight":0 first
ssh nuncio-vultr 'cd /opt/gen-ui && sudo docker compose -f docker-compose.infra.yml up -d'
```

The repo copy and the server copy must stay in sync; if you hot-edit the server's, re-copy it
back into the repo in the same sitting. `./init-db` resolves to `/opt/gen-ui/init-db/` on the
server — the repo source for that is `deployment/init-db/` (verified byte-identical, md5
`446896df…`, 2026-10-03).

Also note: `ufw status numbered` on this host carries public rules for **other**
projects (3000, 4000, 18080, 18766, 31777, 31778) — the table above is DevCut's
intent, not the machine's actual ruleset.

## Legacy compose files in `deployment/`

`deployment/docker-compose.prod.yml` + `deployment/Caddyfile` are the pre-Coolify
full-Docker stack (apps in containers, Caddy on 80/443). **Nothing runs them** — prod
is PM2 + `docker-compose.infra.yml` at the **repo root**, and Caddy was removed. They are kept
for the hackathon submission history; read them as archaeology, not as deploy
instructions. They are also unsafe to revive as-is: `docker-compose.prod.yml` publishes Postgres
and Redis unbound (and Caddy on 80/443), and it hardcodes `intelligence:intelligence`, which has
not been the prod password since the 2026-10-03 rotation. A `DEAD FILE` header now says all of
that at the top of the file itself, so a reader who opens the compose instead of this doc is
still warned.

The **local** `deployment/docker-compose.yml` (what `npm run dev:infra` runs) used to bind its
infra ports with no address prefix — same shape as the prod exposure, and it still carries the
dev-only `intelligence:intelligence` credential. On 2026-10-03 all four mappings got
`127.0.0.1:` prefixes. That change is **syntax-checked (YAML parse) but never booted**: this
laptop has no Docker CLI installed, so nobody has confirmed the dev stack still comes up with
the narrowed binds. Run `npm run dev:infra` on a machine that has Docker before trusting it.
On a laptop behind NAT the unbound bind was a much smaller problem than it was on nuncio-vultr,
but on any machine with a public interface, `up -d`ing it exposed Postgres/Redis the same way.

## Recommended server size

| Workload | Instance class |
| --- | --- |
| Demo / hackathon (MOCK mode) | 2 vCPU, 4 GB RAM |
| Live Runway generation | 4 vCPU, 8 GB RAM |
| High traffic | 4+ vCPU + separate Postgres |

Budget ~2 GB for the full stack at idle — and that now includes Postgres, Redis
and the Intelligence composite, which the earlier version of this doc didn't
count. The agent (Python + LangGraph) is the most memory-hungry PM2 service
(~512 MB). Measured on prod (nuncio-vultr, 2026-10-03): **4 vCPU, 7 GB RAM,
150 GB disk** — comfortably in the "Live Runway generation" row.

## Updating

```bash
bash scripts/deploy-local.sh
```

Same command every time. The deploy script handles build, rsync, health
check, rollback, and cleanup automatically.

## Rollback

If a deploy fails the health check, the script automatically rolls back
to the previous release. To manually roll back:

```bash
ssh nuncio-vultr
cd /opt/gen-ui/releases
ls -t                          # see available releases
ln -snf releases/<timestamp> /opt/gen-ui/current
pm2 startOrReload /opt/gen-ui/ecosystem.config.js --update-env
```

## Disk management

The deploy script keeps 3 releases (~1.7 GB). Old monorepo artifacts
(`node_modules`, `.git`, `.next`, agent `.venv`) are cleaned automatically
after the first deploy.

To check disk usage:
```bash
ssh nuncio-vultr 'du -sh /opt/gen-ui/* | sort -rh'
ssh nuncio-vultr 'df -h /opt/gen-ui'
```

## Troubleshooting

**Agent fails to start**
- Check `GEMINI_API_KEY` is set and not a stub value.
- Check agent logs: `pm2 logs director-agent --lines 50`

**MCP crash-loops**
- Check MCP logs: `pm2 logs director-mcp --lines 50`
- Ensure `PORT=3011` is set in the ecosystem config env block.

**BFF returns 503**
- BFF's `/health` endpoint checks downstream services (Agent, MCP).
- If Agent or MCP are down, BFF returns degraded. Check those first.

**"Thread locked" errors in chat**
- A previous turn errored mid-stream. Start a new conversation (sidebar → +).

**Build fails locally**
- Ensure all deps are installed: `npm install --ignore-scripts`
- Rebuild MCP: `cd apps/mcp && npm install --ignore-scripts && npm run build`
