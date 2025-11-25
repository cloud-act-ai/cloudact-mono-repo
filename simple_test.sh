#!/bin/bash

# simple_test.sh - Verify Bootstrap -> Onboard -> Pipeline flow
# Usage: ./simple_test.sh [local|stage|prod]

set -e

ENV=$1
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ -z "$ENV" ]; then
    echo "Usage: ./simple_test.sh [local|stage|prod]"
    exit 1
fi

# Configuration
# Use a shorter organization slug to avoid length limits if any, but unique enough
ORG_SLUG="test_$(date +%s)"
DESCRIPTION="Test Organization for $ENV verification"
DATE=$(date +%Y-%m-%d)

echo -e "${BLUE}----------------------------------------------------------------${NC}"
echo -e "${BLUE}Running Simple Test Suite for $ENV${NC}"
echo -e "${BLUE}----------------------------------------------------------------${NC}"

# Set Environment Variables
if [ "$ENV" = "local" ]; then
    API_URL="http://localhost:8000"
    
    if [ -z "$ADMIN_API_KEY" ]; then
        echo -e "${RED}Error: ADMIN_API_KEY not set.${NC}"
        echo "Please export ADMIN_API_KEY='admin_...' before running local test."
        exit 1
    fi
elif [ "$ENV" = "stage" ]; then
    API_URL="https://convergence-pipeline-stage-526075321773.us-central1.run.app"
    PROJECT_ID="gac-stage-471220"
    
    if [ -z "$ADMIN_API_KEY" ]; then
        echo "Fetching Admin API Key from Secret Manager (stage)..."
        ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-stage --project=$PROJECT_ID 2>/dev/null || echo "")
        
        if [ -z "$ADMIN_API_KEY" ]; then
             # Fallback name check
             ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key --project=$PROJECT_ID 2>/dev/null || echo "")
        fi

        if [ -z "$ADMIN_API_KEY" ]; then
             echo -e "${RED}Could not fetch admin-api-key. Please export ADMIN_API_KEY manually.${NC}"
             exit 1
        fi
        echo "Admin Key fetched successfully."
    fi
elif [ "$ENV" = "prod" ]; then
    API_URL="https://convergence-pipeline-prod-820784027009.us-central1.run.app"
    PROJECT_ID="gac-prod-471220"
    
    if [ -z "$ADMIN_API_KEY" ]; then
        echo "Fetching Admin API Key from Secret Manager (prod)..."
        ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-prod --project=$PROJECT_ID 2>/dev/null || echo "")
        
        if [ -z "$ADMIN_API_KEY" ]; then
             # Fallback name check
             ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key --project=$PROJECT_ID 2>/dev/null || echo "")
        fi

        if [ -z "$ADMIN_API_KEY" ]; then
             echo -e "${RED}Could not fetch admin-api-key. Please export ADMIN_API_KEY manually.${NC}"
             exit 1
        fi
        echo "Admin Key fetched successfully."
    fi
else
    echo -e "${RED}Invalid environment. Use local, stage, or prod.${NC}"
    exit 1
fi

echo "URL: $API_URL"
echo "Organization: $ORG_SLUG"
echo -e "${BLUE}----------------------------------------------------------------${NC}"

# Helper function
run_curl() {
    local method=$1
    local endpoint=$2
    local data=$3
    local header=$4
    
    echo -e "${GREEN}Request: $method $endpoint${NC}"
    
    if [ -n "$data" ]; then
        response=$(curl -s -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "$header" \
            -d "$data")
    else
        response=$(curl -s -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "$header")
    fi
    
    # Check for curl errors or empty response
    if [ -z "$response" ]; then
        echo -e "${RED}Error: Empty response from server.${NC}"
        exit 1
    fi

    echo "Response: $response"
    echo "----------------------------------------------------------------"
    echo "$response"
}

# 1. Bootstrap
echo "Step 1: Bootstrapping System..."
run_curl "POST" "/api/v1/admin/bootstrap" '{"force_recreate_dataset": false, "force_recreate_tables": false}' "X-Admin-Key: $ADMIN_API_KEY"

# 2. Onboard Organization (creates dataset + API key in one step)
echo "Step 2: Onboarding Organization..."
echo -e "${GREEN}Request: POST /api/v1/organizations/onboard${NC}"
onboard_response=$(curl -s -X POST "$API_URL/api/v1/organizations/onboard" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -d "{\"org_slug\": \"$ORG_SLUG\", \"company_name\": \"$DESCRIPTION\", \"admin_email\": \"test@test.com\", \"plan_name\": \"PROFESSIONAL\"}")
echo "Response: $onboard_response"
echo "----------------------------------------------------------------"

# Extract API Key from onboarding response
if command -v jq &> /dev/null; then
    ORG_API_KEY=$(echo "$onboard_response" | jq -r '.api_key')
else
    ORG_API_KEY=$(echo "$onboard_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('api_key', ''))")
fi

if [ "$ORG_API_KEY" == "null" ] || [ -z "$ORG_API_KEY" ]; then
    echo -e "${RED}Failed to onboard organization and get API key.${NC}"
    echo "Response: $onboard_response"
    exit 1
fi

echo -e "${GREEN}Organization onboarded and API Key generated!${NC}"

# 3. Run Pipeline
echo "Step 3: Running Cost Billing Pipeline..."
# Endpoint: /api/v1/pipelines/run/{org_slug}/gcp/cost/cost_billing
PIPELINE_ENDPOINT="/api/v1/pipelines/run/$ORG_SLUG/gcp/cost/cost_billing"

response=$(run_curl "POST" "$PIPELINE_ENDPOINT" "{\"date\": \"$DATE\"}" "X-API-Key: $ORG_API_KEY")

if [[ "$response" == *"pipeline_logging_id"* ]] || [[ "$response" == *"SUCCESS"* ]]; then
    echo -e "${GREEN}Test Complete! Pipeline triggered successfully.${NC}"
else
    echo -e "${RED}Pipeline trigger might have failed. Check response.${NC}"
    exit 1
fi
