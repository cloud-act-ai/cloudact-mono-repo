#!/bin/bash
# =============================================================================
# Billing Reconciliation Script
# =============================================================================
# Full reconciliation between Stripe subscriptions and Supabase/BigQuery.
# Compares all active subscriptions and syncs any mismatches.
#
# Schedule: Daily at 2:00 AM UTC
# Example cron: 0 2 * * * /path/to/billing-reconciliation.sh
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

echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] Starting billing reconciliation"

# Call the API endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" \
    --max-time 300 \
    -X POST "${APP_URL}/api/cron/billing-sync" \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -d '{"action": "reconcile"}')

# Extract body and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check response
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "[SUCCESS] Response: $BODY"

    # Parse and log stats
    CHECKED=$(echo "$BODY" | jq -r '.checked // 0')
    SYNCED=$(echo "$BODY" | jq -r '.synced // 0')
    ERRORS=$(echo "$BODY" | jq -r '.errors | length // 0')
    MISMATCHES=$(echo "$BODY" | jq -r '.mismatches | length // 0')

    echo "[STATS] Checked: $CHECKED, Synced: $SYNCED, Mismatches: $MISMATCHES, Errors: $ERRORS"

    # Log any errors
    if [ "$ERRORS" -gt 0 ]; then
        echo "[ERRORS]:"
        echo "$BODY" | jq -r '.errors[]'
    fi

    # Log mismatches for audit
    if [ "$MISMATCHES" -gt 0 ]; then
        echo "[MISMATCHES]:"
        echo "$BODY" | jq -r '.mismatches[] | "\(.orgSlug): \(.field) - Stripe: \(.stripe), Supabase: \(.supabase)"'
    fi
else
    echo "[ERROR] HTTP $HTTP_CODE: $BODY"
    exit 1
fi

echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] Billing reconciliation completed"
