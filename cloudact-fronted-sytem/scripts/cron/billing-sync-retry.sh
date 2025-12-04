#!/bin/bash
# =============================================================================
# Billing Sync Retry Script
# =============================================================================
# Processes failed Stripe→BigQuery sync attempts from the retry queue.
# Uses exponential backoff (1min, 2min, 4min, 8min, 16min).
#
# Schedule: Every 5 minutes
# Example cron: */5 * * * * /path/to/billing-sync-retry.sh
#
# Environment variables required:
#   APP_URL - Base URL of the frontend (e.g., https://app.cloudact.ai)
#   CRON_SECRET - Secret key for authentication
# =============================================================================

set -e

# Configuration
APP_URL="${APP_URL:-http://localhost:3000}"
CRON_SECRET="${CRON_SECRET:-}"
LIMIT="${1:-10}"  # Number of items to process per run

# Validate required env vars
if [ -z "$CRON_SECRET" ]; then
    echo "[ERROR] CRON_SECRET environment variable is required"
    exit 1
fi

echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] Starting billing sync retry (limit: $LIMIT)"

# Call the API endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${APP_URL}/api/cron/billing-sync" \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -d "{\"action\": \"retry\", \"limit\": ${LIMIT}}")

# Extract body and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check response
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "[SUCCESS] Response: $BODY"

    # Parse and log stats
    PROCESSED=$(echo "$BODY" | jq -r '.processed // 0')
    SUCCEEDED=$(echo "$BODY" | jq -r '.succeeded // 0')
    FAILED=$(echo "$BODY" | jq -r '.failed // 0')

    echo "[STATS] Processed: $PROCESSED, Succeeded: $SUCCEEDED, Failed: $FAILED"
else
    echo "[ERROR] HTTP $HTTP_CODE: $BODY"
    exit 1
fi

echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] Billing sync retry completed"
