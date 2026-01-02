#!/bin/bash
# Safely delete demo data from ANY organization (including real orgs)
# Uses demo markers (x_credential_id, x_run_id) to identify demo data
#
# This script ONLY deletes rows where:
#   - x_credential_id LIKE '%demo%'  OR
#   - x_run_id LIKE 'run_demo_%'
#
# This is SAFE for real orgs because real data will NOT have these markers
#
# Usage:
#   ./scripts/cleanup-demo-by-marker.sh [--force] [--dry-run]
#
# Options:
#   --force      Skip confirmation prompt
#   --dry-run    Show what would be deleted without deleting
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Cleanup Demo Data by Marker"
echo "================================================"
echo ""

# ======================================================
# Parse Arguments
# ======================================================

FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
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
            echo "Usage: $0 [--force] [--dry-run]"
            exit 1
            ;;
    esac
done

# ======================================================
# Validation
# ======================================================

check_requirements
check_auth
check_org_slug
show_config

if [[ "$DRY_RUN" == "true" ]]; then
    log_warn "DRY RUN MODE - No data will be deleted"
    echo ""
fi

# ======================================================
# Demo Data Condition
# ======================================================

# This WHERE clause identifies demo data using embedded markers
DEMO_WHERE_CLAUSE="(
    x_credential_id LIKE '%${DEMO_CREDENTIAL_PATTERN}%'
    OR x_run_id LIKE '${DEMO_RUN_ID_PATTERN}%'
)"

# For subscription_plans (no x_* fields), use notes field
SUBSCRIPTION_WHERE_CLAUSE="notes LIKE '%Demo subscription%'"

# ======================================================
# Preview Demo Data Counts
# ======================================================

echo "========================================"
echo "  Demo Data Preview"
echo "========================================"
echo ""

log_info "Scanning for demo data in ${DATASET}..."
echo ""

# Count demo data in each table
count_demo_data() {
    local table="$1"
    local where_clause="$2"
    local full_table="\`${PROJECT_ID}.${DATASET}.${table}\`"

    # Check if table exists
    if ! bq show "${PROJECT_ID}:${DATASET}.${table}" > /dev/null 2>&1; then
        echo "  ${table}: (table not found)"
        return 0
    fi

    local count=$(bq query --use_legacy_sql=false --format=csv --quiet \
        "SELECT COUNT(*) as cnt FROM ${full_table} WHERE ${where_clause}" 2>/dev/null | tail -1)

    if [[ "$count" == "0" || -z "$count" ]]; then
        echo "  ${table}: 0 demo records"
    else
        echo "  ${table}: ${count} demo records"
    fi
}

echo "GenAI Tables:"
count_demo_data "genai_payg_usage_raw" "$DEMO_WHERE_CLAUSE"
count_demo_data "genai_costs_daily_unified" "$DEMO_WHERE_CLAUSE"
count_demo_data "genai_payg_costs_daily" "$DEMO_WHERE_CLAUSE"

echo ""
echo "Cloud Tables:"
count_demo_data "cloud_gcp_billing_raw_daily" "$DEMO_WHERE_CLAUSE"
count_demo_data "cloud_aws_billing_raw_daily" "$DEMO_WHERE_CLAUSE"
count_demo_data "cloud_azure_billing_raw_daily" "$DEMO_WHERE_CLAUSE"
count_demo_data "cloud_oci_billing_raw_daily" "$DEMO_WHERE_CLAUSE"

echo ""
echo "Subscription Tables:"
count_demo_data "subscription_plans" "$SUBSCRIPTION_WHERE_CLAUSE"
count_demo_data "subscription_plan_costs_daily" "$DEMO_WHERE_CLAUSE"

echo ""
echo "FOCUS 1.3 Table:"
count_demo_data "cost_data_standard_1_3" "$DEMO_WHERE_CLAUSE"

echo ""

# ======================================================
# Confirmation
# ======================================================

if [[ "$FORCE" != "true" && "$DRY_RUN" != "true" ]]; then
    log_warn "This will DELETE all demo data identified above"
    log_warn "Real data (without demo markers) will NOT be affected"
    echo ""
    read -p "Type 'DELETE DEMO' to confirm: " confirmation
    if [[ "$confirmation" != "DELETE DEMO" ]]; then
        log_info "Cleanup cancelled"
        exit 0
    fi
fi

# ======================================================
# Delete Demo Data
# ======================================================

echo ""
echo "========================================"
echo "  Deleting Demo Data"
echo "========================================"
echo ""

delete_demo_data() {
    local table="$1"
    local where_clause="$2"
    local full_table="\`${PROJECT_ID}.${DATASET}.${table}\`"

    # Check if table exists
    if ! bq show "${PROJECT_ID}:${DATASET}.${table}" > /dev/null 2>&1; then
        log_warn "Skipping ${table}: table not found"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would delete from: ${table}"
        bq query --use_legacy_sql=false --dry_run \
            "DELETE FROM ${full_table} WHERE ${where_clause}" 2>/dev/null || true
    else
        log_info "Deleting demo data from: ${table}..."
        local result=$(bq query --use_legacy_sql=false --format=json \
            "DELETE FROM ${full_table} WHERE ${where_clause}" 2>&1)
        log_info "  Done"
    fi
}

# Raw tables
delete_demo_data "genai_payg_usage_raw" "$DEMO_WHERE_CLAUSE"
delete_demo_data "cloud_gcp_billing_raw_daily" "$DEMO_WHERE_CLAUSE"
delete_demo_data "cloud_aws_billing_raw_daily" "$DEMO_WHERE_CLAUSE"
delete_demo_data "cloud_azure_billing_raw_daily" "$DEMO_WHERE_CLAUSE"
delete_demo_data "cloud_oci_billing_raw_daily" "$DEMO_WHERE_CLAUSE"
delete_demo_data "subscription_plans" "$SUBSCRIPTION_WHERE_CLAUSE"

# Processed tables
delete_demo_data "genai_costs_daily_unified" "$DEMO_WHERE_CLAUSE"
delete_demo_data "genai_payg_costs_daily" "$DEMO_WHERE_CLAUSE"
delete_demo_data "subscription_plan_costs_daily" "$DEMO_WHERE_CLAUSE"

# FOCUS 1.3 table
delete_demo_data "cost_data_standard_1_3" "$DEMO_WHERE_CLAUSE"

# ======================================================
# Summary
# ======================================================

echo ""
echo "========================================"
echo "  Summary"
echo "========================================"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "DRY RUN completed - no data was deleted"
else
    log_info "Demo data cleanup complete for: ${ORG_SLUG}"
    log_info ""
    log_info "Only data with demo markers was deleted:"
    log_info "  - x_credential_id containing '${DEMO_CREDENTIAL_PATTERN}'"
    log_info "  - x_run_id starting with '${DEMO_RUN_ID_PATTERN}'"
    log_info ""
    log_info "Real data (without these markers) was NOT affected"
fi
