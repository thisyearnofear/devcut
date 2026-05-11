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

if [ ! -f "$TARGET" ]; then
  echo "[patch] @ag-ui/langgraph not found – skipping"
  exit 0
fi

if grep -q 'config:w&&{\.\.\.w,configurable:void 0}' "$TARGET" 2>/dev/null; then
  echo "[patch] @ag-ui/langgraph already patched"
  exit 0
fi

if ! grep -q 'config:w,context:{' "$TARGET" 2>/dev/null; then
  echo "[patch] WARNING: expected pattern not found in @ag-ui/langgraph – skipping"
  exit 0
fi

sed -i.bak 's/config:w,context:{/config:w\&\&{...w,configurable:void 0},context:{/' "$TARGET"
rm -f "${TARGET}.bak"
echo "[patch] @ag-ui/langgraph patched (configurable stripped when context present)"
