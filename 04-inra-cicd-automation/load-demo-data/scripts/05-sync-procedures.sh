#!/bin/bash
# Sync stored procedures to BigQuery
# Run this BEFORE running cost pipelines (04-run-pipelines.sh)
#
# This deploys all stored procedures from:
#   03-data-pipeline-service/configs/system/procedures/
# To:
#   BigQuery organizations dataset
#
# Procedures deployed:
#   - sp_calculate_subscription_plan_costs_daily
#   - sp_convert_subscription_costs_to_focus_1_3
#   - sp_run_subscription_costs_pipeline
#   - sp_consolidate_genai_usage_daily
#   - sp_consolidate_genai_costs_daily
#   - sp_convert_genai_to_focus_1_3
#   - sp_convert_cloud_costs_to_focus_1_3
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Syncing Stored Procedures"
echo "================================================"
echo ""

# ======================================================
# Configuration
# ======================================================

PIPELINE_SERVICE_URL="${PIPELINE_SERVICE_URL:-http://localhost:8001}"

# CA_ROOT_API_KEY is required for procedure sync
if [[ -z "$CA_ROOT_API_KEY" ]]; then
    log_error "CA_ROOT_API_KEY environment variable is required"
    log_error "This is the system admin key used for procedure deployment"
    exit 1
fi

log_info "Pipeline Service: ${PIPELINE_SERVICE_URL}"
echo ""

# ======================================================
# Sync Procedures
# ======================================================

log_info "Syncing stored procedures to BigQuery..."

response=$(curl -s -w "\n%{http_code}" -X POST \
    "${PIPELINE_SERVICE_URL}/api/v1/procedures/sync" \
    -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}" \
    -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    log_info "Procedures synced successfully!"
    echo ""

    # Parse and display results
    echo "$body" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'synced' in d:
        print(f\"  Synced: {len(d['synced'])} procedures\")
        for p in d['synced'][:10]:
            print(f\"    - {p}\")
        if len(d['synced']) > 10:
            print(f\"    ... and {len(d['synced']) - 10} more\")
    if 'failed' in d and d['failed']:
        print(f\"  Failed: {len(d['failed'])} procedures\")
        for p in d['failed']:
            print(f\"    - {p}\")
except Exception as e:
    print(f\"  Response: {sys.stdin.read()}\")
" 2>/dev/null || echo "  Response: ${body}"
else
    log_error "Procedure sync failed (HTTP ${http_code})"
    log_error "Response: ${body}"
    exit 1
fi

echo ""

# ======================================================
# List Deployed Procedures
# ======================================================

log_info "Listing deployed procedures..."

list_response=$(curl -s -X GET \
    "${PIPELINE_SERVICE_URL}/api/v1/procedures" \
    -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}")

echo "$list_response" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    procedures = d.get('procedures', d) if isinstance(d, dict) else d
    if isinstance(procedures, list):
        print(f\"  Total procedures: {len(procedures)}\")
        for p in sorted(procedures)[:15]:
            print(f\"    - {p}\")
        if len(procedures) > 15:
            print(f\"    ... and {len(procedures) - 15} more\")
    else:
        print(f\"  Response: {d}\")
except Exception as e:
    pass
" 2>/dev/null || true

echo ""
log_info "Procedure sync complete!"
echo ""
log_info "NEXT STEP: Run pipelines with:"
log_info "  ./scripts/04-run-pipelines.sh"
