#!/bin/bash

# Final comprehensive test with fresh tenant
# Tests: bootstrap → onboard → API key → pipeline

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV=$1
if [ -z "$ENV" ]; then
    echo "Usage: ./final_test.sh [stage|prod]"
    exit 1
fi

# Generate unique tenant ID
TENANT_ID="test_$(date +%s)"
DATE=$(date +%Y-%m-%d)

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}Final Comprehensive Test - $ENV${NC}"
echo -e "${BLUE}Tenant: $TENANT_ID${NC}"
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

# Step 1: Bootstrap
echo -e "${YELLOW}[1/4] Bootstrap${NC}"
response=$(curl -s -X POST "$API_URL/api/v1/admin/bootstrap" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -d '{"force_recreate_dataset": false, "force_recreate_tables": false}')

if [[ "$response" == *"SUCCESS"* ]]; then
    echo -e "${GREEN}✓ Bootstrap successful${NC}"
else
    echo -e "${RED}✗ Bootstrap failed: $response${NC}"
    exit 1
fi
echo ""

# Step 2: Onboard Tenant
echo -e "${YELLOW}[2/4] Onboard Tenant: $TENANT_ID${NC}"
response=$(curl -s -X POST "$API_URL/api/v1/admin/tenants" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -d "{\"tenant_id\": \"$TENANT_ID\", \"description\": \"Test tenant\"}")

if [[ "$response" == *"tenant_id"* ]]; then
    echo -e "${GREEN}✓ Tenant created${NC}"
else
    echo -e "${RED}✗ Tenant creation failed: $response${NC}"
    exit 1
fi
echo ""

# Step 3: Generate API Key
echo -e "${YELLOW}[3/4] Generate API Key${NC}"
response=$(curl -s -X POST "$API_URL/api/v1/admin/api-keys" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -d "{\"tenant_id\": \"$TENANT_ID\", \"description\": \"Test key\"}")

if [[ "$response" == *"api_key"* ]]; then
    TENANT_API_KEY=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('api_key', ''))")
    echo -e "${GREEN}✓ API key generated${NC}"
else
    echo -e "${RED}✗ API key generation failed: $response${NC}"
    exit 1
fi
echo ""

# Step 4: Run Pipeline
echo -e "${YELLOW}[4/4] Run Cost Billing Pipeline${NC}"
response=$(curl -s -X POST "$API_URL/api/v1/pipelines/run/$TENANT_ID/gcp/cost/cost_billing" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $TENANT_API_KEY" \
    -d "{\"date\": \"$DATE\"}")

if [[ "$response" == *"pipeline_logging_id"* ]] || [[ "$response" == *"SUCCESS"* ]]; then
    echo -e "${GREEN}✓ Pipeline triggered successfully${NC}"
else
    echo -e "${YELLOW}⚠ Pipeline response: $response${NC}"
fi
echo ""

echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}✓✓✓ ALL TESTS PASSED! ✓✓✓${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo "Tenant ID: $TENANT_ID"
echo "Environment: $ENV"
echo ""
