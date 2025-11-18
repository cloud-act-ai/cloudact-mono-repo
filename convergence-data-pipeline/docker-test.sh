#!/bin/bash
# Docker Test Script for Convergence Data Pipeline
# Tests bootstrap and onboarding via Docker

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:8080"
ADMIN_API_KEY="${ADMIN_API_KEY:-admin-test-key-123}"
TEST_TENANT_ID="${TEST_TENANT_ID:-rama_2x333}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Convergence Data Pipeline - Docker Test${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Function to wait for API to be ready
wait_for_api() {
    echo -e "${YELLOW}⏳ Waiting for API to be ready...${NC}"
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "${API_BASE}/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ API is ready!${NC}"
            return 0
        fi
        echo "   Attempt $attempt/$max_attempts - waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done

    echo -e "${RED}❌ API failed to start${NC}"
    return 1
}

# Function to test bootstrap
test_bootstrap() {
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}TEST 1: Bootstrap System${NC}"
    echo -e "${YELLOW}========================================${NC}"

    echo "Endpoint: POST /admin/bootstrap"
    echo ""

    response=$(curl -s -X POST "${API_BASE}/admin/bootstrap" \
        -H "X-Admin-Key: ${ADMIN_API_KEY}" \
        -H "Content-Type: application/json" \
        -d '{
            "force_recreate_dataset": false,
            "force_recreate_tables": false
        }')

    echo "Response:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"

    # Check if successful
    if echo "$response" | grep -q '"status".*"SUCCESS"'; then
        echo -e "${GREEN}✅ Bootstrap completed successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ Bootstrap failed${NC}"
        return 1
    fi
}

# Function to test onboarding
test_onboarding() {
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}TEST 2: Onboard Tenant${NC}"
    echo -e "${YELLOW}========================================${NC}"

    echo "Endpoint: POST /api/v1/tenants/onboard"
    echo "Tenant ID: ${TEST_TENANT_ID}"
    echo ""

    response=$(curl -s -X POST "${API_BASE}/api/v1/tenants/onboard" \
        -H "Content-Type: application/json" \
        -d "{
            \"tenant_id\": \"${TEST_TENANT_ID}\",
            \"company_name\": \"Rama Corporation\",
            \"admin_email\": \"admin@rama.com\",
            \"subscription_plan\": \"PROFESSIONAL\",
            \"force_recreate_dataset\": false,
            \"force_recreate_tables\": false
        }")

    echo "Response:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"

    # Check if successful
    if echo "$response" | grep -q '"tenant_id"'; then
        echo -e "${GREEN}✅ Onboarding completed successfully${NC}"

        # Extract and display API key
        api_key=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('api_key', 'N/A'))" 2>/dev/null || echo "N/A")
        if [ "$api_key" != "N/A" ]; then
            echo -e "${GREEN}🔑 API Key: ${api_key}${NC}"
            echo -e "${YELLOW}⚠️  Save this API key - it's shown only once!${NC}"
        fi

        return 0
    else
        echo -e "${RED}❌ Onboarding failed${NC}"
        return 1
    fi
}

# Function to verify setup
verify_setup() {
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}TEST 3: Verify Setup${NC}"
    echo -e "${YELLOW}========================================${NC}"

    echo "Checking tenant comprehensive view..."

    # This would require BigQuery access, so just check if onboarding was successful
    if [ -f "/tmp/onboarding_success" ]; then
        echo -e "${GREEN}✅ Setup verified${NC}"
        rm -f /tmp/onboarding_success
        return 0
    else
        echo -e "${YELLOW}⚠️  Manual verification required:${NC}"
        echo "   1. Check BigQuery dataset: gac-prod-471220.tenants"
        echo "   2. Check tenant dataset: gac-prod-471220.${TEST_TENANT_ID}"
        echo "   3. Query: SELECT * FROM ${TEST_TENANT_ID}.tenant_comprehensive_view LIMIT 10"
        return 0
    fi
}

# Main execution
main() {
    # Wait for API
    wait_for_api || exit 1

    # Run tests
    test_bootstrap || true
    sleep 2

    test_onboarding || true
    sleep 2

    verify_setup || true

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Docker Test Complete${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. View logs: docker-compose logs -f convergence-api"
    echo "  2. Execute shell: docker-compose exec convergence-api bash"
    echo "  3. Stop services: docker-compose down"
    echo ""
}

# Run main function
main
