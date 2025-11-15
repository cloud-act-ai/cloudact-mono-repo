#!/bin/bash
#
# Test Onboarding with Force Recreation
# This script onboards 5 customers with force_recreate options enabled,
# then runs a sample pipeline for each customer to validate infrastructure.
#
# Usage: ./test_onboarding_with_force_recreate.sh
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8080}"
ONBOARDING_ENDPOINT="${API_BASE_URL}/api/v1/customers/onboard"

# List of customers to onboard
CUSTOMERS=(
    "acmeinc_23xv2"
    "techcorp_99zx4"
    "datasystems_45abc"
    "cloudworks_78def"
    "bytefactory_12ghi"
)

# Log directory
LOG_DIR="tests/logs/onboarding_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$LOG_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Customer Onboarding Test with Force Recreation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}API Base URL: ${API_BASE_URL}${NC}"
echo -e "${YELLOW}Log Directory: ${LOG_DIR}${NC}"
echo -e "${YELLOW}Customers to onboard: ${#CUSTOMERS[@]}${NC}"
echo ""

# Store API keys for each customer
declare -A CUSTOMER_API_KEYS

# Function to onboard a single customer
onboard_customer() {
    local tenant_id=$1
    local log_file="${LOG_DIR}/${tenant_id}_onboarding.log"

    echo -e "${BLUE}[${tenant_id}] Starting onboarding...${NC}"

    # Onboard with force recreation enabled
    local response=$(curl -s -X POST "${ONBOARDING_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -d "{
            \"tenant_id\": \"${tenant_id}\",
            \"force_recreate_dataset\": true,
            \"force_recreate_tables\": true
        }" | tee "${log_file}")

    # Check if request was successful
    if echo "$response" | jq -e '.api_key' > /dev/null 2>&1; then
        local api_key=$(echo "$response" | jq -r '.api_key')
        local dataset_created=$(echo "$response" | jq -r '.dataset_created')
        local dryrun_status=$(echo "$response" | jq -r '.dryrun_status')

        echo -e "${GREEN}[${tenant_id}] ✓ Onboarding successful${NC}"
        echo -e "${GREEN}[${tenant_id}]   - Dataset created: ${dataset_created}${NC}"
        echo -e "${GREEN}[${tenant_id}]   - Dryrun status: ${dryrun_status}${NC}"
        echo -e "${GREEN}[${tenant_id}]   - API Key: ${api_key:0:20}...${NC}"

        # Store API key for pipeline testing
        CUSTOMER_API_KEYS["${tenant_id}"]="${api_key}"

        return 0
    else
        echo -e "${RED}[${tenant_id}] ✗ Onboarding failed${NC}"
        echo -e "${RED}[${tenant_id}] Response: ${response}${NC}"
        return 1
    fi
}

# Function to run sample pipeline for a customer
run_sample_pipeline() {
    local tenant_id=$1
    local api_key="${CUSTOMER_API_KEYS[${tenant_id}]}"
    local log_file="${LOG_DIR}/${tenant_id}_pipeline.log"

    if [ -z "$api_key" ]; then
        echo -e "${RED}[${tenant_id}] ✗ No API key found, skipping pipeline test${NC}"
        return 1
    fi

    echo -e "${BLUE}[${tenant_id}] Running sample pipeline...${NC}"

    # Run dryrun pipeline (gcp/example/dryrun)
    local pipeline_endpoint="${API_BASE_URL}/api/v1/pipelines/run/${tenant_id}/gcp/example/dryrun"

    local response=$(curl -s -X POST "${pipeline_endpoint}" \
        -H "X-API-Key: ${api_key}" \
        -H "Content-Type: application/json" \
        -d '{}' | tee "${log_file}")

    # Check if pipeline started successfully
    if echo "$response" | jq -e '.pipeline_logging_id' > /dev/null 2>&1; then
        local pipeline_id=$(echo "$response" | jq -r '.pipeline_logging_id')
        local status=$(echo "$response" | jq -r '.status')

        echo -e "${GREEN}[${tenant_id}] ✓ Pipeline started successfully${NC}"
        echo -e "${GREEN}[${tenant_id}]   - Pipeline ID: ${pipeline_id}${NC}"
        echo -e "${GREEN}[${tenant_id}]   - Status: ${status}${NC}"

        return 0
    else
        echo -e "${YELLOW}[${tenant_id}] ⚠ Pipeline test skipped or failed${NC}"
        echo -e "${YELLOW}[${tenant_id}] Response: ${response}${NC}"
        return 1
    fi
}

# Export functions for parallel execution
export -f onboard_customer
export -f run_sample_pipeline
export ONBOARDING_ENDPOINT
export API_BASE_URL
export LOG_DIR
export GREEN RED YELLOW BLUE NC

# Step 1: Onboard all customers in parallel
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Step 1: Onboarding Customers (Parallel)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Run onboarding in parallel using xargs
printf '%s\n' "${CUSTOMERS[@]}" | xargs -P 5 -I {} bash -c 'onboard_customer "$@"' _ {}

echo ""
echo -e "${GREEN}✓ All onboarding requests completed${NC}"
echo ""

# Small delay to ensure all responses are processed
sleep 2

# Step 2: Load API keys from log files (fallback)
echo -e "${BLUE}Loading API keys from onboarding logs...${NC}"
for tenant_id in "${CUSTOMERS[@]}"; do
    log_file="${LOG_DIR}/${tenant_id}_onboarding.log"
    if [ -f "$log_file" ]; then
        api_key=$(jq -r '.api_key' "$log_file" 2>/dev/null || echo "")
        if [ -n "$api_key" ] && [ "$api_key" != "null" ]; then
            CUSTOMER_API_KEYS["${tenant_id}"]="${api_key}"
            echo -e "${GREEN}[${tenant_id}] Loaded API key${NC}"
        fi
    fi
done
echo ""

# Export the associative array for subshells
declare -p CUSTOMER_API_KEYS > "${LOG_DIR}/api_keys.env"

# Step 3: Run sample pipelines for all customers in parallel
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Step 2: Running Sample Pipelines (Parallel)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Source the API keys in subshell
run_pipeline_with_key() {
    local tenant_id=$1
    source "${LOG_DIR}/api_keys.env"
    run_sample_pipeline "${tenant_id}"
}
export -f run_pipeline_with_key

printf '%s\n' "${CUSTOMERS[@]}" | xargs -P 5 -I {} bash -c 'run_pipeline_with_key "$@"' _ {}

echo ""
echo -e "${GREEN}✓ All pipeline tests completed${NC}"
echo ""

# Step 4: Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

onboarding_success=0
onboarding_failed=0
pipeline_success=0
pipeline_failed=0

for tenant_id in "${CUSTOMERS[@]}"; do
    onboarding_log="${LOG_DIR}/${tenant_id}_onboarding.log"
    pipeline_log="${LOG_DIR}/${tenant_id}_pipeline.log"

    # Check onboarding status
    if [ -f "$onboarding_log" ] && jq -e '.api_key' "$onboarding_log" > /dev/null 2>&1; then
        ((onboarding_success++))
        echo -e "${GREEN}✓ ${tenant_id}: Onboarding succeeded${NC}"
    else
        ((onboarding_failed++))
        echo -e "${RED}✗ ${tenant_id}: Onboarding failed${NC}"
    fi

    # Check pipeline status
    if [ -f "$pipeline_log" ] && jq -e '.pipeline_logging_id' "$pipeline_log" > /dev/null 2>&1; then
        ((pipeline_success++))
        echo -e "${GREEN}  ✓ Pipeline test succeeded${NC}"
    else
        ((pipeline_failed++))
        echo -e "${YELLOW}  ⚠ Pipeline test failed or skipped${NC}"
    fi
done

echo ""
echo -e "${BLUE}Results:${NC}"
echo -e "  Onboarding: ${GREEN}${onboarding_success} succeeded${NC}, ${RED}${onboarding_failed} failed${NC}"
echo -e "  Pipelines:  ${GREEN}${pipeline_success} succeeded${NC}, ${YELLOW}${pipeline_failed} failed/skipped${NC}"
echo ""
echo -e "${YELLOW}Logs saved to: ${LOG_DIR}${NC}"
echo ""

# Exit with error if any onboarding failed
if [ $onboarding_failed -gt 0 ]; then
    echo -e "${RED}Some onboarding operations failed. Check logs for details.${NC}"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ All tests completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
