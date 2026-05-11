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

if grep -q 'config:w&&{\.\.\.w,configurable:void 0}' "$TARGET" 2>/dev/null; then
  echo "[patch] @ag-ui/langgraph v${EXPECTED_VERSION} already patched"
  exit 0
fi

if ! grep -q 'config:w,context:{' "$TARGET" 2>/dev/null; then
  echo "[patch] WARNING: expected pattern not found in @ag-ui/langgraph – skipping"
  exit 0
fi

sed -i.bak 's/config:w,context:{/config:w\&\&{...w,configurable:void 0},context:{/' "$TARGET"
rm -f "${TARGET}.bak"
echo "[patch] @ag-ui/langgraph patched (configurable stripped when context present)"
