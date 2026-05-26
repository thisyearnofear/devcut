#!/usr/bin/env bash
# ============================================================================
# deploy-local.sh — Build locally, deploy to server via rsync
#
# Pipeline:
#   build → apply patches → create release → size check → rsync →
#   server-side install (BFF deps + agent) → symlink flip → PM2 reload →
#   health check (auto-rollback) → prune old releases → clean old dirs
#
# Usage:  bash scripts/deploy-local.sh
# ============================================================================
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
REMOTE="snel-bot"
REMOTE_PATH="/opt/gen-ui"
KEEP_RELEASES=3
GROWTH_WARN=1.2
GROWTH_FAIL=1.5
UV_BIN="/home/deploy/.local/bin/uv"

# ── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }
fail()  { error "$*"; exit 1; }

# ── Helpers ─────────────────────────────────────────────────────────────────
hr() { python3 -c "print(f'{$1/1024/1024:.1f}MiB')" 2>/dev/null || echo "$1 bytes"; }
ratio() { python3 -c "
s1=$1; s2=$2
if s2 > 0: print(f'{s1/s2:.2f}')
else: print('N/A')
"; }
# Cross-platform directory size in bytes (macOS du -sk returns KiB, Linux du -sb returns bytes)
du_bytes() {
  if [[ "$OSTYPE" == darwin* ]]; then
    # macOS: du -sk gives KiB, multiply by 1024
    echo $(( $(du -sk "$1" | cut -f1) * 1024 ))
  else
    du -sb "$1" | cut -f1
  fi
}

# ── Pre-flight ──────────────────────────────────────────────────────────────
cd "$(dirname "$0")/.."
ROOT="$PWD"

[ -f "$ROOT/.env" ]                        || fail ".env not found"
command -v rsync &>/dev/null               || fail "rsync not found locally"
ssh "$REMOTE" "command -v pm2" &>/dev/null || fail "pm2 not found on $REMOTE"
ssh "$REMOTE" "test -x $UV_BIN" &>/dev/null|| fail "uv not found on $REMOTE"

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
LOCAL_RELEASE=$(mktemp -d /tmp/gen-ui-rls-XXXXXXXX)
trap "rm -rf $LOCAL_RELEASE" EXIT

# Verify local build artifacts exist — build if missing
if [ ! -d "$ROOT/apps/frontend/.next" ] || [ ! -d "$ROOT/apps/bff/dist" ]; then
  info "Build artifacts missing locally — will build"
  NEED_BUILD=1
else
  NEED_BUILD=0
fi

# ── 1. BUILD ────────────────────────────────────────────────────────────────
if [ "$NEED_BUILD" -eq 1 ] || [ "${FORCE_BUILD:-0}" = "1" ]; then
  info "Building frontend..."
  grep '^NEXT_PUBLIC_' "$ROOT/.env" > "$ROOT/apps/frontend/.env.local" || true
  npm run build 2>&1 | tail -5

  info "Building BFF..."
  (cd apps/bff && npx tsc) 2>&1 | tail -3

  info "Building MCP..."
  (cd apps/mcp && npm run build) 2>&1 | tail -5
else
  info "Using existing build artifacts"
fi

# Apply patches to node_modules (safe to re-run)
info "Applying patches..."
for d in "$ROOT" "$ROOT/apps/frontend" "$ROOT/apps/bff"; do
  if [ -d "$d/node_modules" ]; then
    for patch in "$ROOT"/scripts/patches/*.sh; do
      [ -f "$patch" ] && (cd "$d" && bash "$patch" 2>/dev/null || true)
    done
  fi
done

# ── 2. CREATE RELEASE ───────────────────────────────────────────────────────
info "Creating release structure..."

# Frontend
mkdir -p "$LOCAL_RELEASE/apps/frontend"
cp -r apps/frontend/.next   "$LOCAL_RELEASE/apps/frontend/.next"
cp -r apps/frontend/public  "$LOCAL_RELEASE/apps/frontend/public"
cp apps/frontend/package.json "$LOCAL_RELEASE/apps/frontend/package.json"
rm -rf "$LOCAL_RELEASE/apps/frontend/.next/cache"

# Next.js standalone quirk — copy static + public into standalone dir
if [ -d "$LOCAL_RELEASE/apps/frontend/.next/standalone" ]; then
  mkdir -p "$LOCAL_RELEASE/apps/frontend/.next/standalone/apps/frontend"
  cp -r "$LOCAL_RELEASE/apps/frontend/.next/static" \
        "$LOCAL_RELEASE/apps/frontend/.next/standalone/apps/frontend/.next/static" 2>/dev/null || true
  cp -r "$LOCAL_RELEASE/apps/frontend/public" \
        "$LOCAL_RELEASE/apps/frontend/.next/standalone/apps/frontend/public" 2>/dev/null || true
fi

# BFF
mkdir -p "$LOCAL_RELEASE/apps/bff"
cp -r apps/bff/dist          "$LOCAL_RELEASE/apps/bff/dist"
cp apps/bff/package.json     "$LOCAL_RELEASE/apps/bff/package.json"

# MCP — ship compiled output + its own node_modules (16M)
mkdir -p "$LOCAL_RELEASE/apps/mcp"
cp -r apps/mcp/dist          "$LOCAL_RELEASE/apps/mcp/dist"
cp -r apps/mcp/.mcp-use      "$LOCAL_RELEASE/apps/mcp/.mcp-use" 2>/dev/null || true
cp -r apps/mcp/resources     "$LOCAL_RELEASE/apps/mcp/resources" 2>/dev/null || true
cp -r apps/mcp/public        "$LOCAL_RELEASE/apps/mcp/public" 2>/dev/null || true
cp -r apps/mcp/src           "$LOCAL_RELEASE/apps/mcp/src" 2>/dev/null || true
cp apps/mcp/package.json     "$LOCAL_RELEASE/apps/mcp/package.json"
cp -r apps/mcp/node_modules  "$LOCAL_RELEASE/apps/mcp/node_modules"
# Copy hoisted MCP deps that npm may have placed in root node_modules
for dep in "@mcp-ui/server" "dotenv"; do
  if [ -d "node_modules/$dep" ] && [ ! -d "$LOCAL_RELEASE/apps/mcp/node_modules/$dep" ]; then
    mkdir -p "$(dirname "$LOCAL_RELEASE/apps/mcp/node_modules/$dep")"
    cp -r "node_modules/$dep" "$LOCAL_RELEASE/apps/mcp/node_modules/$dep"
  fi
done

# Agent — source + pyproject (uv sync creates .venv on server)
mkdir -p "$LOCAL_RELEASE/apps/agent/src"
cp -r apps/agent/src/*.py    "$LOCAL_RELEASE/apps/agent/src/" 2>/dev/null || true
cp apps/agent/main.py        "$LOCAL_RELEASE/apps/agent/main.py" 2>/dev/null || true
cp apps/agent/director.py    "$LOCAL_RELEASE/apps/agent/director.py" 2>/dev/null || true
cp apps/agent/langgraph.json "$LOCAL_RELEASE/apps/agent/langgraph.json" 2>/dev/null || true
cp apps/agent/pyproject.toml "$LOCAL_RELEASE/apps/agent/pyproject.toml" 2>/dev/null || true
cp apps/agent/uv.lock        "$LOCAL_RELEASE/apps/agent/uv.lock" 2>/dev/null || true
# pyproject.toml references README.md — uv sync needs it to exist
cp apps/agent/README.md      "$LOCAL_RELEASE/apps/agent/README.md" 2>/dev/null || echo "# agent" > "$LOCAL_RELEASE/apps/agent/README.md"

# Copy data/ directory (used at runtime)
if [ -d apps/agent/data ]; then
  cp -r apps/agent/data      "$LOCAL_RELEASE/apps/agent/data"
fi

# ── 3. INSTALL BFF DEPS INTO RELEASE ────────────────────────────────────────
info "Installing BFF production deps..."
cd "$ROOT"

BFF_DEPS=("hono" "@hono/node-server" "ioredis" "@copilotkit/runtime" "zod")
SPECS=()
for dep in "${BFF_DEPS[@]}"; do
  # Check root hoisted first, then workspace-local
  for p in "node_modules/$dep/package.json" "apps/bff/node_modules/$dep/package.json"; do
    if [ -f "$p" ]; then
      VER=$(python3 -c "import json; print(json.load(open('$p'))['version'])")
      break
    fi
  done
  SPECS+=("${dep}@${VER}")
done

cd "$LOCAL_RELEASE"
npm init -y >/dev/null 2>&1
npm pkg set type="module" private=true >/dev/null
npm install --save --omit=dev "${SPECS[@]}" 2>&1 | tail -3

# ── 4. SIZE CHECK ──────────────────────────────────────────────────────────
RSIZE=$(du_bytes "$LOCAL_RELEASE")
info "Release: $(hr $RSIZE)"

PREV_SIZE=$(ssh "$REMOTE" "
  P=\$(readlink -f $REMOTE_PATH/current 2>/dev/null)
  if [ -n \"\$P\" ] && [ -d \"\$P\" ]; then du -sb \"\$P\" 2>/dev/null | cut -f1; else echo 0; fi
" 2>/dev/null || echo 0)

if [ "$PREV_SIZE" -gt 0 ]; then
  RATIO=$(ratio $RSIZE $PREV_SIZE)
  info "Previous: $(hr $PREV_SIZE), Growth: ${RATIO}x"

  if python3 -c "exit(0 if $RSIZE > $PREV_SIZE * $GROWTH_FAIL else 1)" 2>/dev/null; then
    fail "Release grew ${RATIO}x — exceeds ${GROWTH_FAIL}x threshold. Aborting."
  fi
  if python3 -c "exit(0 if $RSIZE > $PREV_SIZE * $GROWTH_WARN else 1)" 2>/dev/null; then
    warn "Release grew ${RATIO}x — exceeds ${GROWTH_WARN}x threshold. Proceeding..."
  fi
else
  info "No previous release — skipping growth check."
fi

# ── 5. RSYNC ────────────────────────────────────────────────────────────────
REMOTE_RELEASE="$REMOTE_PATH/releases/$TIMESTAMP"
info "Rsyncing to $REMOTE:$REMOTE_RELEASE ..."
ssh "$REMOTE" "mkdir -p $REMOTE_PATH/releases"
rsync -az --info=progress2 --delete \
  --exclude='.DS_Store' \
  --exclude='Thumbs.db' \
  "$LOCAL_RELEASE/" "$REMOTE:$REMOTE_RELEASE/"

# ── 6. SERVER-SIDE SETUP ────────────────────────────────────────────────────
info "Server-side setup..."
ssh "$REMOTE" "
  # Shared .env at release root (for any direct node processes)
  ln -sf $REMOTE_PATH/.env $REMOTE_RELEASE/.env 2>/dev/null || true

  # Agent .env symlink
  mkdir -p $REMOTE_RELEASE/apps/agent
  ln -sf ../../../.env $REMOTE_RELEASE/apps/agent/.env 2>/dev/null || true

  # Ensure exports dir
  mkdir -p $REMOTE_RELEASE/apps/frontend/public/exports

  # Ensure logs dir at root (shared across releases)
  mkdir -p $REMOTE_PATH/logs
"

info "Installing agent Python deps..."
ssh "$REMOTE" "cd $REMOTE_RELEASE/apps/agent && $UV_BIN sync --frozen --no-dev 2>&1" | tail -5

info "Updating ecosystem.config.js..."
rsync -az "$ROOT/ecosystem.config.js" "$REMOTE:$REMOTE_PATH/ecosystem.config.js"

# ── 7. SYMLINK FLIP ────────────────────────────────────────────────────────
info "Flipping current/ symlink → $TIMESTAMP"
ssh "$REMOTE" "ln -snf releases/$TIMESTAMP $REMOTE_PATH/current"

# ── 8. PM2 RELOAD ──────────────────────────────────────────────────────────
info "Reloading PM2..."
ssh "$REMOTE" "pm2 startOrReload $REMOTE_PATH/ecosystem.config.js --update-env 2>&1"
sleep 10

# ── 9. HEALTH CHECK ────────────────────────────────────────────────────────
info "Health checks..."
H_PASS=true
hcheck() {
  local NAME=$1 URL=$2
  local CODE
  CODE=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' --max-time 5 '$URL' 2>/dev/null || echo '000'")
  if [ "$CODE" = "200" ]; then
    info "  ✓ $NAME (HTTP $CODE)"
  else
    warn "  ✗ $NAME (HTTP $CODE)"
    H_PASS=false
  fi
}
hcheck_retry() {
  local NAME=$1 URL=$2 RETRIES=${3:-6} DELAY=${4:-5}
  local CODE i
  for i in $(seq 1 "$RETRIES"); do
    CODE=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' --max-time 5 '$URL' 2>/dev/null || echo '000'")
    if [ "$CODE" = "200" ]; then
      info "  ✓ $NAME (HTTP $CODE, attempt $i)"
      return 0
    fi
    [ "$i" -lt "$RETRIES" ] && sleep "$DELAY"
  done
  warn "  ✗ $NAME (HTTP $CODE after $RETRIES attempts)"
  H_PASS=false
}

hcheck "Frontend"     "http://localhost:3100/"
hcheck_retry "BFF"    "http://localhost:4010/health" 6 5
hcheck_retry "Agent"  "http://localhost:8123/ok" 6 5
hcheck_retry "MCP"    "http://localhost:3011/mcp" 6 5

if [ "$H_PASS" = false ]; then
  error "Health check FAILED — rolling back..."
  ROLLBACK_TARGET=$(ssh "$REMOTE" "ls -dt $REMOTE_PATH/releases/*/ 2>/dev/null | head -2 | tail -1" || echo "")
  if [ -n "$ROLLBACK_TARGET" ]; then
    RBNAME=$(basename "$ROLLBACK_TARGET")
    info "Rolling back to $RBNAME ..."
    ssh "$REMOTE" "
      ln -snf releases/$RBNAME $REMOTE_PATH/current
      pm2 startOrReload $REMOTE_PATH/ecosystem.config.js --update-env 2>&1
    "
    info "Rolled back to $RBNAME"
  else
    error "No previous release — manual intervention required"
    error "current/ symlink points to $TIMESTAMP (may be broken)"
  fi
  exit 1
fi

info "All services healthy ✓"

# ── 10. CLEAN OLD FILES (first deploy with this system) ─────────────────────
info "Cleaning old deployment structure..."
ssh "$REMOTE" "
  # Only clean if current/ points to a valid release dir
  # NOTE: agent .venv is kept — the agent PM2 entry is commented out in
  # ecosystem.config.js so it isn't reloaded during deploy.  The old .venv
  # stays until the agent is migrated to the release structure.
  CUR_TARGET=\$(readlink -f $REMOTE_PATH/current 2>/dev/null || echo '')
  if [ -n \"\$CUR_TARGET\" ] && [ -d \"\$CUR_TARGET\" ]; then
    rm -rf $REMOTE_PATH/node_modules         2>/dev/null && echo '  removed old node_modules'
    rm -rf $REMOTE_PATH/apps/frontend/.next   2>/dev/null && echo '  removed old .next'
    rm -rf $REMOTE_PATH/apps/bff/dist         2>/dev/null && echo '  removed old bff/dist'
    rm -rf $REMOTE_PATH/apps/mcp/node_modules 2>/dev/null && echo '  removed old mcp/node_modules'
    rm -rf $REMOTE_PATH/.git                 2>/dev/null && echo '  removed .git'
    rm -f  $REMOTE_PATH/apps/agent/.env      2>/dev/null || true
  fi
"

# ── 11. PRUNE OLD RELEASES ──────────────────────────────────────────────────
info "Pruning old releases (keeping $KEEP_RELEASES)..."
ssh "$REMOTE" "cd $REMOTE_PATH/releases && ls -t1 | tail -n +$((KEEP_RELEASES+1)) | xargs -r rm -rf"

# ── Disk usage summary ─────────────────────────────────────────────────────
info "Server disk usage:"
ssh "$REMOTE" "df -h $REMOTE_PATH | tail -1"
ssh "$REMOTE" "du -sh $REMOTE_PATH/releases/ 2>/dev/null || true"

# ── 12. POST-DEPLOY SMOKE TEST ──────────────────────────────────────────────
info "Post-deploy smoke test (on server)..."
if ssh "$REMOTE" "cd $REMOTE_PATH/current && bash scripts/smoke-test.sh http://localhost:4010" 2>&1; then
  info "Smoke test passed ✓"
else
  warn "Smoke test had failures (see above) — deploy itself succeeded"
fi

# ── Done ──
info "Deploy complete ✓  release=$TIMESTAMP"
