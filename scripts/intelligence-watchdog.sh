#!/usr/bin/env bash
# intelligence-watchdog.sh — Auto-restart Intelligence container if unhealthy
#
# Usage:
#   Add to crontab (every 30s via two entries):
#     * * * * * bash /opt/gen-ui/scripts/intelligence-watchdog.sh >> /opt/gen-ui/logs/watchdog.log 2>&1
#     * * * * * sleep 30 && bash /opt/gen-ui/scripts/intelligence-watchdog.sh >> /opt/gen-ui/logs/watchdog.log 2>&1
#
# The script checks the Intelligence container's Docker health status.
# If unhealthy or not running, it restarts the container and logs the event.

set -euo pipefail

CONTAINER="hackathon-intelligence-notion-intelligence-1"
LOG_PREFIX="[watchdog $(date -Iseconds)]"

# Check if container exists
if ! sudo docker inspect "$CONTAINER" &>/dev/null; then
  echo "$LOG_PREFIX SKIP — container $CONTAINER not found"
  exit 0
fi

STATUS=$(sudo docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "unknown")
RUNNING=$(sudo docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo "false")

if [ "$RUNNING" != "true" ]; then
  echo "$LOG_PREFIX RESTART — container not running (state=$STATUS)"
  sudo docker restart "$CONTAINER"
  echo "$LOG_PREFIX RESTARTED"
  exit 0
fi

if [ "$STATUS" = "healthy" ]; then
  # All good — silent exit (no log spam).
  exit 0
fi

# Unhealthy or unknown — probe the API directly before restarting.
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:4203/api/threads" -H "Authorization: Bearer ${INTELLIGENCE_API_KEY:-cpk_sPRVSEED_seed0privat0longtoken00}" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  # API is responding — container is functional despite Docker health status.
  exit 0
fi

echo "$LOG_PREFIX RESTART — status=$STATUS http=$HTTP_CODE"
sudo docker restart "$CONTAINER"
echo "$LOG_PREFIX RESTARTED — waiting 10s for startup"
sleep 10

# Verify recovery
NEW_STATUS=$(sudo docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "unknown")
echo "$LOG_PREFIX POST-RESTART status=$NEW_STATUS"
