#!/bin/bash
# Load demo data into ANY organization (including real orgs like rama_inc)
# This script safely replaces org_slug in demo data and uses demo markers
# for later identification and safe deletion
#
# Usage:
#   ./scripts/load-demo-to-org.sh [--force] [--dry-run]
#
# Prerequisites:
#   - ORG_SLUG must be set (target organization)
#   - GCP authentication configured
#   - Target dataset must exist (run onboarding first)
#
# Safety:
#   - Demo data is marked with x_credential_id containing "demo"
#   - Demo data is marked with x_run_id starting with "run_demo_"
#   - Use cleanup-demo-by-marker.sh to safely delete ONLY demo data
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Load Demo Data to Organization"
echo "================================================"
echo ""

# ======================================================
# Parse Arguments
# ======================================================

FORCE=false
DRY_RUN=false
CLEAR_EXISTING=false

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
        --clear-existing)
            CLEAR_EXISTING=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Usage: $0 [--force] [--dry-run] [--clear-existing]"
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
    log_warn "DRY RUN MODE - No data will be loaded"
    echo ""
fi

# ======================================================
# Confirmation for Non-Demo Orgs
# ======================================================

if ! is_demo_org && [[ "$FORCE" != "true" && "$DRY_RUN" != "true" ]]; then
    echo ""
    log_warn "WARNING: Loading demo data into a REAL organization!"
    log_warn "Organization: ${ORG_SLUG}"
    log_warn ""
    log_warn "Demo data will be marked with:"
    log_warn "  - x_credential_id containing '${DEMO_CREDENTIAL_PATTERN}'"
    log_warn "  - x_run_id starting with '${DEMO_RUN_ID_PATTERN}'"
    log_warn ""
    log_warn "You can safely delete demo data later with:"
    log_warn "  ./scripts/cleanup-demo-by-marker.sh"
    echo ""
    read -p "Type 'LOAD DEMO' to confirm: " confirmation
    if [[ "$confirmation" != "LOAD DEMO" ]]; then
        log_info "Operation cancelled"
        exit 0
    fi
fi

# ======================================================
# Create Temp Directory for Modified Data
# ======================================================

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log_info "Preparing demo data for org: ${ORG_SLUG}"
log_info "Temp directory: ${TEMP_DIR}"
echo ""

# ======================================================
# Helper: Transform JSON with org_slug replacement
# ======================================================

transform_json_data() {
    local source_file="$1"
    local target_file="$2"
    local data_type="${3:-generic}"  # genai, cloud, or generic

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would transform: $(basename $source_file)"
        return 0
    fi

    # Use Python for more complex transformation (add missing required fields)
    python3 << EOF
import json
import uuid
from datetime import datetime

source_file = "${source_file}"
target_file = "${target_file}"
org_slug = "${ORG_SLUG}"
demo_source_org = "${DEMO_DATA_SOURCE_ORG}"
data_type = "${data_type}"

with open(source_file, 'r') as f_in, open(target_file, 'w') as f_out:
    for line in f_in:
        if not line.strip():
            continue
        record = json.loads(line)

        # Replace org_slug
        if 'x_org_slug' in record:
            record['x_org_slug'] = org_slug

        # Add missing required fields for GenAI data
        if data_type == 'genai':
            if 'x_ingestion_id' not in record or not record.get('x_ingestion_id'):
                record['x_ingestion_id'] = str(uuid.uuid4())
            if 'x_ingestion_date' not in record or not record.get('x_ingestion_date'):
                record['x_ingestion_date'] = record.get('usage_date', datetime.now().strftime('%Y-%m-%d'))
            if 'x_genai_provider' not in record or not record.get('x_genai_provider'):
                record['x_genai_provider'] = record.get('provider', 'unknown')

        # Add missing required fields for Cloud data
        if data_type == 'cloud':
            if 'x_ingestion_id' not in record or not record.get('x_ingestion_id'):
                record['x_ingestion_id'] = str(uuid.uuid4())
            if 'x_ingestion_date' not in record or not record.get('x_ingestion_date'):
                # Use ingestion_date if present, else derive from usage_start_time
                if 'ingestion_date' in record:
                    record['x_ingestion_date'] = record['ingestion_date']
                elif 'usage_start_time' in record:
                    record['x_ingestion_date'] = record['usage_start_time'][:10]
                else:
                    record['x_ingestion_date'] = datetime.now().strftime('%Y-%m-%d')
            # x_cloud_provider is already in demo data

        f_out.write(json.dumps(record) + '\n')

print(f"  Transformed $(basename ${source_file})")
EOF

    # Verify replacement
    local new_count=$(grep -c "\"x_org_slug\": \"${ORG_SLUG}\"" "$target_file" || echo "0")
    log_info "  Transformed $(basename $source_file): ${new_count} records with x_org_slug=${ORG_SLUG}"
}

transform_csv_data() {
    local source_file="$1"
    local target_file="$2"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would transform: $(basename $source_file)"
        return 0
    fi

    # Replace org_slug in CSV data (first column)
    sed "s/^${DEMO_DATA_SOURCE_ORG},/${ORG_SLUG},/g" \
        "$source_file" > "$target_file"

    log_info "  Transformed $(basename $source_file) with org_slug=${ORG_SLUG}"
}

# ======================================================
# Helper: Load data to BigQuery
# ======================================================

load_json_to_bq() {
    local data_file="$1"
    local table_name="$2"
    local schema_file="$3"
    local full_table="${PROJECT_ID}:${DATASET}.${table_name}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would load to: ${table_name}"
        return 0
    fi

    log_info "Loading to ${table_name}..."

    local load_args="--source_format=NEWLINE_DELIMITED_JSON"
    if [[ -n "$schema_file" && -f "$schema_file" ]]; then
        load_args="$load_args --schema=$schema_file"
    else
        load_args="$load_args --autodetect"
    fi

    bq load $load_args "${full_table}" "${data_file}"

    local count=$(wc -l < "$data_file" | tr -d ' ')
    log_info "  Loaded ${count} records"
}

load_csv_to_bq() {
    local data_file="$1"
    local table_name="$2"
    local schema_file="$3"
    local full_table="${PROJECT_ID}:${DATASET}.${table_name}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would load to: ${table_name}"
        return 0
    fi

    log_info "Loading to ${table_name}..."

    local load_args="--source_format=CSV --skip_leading_rows=1"
    if [[ -n "$schema_file" && -f "$schema_file" ]]; then
        load_args="$load_args --schema=$schema_file"
    else
        load_args="$load_args --autodetect"
    fi

    bq load $load_args "${full_table}" "${data_file}"

    local count=$(($(wc -l < "$data_file" | tr -d ' ') - 1))
    log_info "  Loaded ${count} records"
}

# ======================================================
# Optionally Clear Existing Demo Data First
# ======================================================

if [[ "$CLEAR_EXISTING" == "true" && "$DRY_RUN" != "true" ]]; then
    log_info "Clearing existing demo data first..."
    "${SCRIPT_DIR}/cleanup-demo-by-marker.sh" --force 2>/dev/null || true
    echo ""
fi

# ======================================================
# Step 1: GenAI Usage Data
# ======================================================

echo "========================================"
echo "  Step 1: GenAI Usage Data"
echo "========================================"
echo ""

for provider in openai anthropic gemini; do
    source_file="${DATA_DIR}/genai/${provider}_usage_raw.json"
    if [[ -f "$source_file" ]]; then
        target_file="${TEMP_DIR}/${provider}_usage_raw.json"
        transform_json_data "$source_file" "$target_file" "genai"
        # Use base schema from API service (single source of truth)
        load_json_to_bq "$target_file" "genai_payg_usage_raw" "${BASE_SCHEMA_DIR}/genai_payg_usage_raw.json"
    else
        log_warn "Skipping ${provider}: file not found"
    fi
done

# ======================================================
# Step 2: Cloud Billing Data
# ======================================================

echo ""
echo "========================================"
echo "  Step 2: Cloud Billing Data"
echo "========================================"
echo ""

declare -A CLOUD_TABLES=(
    ["gcp"]="cloud_gcp_billing_raw_daily"
    ["aws"]="cloud_aws_billing_raw_daily"
    ["azure"]="cloud_azure_billing_raw_daily"
    ["oci"]="cloud_oci_billing_raw_daily"
)

# Use base schemas from API service (single source of truth)
declare -A CLOUD_SCHEMAS=(
    ["gcp"]="${BASE_SCHEMA_DIR}/cloud_gcp_billing_raw_daily.json"
    ["aws"]="${BASE_SCHEMA_DIR}/cloud_aws_billing_raw_daily.json"
    ["azure"]="${BASE_SCHEMA_DIR}/cloud_azure_billing_raw_daily.json"
    ["oci"]="${BASE_SCHEMA_DIR}/cloud_oci_billing_raw_daily.json"
)

for provider in gcp aws azure oci; do
    source_file="${DATA_DIR}/cloud/${provider}_billing_raw.json"
    if [[ -f "$source_file" ]]; then
        target_file="${TEMP_DIR}/${provider}_billing_raw.json"
        transform_json_data "$source_file" "$target_file" "cloud"
        load_json_to_bq "$target_file" "${CLOUD_TABLES[$provider]}" "${CLOUD_SCHEMAS[$provider]}"
    else
        log_warn "Skipping ${provider}: file not found"
    fi
done

# ======================================================
# Step 3: Subscription Plans
# ======================================================

echo ""
echo "========================================"
echo "  Step 3: Subscription Plans"
echo "========================================"
echo ""

source_file="${DATA_DIR}/subscriptions/subscription_plans.csv"
if [[ -f "$source_file" ]]; then
    target_file="${TEMP_DIR}/subscription_plans.csv"
    transform_csv_data "$source_file" "$target_file"
    # Use base schema from API service (single source of truth)
    load_csv_to_bq "$target_file" "subscription_plans" "${BASE_SCHEMA_DIR}/subscription_plans.json"
else
    log_warn "Subscription plans file not found"
fi

# ======================================================
# Summary
# ======================================================

echo ""
echo "========================================"
echo "  Summary"
echo "========================================"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "DRY RUN completed - no data was loaded"
else
    log_info "Demo data loaded to organization: ${ORG_SLUG}"
    log_info ""
    log_info "Demo data is marked with:"
    log_info "  - x_credential_id containing '${DEMO_CREDENTIAL_PATTERN}'"
    log_info "  - x_run_id starting with '${DEMO_RUN_ID_PATTERN}'"
    log_info ""
    log_info "To delete ONLY the demo data later, run:"
    log_info "  ./scripts/cleanup-demo-by-marker.sh"
    log_info ""
    log_info "NEXT STEPS:"
    log_info "  1. Sync procedures: ./scripts/05-sync-procedures.sh"
    log_info "  2. Run pipelines:   ./scripts/04-run-pipelines.sh"
fi
