#!/bin/bash

# Test cost pipeline for guru_234 on prod
# Since guru_234 already has an API key, we need to get it or create a new tenant

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV=$1
TENANT_ID=${2:-"guru_234"}

if [ -z "$ENV" ]; then
    echo "Usage: ./test_pipeline.sh [stage|prod] [tenant_id]"
    exit 1
fi

DATE=$(date +%Y-%m-%d)

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}Testing Cost Pipeline for $TENANT_ID on $ENV${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# Set environment
if [ "$ENV" = "stage" ]; then
    API_URL="https://convergence-pipeline-stage-pjokgqnf2a-uc.a.run.app"
    PROJECT_ID="gac-stage-471220"
elif [ "$ENV" = "prod" ]; then
    API_URL="https://convergence-pipeline-prod-820784027009.us-central1.run.app"
    PROJECT_ID="gac-prod-471220"
else
    echo -e "${RED}Invalid environment${NC}"
    exit 1
fi

# Get admin key
echo "Fetching admin API key..."
ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-$ENV --project=$PROJECT_ID 2>/dev/null || gcloud secrets versions access latest --secret=admin-api-key --project=$PROJECT_ID)

if [ -z "$ADMIN_API_KEY" ]; then
    echo -e "${RED}Failed to get admin key${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Admin key retrieved${NC}"
echo ""

# Check if tenant exists
echo "Checking if tenant $TENANT_ID exists..."
tenant_response=$(curl -s "$API_URL/api/v1/admin/tenants/$TENANT_ID" \
    -H "X-Admin-Key: $ADMIN_API_KEY")

if [[ "$tenant_response" == *"tenant_id"* ]]; then
    echo -e "${GREEN}✓ Tenant exists${NC}"
    api_keys_count=$(echo "$tenant_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('api_keys_count', 0))")
    echo "  API keys: $api_keys_count"
else
    echo -e "${YELLOW}⚠ Tenant doesn't exist, creating...${NC}"
    curl -s -X POST "$API_URL/api/v1/admin/tenants" \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -d "{\"tenant_id\": \"$TENANT_ID\", \"description\": \"Test tenant\"}" > /dev/null
    echo -e "${GREEN}✓ Tenant created${NC}"
    api_keys_count=0
fi
echo ""

# Generate or check API key
if [ "$api_keys_count" -eq "0" ]; then
    echo "Generating API key for $TENANT_ID..."
    api_key_response=$(curl -s -X POST "$API_URL/api/v1/admin/api-keys" \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -d "{\"tenant_id\": \"$TENANT_ID\", \"description\": \"Pipeline test key\"}")
    
    if [[ "$api_key_response" == *"api_key"* ]]; then
        TENANT_API_KEY=$(echo "$api_key_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('api_key', ''))")
        echo -e "${GREEN}✓ API key generated${NC}"
    else
        echo -e "${RED}✗ API key generation failed: $api_key_response${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ Tenant already has an API key${NC}"
    echo "  To test the pipeline, we need to create a new tenant or revoke the existing key"
    echo ""
    echo "Creating a new test tenant instead..."
    NEW_TENANT="test_pipeline_$(date +%s)"
    
    curl -s -X POST "$API_URL/api/v1/admin/tenants" \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -d "{\"tenant_id\": \"$NEW_TENANT\", \"description\": \"Pipeline test\"}" > /dev/null
    
    api_key_response=$(curl -s -X POST "$API_URL/api/v1/admin/api-keys" \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -d "{\"tenant_id\": \"$NEW_TENANT\", \"description\": \"Pipeline test key\"}")
    
    TENANT_API_KEY=$(echo "$api_key_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('api_key', ''))")
    TENANT_ID=$NEW_TENANT
    echo -e "${GREEN}✓ New tenant created: $TENANT_ID${NC}"
    echo -e "${GREEN}✓ API key generated${NC}"
fi
echo ""

# Run cost billing pipeline
echo -e "${YELLOW}Running cost billing pipeline for $TENANT_ID...${NC}"
echo "Date: $DATE"
echo ""

pipeline_response=$(curl -s -X POST "$API_URL/api/v1/pipelines/run/$TENANT_ID/gcp/cost/cost_billing" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $TENANT_API_KEY" \
    -d "{\"date\": \"$DATE\"}")

echo "Pipeline Response:"
echo "$pipeline_response" | python3 -m json.tool 2>/dev/null || echo "$pipeline_response"
echo ""

if [[ "$pipeline_response" == *"pipeline_logging_id"* ]] || [[ "$pipeline_response" == *"SUCCESS"* ]]; then
    echo -e "${GREEN}✓✓✓ PIPELINE TRIGGERED SUCCESSFULLY! ✓✓✓${NC}"
elif [[ "$pipeline_response" == *"error"* ]] || [[ "$pipeline_response" == *"detail"* ]]; then
    echo -e "${RED}✗ Pipeline failed${NC}"
    exit 1
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

echo ""
echo -e "${BLUE}================================================================${NC}"
echo "Tenant ID: $TENANT_ID"
echo "Environment: $ENV"
echo -e "${BLUE}================================================================${NC}"
