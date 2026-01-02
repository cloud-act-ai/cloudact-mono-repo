#!/bin/bash
# Load SaaS subscription plans AND daily costs into BigQuery
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Loading SaaS Subscription Data"
echo "================================================"
echo ""

check_requirements
check_auth
check_dataset

# ======================================================
# Part 1: Load Subscription Plans (master data)
# ======================================================

PLANS_DATA="${DATA_DIR}/subscriptions/saas_subscription_plans.csv"
PLANS_SCHEMA="${SCHEMA_DIR}/saas_subscription_plans.json"
PLANS_TABLE="${PROJECT_ID}:${DATASET}.saas_subscription_plans"

if [[ -f "$PLANS_DATA" ]]; then
    log_info "Loading subscription plans (master data)..."
    log_info "  Source: ${PLANS_DATA}"
    log_info "  Target: ${PLANS_TABLE}"

    if [[ ! -f "$PLANS_SCHEMA" ]]; then
        log_warn "Schema file not found: ${PLANS_SCHEMA}"
        log_warn "Loading without explicit schema (auto-detect)"
        bq load \
            --source_format=CSV \
            --skip_leading_rows=1 \
            --replace \
            --autodetect \
            "${PLANS_TABLE}" \
            "${PLANS_DATA}"
    else
        bq load \
            --source_format=CSV \
            --skip_leading_rows=1 \
            --replace \
            --schema="${PLANS_SCHEMA}" \
            "${PLANS_TABLE}" \
            "${PLANS_DATA}"
    fi

    record_count=$(($(wc -l < "$PLANS_DATA" | tr -d ' ') - 1))
    log_info "  Loaded ${record_count} subscription plans"
    echo ""
else
    log_warn "Subscription plans file not found: ${PLANS_DATA}"
fi

# ======================================================
# Part 2: Load Daily Subscription Costs (time-series)
# ======================================================

COSTS_DATA="${DATA_DIR}/subscriptions/saas_subscription_costs_daily.json"
COSTS_SCHEMA="${SCHEMA_DIR}/saas_subscription_plan_costs_daily.json"
COSTS_TABLE="${PROJECT_ID}:${DATASET}.saas_subscription_plan_costs_daily"

if [[ -f "$COSTS_DATA" ]]; then
    log_info "Loading daily subscription costs..."
    log_info "  Source: ${COSTS_DATA}"
    log_info "  Target: ${COSTS_TABLE}"

    record_count=$(wc -l < "$COSTS_DATA" | tr -d ' ')
    log_info "  Records to load: ${record_count}"

    if [[ ! -f "$COSTS_SCHEMA" ]]; then
        log_warn "Schema file not found: ${COSTS_SCHEMA}"
        log_warn "Loading without explicit schema (auto-detect)"
        bq load \
            --source_format=NEWLINE_DELIMITED_JSON \
            --replace \
            --autodetect \
            "${COSTS_TABLE}" \
            "${COSTS_DATA}"
    else
        bq load \
            --source_format=NEWLINE_DELIMITED_JSON \
            --replace \
            --schema="${COSTS_SCHEMA}" \
            "${COSTS_TABLE}" \
            "${COSTS_DATA}"
    fi

    log_info "  Daily costs loaded successfully!"
    echo ""
else
    log_warn "Daily costs file not found: ${COSTS_DATA}"
fi

# ======================================================
# Verify loaded data
# ======================================================

echo ""
log_info "Verifying subscription plans..."
bq query --use_legacy_sql=false \
    "SELECT provider, plan_name, seats, unit_price, pricing_model, status
     FROM \`${PROJECT_ID}.${DATASET}.saas_subscription_plans\`
     ORDER BY provider, plan_name
     LIMIT 5"

echo ""
log_info "Verifying daily costs (summary)..."
bq query --use_legacy_sql=false \
    "SELECT
       MIN(cost_date) as first_date,
       MAX(cost_date) as last_date,
       COUNT(*) as total_records,
       COUNT(DISTINCT provider) as unique_providers,
       ROUND(SUM(daily_cost), 2) as total_daily_costs
     FROM \`${PROJECT_ID}.${DATASET}.saas_subscription_plan_costs_daily\`"

echo ""
log_info "Subscription data load complete!"
