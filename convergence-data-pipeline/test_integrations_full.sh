#!/bin/bash

# Full Integration Testing Script
# Creates a fresh org and tests all integration endpoints

set -e

BASE_URL="http://localhost:8000"
CA_ROOT_KEY="test-ca-root-key-minimum-32-chars"
TEST_ORG="inttest_$(date +%s)"

echo "============================================"
echo "Full Integration Endpoints Test"
echo "Test Org: ${TEST_ORG}"
echo "============================================"
echo ""

# Function to test and display results
run_test() {
    local test_num="$1"
    local test_name="$2"
    local method="$3"
    local endpoint="$4"
    local headers="$5"
    local data="$6"

    echo ""
    echo "================================================"
    echo "TEST ${test_num}: ${test_name}"
    echo "================================================"
    echo "Method: $method"
    echo "Endpoint: $endpoint"
    echo ""

    # Make request
    if [ "$method" = "GET" ] || [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" $headers "${BASE_URL}${endpoint}")
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" $headers -H "Content-Type: application/json" -d "$data" "${BASE_URL}${endpoint}")
    fi

    # Extract status and body
    status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    body=$(echo "$response" | grep -v "HTTP_STATUS:")

    echo "HTTP Status: $status"
    echo ""
    echo "Response Body:"
    if echo "$body" | jq -e . >/dev/null 2>&1; then
        echo "$body" | jq -C '.'
    else
        echo "$body"
    fi
    echo ""

    # Evaluation
    if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
        echo "Result: ✓ SUCCESS"
    elif [ "$status" -eq 401 ] || [ "$status" -eq 403 ]; then
        echo "Result: ⚠ AUTH FAILURE (Expected for invalid credentials)"
    elif [ "$status" -eq 422 ]; then
        echo "Result: ⚠ VALIDATION ERROR"
    else
        echo "Result: ✗ UNEXPECTED STATUS"
    fi

    echo "$body"  # Return body for parsing
}

echo "Step 1: Creating test organization..."
echo ""

onboard_result=$(run_test "1" "Onboard New Organization" "POST" "/api/v1/organizations/onboard" \
    "-H 'X-CA-Root-Key: ${CA_ROOT_KEY}'" \
    "{\"org_slug\": \"${TEST_ORG}\", \"company_name\": \"Integration Test Org\", \"admin_email\": \"test@integrations.com\", \"subscription_plan\": \"STARTER\"}")

# Extract API key
ORG_API_KEY=$(echo "$onboard_result" | jq -r '.api_key // empty' 2>/dev/null)

if [ -z "$ORG_API_KEY" ] || [ "$ORG_API_KEY" = "null" ]; then
    echo ""
    echo "ERROR: Failed to get API key from onboarding response"
    echo "Cannot continue with tests"
    exit 1
fi

echo ""
echo "✓ Successfully onboarded organization"
echo "✓ Org API Key: ${ORG_API_KEY}"
echo ""

# Test 2: Get integrations (no auth header)
run_test "2" "Get All Integrations (No Auth)" "GET" "/api/v1/integrations/${TEST_ORG}" "" "" > /dev/null

# Test 3: Get integrations (invalid auth)
run_test "3" "Get All Integrations (Invalid Key)" "GET" "/api/v1/integrations/${TEST_ORG}" \
    "-H 'X-API-Key: invalid-key-12345'" "" > /dev/null

# Test 4: Get integrations (valid auth)
run_test "4" "Get All Integrations (Valid Key - Empty)" "GET" "/api/v1/integrations/${TEST_ORG}" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" "" > /dev/null

# Test 5: Setup OpenAI integration
run_test "5" "Setup OpenAI Integration" "POST" "/api/v1/integrations/${TEST_ORG}/openai/setup" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" \
    '{"credential": "sk-proj-test-invalid-key-12345678901234567890", "credential_name": "Test OpenAI Production Key"}' > /dev/null

# Test 6: Setup Anthropic integration
run_test "6" "Setup Anthropic Integration" "POST" "/api/v1/integrations/${TEST_ORG}/anthropic/setup" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" \
    '{"credential": "sk-ant-api03-test-invalid-key-1234567890", "credential_name": "Test Claude Production Key"}' > /dev/null

# Test 7: Setup DeepSeek integration
run_test "7" "Setup DeepSeek Integration" "POST" "/api/v1/integrations/${TEST_ORG}/deepseek/setup" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" \
    '{"credential": "sk-deepseek-test-key-1234567890", "credential_name": "Test DeepSeek Key"}' > /dev/null

# Test 8: Get all integrations (should show configured ones)
run_test "8" "Get All Integrations (After Setup)" "GET" "/api/v1/integrations/${TEST_ORG}" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" "" > /dev/null

# Test 9: Validate OpenAI integration (will fail with invalid key but test the endpoint)
run_test "9" "Validate OpenAI Integration" "POST" "/api/v1/integrations/${TEST_ORG}/openai/validate" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" "" > /dev/null

# Test 10: Delete OpenAI integration
run_test "10" "Delete OpenAI Integration" "DELETE" "/api/v1/integrations/${TEST_ORG}/openai" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" "" > /dev/null

# Test 11: Verify deletion
run_test "11" "Get All Integrations (After Delete)" "GET" "/api/v1/integrations/${TEST_ORG}" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" "" > /dev/null

# Test 12: Try to validate deleted integration (should fail)
run_test "12" "Validate Deleted Integration (Should Fail)" "POST" "/api/v1/integrations/${TEST_ORG}/openai/validate" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" "" > /dev/null

# Test 13: Delete non-existent integration (should handle gracefully)
run_test "13" "Delete Non-Existent Integration" "DELETE" "/api/v1/integrations/${TEST_ORG}/gcp_sa" \
    "-H 'X-API-Key: ${ORG_API_KEY}'" "" > /dev/null

echo ""
echo "============================================"
echo "All Integration Tests Complete!"
echo "============================================"
echo ""
echo "Test Organization: ${TEST_ORG}"
echo "Org API Key: ${ORG_API_KEY}"
echo ""
echo "Note: You can query BigQuery to see the stored data:"
echo "  Dataset: organizations"
echo "  Tables: org_integration_credentials, org_profiles, org_api_keys"
echo ""
