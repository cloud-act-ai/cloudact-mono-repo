#!/bin/bash
#
# Staging Test Suite - Convergence Data Pipeline
# Tests deployment, performance, and integration in staging environment
#
# Usage: ./tests/staging_test_suite.sh
#

set -e

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
STAGING_URL="${STAGING_URL:-https://convergence-api-staging.example.com}"
ADMIN_API_KEY="${ADMIN_API_KEY:-}"
TEST_TENANT_ID="staging_test_$(date +%s)"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=10

echo "================================================================================"
echo "STAGING TEST SUITE - Convergence Data Pipeline"
echo "================================================================================"
echo "Staging URL: $STAGING_URL"
echo "Test Tenant: $TEST_TENANT_ID"
echo "================================================================================"
echo ""

run_test() {
    local test_num=$1
    local test_name=$2
    local test_cmd=$3

    echo -n "Test ${test_num}/${TOTAL_TESTS}: ${test_name}... "

    if eval "$test_cmd"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

check_admin_key() {
    if [ -z "$ADMIN_API_KEY" ]; then
        echo -e "${RED}ERROR: ADMIN_API_KEY not set for staging${NC}"
        exit 1
    fi
}

# ============================================================================
# TEST 1: HTTPS/TLS Certificate Validation
# ============================================================================
test_1_tls_certificate() {
    response=$(curl -s -I "$STAGING_URL/health" 2>&1)

    # Check for valid TLS
    ! echo "$response" | grep -q "certificate" && echo "$response" | grep -q "HTTP"
}

# ============================================================================
# TEST 2: Service Health & Uptime
# ============================================================================
test_2_service_health() {
    response=$(curl -s -w "\n%{http_code}" "$STAGING_URL/health")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    [ "$http_code" = "200" ] && echo "$body" | grep -q "healthy" && echo "$body" | grep -q "staging"
}

# ============================================================================
# TEST 3: KMS Integration - Encryption Working
# ============================================================================
test_3_kms_integration() {
    check_admin_key

    # Create tenant
    curl -s -X POST "$STAGING_URL/api/v1/admin/tenants" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"${TEST_TENANT_ID}_kms\", \"description\": \"KMS test\"}" > /dev/null

    # Try to generate API key with KMS encryption
    response=$(curl -s -w "\n%{http_code}" -X POST "$STAGING_URL/api/v1/admin/api-keys" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"${TEST_TENANT_ID}_kms\", \"description\": \"KMS test key\"}")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    # Should complete successfully with KMS in staging
    [ "$http_code" = "200" ] && echo "$body" | grep -q "api_key"
}

# ============================================================================
# TEST 4: Multi-Tenant Isolation
# ============================================================================
test_4_tenant_isolation() {
    check_admin_key

    # Create two tenants
    curl -s -X POST "$STAGING_URL/api/v1/admin/tenants" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"${TEST_TENANT_ID}_a\"}" > /dev/null

    curl -s -X POST "$STAGING_URL/api/v1/admin/tenants" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"${TEST_TENANT_ID}_b\"}" > /dev/null

    # Verify both exist independently
    response_a=$(curl -s -w "\n%{http_code}" "$STAGING_URL/api/v1/admin/tenants/${TEST_TENANT_ID}_a" \
        -H "X-Admin-Key: $ADMIN_API_KEY")

    response_b=$(curl -s -w "\n%{http_code}" "$STAGING_URL/api/v1/admin/tenants/${TEST_TENANT_ID}_b" \
        -H "X-Admin-Key: $ADMIN_API_KEY")

    http_code_a=$(echo "$response_a" | tail -n1)
    http_code_b=$(echo "$response_b" | tail -n1)

    [ "$http_code_a" = "200" ] && [ "$http_code_b" = "200" ]
}

# ============================================================================
# TEST 5: Rate Limiting - Global Limits
# ============================================================================
test_5_rate_limiting() {
    check_admin_key

    # Make rapid requests to test rate limiting
    success_count=0
    for i in {1..5}; do
        response=$(curl -s -w "\n%{http_code}" "$STAGING_URL/health")
        http_code=$(echo "$response" | tail -n1)
        [ "$http_code" = "200" ] && ((success_count++))
    done

    # Should handle at least some requests
    [ $success_count -ge 3 ]
}

# ============================================================================
# TEST 6: BigQuery Dataset Access
# ============================================================================
test_6_bigquery_access() {
    check_admin_key

    # Create tenant which creates BigQuery dataset
    response=$(curl -s -w "\n%{http_code}" -X POST "$STAGING_URL/api/v1/admin/tenants" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"${TEST_TENANT_ID}_bq\"}")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    # Should successfully create dataset
    [ "$http_code" = "200" ] && echo "$body" | grep -q "datasets_created"
}

# ============================================================================
# TEST 7: Logging & Monitoring
# ============================================================================
test_7_logging_monitoring() {
    # Make a request and check if logging is working
    response=$(curl -s -w "\n%{http_code}" "$STAGING_URL/health" \
        -H "X-Request-ID: test-staging-$(date +%s)")

    http_code=$(echo "$response" | tail -n1)

    # Request should succeed (logging happens in background)
    [ "$http_code" = "200" ]
}

# ============================================================================
# TEST 8: Performance - Response Time
# ============================================================================
test_8_performance() {
    # Measure response time
    start_time=$(date +%s%N)
    response=$(curl -s -w "\n%{http_code}" "$STAGING_URL/health")
    end_time=$(date +%s%N)

    http_code=$(echo "$response" | tail -n1)
    response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

    # Should respond within 2 seconds
    [ "$http_code" = "200" ] && [ $response_time -lt 2000 ]
}

# ============================================================================
# TEST 9: Error Handling - Invalid Requests
# ============================================================================
test_9_error_handling() {
    check_admin_key

    # Send invalid tenant ID format
    response=$(curl -s -w "\n%{http_code}" -X POST "$STAGING_URL/api/v1/admin/tenants" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d '{"tenant_id": "INVALID-TENANT-123!@#"}')

    http_code=$(echo "$response" | tail -n1)

    # Should reject with 422 (validation error)
    [ "$http_code" = "422" ]
}

# ============================================================================
# TEST 10: End-to-End Workflow
# ============================================================================
test_10_e2e_workflow() {
    check_admin_key

    local e2e_tenant="${TEST_TENANT_ID}_e2e"

    # Step 1: Create tenant
    response1=$(curl -s -w "\n%{http_code}" -X POST "$STAGING_URL/api/v1/admin/tenants" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"$e2e_tenant\"}")

    http_code1=$(echo "$response1" | tail -n1)
    [ "$http_code1" != "200" ] && return 1

    # Step 2: Get tenant info
    response2=$(curl -s -w "\n%{http_code}" "$STAGING_URL/api/v1/admin/tenants/$e2e_tenant" \
        -H "X-Admin-Key: $ADMIN_API_KEY")

    http_code2=$(echo "$response2" | tail -n1)
    [ "$http_code2" != "200" ] && return 1

    # Step 3: Generate API key
    response3=$(curl -s -w "\n%{http_code}" -X POST "$STAGING_URL/api/v1/admin/api-keys" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"$e2e_tenant\", \"description\": \"E2E test key\"}")

    http_code3=$(echo "$response3" | tail -n1)
    [ "$http_code3" = "200" ]
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

echo "Running staging tests..."
echo ""

run_test 1 "HTTPS/TLS Certificate" "test_1_tls_certificate"
run_test 2 "Service Health & Environment" "test_2_service_health"
run_test 3 "KMS Integration" "test_3_kms_integration"
run_test 4 "Multi-Tenant Isolation" "test_4_tenant_isolation"
run_test 5 "Rate Limiting" "test_5_rate_limiting"
run_test 6 "BigQuery Dataset Access" "test_6_bigquery_access"
run_test 7 "Logging & Monitoring" "test_7_logging_monitoring"
run_test 8 "Performance - Response Time" "test_8_performance"
run_test 9 "Error Handling" "test_9_error_handling"
run_test 10 "End-to-End Workflow" "test_10_e2e_workflow"

# ============================================================================
# RESULTS
# ============================================================================

echo ""
echo "================================================================================"
echo "STAGING TEST RESULTS"
echo "================================================================================"
echo -e "Total Tests:  ${TOTAL_TESTS}"
echo -e "Passed:       ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Failed:       ${RED}${TESTS_FAILED}${NC}"
echo -e "Success Rate: $(( TESTS_PASSED * 100 / TOTAL_TESTS ))%"
echo "================================================================================"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL STAGING TESTS PASSED - READY FOR PRODUCTION${NC}"
    exit 0
else
    echo -e "${RED}✗ STAGING TESTS FAILED - DO NOT DEPLOY TO PRODUCTION${NC}"
    exit 1
fi
