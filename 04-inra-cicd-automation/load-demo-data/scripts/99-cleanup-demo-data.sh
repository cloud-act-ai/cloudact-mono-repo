#!/bin/bash
# Cleanup demo data from BigQuery tables
# Use this to reset a demo org before reloading fresh data
#
# SAFETY: This script only works on organizations with the demo prefix
# Set DEMO_PREFIX in config.sh or via environment variable
#
# Options:
#   --raw-only     Delete only raw tables (not processed costs)
#   --costs-only   Delete only processed costs (not raw data)
#   --all          Delete all demo data (raw + processed)
#   --force        Skip confirmation prompt
#   --dry-run      Show what would be deleted without deleting
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Demo Data Cleanup"
echo "================================================"
echo ""

# ======================================================
# Parse Arguments
# ======================================================

DELETE_RAW=false
DELETE_COSTS=false
FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --raw-only)
            DELETE_RAW=true
            shift
            ;;
        --costs-only)
            DELETE_COSTS=true
            shift
            ;;
        --all)
            DELETE_RAW=true
            DELETE_COSTS=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Usage: $0 [--raw-only|--costs-only|--all] [--force] [--dry-run]"
            exit 1
            ;;
    esac
done

# Default to --all if no option specified
if [[ "$DELETE_RAW" == "false" && "$DELETE_COSTS" == "false" ]]; then
    DELETE_RAW=true
    DELETE_COSTS=true
fi

# ======================================================
# Validation
# ======================================================

check_requirements
check_auth
check_org_slug

# Safety check: Only allow cleanup of demo orgs
if ! is_demo_org; then
    log_error "SAFETY: This script only works on demo organizations"
    log_error "Organization '${ORG_SLUG}' does not start with '${DEMO_PREFIX}'"
    log_error ""
    log_error "To cleanup a non-demo org, use BigQuery console directly"
    exit 1
fi

show_config

# ======================================================
# Confirmation
# ======================================================

if [[ "$DRY_RUN" == "true" ]]; then
    log_warn "DRY RUN MODE - No data will be deleted"
    echo ""
fi

if [[ "$FORCE" != "true" && "$DRY_RUN" != "true" ]]; then
    echo ""
    log_warn "This will DELETE demo data from the following tables:"
    [[ "$DELETE_RAW" == "true" ]] && echo "  - Raw tables (genai_payg_usage_raw, cloud_*_billing_raw_daily, subscription_plans)"
    [[ "$DELETE_COSTS" == "true" ]] && echo "  - Cost tables (genai_costs_daily_unified, subscription_plan_costs_daily, cost_data_standard_1_3)"
    echo ""
    read -p "Type 'DELETE' to confirm: " confirmation
    if [[ "$confirmation" != "DELETE" ]]; then
        log_info "Cleanup cancelled"
        exit 0
    fi
fi

# ======================================================
# Helper Function
# ======================================================

delete_table_data() {
    local table="$1"
    local full_table="${PROJECT_ID}.${DATASET}.${table}"

    # Check if table exists
    if ! bq show "${PROJECT_ID}:${DATASET}.${table}" > /dev/null 2>&1; then
        log_warn "Table not found (skipping): ${table}"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would delete all rows from: ${table}"
        bq query --use_legacy_sql=false --dry_run \
            "DELETE FROM \`${full_table}\` WHERE TRUE" 2>/dev/null || true
    else
        log_info "Deleting data from: ${table}..."
        bq query --use_legacy_sql=false \
            "DELETE FROM \`${full_table}\` WHERE TRUE"
    fi
}

truncate_table() {
    local table="$1"
    local full_table="${PROJECT_ID}:${DATASET}.${table}"

    # Check if table exists
    if ! bq show "${full_table}" > /dev/null 2>&1; then
        log_warn "Table not found (skipping): ${table}"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would truncate: ${table}"
    else
        log_info "Truncating: ${table}..."
        # For partitioned tables, delete all data
        bq query --use_legacy_sql=false \
            "TRUNCATE TABLE \`${PROJECT_ID}.${DATASET}.${table}\`" 2>/dev/null || \
        bq query --use_legacy_sql=false \
            "DELETE FROM \`${PROJECT_ID}.${DATASET}.${table}\` WHERE TRUE"
    fi
}

# ======================================================
# Delete Raw Tables
# ======================================================

if [[ "$DELETE_RAW" == "true" ]]; then
    echo ""
    echo "========================================"
    echo "  Cleaning Raw Tables"
    echo "========================================"
    echo ""

    # GenAI raw usage
    truncate_table "genai_payg_usage_raw"

    # Cloud billing raw
    truncate_table "cloud_gcp_billing_raw_daily"
    truncate_table "cloud_aws_billing_raw_daily"
    truncate_table "cloud_azure_billing_raw_daily"
    truncate_table "cloud_oci_billing_raw_daily"

    # Subscription plans (master data)
    truncate_table "subscription_plans"
fi

# ======================================================
# Delete Processed Cost Tables
# ======================================================

if [[ "$DELETE_COSTS" == "true" ]]; then
    echo ""
    echo "========================================"
    echo "  Cleaning Processed Cost Tables"
    echo "========================================"
    echo ""

    # GenAI costs
    truncate_table "genai_costs_daily_unified"
    truncate_table "genai_payg_costs_daily"

    # Subscription costs
    truncate_table "subscription_plan_costs_daily"

    # FOCUS 1.3 unified costs
    truncate_table "cost_data_standard_1_3"
fi

# ======================================================
# Summary
# ======================================================

echo ""
echo "========================================"
echo "  Cleanup Complete"
echo "========================================"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "DRY RUN completed - no data was deleted"
else
    log_info "Demo data has been cleaned up"
fi

echo ""
log_info "To reload demo data, run:"
log_info "  ./scripts/00-load-pricing-seed.sh"
log_info "  ./scripts/01-load-genai-data.sh"
log_info "  ./scripts/02-load-cloud-data.sh"
log_info "  ./scripts/03-load-subscriptions.sh"
log_info "  ./scripts/05-sync-procedures.sh"
log_info "  ./scripts/04-run-pipelines.sh"
