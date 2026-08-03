#!/usr/bin/env bash
# ============================================================================
# deploy-local.sh — Build locally, deploy to server via rsync
#
# Pipeline:
#   build (+ agent import gate) → apply patches → create release → per-app
#   fingerprinting → size check → rsync → server-side install → drain gate
#   (if agent changes) → symlink flip → SELECTIVE PM2 reload (only changed
#   services) → health check (rollback to last-known-good) → bound-aware prune
#
# Deploy-safety invariants:
#   * A frontend-only change never restarts the agent (in-mem LangGraph state
#     = live canvases; restarting it severs them).
#   * The agent is only restarted after in-flight runs drain (FORCE_DEPLOY=1
#     to override).
#   * Rollback restores the exact pre-deploy symlink target, and only if it
#     previously passed health (.health-ok marker) — never a timestamp guess.
#
# Usage:  bash scripts/deploy-local.sh     (FORCE_DEPLOY=1 to skip the drain gate)
# ============================================================================
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
REMOTE="nuncio-vultr"
REMOTE_PATH="/opt/gen-ui"
KEEP_RELEASES=2
GROWTH_WARN=1.2
GROWTH_FAIL=1.5
UV_BIN="/home/linuxuser/.local/bin/uv"
DRAIN_TIMEOUT_S="${DRAIN_TIMEOUT_S:-90}"

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
  (cd apps/mcp && npx mcp-use build --no-typecheck) 2>&1 | tail -5
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

# ── 1b. AGENT IMPORT GATE ───────────────────────────────────────────────────
# Catch import-time breakage (missing exports / undefined names — the exact
# bug class that boots into a PM2 crash loop) BEFORE anything ships.
# Mirrors the `npx tsc` gate the BFF already has.
if command -v uv >/dev/null 2>&1 && [ -f "$ROOT/apps/agent/uv.lock" ]; then
  info "Import-checking agent graph..."
  (cd "$ROOT/apps/agent" && uv sync --frozen --no-dev >/dev/null 2>&1) \
    || warn "uv sync failed — import gate will use the existing venv"
  (cd "$ROOT/apps/agent" && .venv/bin/python -c "
from dotenv import load_dotenv
load_dotenv('.env'); load_dotenv('../../.env')
import main, director  # noqa: F401
print('agent imports ok')
") || fail "Agent import gate FAILED — fix the import error before deploying"
else
  warn "uv or apps/agent/uv.lock unavailable locally — skipping agent import gate"
fi

# ── 2. CREATE RELEASE ───────────────────────────────────────────────────────
info "Creating release structure..."

# Frontend — ship ONLY .next/standalone (the runtime tree).
# ecosystem.config.js launches .next/standalone/apps/frontend/server.js, so
# the outer .next/server, .next/build, .next/cache, type files etc. are not
# needed at runtime. We fold static/ and public/ into the standalone tree
# (Next.js standalone quirk) and skip the rest. Saves ~60M per release.
mkdir -p "$LOCAL_RELEASE/apps/frontend/.next/standalone"
cp apps/frontend/package.json "$LOCAL_RELEASE/apps/frontend/package.json"

if [ ! -d "apps/frontend/.next/standalone" ]; then
  fail "apps/frontend/.next/standalone missing — frontend not built (or 'output: standalone' disabled in next.config)"
fi

cp -r apps/frontend/.next/standalone/. "$LOCAL_RELEASE/apps/frontend/.next/standalone/"
mkdir -p "$LOCAL_RELEASE/apps/frontend/.next/standalone/apps/frontend/.next"
cp -r apps/frontend/.next/static \
      "$LOCAL_RELEASE/apps/frontend/.next/standalone/apps/frontend/.next/static"
cp -r apps/frontend/public \
      "$LOCAL_RELEASE/apps/frontend/.next/standalone/apps/frontend/public"

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

# Strip MCP widget-only deps from the release tree. Widgets are pre-bundled
# into apps/mcp/dist/ at build time and aren't imported by the running server
# (dist/index.js only imports `mcp-use/server` + `zod`).
#
# NOTE: We deliberately do NOT use `npm prune --omit=dev` here — in a monorepo
# with peer-dep-heavy packages (mcp-use peer-deps include the langchain stack),
# npm "prune" decides to *install* missing peers from the registry, ballooning
# the tree instead of shrinking it. Plain `rm -rf` of the known-unneeded dirs
# is deterministic, fast, and avoids the peer-dep resolution rabbit hole.
info "Stripping MCP widget-only deps..."
MCP_BEFORE=$(du_bytes "$LOCAL_RELEASE/apps/mcp/node_modules")
MCP_NM="$LOCAL_RELEASE/apps/mcp/node_modules"
# Heavy widget/build-time deps (some pulled in transitively via @openai/apps-sdk-ui)
for d in \
  "@openai" "@radix-ui" "@mcp-ui/client" "@mcp-ui/shared" "@mcp-ui/react" \
  "lucide-react" "framer-motion" "react-syntax-highlighter" \
  "tailwindcss" "vite" "vite-plugin-singlefile" \
  "typescript" "tsx" "@types" \
  "rollup" "esbuild" "@esbuild" "@rollup" "postcss" "autoprefixer" \
  ; do
  rm -rf "$MCP_NM/$d" 2>/dev/null || true
done
# Also clear .cache and any nested node_modules left orphaned
find "$MCP_NM" -name '.cache' -type d -prune -exec rm -rf {} + 2>/dev/null || true
MCP_AFTER=$(du_bytes "$LOCAL_RELEASE/apps/mcp/node_modules")
info "MCP node_modules: $(hr $MCP_BEFORE) → $(hr $MCP_AFTER)"

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

# Server-side helpers (smoke-test.sh runs from current/scripts/ post-deploy,
# plus intelligence-watchdog.sh and other ops scripts kept alongside the app)
cp -r scripts "$LOCAL_RELEASE/scripts"

# ── 3. INSTALL BFF DEPS INTO RELEASE ────────────────────────────────────────
info "Installing BFF production deps..."
cd "$ROOT"

BFF_DEPS=("hono" "@hono/node-server" "ioredis" "@copilotkit/runtime" "zod")
SPECS=()
for dep in "${BFF_DEPS[@]}"; do
  VER=""   # MUST reset — otherwise a missing dep inherits the previous one's version
  # Check root hoisted first, then workspace-local
  for p in "node_modules/$dep/package.json" "apps/bff/node_modules/$dep/package.json"; do
    if [ -f "$p" ]; then
      VER=$(python3 -c "import json; print(json.load(open('$p'))['version'])")
      break
    fi
  done
  if [ -z "$VER" ]; then
    fail "BFF dep '$dep' not found in node_modules — run 'npm install --ignore-scripts' first"
  fi
  SPECS+=("${dep}@${VER}")
done

cd "$LOCAL_RELEASE"
npm init -y >/dev/null 2>&1
npm pkg set type="module" private=true name="devcut-release" >/dev/null
npm install --save --omit=dev "${SPECS[@]}" 2>&1 | tail -3

# ── 3b. PER-APP FINGERPRINTS (selective restart decisions) ─────────────────
info "Fingerprinting payloads (selective-restart decisions)..."
dirhash() { python3 "$ROOT/scripts/dirhash.py" "$@"; }
H_AGENT=$(dirhash "$LOCAL_RELEASE/apps/agent/src" "$LOCAL_RELEASE/apps/agent/pyproject.toml" "$LOCAL_RELEASE/apps/agent/uv.lock")
H_BFF=$(dirhash "$LOCAL_RELEASE/apps/bff" "$LOCAL_RELEASE/package.json")
H_FRONT=$(dirhash "$LOCAL_RELEASE/apps/frontend")
H_MCP=$(dirhash "$LOCAL_RELEASE/apps/mcp/dist" "$LOCAL_RELEASE/apps/mcp/package.json")
H_ECOSYS=$(dirhash "$ROOT/ecosystem.config.js")

# Compare against what the LIVE services actually run from. Capture the exact
# pre-deploy symlink target now — it is also the (marked) rollback target.
PREV_TARGET=$(ssh "$REMOTE" "readlink -f $REMOTE_PATH/current 2>/dev/null || true")
rhash() { ssh "$REMOTE" "python3 - $1" < "$ROOT/scripts/dirhash.py" 2>/dev/null || echo ""; }
if [ -n "$PREV_TARGET" ] && ssh "$REMOTE" "test -d '$PREV_TARGET'"; then
  P_AGENT=$(rhash "$PREV_TARGET/apps/agent/src $PREV_TARGET/apps/agent/pyproject.toml $PREV_TARGET/apps/agent/uv.lock")
  P_BFF=$(rhash "$PREV_TARGET/apps/bff $PREV_TARGET/package.json")
  P_FRONT=$(rhash "$PREV_TARGET/apps/frontend")
  P_MCP=$(rhash "$PREV_TARGET/apps/mcp/dist $PREV_TARGET/apps/mcp/package.json")
  P_ECOSYS=$(rhash "$REMOTE_PATH/ecosystem.config.js")
else
  P_AGENT=""; P_BFF=""; P_FRONT=""; P_MCP=""; P_ECOSYS=""
fi

# Server .env: local and prod SHOULD differ, so content-comparing them would
# force restart-all every deploy. Instead track the SERVER env's own drift:
# store its fingerprint server-side after each healthy deploy.
ENV_FP=$(rhash "$REMOTE_PATH/.env")
STORED_ENV_FP=$(ssh "$REMOTE" "cat $REMOTE_PATH/releases/.env-fingerprint 2>/dev/null" || echo "")

# ecosystem.config.js or server .env changes affect every service.
RESTART_ALL=0
{ [ -n "$P_ECOSYS" ] && [ "$H_ECOSYS" = "$P_ECOSYS" ] && [ "$ENV_FP" = "$STORED_ENV_FP" ]; } || RESTART_ALL=1

PM2_AGENT=director-agent; PM2_BFF=director-bff; PM2_FRONT=director-frontend; PM2_MCP=director-mcp
WANT=()
{ [ $RESTART_ALL -eq 1 ] || [ "$H_AGENT" != "$P_AGENT" ]; } && WANT+=(agent)
{ [ $RESTART_ALL -eq 1 ] || [ "$H_BFF"   != "$P_BFF"   ]; } && WANT+=(bff)
{ [ $RESTART_ALL -eq 1 ] || [ "$H_FRONT" != "$P_FRONT" ]; } && WANT+=(frontend)
{ [ $RESTART_ALL -eq 1 ] || [ "$H_MCP"   != "$P_MCP"   ]; } && WANT+=(mcp)
pm2name() { case "$1" in agent) echo $PM2_AGENT;; bff) echo $PM2_BFF;; frontend) echo $PM2_FRONT;; mcp) echo $PM2_MCP;; esac; }
if [ ${#WANT[@]} -eq 0 ]; then
  info "Payloads identical for all services — symlink flip only, NO restarts"
else
  info "Services to reload: ${WANT[*]}"
fi

# ── 4. SIZE CHECK ──────────────────────────────────────────────────────────
RSIZE=$(du_bytes "$LOCAL_RELEASE")
info "Release: $(hr $RSIZE)"

PREV_SIZE=$(ssh "$REMOTE" "
  P=${PREV_TARGET}
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

# Fix permissions so nginx (www-data) can traverse the release tree
ssh "$REMOTE" "chmod o+rx $REMOTE_RELEASE"

# ── 6. SERVER-SIDE SETUP ────────────────────────────────────────────────────
info "Server-side setup..."
ssh "$REMOTE" "
  # Shared .env at release root (for any direct node processes)
  ln -sf $REMOTE_PATH/.env $REMOTE_RELEASE/.env 2>/dev/null || true

  # Agent .env symlink (agent/ → apps/ → <release>/ → releases/ → /opt/gen-ui)
  mkdir -p $REMOTE_RELEASE/apps/agent
  ln -sf ../../../../.env $REMOTE_RELEASE/apps/agent/.env 2>/dev/null || true

  # Ensure exports dir
  mkdir -p $REMOTE_RELEASE/apps/frontend/public/exports

  # Ensure logs dir at root (shared across releases)
  mkdir -p $REMOTE_PATH/logs
"

info "Installing agent Python deps..."
ssh "$REMOTE" "cd $REMOTE_RELEASE/apps/agent && $UV_BIN sync --frozen --no-dev 2>&1" | tail -5

info "Updating ecosystem.config.js..."
rsync -az "$ROOT/ecosystem.config.js" "$REMOTE:$REMOTE_PATH/ecosystem.config.js"

# ── 6b. DRAIN GATE (agent restarts only) ────────────────────────────────────
# An agent restart wipes in-mem LangGraph state and severs in-flight runs.
# Refuse to proceed while runs are active unless explicitly forced.
AGENT_RESTARTS=0
for s in "${WANT[@]:-}"; do [ "$s" = agent ] && AGENT_RESTARTS=1; done
if [ "$AGENT_RESTARTS" -eq 1 ] && [ "${FORCE_DEPLOY:-0}" != "1" ]; then
  info "Agent payload changed — draining in-flight runs (timeout ${DRAIN_TIMEOUT_S}s)..."
  DEADLINE=$(( $(date +%s) + DRAIN_TIMEOUT_S ))
  while :; do
    INFLIGHT=$(ssh "$REMOTE" "curl -s --max-time 5 http://localhost:4010/readyz 2>/dev/null" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('inflight', -1))" 2>/dev/null || echo -1)
    [ "$INFLIGHT" = "0" ] && { info "  drained (inflight=0)"; break; }
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then
      fail "Runs still in flight (inflight=$INFLIGHT). Wait for them, or re-run with FORCE_DEPLOY=1 to interrupt (users lose in-progress cuts)."
    fi
    sleep 5
  done
fi

# ── 7. SYMLINK FLIP ────────────────────────────────────────────────────────
info "Flipping current/ symlink → $TIMESTAMP"
ssh "$REMOTE" "ln -snf releases/$TIMESTAMP $REMOTE_PATH/current"

# ── 8. PM2 RELOAD (selective) ───────────────────────────────────────────────
# Bound-release markers: record which release each service runs from, so the
# prune step can never delete a release a SKIPPED service still executes.
BOUND_DIR="$REMOTE_PATH/releases/.bound"
ssh "$REMOTE" "mkdir -p $BOUND_DIR"
# Services NOT restarted keep their existing marker; initialise if missing.
ssh "$REMOTE" "for s in agent bff frontend mcp; do
  f=$BOUND_DIR/\$s
  [ -f \"\$f\" ] || basename '${PREV_TARGET:-''}' > \"\$f\" 2>/dev/null || true
done"

if [ ${#WANT[@]} -eq 0 ]; then
  info "Skipping PM2 reload entirely (agent state + user canvases preserved)"
else
  # Restart in dependency order: agent → bff → mcp → frontend.
  for SVC in agent bff mcp frontend; do
    FOUND=0
    for w in "${WANT[@]}"; do [ "$w" = "$SVC" ] && FOUND=1; done
    [ "$FOUND" -eq 1 ] || continue
    PM=$(pm2name "$SVC")
    info "Reloading $PM..."
    ssh "$REMOTE" "pm2 startOrReload $REMOTE_PATH/ecosystem.config.js --only $PM --update-env 2>&1 | tail -1"
    echo "$TIMESTAMP" | ssh "$REMOTE" "cat > $BOUND_DIR/$SVC"
    # The agent's langgraph boot is slow (~25s) — give it a head start.
    [ "$SVC" = agent ] && sleep 8 || sleep 2
  done
fi
sleep 5

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
hcheck_retry "BFF"    "http://localhost:4010/health" 8 5
hcheck_retry "Agent"  "http://localhost:8123/ok" 12 5
hcheck_retry "MCP"    "http://localhost:3011/mcp" 8 5

if [ "$H_PASS" = false ]; then
  error "Health check FAILED — rolling back..."
  # Restore the EXACT pre-deploy target — but only if it previously passed
  # health (has the .health-ok marker). Otherwise fall back to the newest
  # marked release. Never roll back to an unverified timestamp neighbour.
  ROLLBACK_TARGET=$(ssh "$REMOTE" "
    if [ -n '${PREV_TARGET:-}' ] && [ -f '${PREV_TARGET:-/nonexistent}/.health-ok' ]; then
      basename '$PREV_TARGET'
    else
      for d in \$(ls -dt $REMOTE_PATH/releases/*/ 2>/dev/null); do
        if [ -f \"\$d/.health-ok\" ]; then basename \"\$d\"; break; fi
      done
    fi" || echo "")
  if [ -n "$ROLLBACK_TARGET" ]; then
    RBNAME=$(basename "$ROLLBACK_TARGET")
    info "Rolling back to $RBNAME (last known-good) ..."
    ssh "$REMOTE" "
      ln -snf releases/$RBNAME $REMOTE_PATH/current
      pm2 startOrReload $REMOTE_PATH/ecosystem.config.js --update-env 2>&1 | tail -1
      for s in agent bff frontend mcp; do echo $RBNAME > $REMOTE_PATH/releases/.bound/\$s; done
    "
    info "Rolled back to $RBNAME"
  else
    error "No known-good release to roll back to — manual intervention required"
    error "current/ symlink points to $TIMESTAMP (may be broken)"
  fi
  exit 1
fi

info "All services healthy ✓"
# Mark this release as a valid rollback target + store the env fingerprint.
ssh "$REMOTE" "touch $REMOTE_RELEASE/.health-ok && echo '$ENV_FP' > $REMOTE_PATH/releases/.env-fingerprint"

# ── 9b. SEED INTELLIGENCE DEFAULT USER ──────────────────────────────────────
# The BFF sends userId='default' to Intelligence. If that user doesn't exist
# in cpki.users, every thread-create returns 500 (threads_user_id_fkey).
# This is idempotent (ON CONFLICT DO NOTHING) and safe to run every deploy.
info "Seeding Intelligence default user..."
ssh "$REMOTE" "
  sudo docker exec directors-canvas-prod-postgres-1 \
    psql -U intelligence -d intelligence_app -v ON_ERROR_STOP=1 -c \
    \"INSERT INTO cpki.users (id, organization_id, created_at) VALUES ('default', 'casa-de-erlang', NOW()), ('1_default', 'casa-de-erlang', NOW()) ON CONFLICT (id) DO NOTHING;\" \
  2>&1 && echo 'seed: ok' || echo 'seed: skipped (container not found)'
"

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

# ── 11. PRUNE OLD RELEASES (bound-aware) ────────────────────────────────────
# Never delete a release a running service is still executed from (a skipped
# agent keeps running its older release to preserve in-mem state).
info "Pruning old releases (keeping $KEEP_RELEASES + bound)..."
ssh "$REMOTE" "cd $REMOTE_PATH/releases && ls -t1 | grep -v '^\.' | tail -n +$((KEEP_RELEASES+1)) | while read -r r; do
  if grep -qxF \"\$r\" $BOUND_DIR/* 2>/dev/null; then
    echo \"  keeping \$r (bound to a running service)\"
  else
    rm -rf \"\$r\"
  fi
done"

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
