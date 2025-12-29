#!/bin/bash
# Load SaaS subscription plans into BigQuery
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Loading SaaS Subscription Plans"
echo "================================================"
echo ""

check_requirements
check_auth
check_dataset

DATA_FILE="${DATA_DIR}/subscriptions/saas_subscription_plans.csv"
SCHEMA_FILE="${SCHEMA_DIR}/saas_subscription_plans.json"
TARGET_TABLE="${PROJECT_ID}:${DATASET}.saas_subscription_plans"

if [[ ! -f "$DATA_FILE" ]]; then
    log_error "Data file not found: ${DATA_FILE}"
    exit 1
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
    log_error "Schema file not found: ${SCHEMA_FILE}"
    exit 1
fi

log_info "Loading subscription plans..."
log_info "  Source: ${DATA_FILE}"
log_info "  Target: ${TARGET_TABLE}"

# Count records (excluding header)
record_count=$(($(wc -l < "$DATA_FILE" | tr -d ' ') - 1))
log_info "  Records to load: ${record_count}"

# Load CSV data
bq load \
    --source_format=CSV \
    --skip_leading_rows=1 \
    --replace \
    --schema="${SCHEMA_FILE}" \
    "${TARGET_TABLE}" \
    "${DATA_FILE}"

if [[ $? -eq 0 ]]; then
    log_info "Subscription plans loaded successfully!"
else
    log_error "Failed to load subscription plans"
    exit 1
fi

# Verify loaded data
echo ""
log_info "Verifying loaded data..."
bq query --use_legacy_sql=false \
    "SELECT provider, plan_name, seats, unit_price, pricing_model, status
     FROM \`${PROJECT_ID}.${DATASET}.saas_subscription_plans\`
     ORDER BY provider, plan_name"
