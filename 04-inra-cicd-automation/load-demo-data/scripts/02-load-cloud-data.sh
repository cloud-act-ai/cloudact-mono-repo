#!/bin/bash
# Load Cloud billing data into BigQuery
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Loading Cloud Billing Data"
echo "================================================"
echo ""

check_requirements
check_auth
check_dataset

# Load GCP data
load_provider() {
    local provider=$1
    local table=$2
    local schema=$3

    local DATA_FILE="${DATA_DIR}/cloud/${provider}_billing_raw.json"
    local SCHEMA_FILE="${SCHEMA_DIR}/${schema}"
    local TARGET_TABLE="${PROJECT_ID}:${DATASET}.${table}"

    if [[ ! -f "$DATA_FILE" ]]; then
        log_warn "Skipping ${provider}: ${DATA_FILE} not found"
        return 0
    fi

    if [[ ! -f "$SCHEMA_FILE" ]]; then
        log_warn "Skipping ${provider}: ${SCHEMA_FILE} not found"
        return 0
    fi

    log_info "Loading ${provider} billing data..."
    log_info "  Source: ${DATA_FILE}"
    log_info "  Target: ${TARGET_TABLE}"

    # Count records
    record_count=$(wc -l < "$DATA_FILE" | tr -d ' ')
    log_info "  Records to load: ${record_count}"

    # Load data (replace mode for each provider table)
    bq load \
        --source_format=NEWLINE_DELIMITED_JSON \
        --replace \
        --schema="${SCHEMA_FILE}" \
        "${TARGET_TABLE}" \
        "${DATA_FILE}"

    if [[ $? -eq 0 ]]; then
        log_info "  ${provider} billing data loaded successfully!"
    else
        log_error "  Failed to load ${provider} billing data"
        return 1
    fi
}

# Load each provider
load_provider "gcp" "gcp_billing_daily_raw" "gcp_billing_cost.json"
load_provider "aws" "aws_billing_cost_daily" "aws_billing_cost.json"
load_provider "azure" "azure_billing_cost_daily" "azure_billing_cost.json"
load_provider "oci" "oci_billing_cost_daily" "oci_billing_cost.json"

echo ""
log_info "Cloud billing data loading complete!"

# Show summary
echo ""
log_info "Loaded tables:"
echo "  - ${PROJECT_ID}:${DATASET}.gcp_billing_daily_raw"
echo "  - ${PROJECT_ID}:${DATASET}.aws_billing_cost_daily"
echo "  - ${PROJECT_ID}:${DATASET}.azure_billing_cost_daily"
echo "  - ${PROJECT_ID}:${DATASET}.oci_billing_cost_daily"
