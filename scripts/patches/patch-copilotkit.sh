#!/usr/bin/env bash
# Patch @copilotkit/core: increase WebSocket retry limit from 5 → 10
# so Intelligence has more time to issue a valid join_token before the
# client gives up. Applied automatically via postinstall.
set -e

CORE_DIR="$(pwd)/node_modules/@copilotkit/core/dist"

for f in index.cjs index.mjs index.umd.js; do
  FILE="$CORE_DIR/$f"
  if [ -f "$FILE" ]; then
    if grep -q "MAX_SOCKET_RETRIES = 5" "$FILE"; then
      sed -i.bak 's/MAX_SOCKET_RETRIES = 5/MAX_SOCKET_RETRIES = 10/g' "$FILE"
      rm -f "$FILE.bak"
      echo "[patch-copilotkit] patched $f (5 → 10 retries)"
    else
      echo "[patch-copilotkit] $f already patched or changed upstream, skipping"
    fi
  fi
done
