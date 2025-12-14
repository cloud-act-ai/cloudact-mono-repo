#!/bin/bash

# test_signup_currencies.sh - Verify Signup with different currencies
# Usage: ./test_signup_currencies.sh [local|stage|prod]

set -e

ENV=$1
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ -z "$ENV" ]; then
    echo "Usage: ./test_signup_currencies.sh [local|stage|prod]"
    exit 1
fi

# Configuration
TIMESTAMP=$(date +%s)

if [ "$ENV" = "local" ]; then
    API_URL="http://localhost:8000"
    if [ -z "$CA_ROOT_API_KEY" ]; then
        echo -e "${RED}Error: CA_ROOT_API_KEY not set.${NC}"
        echo "Please export CA_ROOT_API_KEY='ca_root_...' before running."
        exit 1
    fi
elif [ "$ENV" = "stage" ]; then
    API_URL="https://convergence-pipeline-stage-526075321773.us-central1.run.app"
     if [ -z "$CA_ROOT_API_KEY" ]; then
         echo -e "${RED}Error: CA_ROOT_API_KEY not set for stage.${NC}"
         exit 1
    fi
elif [ "$ENV" = "prod" ]; then
    API_URL="https://convergence-pipeline-prod-820784027009.us-central1.run.app"
     if [ -z "$CA_ROOT_API_KEY" ]; then
         echo -e "${RED}Error: CA_ROOT_API_KEY not set for prod.${NC}"
         exit 1
    fi
else
    echo -e "${RED}Invalid environment.${NC}"
    exit 1
fi

# Helper function
run_test() {
    local currency=$1
    local expected_country=$2
    local test_slug="test_currency_${currency}_${TIMESTAMP}"
    local email="test_${currency}_${TIMESTAMP}@example.com"

    echo -e "${BLUE}----------------------------------------------------------------${NC}"
    echo -e "${BLUE}TEST: Signup with Currency: $currency${NC}"
    echo -e "${BLUE}----------------------------------------------------------------${NC}"

    response=$(curl -s -X POST "$API_URL/api/v1/organizations/onboard" \
        -H "Content-Type: application/json" \
        -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
        -d "{\"org_slug\": \"$test_slug\", \"company_name\": \"Test $currency\", \"admin_email\": \"$email\", \"subscription_plan\": \"STARTER\", \"default_currency\": \"$currency\"}")

    # Parse response
    if command -v jq &> /dev/null; then
        actual_currency=$(echo "$response" | jq -r '.default_currency')
        actual_country=$(echo "$response" | jq -r '.default_country')
        error_msg=$(echo "$response" | jq -r '.detail // empty')
    else
         # Fallback python parser
         actual_currency=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('default_currency', ''))")
         actual_country=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('default_country', ''))")
    fi

    if [ -n "$error_msg" ]; then
         echo -e "${RED}FAILED: API returned error: $error_msg${NC}"
         echo "Response: $response"
         exit 1
    fi

    echo "Expected Currency: $currency | Actual: $actual_currency"
    echo "Expected Country: $expected_country  | Actual: $actual_country"

    if [ "$actual_currency" == "$currency" ] && [ "$actual_country" == "$expected_country" ]; then
        echo -e "${GREEN}PASS: Onboarding successful with correct currency/country.${NC}"
    else
        echo -e "${RED}FAIL: Onboarding Mismatch detected.${NC}"
        echo "Response: $response"
        exit 1
    fi

    # ----------------------------------------------------------------
    # Persistence Check: GET /api/v1/organizations/{org_slug}/locale
    # ----------------------------------------------------------------
    echo "Verifying Persistence via GET /locale..."
    # Retrieve API key for the new org if needed, but we can use Root Key for admin access if allowed, 
    # or just use the root key to "sudo" if the endpoint supports it (it usually requires valid auth).
    # The locale endpoint /api/v1/organizations/{org_slug}/locale is likely accessible to the org user.
    # We extracted ORG_API_KEY earlier in a variable if we parse it.
    
    # Let's parse the ORG_API_KEY from the response properly
    if command -v jq &> /dev/null; then
        ORG_API_KEY=$(echo "$response" | jq -r '.api_key')
    else
        ORG_API_KEY=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('api_key', ''))")
    fi

    locale_response=$(curl -s -X GET "$API_URL/api/v1/organizations/$test_slug/locale" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $ORG_API_KEY")

    if command -v jq &> /dev/null; then
        persisted_currency=$(echo "$locale_response" | jq -r '.default_currency')
        persisted_country=$(echo "$locale_response" | jq -r '.default_country')
    else
         persisted_currency=$(echo "$locale_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('default_currency', ''))")
         persisted_country=$(echo "$locale_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('default_country', ''))")
    fi

    echo "Persisted Currency: $persisted_currency"
    echo "Persisted Country: $persisted_country"

    if [ "$persisted_currency" == "$currency" ] && [ "$persisted_country" == "$expected_country" ]; then
        echo -e "${GREEN}PASS: Persistence verified.${NC}"
    else
        echo -e "${RED}FAIL: Persistence check failed.${NC}"
        echo "Locale Response: $locale_response"
        exit 1
    fi
}

# Run Tests
run_test "USD" "US"
run_test "INR" "IN"

echo -e "${GREEN}----------------------------------------------------------------${NC}"
echo -e "${GREEN}ALL TESTS PASSED${NC}"
echo -e "${GREEN}----------------------------------------------------------------${NC}"
