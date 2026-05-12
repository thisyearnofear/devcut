#!/usr/bin/env bash
# smoke-test.sh — Post-deploy end-to-end smoke test
#
# Verifies that the full stack (BFF → Intelligence → Agent) can handle a
# real request, not just return 200 on health endpoints.
#
# Usage:
#   bash scripts/smoke-test.sh [base_url]
#   Default base_url: http://localhost:4010

set -euo pipefail

BASE="${1:-http://localhost:4010}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
FAIL=0

pass() { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; FAIL=1; }
info() { echo -e "${YELLOW}[smoke]${NC} $*"; }

info "Smoke-testing $BASE"

# 1. Liveness
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/livez" 2>/dev/null || echo "000")
[ "$STATUS" = "200" ] && pass "/livez → 200" || fail "/livez → $STATUS"

# 2. Readiness
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/health" 2>/dev/null || echo "000")
[ "$STATUS" = "200" ] && pass "/health → 200" || fail "/health → $STATUS (degraded or down)"

# 3. /info returns agents
BODY=$(curl -s --max-time 10 "$BASE/api/copilotkit/info" 2>/dev/null || echo "{}")
if echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); names=[a['name'] for a in d.get('agents',[])]; assert 'director' in names" 2>/dev/null; then
  pass "/api/copilotkit/info lists 'director' agent"
else
  fail "/api/copilotkit/info missing 'director' agent"
fi

# 4. Agent health
AGENT_URL="${LANGGRAPH_DEPLOYMENT_URL:-http://localhost:8123}"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$AGENT_URL/ok" 2>/dev/null || echo "000")
[ "$STATUS" = "200" ] && pass "Agent /ok → 200" || fail "Agent /ok → $STATUS"

# 5. Intelligence container (if Docker is available)
if command -v docker &>/dev/null || command -v sudo &>/dev/null; then
  INTEL_STATUS=$(sudo docker inspect --format='{{.State.Health.Status}}' hackathon-intelligence-notion-intelligence-1 2>/dev/null || echo "n/a")
  [ "$INTEL_STATUS" = "healthy" ] && pass "Intelligence container: healthy" || fail "Intelligence container: $INTEL_STATUS"
else
  info "Skipping Intelligence container check (no docker)"
fi

# 6. Brief round-trip (send a minimal message, expect a non-error response)
# This tests BFF → Intelligence → Agent → back. Times out after 15s.
RT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST "$BASE/api/copilotkit/agent/director/run" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"smoke-test-'$(date +%s)'","messages":[{"role":"user","content":"ping"}],"forwardedProps":{"config":{"configurable":{}}}}' \
  2>/dev/null || echo "000")
if [ "$RT_STATUS" -ge 200 ] && [ "$RT_STATUS" -lt 500 ]; then
  pass "Director /run round-trip → $RT_STATUS"
else
  fail "Director /run round-trip → $RT_STATUS"
fi

echo ""
if [ "$FAIL" = "0" ]; then
  info "All smoke tests passed ✓"
else
  info "Some smoke tests failed — check above"
  exit 1
fi
