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
| `COPILOTKIT_LICENSE_TOKEN` | `npm run license` locally, copy the token. **Expires every 30 days** — renew before the UI starts showing the license banner, and apply it with `up -d`, not `restart` |
| `BAKED_LICENSE_KEYS_JSON` | Infra-compose env only — the composite image ships without baked keys (value in `AGENTS.md`) |
| `INTELLIGENCE_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_RUNNER_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_SECRET_KEY_BASE` | `openssl rand -base64 64` |
| `PUBLIC_INTELLIGENCE_WS_URL` | Must end in `/ws/client` — Phoenix appends `/websocket` to whatever base it gets (WS topology in `AGENTS.md`) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` / `AUTH_SECRET` / `AUTH_TRUST_HOST` / `AUTH_URL` | Auth.js v5 (ADR-0002). Needs `FORCE_BUILD=1` — `NEXT_PUBLIC_AUTH_ENABLED` is baked at build time |
| `DATABASE_URI` | `postgresql://…@localhost:5433/langgraph_app` — Postgres checkpointer + BFF tables (`devcut_credentials`, `devcut_thread_links`) |
| `X402_MODE` / `X402_PAY_TO` / `X402_NETWORK` / `X402_UNLOCK_SECRET` / `FACILITATOR_URL` | x402 job meter. Prod runs `demo` on Base testnet (`eip155:84532`) — see [`x402.md`](./x402.md) |
| `STITCH_MODE` | `mock` returns the Big Buck Bunny placeholder; live stitching requires ffmpeg |
| `LANGGRAPH_JOBS_PER_WORKER` | `4` on prod (concurrent runs per worker) |

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

### Known exposure: UFW does not gate Docker-published ports (found 2026-10-03)

`sudo ufw status` on nuncio-vultr has **no** rule for 5433 / 6381 / 4203 / 4403, yet
all four answer from outside — verified from a laptop with a real protocol
handshake (`redis-cli`-style `PING` → `+PONG` on 6381). Reason: `docker-compose.infra.yml`
publishes them as `"5433:5432"` etc. (no `127.0.0.1:` prefix, so they bind `0.0.0.0`),
and Docker's own `iptables` FORWARD/DOCKER rules are evaluated independently of UFW's
INPUT chain — a published container port punches through the host firewall.

Two consequences for the docs here: (1) any statement like "infra ports are bound to
localhost only" was **false** — they are reachable, and Postgres / Redis / the
Intelligence gateway are unauthenticated at the transport layer; (2) the same trap
applies to any service you add to that compose file.

Fix (not yet applied — it recreates the infra containers, so it must be scheduled
around in-flight runs): bind each mapping to loopback in `/opt/gen-ui/docker-compose.infra.yml`,

```yaml
ports:
  - "127.0.0.1:5433:5432"
  - "127.0.0.1:6381:6379"
```

then `docker compose -f docker-compose.infra.yml up -d` and re-prove from outside
(`nc -z -G 5 144.202.117.160 5433` should fail). PM2 services connect over
`localhost`, so nothing on the host needs the wide binding.

Also note: `ufw status numbered` on this host carries public rules for **other**
projects (3000, 4000, 18080, 18766, 31777, 31778) — the table above is DevCut's
intent, not the machine's actual ruleset.

## Legacy compose files in `deployment/`

`deployment/docker-compose.prod.yml` + `deployment/Caddyfile` are the pre-Coolify
full-Docker stack (apps in containers, Caddy on 80/443). **Nothing runs them** — prod
is PM2 + `docker-compose.infra.yml` on the server, and Caddy was removed. They are kept
for the hackathon submission history; read them as archaeology, not as deploy
instructions.

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
