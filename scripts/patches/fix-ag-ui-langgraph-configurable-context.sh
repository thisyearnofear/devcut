#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Patch @ag-ui/langgraph to avoid sending both `configurable` and `context`
# to LangGraph >=0.6.0 which rejects the combination.
#
# The minified code builds: { config: w, context: { ...l, ...w?.configurable ?? {} } }
# We change config:w to config:w&&{...w,configurable:void 0} so configurable
# is stripped when context is also present.
# ---------------------------------------------------------------------------
set -euo pipefail

TARGET="node_modules/@ag-ui/langgraph/dist/index.mjs"
PKG="node_modules/@ag-ui/langgraph/package.json"
EXPECTED_VERSION="0.0.31"

if [ ! -f "$TARGET" ]; then
  echo "[patch] @ag-ui/langgraph not found – skipping"
  exit 0
fi

# Version guard — fail loudly if the package has been updated so we
# don't silently apply a stale sed pattern to new code.
if [ -f "$PKG" ]; then
  ACTUAL=$(node -e "console.log(require('./$PKG').version)" 2>/dev/null || echo "unknown")
  if [ "$ACTUAL" != "$EXPECTED_VERSION" ]; then
    echo "[patch] WARNING: @ag-ui/langgraph is v${ACTUAL} (expected v${EXPECTED_VERSION})"
    echo "[patch] The configurable/context patch may no longer be needed — check the changelog."
    echo "[patch] Skipping patch to avoid corrupting new code."
    exit 0
  fi
fi

# --- Patch 1: strip configurable when context is present ---
if grep -q 'config:w&&{\.\.\.w,configurable:void 0}' "$TARGET" 2>/dev/null; then
  echo "[patch] @ag-ui/langgraph configurable/context already patched"
elif grep -q 'config:w,context:{' "$TARGET" 2>/dev/null; then
  sed -i.bak 's/config:w,context:{/config:w\&\&{...w,configurable:void 0},context:{/' "$TARGET"
  rm -f "${TARGET}.bak"
  echo "[patch] @ag-ui/langgraph patched (configurable stripped when context present)"
else
  echo "[patch] WARNING: configurable/context pattern not found – skipping"
fi

# --- Patch 2: guard JSON.parse(e.function.arguments) ---
# The g() message-conversion function calls JSON.parse on tool-call arguments
# which can be empty or partial during streaming, causing
# "Unexpected end of JSON input".  Wrap in try/catch with {} fallback.
UNSAFE_ARGS='JSON.parse(e.function.arguments)'
SAFE_ARGS='(()=>{try{return JSON.parse(e.function.arguments)}catch{return{}}})()'

if grep -qF "$SAFE_ARGS" "$TARGET" 2>/dev/null; then
  echo "[patch] @ag-ui/langgraph tool-args parse already patched"
elif grep -qF "$UNSAFE_ARGS" "$TARGET" 2>/dev/null; then
  sed -i.bak "s|$UNSAFE_ARGS|$SAFE_ARGS|g" "$TARGET"
  rm -f "${TARGET}.bak"
  echo "[patch] @ag-ui/langgraph patched (safe JSON.parse for tool-call arguments)"
else
  echo "[patch] WARNING: JSON.parse(e.function.arguments) pattern not found – skipping"
fi

# --- Patch 3: tolerate missing RUN_STARTED in @ag-ui/client ---
# When using CopilotKit Intelligence (Phoenix realtime gateway), the runner
# pushes events to the ingestion channel before the browser client connects
# to the thread channel.  If RUN_STARTED is broadcast before the client
# subscribes, the @ag-ui/client validation throws
# "First event must be 'RUN_STARTED'".
# Fix: remove the strict first-event check — just set the flag and continue.
CLIENT_TARGET="node_modules/@ag-ui/client/dist/index.mjs"
CLIENT_PKG="node_modules/@ag-ui/client/package.json"

if [ ! -f "$CLIENT_TARGET" ]; then
  echo "[patch] @ag-ui/client not found – skipping"
else
  OLD_CLIENT="if(!l){if(l=!0,t!==i.RUN_STARTED&&t!==i.RUN_ERROR)return _(()=>new n(\`First event must be 'RUN_STARTED'\`))}"
  NEW_CLIENT="if(!l){l=!0}"

  if grep -qF "$NEW_CLIENT" "$CLIENT_TARGET" 2>/dev/null && ! grep -qF "First event must be" "$CLIENT_TARGET" 2>/dev/null; then
    echo "[patch] @ag-ui/client RUN_STARTED tolerance already patched"
  elif grep -qF "First event must be" "$CLIENT_TARGET" 2>/dev/null; then
    python3 -c "
import sys
with open('$CLIENT_TARGET') as f:
    content = f.read()
old = \"if(!l){if(l=!0,t!==i.RUN_STARTED&&t!==i.RUN_ERROR)return _(()=>new n(\\\`First event must be 'RUN_STARTED'\\\`))}\";
new = 'if(!l){l=!0}'
if old in content:
    content = content.replace(old, new)
    with open('$CLIENT_TARGET', 'w') as f:
        f.write(content)
    print('[patch] @ag-ui/client patched (tolerant of missing RUN_STARTED)')
else:
    print('[patch] WARNING: @ag-ui/client exact pattern not found – skipping')
    sys.exit(1)
"
  else
    echo "[patch] WARNING: @ag-ui/client RUN_STARTED pattern not found – skipping"
  fi
fi
