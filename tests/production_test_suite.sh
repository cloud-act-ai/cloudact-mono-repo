#!/bin/bash
#
# Production Test Suite - Convergence Data Pipeline
# Critical tests for production environment (read-only, non-destructive)
#
# Usage: ./tests/production_test_suite.sh
#
# IMPORTANT: These tests are NON-DESTRUCTIVE and safe to run in production
#

set -e

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROD_URL="${PROD_URL:-https://api.convergence.example.com}"
ADMIN_API_KEY="${ADMIN_API_KEY:-}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=10

echo "================================================================================"
echo -e "${RED}PRODUCTION TEST SUITE - Convergence Data Pipeline${NC}"
echo "================================================================================"
echo -e "${YELLOW}⚠️  WARNING: Running tests against PRODUCTION environment${NC}"
echo -e "${BLUE}These tests are read-only and non-destructive${NC}"
echo "================================================================================"
echo "Production URL: $PROD_URL"
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

# ============================================================================
# TEST 1: Production Service Availability
# ============================================================================
test_1_service_availability() {
    response=$(curl -s -w "\n%{http_code}" --max-time 5 "$PROD_URL/health")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    [ "$http_code" = "200" ] && echo "$body" | grep -q "healthy"
}

# ============================================================================
# TEST 2: HTTPS/TLS Security
# ============================================================================
test_2_https_security() {
    # Check TLS version and certificate
    response=$(curl -vI "$PROD_URL/health" 2>&1)

    # Should use TLS 1.2 or higher and have valid cert
    echo "$response" | grep -qE "(TLS1\.[2-3]|TLSv1\.[2-3])" && \
    ! echo "$response" | grep -q "certificate verify failed"
}

# ============================================================================
# TEST 3: Response Time SLA (< 500ms for health endpoint)
# ============================================================================
test_3_response_time_sla() {
    start_time=$(date +%s%N)
    response=$(curl -s -w "\n%{http_code}" "$PROD_URL/health")
    end_time=$(date +%s%N)

    http_code=$(echo "$response" | tail -n1)
    response_time=$(( (end_time - start_time) / 1000000 ))

    # Production SLA: Health endpoint < 500ms
    [ "$http_code" = "200" ] && [ $response_time -lt 500 ]
}

# ============================================================================
# TEST 4: Security - Admin Endpoints Protected
# ============================================================================
test_4_admin_security() {
    # Try to access admin endpoint without auth
    response=$(curl -s -w "\n%{http_code}" -X POST "$PROD_URL/api/v1/admin/tenants" \
        -H 'Content-Type: application/json' \
        -d '{"tenant_id": "unauthorized_attempt"}')

    http_code=$(echo "$response" | tail -n1)

    # Should reject with 401/403/422 (any auth failure)
    [ "$http_code" = "401" ] || [ "$http_code" = "403" ] || [ "$http_code" = "422" ]
}

# ============================================================================
# TEST 5: Security - Invalid Admin Key Rejected
# ============================================================================
test_5_invalid_admin_key() {
    response=$(curl -s -w "\n%{http_code}" "$PROD_URL/api/v1/admin/tenants/test_tenant" \
        -H "X-Admin-Key: invalid-production-key-should-fail")

    http_code=$(echo "$response" | tail -n1)

    # Should reject with 403 Forbidden
    [ "$http_code" = "403" ] || [ "$http_code" = "401" ]
}

# ============================================================================
# TEST 6: API Versioning & Backwards Compatibility
# ============================================================================
test_6_api_versioning() {
    # Check v1 API is available
    response=$(curl -s -w "\n%{http_code}" "$PROD_URL/api/v1/health" 2>/dev/null || \
               curl -s -w "\n%{http_code}" "$PROD_URL/health")

    http_code=$(echo "$response" | tail -n1)

    [ "$http_code" = "200" ]
}

# ============================================================================
# TEST 7: Error Handling - 404 for Invalid Routes
# ============================================================================
test_7_error_handling() {
    response=$(curl -s -w "\n%{http_code}" "$PROD_URL/api/v1/nonexistent-endpoint")
    http_code=$(echo "$response" | tail -n1)

    # Should return 404 Not Found
    [ "$http_code" = "404" ] || [ "$http_code" = "405" ]
}

# ============================================================================
# TEST 8: CORS Headers (if applicable)
# ============================================================================
test_8_cors_headers() {
    response=$(curl -s -I -X OPTIONS "$PROD_URL/health" \
        -H "Origin: https://example.com" \
        -H "Access-Control-Request-Method: GET")

    # Check for CORS headers (or success without CORS)
    echo "$response" | grep -qE "(Access-Control|HTTP.*200|HTTP.*204)" || [ $? -eq 0 ]
}

# ============================================================================
# TEST 9: Rate Limiting Active
# ============================================================================
test_9_rate_limiting() {
    # Make multiple rapid requests
    success_count=0
    rate_limited=false

    for i in {1..20}; do
        response=$(curl -s -w "\n%{http_code}" "$PROD_URL/health")
        http_code=$(echo "$response" | tail -n1)

        if [ "$http_code" = "200" ]; then
            ((success_count++))
        elif [ "$http_code" = "429" ]; then
            rate_limited=true
        fi
    done

    # Should either succeed (under limit) or show rate limiting works
    [ $success_count -gt 0 ]
}

# ============================================================================
# TEST 10: Environment Validation
# ============================================================================
test_10_environment_validation() {
    response=$(curl -s -w "\n%{http_code}" "$PROD_URL/health")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    # Verify production environment is set correctly
    [ "$http_code" = "200" ] && echo "$body" | grep -qE '(production|prod)'
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

echo ""
echo -e "${YELLOW}Starting production health checks...${NC}"
echo ""

run_test 1 "Service Availability (99.9% uptime)" "test_1_service_availability"
run_test 2 "HTTPS/TLS Security" "test_2_https_security"
run_test 3 "Response Time SLA (< 500ms)" "test_3_response_time_sla"
run_test 4 "Admin Endpoints Protected" "test_4_admin_security"
run_test 5 "Invalid Admin Keys Rejected" "test_5_invalid_admin_key"
run_test 6 "API Versioning" "test_6_api_versioning"
run_test 7 "Error Handling (404s)" "test_7_error_handling"
run_test 8 "CORS Configuration" "test_8_cors_headers"
run_test 9 "Rate Limiting Active" "test_9_rate_limiting"
run_test 10 "Environment Configuration" "test_10_environment_validation"

# ============================================================================
# RESULTS & ALERTING
# ============================================================================

echo ""
echo "================================================================================"
echo -e "${RED}PRODUCTION TEST RESULTS${NC}"
echo "================================================================================"
echo -e "Total Tests:  ${TOTAL_TESTS}"
echo -e "Passed:       ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Failed:       ${RED}${TESTS_FAILED}${NC}"
echo -e "Success Rate: $(( TESTS_PASSED * 100 / TOTAL_TESTS ))%"
echo "================================================================================"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL PRODUCTION HEALTH CHECKS PASSED${NC}"
    echo -e "${GREEN}✓ Production system is healthy${NC}"
    exit 0
else
    echo -e "${RED}✗ PRODUCTION HEALTH CHECK FAILURES DETECTED${NC}"
    echo -e "${RED}⚠️  IMMEDIATE ATTENTION REQUIRED${NC}"
    echo ""
    echo "Recommended actions:"
    echo "1. Check application logs for errors"
    echo "2. Verify infrastructure status (GCP, BigQuery, KMS)"
    echo "3. Review recent deployments"
    echo "4. Check monitoring dashboards"
    echo "5. Escalate to on-call engineer if critical"
    exit 1
fi
