#!/bin/bash
# Validate environment before loading demo data
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Demo Data Loader - Environment Validation"
echo "================================================"
echo ""

# Check requirements
log_info "Checking required tools..."
check_requirements

# Check authentication
log_info "Checking GCP authentication..."
check_auth

# Check dataset
log_info "Checking target dataset..."
check_dataset

# Check data files exist
log_info "Checking data files..."
DATA_FILES=(
    "${DATA_DIR}/genai/openai_usage_raw.json"
    "${DATA_DIR}/genai/anthropic_usage_raw.json"
    "${DATA_DIR}/genai/gemini_usage_raw.json"
    "${DATA_DIR}/cloud/gcp_billing_raw.json"
    "${DATA_DIR}/cloud/aws_billing_raw.json"
    "${DATA_DIR}/cloud/azure_billing_raw.json"
    "${DATA_DIR}/cloud/oci_billing_raw.json"
    "${DATA_DIR}/subscriptions/saas_subscription_plans.csv"
)

missing_files=0
for file in "${DATA_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "  [OK] $(basename $file)"
    else
        echo "  [MISSING] $(basename $file)"
        ((missing_files++))
    fi
done

if [[ $missing_files -gt 0 ]]; then
    log_warn "${missing_files} data file(s) missing. Run generators/generate-demo-data.py first."
else
    log_info "All data files present."
fi

# Check schema files
log_info "Checking schema files..."
SCHEMA_FILES=(
    "${SCHEMA_DIR}/genai_payg_usage_raw.json"
    "${SCHEMA_DIR}/gcp_billing_cost.json"
    "${SCHEMA_DIR}/aws_billing_cost.json"
    "${SCHEMA_DIR}/azure_billing_cost.json"
    "${SCHEMA_DIR}/oci_billing_cost.json"
    "${SCHEMA_DIR}/saas_subscription_plans.json"
)

missing_schemas=0
for file in "${SCHEMA_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "  [OK] $(basename $file)"
    else
        echo "  [MISSING] $(basename $file)"
        ((missing_schemas++))
    fi
done

if [[ $missing_schemas -gt 0 ]]; then
    log_warn "${missing_schemas} schema file(s) missing."
else
    log_info "All schema files present."
fi

echo ""
echo "================================================"
if [[ $missing_files -eq 0 && $missing_schemas -eq 0 ]]; then
    log_info "Environment validation PASSED. Ready to load data."
else
    log_warn "Some files are missing. Generate data before loading."
fi
echo "================================================"
