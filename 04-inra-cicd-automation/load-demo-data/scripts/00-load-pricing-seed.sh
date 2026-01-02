#!/bin/bash
# Load GenAI pricing seed data into BigQuery
# This provides reference pricing for cost calculations
# Run this BEFORE running GenAI pipelines
#
# IMPORTANT: Loads to ORG's dataset (not global organizations dataset)
# because pipelines read pricing from {org}_local.genai_payg_pricing
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Loading GenAI Pricing Seed Data"
echo "================================================"
echo ""

check_requirements
check_auth
check_org_slug
check_dataset

# ======================================================
# Configuration
# ======================================================

# Pricing seed data location (in demo-data folder)
# CSV must match org's genai_payg_pricing table schema
PRICING_DATA="${SCRIPT_DIR}/../data/pricing/genai_payg_pricing.csv"

# Target: ORG's dataset (not global)
# Pipelines read from {org}_local.genai_payg_pricing, NOT organizations.genai_payg_pricing
PRICING_TABLE="${PROJECT_ID}:${DATASET}.genai_payg_pricing"

# Verify pricing data exists
if [[ ! -f "$PRICING_DATA" ]]; then
    log_error "Pricing seed file not found: ${PRICING_DATA}"
    log_error "Expected path: load-demo-data/data/pricing/genai_payg_pricing.csv"
    exit 1
fi

# ======================================================
# Prepare Pricing Data (add org_slug column)
# ======================================================

log_info "Preparing pricing data with org_slug..."
TMP_PRICING="/tmp/pricing_with_org_${ORG_SLUG}.csv"

# Add org_slug as first column
head -1 "$PRICING_DATA" | sed "s/^/org_slug,/" > "$TMP_PRICING"
tail -n +2 "$PRICING_DATA" | sed "s/^/${ORG_SLUG},/" >> "$TMP_PRICING"

record_count=$(($(wc -l < "$TMP_PRICING" | tr -d ' ') - 1))
log_info "  Records to load: ${record_count}"

# ======================================================
# Load Pricing Data
# ======================================================

log_info "Loading GenAI pricing seed data..."
log_info "  Source: ${PRICING_DATA}"
log_info "  Target: ${PRICING_TABLE}"

# Load CSV with explicit schema to handle column mapping
# Using --replace to ensure clean state for pricing data
bq load \
    --source_format=CSV \
    --skip_leading_rows=1 \
    --replace \
    --allow_jagged_rows \
    --ignore_unknown_values \
    "${PRICING_TABLE}" \
    "${TMP_PRICING}" \
    org_slug:STRING,provider:STRING,model:STRING,model_family:STRING,model_version:STRING,region:STRING,input_per_1m:FLOAT,output_per_1m:FLOAT,cached_input_per_1m:FLOAT,cached_write_per_1m:FLOAT,batch_input_per_1m:FLOAT,batch_output_per_1m:FLOAT,cached_discount_pct:FLOAT,batch_discount_pct:FLOAT,volume_tier:STRING,volume_discount_pct:FLOAT,free_tier_input_tokens:INTEGER,free_tier_output_tokens:INTEGER,rate_limit_rpm:INTEGER,rate_limit_tpm:INTEGER,context_window:INTEGER,max_output_tokens:INTEGER,supports_vision:BOOLEAN,supports_streaming:BOOLEAN,supports_tools:BOOLEAN,sla_uptime_pct:FLOAT,effective_from:DATE,effective_to:DATE,status:STRING,last_updated:DATE,notes:STRING

log_info "  Pricing data loaded successfully!"

# Cleanup temp file
rm -f "$TMP_PRICING"
echo ""

# ======================================================
# Verify loaded data
# ======================================================

log_info "Verifying pricing data..."
bq query --use_legacy_sql=false \
    "SELECT
       provider,
       COUNT(*) as models,
       MIN(input_per_1m) as min_input_price,
       MAX(input_per_1m) as max_input_price
     FROM \`${PROJECT_ID}.${DATASET}.genai_payg_pricing\`
     GROUP BY provider
     ORDER BY provider"

echo ""
log_info "Pricing seed load complete!"
echo ""
log_info "NEXT STEP: Load raw demo data with:"
log_info "  ./scripts/01-load-genai-data.sh"
log_info "  ./scripts/02-load-cloud-data.sh"
log_info "  ./scripts/03-load-subscriptions.sh"
