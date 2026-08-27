# Deploying to Hetzner (or any Linux VPS)

Build locally, deploy lightweight artifacts to the server via rsync. No
Docker required — services run via PM2.

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

# rsync (usually pre-installed)
sudo apt install -y rsync
```

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
| Frontend (Next.js standalone) | 3100 | Proxied via Nginx/Caddy to 443 |
| BFF (CopilotKit runtime) | 4010 | Internal only — frontend proxies to it |
| Agent (LangGraph) | 8123 | Internal only — BFF connects to it |
| MCP (mcp-use widgets) | 3011 | Internal only — BFF connects to it |

## Environment variables

The server reads all secrets from `/opt/gen-ui/.env`. Key variables:

| Variable | Where to get it |
| --- | --- |
| `DOMAIN` | Your domain, e.g. `director.yourdomain.com` |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key |
| `RUNWAY_API_KEY` | [dev.runwayml.com](https://dev.runwayml.com) → leave blank for MOCK mode |
| `GENBLAZE_ENABLED` | `1` to route video through Genblaze Pipeline + persist to B2 |
| `GENBLAZE_AGENT_LOOP` | `1` (default) AgentLoop quality gate on Winning artifact beat |
| `B2_KEY_ID` / `B2_APP_KEY` | [B2 Application Keys](https://secure.backblaze.com/app_keys.htm) (not master key) |
| `B2_BUCKET` / `B2_REGION` | Public bucket name + region from endpoint (e.g. `us-west-004`) |
| `B2_PUBLIC_URL_BASE` | Friendly public base for durable `<video src>` URLs |
| `B2_REQUIRE_DURABLE` | `1` for demo/golden — fail loudly if B2 upload fails |
| `B2_AUTO_LIFECYCLE` | `1` apply Genblaze lifecycle defaults |
| `B2_MANIFEST_LOCK_DAYS` | Object Lock GOVERNANCE days on manifests (`0` = off) |
| `DISCORD_WEBHOOK_URL` | Optional: B2 Event Notifications → `/api/b2-events` → Discord |
| `COPILOTKIT_LICENSE_TOKEN` | Run `npm run license` locally, copy the token |
| `INTELLIGENCE_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_RUNNER_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_SECRET_KEY_BASE` | `openssl rand -base64 64` |

## Hetzner firewall rules

In the Hetzner Cloud console → Firewalls, allow inbound:

| Protocol | Port | Source |
| --- | --- | --- |
| TCP | 22 | Your IP (SSH) |
| TCP | 80 | Any (HTTP→HTTPS redirect) |
| TCP | 443 | Any (HTTPS) |

Internal service ports (3100, 4010, 8123, 3011) are NOT exposed publicly —
Nginx or Caddy proxies external traffic to them.

## Recommended server size

| Workload | Hetzner instance |
| --- | --- |
| Demo / hackathon (MOCK mode) | CX22 (2 vCPU, 4 GB RAM) |
| Live Runway generation | CX32 (4 vCPU, 8 GB RAM) |
| High traffic | CX42 + separate Postgres |

Budget ~2 GB for the full stack at idle. The agent (Python + LangGraph)
is the most memory-hungry service (~512 MB).

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
