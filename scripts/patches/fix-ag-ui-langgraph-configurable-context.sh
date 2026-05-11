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
    # Use python via stdin heredoc to avoid shell-escaping the backticks
    # in the minified template literal `First event must be 'RUN_STARTED'`.
    TARGET_FILE="$CLIENT_TARGET" python3 <<'PYEOF'
import os, sys, re
target = os.environ['TARGET_FILE']
with open(target) as f:
    content = f.read()

# .mjs bundle (uses minified locals l, t, i, n, _)
mjs_pat = re.compile(
    r"if\(!l\)\{if\(l=!0,t!==i\.RUN_STARTED&&t!==i\.RUN_ERROR\)return _\(\(\)=>new n\(`First event must be 'RUN_STARTED'`\)\)\}"
)
# .js bundle (uses l.EventType.* and l.AGUIError, throwError from rxjs as d)
js_pat = re.compile(
    r"if\(!s\)\{if\(s=!0,t!==l\.EventType\.RUN_STARTED&&t!==l\.EventType\.RUN_ERROR\)return\s*\(0,d\.throwError\)\(\(\)=>new l\.AGUIError\(`First event must be 'RUN_STARTED'`\)\)\}"
)

new_content, n1 = mjs_pat.subn("if(!l){l=!0}", content)
new_content, n2 = js_pat.subn("if(!s){s=!0}", new_content)

if n1 + n2 == 0:
    print('[patch] WARNING: @ag-ui/client RUN_STARTED regex did not match – skipping')
    sys.exit(1)

with open(target, 'w') as f:
    f.write(new_content)
print(f'[patch] @ag-ui/client patched (tolerant of missing RUN_STARTED, {n1+n2} site(s))')
PYEOF
  else
    echo "[patch] WARNING: @ag-ui/client RUN_STARTED pattern not found – skipping"
  fi
fi

# --- Patch 4: request RUN_STARTED replay in run-mode channel join ----------
# Root-cause fix for the race that caused the "First event must be 'RUN_STARTED'"
# error.  The Intelligence runner publishes RUN_STARTED to the ingestion channel
# before the browser has time to open its WebSocket and join thread:${threadId}.
# Connect-mode joins already include `last_seen_event_id` so Intelligence can
# replay missed events; run-mode joins do not, so RUN_STARTED is lost.
#
# Patch: also send `last_seen_event_id` in run mode (null on fresh run, real
# cursor on reconnect) so Intelligence replays the run's events from the start.
# Files: @copilotkit/core dist bundles (index.mjs, index.cjs, index.umd.js).
for CORE_TARGET in \
  node_modules/@copilotkit/core/dist/index.mjs \
  node_modules/@copilotkit/core/dist/index.cjs \
  node_modules/@copilotkit/core/dist/index.umd.js
do
  if [ ! -f "$CORE_TARGET" ]; then continue; fi
  if grep -qF 'stream_mode: "run",' "$CORE_TARGET" 2>/dev/null && \
     ! grep -qE 'stream_mode: "run",\s*run_id: input\.runId,\s*last_seen_event_id' "$CORE_TARGET" 2>/dev/null; then
    TARGET_FILE="$CORE_TARGET" python3 <<'PYEOF'
import os, sys, re
target = os.environ['TARGET_FILE']
with open(target) as f:
    content = f.read()
# Match the run-mode object literal: { stream_mode: "run", run_id: input.runId }
# allowing arbitrary whitespace (and trailing commas) between fields.
pat = re.compile(
    r'(stream_mode:\s*"run",\s*run_id:\s*input\.runId)(\s*\})',
    re.MULTILINE,
)
new_content, n = pat.subn(
    r'\1,\n\t\t\tlast_seen_event_id: replayCursor === void 0 ? null : replayCursor\2',
    content,
)
if n == 0:
    print(f'[patch] WARNING: @copilotkit/core run-mode replay regex did not match in {target}')
    sys.exit(0)
with open(target, 'w') as f:
    f.write(new_content)
print(f'[patch] @copilotkit/core run-mode replay patched in {target} ({n} site(s))')
PYEOF
  else
    echo "[patch] @copilotkit/core run-mode replay already patched in $CORE_TARGET (or pattern absent)"
  fi
done

# Also patch index.js (CJS bundle of @ag-ui/client) — same fix, different minified vars.
CLIENT_TARGET_CJS="node_modules/@ag-ui/client/dist/index.js"
if [ -f "$CLIENT_TARGET_CJS" ] && grep -qF "First event must be" "$CLIENT_TARGET_CJS" 2>/dev/null; then
  TARGET_FILE="$CLIENT_TARGET_CJS" python3 <<'PYEOF'
import os, sys, re
target = os.environ['TARGET_FILE']
with open(target) as f:
    content = f.read()
js_pat = re.compile(
    r"if\(!s\)\{if\(s=!0,t!==l\.EventType\.RUN_STARTED&&t!==l\.EventType\.RUN_ERROR\)return\s*\(0,d\.throwError\)\(\(\)=>new l\.AGUIError\(`First event must be 'RUN_STARTED'`\)\)\}"
)
new_content, n = js_pat.subn("if(!s){s=!0}", content)
if n == 0:
    print('[patch] WARNING: @ag-ui/client (CJS) RUN_STARTED regex did not match – skipping')
    sys.exit(0)
with open(target, 'w') as f:
    f.write(new_content)
print(f'[patch] @ag-ui/client (CJS) patched ({n} site(s))')
PYEOF
fi
