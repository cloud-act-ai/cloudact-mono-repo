#!/bin/bash
# Run all cost pipelines to generate final costs from raw data
# This transforms raw demo data → cost_data_standard_1_3 (FOCUS 1.3)
#
# Prerequisites:
#   1. Raw data loaded (01-load-genai-data.sh, 02-load-cloud-data.sh, 03-load-subscriptions.sh)
#   2. Pricing seed loaded (00-load-pricing-seed.sh)
#   3. Stored procedures synced (05-sync-procedures.sh)
#
# Pipeline Flow:
#   subscription_plans → sp_calculate_subscription_plan_costs_daily → subscription_plan_costs_daily
#   genai_payg_usage_raw + genai_payg_pricing → sp_consolidate_genai_costs_daily → genai_costs_daily_unified
#   cloud_*_billing_raw_daily → sp_convert_cloud_costs_to_focus_1_3 → cost_data_standard_1_3
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Running Cost Pipelines"
echo "================================================"
echo ""

# ======================================================
# Configuration
# ======================================================

# API endpoints
PIPELINE_SERVICE_URL="${PIPELINE_SERVICE_URL:-http://localhost:8001}"
API_SERVICE_URL="${API_SERVICE_URL:-http://localhost:8000}"

# Date range (default: full year 2025)
START_DATE="${START_DATE:-2025-01-01}"
END_DATE="${END_DATE:-2025-12-28}"

# Required environment variables
if [[ -z "$ORG_API_KEY" ]]; then
    log_error "ORG_API_KEY environment variable is required"
    log_error "Get it from: curl -s '${API_SERVICE_URL}/api/v1/admin/dev/api-key/${ORG_SLUG}' -H 'X-CA-Root-Key: \$CA_ROOT_API_KEY'"
    exit 1
fi

log_info "Organization: ${ORG_SLUG}"
log_info "Date Range: ${START_DATE} to ${END_DATE}"
log_info "Pipeline Service: ${PIPELINE_SERVICE_URL}"
echo ""

# ======================================================
# Helper Functions
# ======================================================

run_pipeline() {
    local pipeline_path="$1"
    local pipeline_name="$2"
    local extra_params="${3:-}"

    log_info "Running: ${pipeline_name}..."
    log_info "  Endpoint: ${PIPELINE_SERVICE_URL}/api/v1/pipelines/run/${ORG_SLUG}/${pipeline_path}"

    local payload="{\"start_date\":\"${START_DATE}\",\"end_date\":\"${END_DATE}\"${extra_params}}"

    local response
    response=$(curl -s -w "\n%{http_code}" -X POST \
        "${PIPELINE_SERVICE_URL}/api/v1/pipelines/run/${ORG_SLUG}/${pipeline_path}" \
        -H "X-API-Key: ${ORG_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "${payload}")

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        log_info "  Status: SUCCESS (HTTP ${http_code})"
        echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Run ID: {d.get(\"run_id\", \"N/A\")}')" 2>/dev/null || true
    else
        log_error "  Status: FAILED (HTTP ${http_code})"
        log_error "  Response: ${body}"
        return 1
    fi
    echo ""
}

# ======================================================
# Step 1: Subscription Costs
# ======================================================

echo "========================================"
echo "  STEP 1: Subscription Costs"
echo "========================================"
echo ""

run_pipeline "subscription/costs/subscription_cost" "SaaS Subscription Cost Pipeline"

# ======================================================
# Step 2: GenAI Costs (per provider)
# ======================================================

echo "========================================"
echo "  STEP 2: GenAI Costs"
echo "========================================"
echo ""

# Run individual provider pipelines
run_pipeline "genai/payg/openai" "OpenAI PAYG Costs"
run_pipeline "genai/payg/anthropic" "Anthropic PAYG Costs"
run_pipeline "genai/payg/gemini" "Gemini PAYG Costs"

# Run unified consolidation (combines all providers)
run_pipeline "genai/unified/consolidate" "GenAI Unified Consolidation"

# ======================================================
# Step 3: Cloud Costs (per provider)
# ======================================================

echo "========================================"
echo "  STEP 3: Cloud Costs"
echo "========================================"
echo ""

# Note: Cloud billing data already has costs, we just convert to FOCUS 1.3
run_pipeline "cloud/unified/focus_convert" "Cloud FOCUS 1.3 Conversion"

# ======================================================
# Verify Results
# ======================================================

echo "========================================"
echo "  Verification"
echo "========================================"
echo ""

log_info "Checking cost_data_standard_1_3..."
bq query --use_legacy_sql=false \
    "SELECT
       x_source_system,
       COUNT(*) as records,
       ROUND(SUM(BilledCost), 2) as total_billed_cost,
       MIN(ChargePeriodStart) as first_date,
       MAX(ChargePeriodEnd) as last_date
     FROM \`${PROJECT_ID}.${DATASET}.cost_data_standard_1_3\`
     GROUP BY x_source_system
     ORDER BY x_source_system"

echo ""
log_info "Pipeline execution complete!"
echo ""
log_info "Dashboard should now show costs for date range: ${START_DATE} to ${END_DATE}"
