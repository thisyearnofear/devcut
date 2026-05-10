# Deploying to Hetzner (or any Linux VPS)

Everything runs in Docker. One `docker compose up` starts all services
and Caddy handles TLS automatically via Let's Encrypt.

## Prerequisites on the server

```bash
# Docker + Compose plugin (Debian/Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this

# Verify
docker compose version   # needs 2.x
```

## 1. Point your domain at the server

Create an A record for your domain (e.g. `director.yourdomain.com`) pointing
to the server's IPv4 address. Caddy won't issue a certificate until DNS
resolves correctly.

## 2. Clone the repo on the server

```bash
git clone https://github.com/thisyearnofear/gen-ui.git
cd gen-ui
```

## 3. Create the production `.env`

```bash
cp .env.production.example .env
```

Fill in every value. The minimum required set:

| Variable | Where to get it |
| --- | --- |
| `DOMAIN` | Your domain, e.g. `director.yourdomain.com` |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key |
| `RUNWAY_API_KEY` | [dev.runwayml.com](https://dev.runwayml.com) → API keys (leave blank for MOCK mode) |
| `COPILOTKIT_LICENSE_TOKEN` | Run `npm run license` locally, copy the token |
| `INTELLIGENCE_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_RUNNER_AUTH_SECRET` | `openssl rand -base64 32` |
| `INTELLIGENCE_SECRET_KEY_BASE` | `openssl rand -base64 64` |

## 4. Deploy

```bash
docker compose -f deployment/docker-compose.prod.yml up -d --wait
```

This builds all images, starts all services, and waits for health checks.
First build takes 3–5 minutes (Python deps + Next.js build). Subsequent
deploys are fast because Docker caches layers.

Caddy will automatically obtain a TLS certificate on first request. Make
sure port 80 and 443 are open in your Hetzner firewall rules.

## 5. Verify

```bash
# All containers should be Up
docker compose -f deployment/docker-compose.prod.yml ps

# Check logs for any startup errors
docker compose -f deployment/docker-compose.prod.yml logs --tail=50

# Hit the app
curl -I https://director.yourdomain.com
```

Open `https://director.yourdomain.com` in a browser. You should land on
the `/director` canvas.

## Updating

```bash
git pull
docker compose -f deployment/docker-compose.prod.yml up -d --build --wait
```

The `--build` flag rebuilds only the images whose source changed. The
`--wait` flag waits for health checks before returning.

## Hetzner firewall rules

In the Hetzner Cloud console → Firewalls, allow inbound:

| Protocol | Port | Source |
| --- | --- | --- |
| TCP | 22 | Your IP (SSH) |
| TCP | 80 | Any (Caddy HTTP→HTTPS redirect + ACME challenge) |
| TCP | 443 | Any (HTTPS) |
| UDP | 443 | Any (HTTP/3) |

No other ports need to be public — all internal service communication
happens on the `internal` Docker network.

## Recommended server size

| Workload | Hetzner instance |
| --- | --- |
| Demo / hackathon (MOCK mode) | CX22 (2 vCPU, 4 GB RAM) |
| Live Runway generation | CX32 (4 vCPU, 8 GB RAM) |
| High traffic | CX42 + separate Postgres |

The agent (Python + LangGraph) is the memory-hungry service. The
Intelligence composite container needs ~512 MB. Budget ~2 GB total for
the full stack at idle.

## Persistent data

All stateful data lives in named Docker volumes:

| Volume | Contents |
| --- | --- |
| `postgres-data` | Intelligence threads (Postgres) |
| `redis-data` | Budget counters + Intelligence cache |
| `exports` | Stitched MP4 exports |
| `caddy-data` | TLS certificates |

To back up threads:
```bash
docker exec directors-canvas-prod-postgres-1 \
  pg_dump -U intelligence intelligence_app | gzip > threads-backup.sql.gz
```

## Troubleshooting

**Caddy can't get a certificate**
- Check DNS: `dig director.yourdomain.com` should return your server IP.
- Check ports 80/443 are open in Hetzner firewall.
- Check Caddy logs: `docker compose -f deployment/docker-compose.prod.yml logs caddy`

**Agent fails to start**
- Check `GEMINI_API_KEY` is set and not a stub value.
- Check agent logs: `docker compose -f deployment/docker-compose.prod.yml logs agent`

**"Thread locked" errors in chat**
- A previous turn errored mid-stream. Start a new conversation (sidebar → +).

**Exports not serving**
- The `exports` volume must be mounted in both `agent` and `frontend` containers.
- Check: `docker compose -f deployment/docker-compose.prod.yml exec frontend ls /app/apps/frontend/public/exports`

**Budget counter not persisting**
- Redis must be healthy. Check: `docker compose -f deployment/docker-compose.prod.yml exec redis redis-cli ping`
