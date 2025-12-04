#!/bin/bash
# =============================================================================
# Billing Sync Queue Stats Script
# =============================================================================
# Gets current sync queue statistics for monitoring/alerting.
# Returns pending, processing, failed counts and oldest pending item.
#
# Schedule: Every 15 minutes (for monitoring dashboards)
# Example cron: */15 * * * * /path/to/billing-sync-stats.sh
#
# Environment variables required:
#   APP_URL - Base URL of the frontend (e.g., https://app.cloudact.ai)
#   CRON_SECRET - Secret key for authentication
# =============================================================================

set -e

# Configuration
APP_URL="${APP_URL:-http://localhost:3000}"
CRON_SECRET="${CRON_SECRET:-}"

# Validate required env vars
if [ -z "$CRON_SECRET" ]; then
    echo "[ERROR] CRON_SECRET environment variable is required"
    exit 1
fi

# Call the API endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${APP_URL}/api/cron/billing-sync" \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -d '{"action": "stats"}')

# Extract body and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check response
if [ "$HTTP_CODE" -eq 200 ]; then
    # Parse stats
    PENDING=$(echo "$BODY" | jq -r '.pending // 0')
    PROCESSING=$(echo "$BODY" | jq -r '.processing // 0')
    FAILED=$(echo "$BODY" | jq -r '.failed // 0')
    COMPLETED_TODAY=$(echo "$BODY" | jq -r '.completedToday // 0')
    OLDEST=$(echo "$BODY" | jq -r '.oldestPending // "none"')

    echo "billing_sync_pending=$PENDING"
    echo "billing_sync_processing=$PROCESSING"
    echo "billing_sync_failed=$FAILED"
    echo "billing_sync_completed_today=$COMPLETED_TODAY"
    echo "billing_sync_oldest_pending=$OLDEST"

    # Alert if too many pending
    if [ "$PENDING" -gt 50 ]; then
        echo "[ALERT] High number of pending syncs: $PENDING"
    fi

    # Alert if too many failed
    if [ "$FAILED" -gt 10 ]; then
        echo "[ALERT] High number of failed syncs: $FAILED"
    fi
else
    echo "[ERROR] HTTP $HTTP_CODE: $BODY"
    exit 1
fi
