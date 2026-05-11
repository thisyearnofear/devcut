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
npm ci 2>&1 | tail -3

# ── 3. Apply patches ───────────────────────────────────────────────────────
# MUST run BEFORE the frontend/BFF builds so Next.js bundles the patched
# @copilotkit/core and @ag-ui/client into .next/standalone. Patches need to
# be applied to BOTH the hoisted root node_modules and the per-app
# node_modules (whichever the workspace resolver picks up).
info "Applying patches…"
for d in "$ROOT" "$ROOT/apps/frontend" "$ROOT/apps/bff"; do
  if [ -d "$d/node_modules" ]; then
    for patch in "$ROOT"/scripts/patches/*.sh; do
      [ -f "$patch" ] && (cd "$d" && bash "$patch") 2>&1 | sed "s|^|  ($(basename "$d")) |"
    done
  fi
done

# ── 4. Build frontend ─────────────────────────────────────────────────────
# Clear Next.js build cache so the patched node_modules code is actually
# bundled into the output. Without this, Next.js reuses cached chunks
# from before the patches were applied.
info "Clearing frontend build cache…"
rm -rf apps/frontend/.next

info "Building frontend…"
(cd apps/frontend && npx next build) 2>&1 | tail -5

# Copy static assets into standalone output (Next.js standalone quirk)
if [ -d apps/frontend/.next/standalone ]; then
  cp -r apps/frontend/.next/static apps/frontend/.next/standalone/apps/frontend/.next/static 2>/dev/null || true
  cp -r apps/frontend/public apps/frontend/.next/standalone/apps/frontend/public 2>/dev/null || true
fi

# ── 5. Build BFF ───────────────────────────────────────────────────────────
info "Building BFF…"
(cd apps/bff && npx tsc) 2>&1 | tail -3

# ── 5a. Ensure logs directory ─────────────────────────────────────────────
mkdir -p "$ROOT/logs"

# ── 5c. Ensure agent .env symlink (single source of truth) ───────────────
if [ ! -L "$ROOT/apps/agent/.env" ]; then
  info "Creating agent .env symlink → root .env"
  rm -f "$ROOT/apps/agent/.env"
  ln -s ../../.env "$ROOT/apps/agent/.env"
fi

# ── 6. Reload PM2 ─────────────────────────────────────────────────────────
info "Reloading PM2 services…"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

# ── 7. Verify ─────────────────────────────────────────────────────────────
sleep 3
info "Service status:"
pm2 list

# Health checks — all 4 services
FAIL=0
check_svc() {
  local NAME="$1" URL="$2" PM2NAME="$3"
  local STATUS
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$URL" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    info "$NAME: ${GREEN}OK${NC}"
  else
    warn "$NAME: HTTP $STATUS — check: pm2 logs $PM2NAME"
    FAIL=1
  fi
}
check_svc "Frontend" "http://localhost:3100/"                    "director-frontend"
check_svc "BFF"      "http://localhost:4010/health"              "director-bff"
check_svc "Agent"    "http://localhost:8123/ok"                  "director-agent"
check_svc "MCP"      "http://localhost:3011/mcp"                 "director-mcp"

if [ "$FAIL" = "0" ]; then
  info "Deploy complete — all services healthy ✓"
else
  warn "Deploy complete — some services need attention (see above)"
fi
