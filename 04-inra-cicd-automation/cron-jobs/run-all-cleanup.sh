#!/bin/bash
# =============================================================================
# Database Cleanup Script
# =============================================================================
# Runs all scheduled cleanup tasks via Supabase RPC.
# Cleans up: rate limits, webhook events, deletion tokens, expired invites,
# and old billing sync queue entries.
#
# Schedule: Daily at 3:00 AM UTC
# Example cron: 0 3 * * * /path/to/run-all-cleanup.sh
#
# Environment variables required:
#   SUPABASE_URL - Supabase project URL
#   SUPABASE_SERVICE_ROLE_KEY - Service role key for RPC calls
# =============================================================================

set -e

# Configuration
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

# Validate required env vars
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    exit 1
fi

echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] Starting database cleanup"

# Call the run_scheduled_cleanup RPC function
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/run_scheduled_cleanup" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

# Extract body and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check response
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "[SUCCESS] Cleanup completed"
    echo "$BODY" | jq '.'
else
    echo "[ERROR] HTTP $HTTP_CODE: $BODY"
    exit 1
fi

echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] Database cleanup completed"
