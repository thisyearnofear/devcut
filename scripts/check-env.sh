#!/usr/bin/env bash
# scripts/check-env.sh — pre-flight wired into `predev` (npm convention).
#
# Validates, in order, that everything `npm run dev` needs is in place:
#   1. Docker daemon up.
#   2. npx is available so `@notionhq/notion-mcp-server` can be fetched
#      on demand. We don't pull the package here (slow) — we just prove
#      the resolver works.
#   3. apps/agent/.env (or root .env) has at least one planner key:
#      NVIDIA_API_KEY | VENICE_API_KEY | GEMINI_API_KEY
#      Plus Notion vars if you use the leads demo.
#   4. Notion is reachable AND the leads database is shared with the
#      integration (skipped when Notion vars are unset).
#
# Collects every problem into a numbered list rather than bailing on the
# first failure, so participants can fix the whole batch in one pass.
# Exit 0 silently on success.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROBLEMS=()

# ---------- 1. Docker daemon -------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  PROBLEMS+=("Docker isn't installed. Install Docker Desktop and re-try.")
elif ! docker info >/dev/null 2>&1; then
  PROBLEMS+=("Docker isn't running. Start Docker Desktop and re-try.")
fi

# ---------- 2. npx (for the Notion MCP server) -------------------------------
if ! command -v npx >/dev/null 2>&1; then
  PROBLEMS+=("npx is not on PATH. Install Node.js 20+ (npm bundles npx).")
fi

# ---------- 3. planner + optional Notion ------------------------------------
# Prefer apps/agent/.env; also accept keys from root .env (agent loads both).
AGENT_ENV="$REPO_ROOT/apps/agent/.env"
ROOT_ENV="$REPO_ROOT/.env"
if [[ ! -f "$AGENT_ENV" && ! -f "$ROOT_ENV" ]]; then
  PROBLEMS+=("No .env found. Run: cp .env.example .env (and optionally cp apps/agent/.env.example apps/agent/.env), then set NVIDIA_API_KEY.")
else
  read_var() {
    local key="$1"
    local file val=""
    for file in "$AGENT_ENV" "$ROOT_ENV"; do
      [[ -f "$file" ]] || continue
      val="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//; s/^[\"']//; s/[\"'][[:space:]]*$//; s/[[:space:]]+$//" || true)"
      [[ -n "$val" ]] && break
    done
    printf '%s' "$val"
  }
  is_stub() {
    local v="$1"
    [[ -z "$v" ]] && return 0
    case "$v" in
      stub*|"<paste"*|"<set"*|"replace-with-"*) return 0 ;;
    esac
    return 1
  }

  nvidia="$(read_var NVIDIA_API_KEY || true)"
  venice="$(read_var VENICE_API_KEY || true)"
  gemini="$(read_var GEMINI_API_KEY || true)"
  if is_stub "$nvidia" && is_stub "$venice" && is_stub "$gemini"; then
    PROBLEMS+=("No planner API key set. Prefer NVIDIA_API_KEY (https://build.nvidia.com); fallbacks: VENICE_API_KEY, GEMINI_API_KEY. See docs/providers.md.")
  fi

  # Notion is only required for the /leads demo — skip if unset.
  notion_auth="$(read_var NOTION_TOKEN || true)"
  notion_db="$(read_var NOTION_LEADS_DATABASE_ID || true)"
  if ! is_stub "$notion_auth" || ! is_stub "$notion_db"; then
    if is_stub "$notion_auth"; then
      PROBLEMS+=("NOTION_TOKEN is unset (or a stub). Get a token at https://notion.so/my-integrations.")
    fi
    if is_stub "$notion_db"; then
      PROBLEMS+=("NOTION_LEADS_DATABASE_ID is unset. Paste the database id from your Notion URL.")
    fi
  fi
fi

# ---------- 4. Notion reachable + database shared ---------------------------
# Only when Notion vars are configured (DevCut can run without Notion).
if [[ ${#PROBLEMS[@]} -eq 0 ]] && declare -F read_var >/dev/null && declare -F is_stub >/dev/null; then
  notion_auth="$(read_var NOTION_TOKEN || true)"
  notion_db="$(read_var NOTION_LEADS_DATABASE_ID || true)"
  if ! is_stub "$notion_auth" && ! is_stub "$notion_db"; then
    HEALTH_OUT="$(cd "$REPO_ROOT/apps/agent" && uv run python -m src.notion_tools --check 2>&1 || true)"
    if ! grep -q "^OK: " <<<"$HEALTH_OUT"; then
      PROBLEMS+=("Notion health check failed:
$HEALTH_OUT")
    fi
  fi
fi

# ---------- Report -----------------------------------------------------------
if [[ ${#PROBLEMS[@]} -gt 0 ]]; then
  echo ""
  echo "Pre-flight check found ${#PROBLEMS[@]} problem(s):"
  echo ""
  i=1
  for p in "${PROBLEMS[@]}"; do
    # Indent multi-line problems so they read as one item.
    first_line="${p%%$'\n'*}"
    rest="${p#*$'\n'}"
    echo "  $i. $first_line"
    if [[ "$rest" != "$p" ]]; then
      while IFS= read -r line; do
        echo "     $line"
      done <<<"$rest"
    fi
    i=$((i+1))
  done
  echo ""
  echo "Fix these and re-run \`npm run dev\`."
  exit 1
fi

exit 0
