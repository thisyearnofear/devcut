#!/usr/bin/env bash
# MOCK golden path — no API keys.
# 1) Unit tests for hyperframes_kit
# 2) Materialize fixture kit to docs/demos/fixtures/golden-challenge-cut/
# 3) Assert required files exist
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> hyperframes_kit unit tests"
(cd apps/agent && uv run python -m unittest tests.test_hyperframes_kit -v)

echo "==> frontend kit + golden constant"
node "$REPO_ROOT/scripts/assert-frontend-kit.mjs"

echo "==> materialize golden MOCK kit"
(cd apps/agent && uv run python "$REPO_ROOT/scripts/materialize_hf_kit.py" --golden)

FIXTURE="$REPO_ROOT/docs/demos/fixtures/golden-challenge-cut"
for f in BRIEF.md assets.json README.md ASSETS.md kit.meta.json; do
  if [[ ! -f "$FIXTURE/$f" ]]; then
    echo "FAIL: missing $FIXTURE/$f" >&2
    exit 1
  fi
done

if ! grep -q "workflow: product-launch-video" "$FIXTURE/BRIEF.md"; then
  echo "FAIL: BRIEF.md missing workflow" >&2
  exit 1
fi

if ! grep -q "Genblaze + B2 Challenge Cut" "$FIXTURE/BRIEF.md"; then
  echo "FAIL: BRIEF.md missing golden title" >&2
  exit 1
fi

ASSET_COUNT="$(python3 -c "import json; print(len(json.load(open('$FIXTURE/assets.json'))['assets']))")"
if [[ "$ASSET_COUNT" -lt 11 ]]; then
  echo "FAIL: expected >=11 assets, got $ASSET_COUNT" >&2
  exit 1
fi

echo "==> OK MOCK golden path"
echo "    Fixture: docs/demos/fixtures/golden-challenge-cut/"
echo "    Next (with keys): film LIVE cut, replace MOCK URLs in assets.json"
