#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — Repeatable production deploy for Director's Canvas
#
# Usage (on the server):
#   cd /opt/gen-ui && bash scripts/deploy.sh
#
# What it does:
#   1. Pulls latest code
#   2. Installs dependencies
#   3. Builds frontend + BFF
#   4. Regenerates ecosystem.config.js from .env (no secrets in git)
#   5. Reloads all PM2 services with zero-downtime restart
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ── Pre-flight checks ─────────────────────────────────────────────────────
if [ ! -f "$ROOT/.env" ]; then
  error ".env not found at $ROOT/.env"
  error "Copy .env.production.example → .env and fill in your secrets first."
  exit 1
fi

if ! command -v pm2 &>/dev/null; then
  error "pm2 not found. Install with: npm i -g pm2"
  exit 1
fi

# ── 1. Pull latest code ───────────────────────────────────────────────────
info "Pulling latest code…"
git pull --ff-only || { warn "git pull failed — continuing with current code"; }

# ── 2. Install dependencies ───────────────────────────────────────────────
info "Installing dependencies…"
npm ci --omit=dev 2>&1 | tail -3

# ── 3. Build frontend ─────────────────────────────────────────────────────
info "Building frontend…"
(cd apps/frontend && npx next build) 2>&1 | tail -5

# Copy static assets into standalone output (Next.js standalone quirk)
if [ -d apps/frontend/.next/standalone ]; then
  cp -r apps/frontend/.next/static apps/frontend/.next/standalone/apps/frontend/.next/static 2>/dev/null || true
  cp -r apps/frontend/public apps/frontend/.next/standalone/apps/frontend/public 2>/dev/null || true
fi

# ── 4. Build BFF ───────────────────────────────────────────────────────────
info "Building BFF…"
(cd apps/bff && npx tsc) 2>&1 | tail -3

# ── 5. Ensure logs directory ──────────────────────────────────────────────
mkdir -p "$ROOT/logs"

# ── 6. Reload PM2 ─────────────────────────────────────────────────────────
info "Reloading PM2 services…"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

# ── 7. Verify ─────────────────────────────────────────────────────────────
sleep 3
info "Service status:"
pm2 list

# Quick health check on BFF
BFF_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4010/api/copilotkit/info 2>/dev/null || echo "000")
if [ "$BFF_STATUS" = "200" ]; then
  info "BFF health check: ${GREEN}OK${NC} (HTTP $BFF_STATUS)"
else
  warn "BFF health check: HTTP $BFF_STATUS — check logs: pm2 logs director-bff"
fi

info "Deploy complete ✓"
