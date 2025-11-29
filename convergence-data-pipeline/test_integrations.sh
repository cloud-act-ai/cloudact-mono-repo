#!/bin/bash

# Integration Testing Script
# Tests all integration endpoints with proper authentication

set -e

BASE_URL="http://localhost:8000"
CA_ROOT_KEY="test-ca-root-key-minimum-32-chars"
TEST_ORG="e2e_test_org"

echo "============================================"
echo "Integration Endpoints Testing"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test an endpoint
test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local headers="$4"
    local data="$5"

    echo -e "${YELLOW}Testing: ${test_name}${NC}"
    echo "Method: $method"
    echo "Endpoint: $endpoint"

    # Make the request
    if [ "$method" = "GET" ] || [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" $headers "${BASE_URL}${endpoint}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" $headers -H "Content-Type: application/json" -d "$data" "${BASE_URL}${endpoint}")
    fi

    # Extract status code (last line)
    status_code=$(echo "$response" | tail -n1)
    # Extract body (everything except last line)
    body=$(echo "$response" | sed '$d')

    echo "HTTP Status: $status_code"

    # Pretty print JSON if response is JSON
    if echo "$body" | jq -e . >/dev/null 2>&1; then
        echo "Response:"
        echo "$body" | jq -C '.'
    else
        echo "Response: $body"
    fi

    # Check status code
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 300 ]; then
        echo -e "${GREEN}✓ PASS${NC}"
    elif [ "$status_code" -eq 401 ] || [ "$status_code" -eq 403 ]; then
        echo -e "${YELLOW}⚠ AUTH ERROR (Expected for invalid credentials)${NC}"
    elif [ "$status_code" -eq 422 ]; then
        echo -e "${YELLOW}⚠ VALIDATION ERROR${NC}"
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi

    echo ""
    echo "----------------------------------------"
    echo ""
}

# Test 1: Get all integrations WITHOUT auth header
test_endpoint \
    "Get All Integrations (No Auth Header)" \
    "GET" \
    "/api/v1/integrations/${TEST_ORG}" \
    "" \
    ""

# Test 2: Get all integrations WITH invalid auth header
test_endpoint \
    "Get All Integrations (Invalid API Key)" \
    "GET" \
    "/api/v1/integrations/${TEST_ORG}" \
    "-H 'X-API-Key: invalid-test-key'" \
    ""

# Test 3: Try to onboard org to get valid API key
echo -e "${YELLOW}Attempting to onboard test org to get valid API key...${NC}"
onboard_response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "X-CA-Root-Key: ${CA_ROOT_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"org_slug\": \"${TEST_ORG}\", \"company_name\": \"E2E Test Org\", \"admin_email\": \"test@example.com\", \"subscription_plan\": \"STARTER\"}" \
    "${BASE_URL}/api/v1/organizations/onboard")

onboard_status=$(echo "$onboard_response" | tail -n1)
onboard_body=$(echo "$onboard_response" | sed '$d')

echo "Onboard Status: $onboard_status"
echo "Onboard Response:"
echo "$onboard_body" | jq -C '.' 2>/dev/null || echo "$onboard_body"

if [ "$onboard_status" -eq 200 ]; then
    # Extract API key from response
    ORG_API_KEY=$(echo "$onboard_body" | jq -r '.api_key // empty')
    if [ -n "$ORG_API_KEY" ] && [ "$ORG_API_KEY" != "null" ]; then
        echo -e "${GREEN}✓ Got valid org API key: ${ORG_API_KEY}${NC}"
        echo ""
        echo "----------------------------------------"
        echo ""

        # Test 4: Get all integrations WITH valid API key
        test_endpoint \
            "Get All Integrations (Valid API Key)" \
            "GET" \
            "/api/v1/integrations/${TEST_ORG}" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            ""

        # Test 5: Setup OpenAI integration (will fail validation but should accept the credential)
        test_endpoint \
            "Setup OpenAI Integration" \
            "POST" \
            "/api/v1/integrations/${TEST_ORG}/openai/setup" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            '{"credential": "sk-test-invalid-key-for-testing-purposes-only", "credential_name": "Test OpenAI Key"}'

        # Test 6: Setup Anthropic integration
        test_endpoint \
            "Setup Anthropic Integration" \
            "POST" \
            "/api/v1/integrations/${TEST_ORG}/anthropic/setup" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            '{"credential": "sk-ant-test-invalid-key-for-testing", "credential_name": "Test Anthropic Key"}'

        # Test 7: Setup DeepSeek integration
        test_endpoint \
            "Setup DeepSeek Integration" \
            "POST" \
            "/api/v1/integrations/${TEST_ORG}/deepseek/setup" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            '{"credential": "sk-deepseek-test-key", "credential_name": "Test DeepSeek Key"}'

        # Test 8: Validate OpenAI integration
        test_endpoint \
            "Validate OpenAI Integration" \
            "POST" \
            "/api/v1/integrations/${TEST_ORG}/openai/validate" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            ""

        # Test 9: Get all integrations again (should show configured integrations)
        test_endpoint \
            "Get All Integrations (After Setup)" \
            "GET" \
            "/api/v1/integrations/${TEST_ORG}" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            ""

        # Test 10: Delete OpenAI integration
        test_endpoint \
            "Delete OpenAI Integration" \
            "DELETE" \
            "/api/v1/integrations/${TEST_ORG}/openai" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            ""

        # Test 11: Verify deletion
        test_endpoint \
            "Get All Integrations (After Delete)" \
            "GET" \
            "/api/v1/integrations/${TEST_ORG}" \
            "-H 'X-API-Key: ${ORG_API_KEY}'" \
            ""
    else
        echo -e "${RED}✗ Failed to extract API key from onboard response${NC}"
    fi
elif [ "$onboard_status" -eq 409 ]; then
    echo -e "${YELLOW}⚠ Org already exists - this is OK for testing${NC}"
    echo "Note: To get a fresh start, you'll need to delete the org from BigQuery"
else
    echo -e "${RED}✗ Onboarding failed with status ${onboard_status}${NC}"
fi

echo ""
echo "============================================"
echo "Integration Testing Complete"
echo "============================================"
