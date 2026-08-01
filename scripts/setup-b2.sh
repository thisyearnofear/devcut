#!/usr/bin/env bash
# Interactive Backblaze B2 bootstrap for Director's Canvas + Genblaze.
# Prereq: a Backblaze account — https://www.backblaze.com/sign-up/cloud-storage
#
# Usage:
#   bash scripts/setup-b2.sh
#
# After this succeeds, GENBLAZE_ENABLED=1 and B2_* are written to .env
# (and apps/agent/.env). Then run:
#   cd apps/agent && uv run python scripts/smoke_genblaze_b2.py --upload

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUCKET_DEFAULT="directors-canvas-media"
REGION_DEFAULT="us-west-004"

echo "=== Director's Canvas — Backblaze B2 setup ==="
echo
echo "1) Create/sign in: https://secure.backblaze.com/user_signin.htm"
echo "2) Application Keys → Add a New Application Key"
echo "   - Allow access to All buckets (or create the bucket first)"
echo "   - Check 'Allow List All Bucket Names' if bucket-restricted"
echo "   - Read and Write"
echo "3) Copy keyID + applicationKey (shown once)"
echo

read -r -p "B2_KEY_ID: " B2_KEY_ID
read -r -s -p "B2_APP_KEY: " B2_APP_KEY
echo
read -r -p "B2_BUCKET [${BUCKET_DEFAULT}]: " B2_BUCKET
B2_BUCKET="${B2_BUCKET:-$BUCKET_DEFAULT}"
read -r -p "B2_REGION [${REGION_DEFAULT}]: " B2_REGION
B2_REGION="${B2_REGION:-$REGION_DEFAULT}"

if [[ -z "$B2_KEY_ID" || -z "$B2_APP_KEY" ]]; then
  echo "ERROR: key ID and application key are required." >&2
  exit 1
fi

# Optional: create public bucket via b2 CLI if installed
if command -v b2 >/dev/null 2>&1; then
  echo
  echo "Authorizing b2 CLI and ensuring public bucket exists…"
  b2 account authorize "$B2_KEY_ID" "$B2_APP_KEY" >/dev/null
  if ! b2 bucket list 2>/dev/null | grep -q "$B2_BUCKET"; then
    b2 bucket create "$B2_BUCKET" allPublic || true
  fi
  # Try to read endpoint region from bucket
  ENDPOINT="$(b2 bucket get "$B2_BUCKET" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('endpoint') or d.get('bucketInfo',{}).get('endpoint',''))" 2>/dev/null || true)"
  if [[ -n "${ENDPOINT:-}" ]]; then
    # endpoint like s3.us-west-004.backblazeb2.com
    maybe_region="$(echo "$ENDPOINT" | sed -n 's/.*s3\.\([^.]*\)\.backblazeb2.com.*/\1/p')"
    if [[ -n "$maybe_region" ]]; then
      B2_REGION="$maybe_region"
      echo "Detected region from bucket endpoint: $B2_REGION"
    fi
  fi
else
  echo
  echo "Tip: install the B2 CLI to auto-create the public bucket:"
  echo "  pipx install b2   # or: uv tool install b2"
  echo "Create bucket in UI as Public: https://secure.backblaze.com/b2_buckets.htm"
fi

upsert_env() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # portable-ish in-place replace
    python3 - "$file" "$key" "$val" <<'PY'
import sys
from pathlib import Path
path, key, val = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text().splitlines()
out, found = [], False
for line in lines:
    if line.startswith(key + "="):
        out.append(f"{key}={val}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"{key}={val}")
path.write_text("\n".join(out) + "\n")
PY
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$file"
  fi
}

for f in .env apps/agent/.env; do
  upsert_env "$f" GENBLAZE_ENABLED 1
  upsert_env "$f" B2_KEY_ID "$B2_KEY_ID"
  upsert_env "$f" B2_APP_KEY "$B2_APP_KEY"
  upsert_env "$f" B2_BUCKET "$B2_BUCKET"
  upsert_env "$f" B2_REGION "$B2_REGION"
  echo "Updated $f"
done

echo
echo "Running smoke upload…"
cd apps/agent
uv run python scripts/smoke_genblaze_b2.py --upload

echo
echo "Done. Restart the agent (langgraph / PM2) so it picks up the new env."
echo "Submission notes: docs/hackathon-backblaze.md"
