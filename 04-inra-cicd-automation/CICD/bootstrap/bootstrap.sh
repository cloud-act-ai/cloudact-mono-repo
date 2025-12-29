#!/bin/bash
################################################################################
# bootstrap.sh - Initialize BigQuery datasets and meta tables
# Usage: ./bootstrap.sh <environment>
# Environments: test, stage, prod
#
# MUST run after api-service is deployed, before first user signup
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 1 ]; then
    echo -e "${RED}Usage: ./bootstrap.sh <environment>${NC}"
    echo ""
    echo "Environments: test, stage, prod"
    echo ""
    echo "Examples:"
    echo "  ./bootstrap.sh test"
    echo "  ./bootstrap.sh prod"
    exit 1
fi

ENV=$1
REGION="us-central1"

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

# Environment-specific project IDs
case $ENV in
    test)
        PROJECT_ID="cloudact-testing-1"
        ;;
    stage)
        PROJECT_ID="cloudact-stage"
        ;;
    prod)
        PROJECT_ID="cloudact-prod"
        ;;
esac

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Bootstrap: $ENV${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Environment: $ENV"
echo ""

# Set active project
gcloud config set project $PROJECT_ID --quiet

# Get API service URL
API_URL=$(gcloud run services describe cloudact-api-service-${ENV} \
    --project=$PROJECT_ID \
    --region=$REGION \
    --format="value(status.url)" 2>/dev/null)

if [ -z "$API_URL" ]; then
    echo -e "${RED}Error: API service not found. Deploy api-service first.${NC}"
    exit 1
fi

echo "API Service: $API_URL"
echo ""

# Get CA_ROOT_API_KEY from Secret Manager
CA_ROOT_API_KEY=$(gcloud secrets versions access latest \
    --secret=ca-root-api-key-${ENV} \
    --project=$PROJECT_ID 2>/dev/null)

if [ -z "$CA_ROOT_API_KEY" ]; then
    echo -e "${RED}Error: CA_ROOT_API_KEY secret not found.${NC}"
    echo "Run: ./secrets/setup-secrets.sh $ENV"
    exit 1
fi

# Check if organizations dataset exists
echo -e "${YELLOW}Checking BigQuery datasets...${NC}"
DATASET_EXISTS=$(bq ls --project_id=$PROJECT_ID 2>/dev/null | grep -c "organizations" || true)

if [ "$DATASET_EXISTS" -gt 0 ]; then
    echo -e "${GREEN}✓ organizations dataset already exists${NC}"

    # Check table count
    TABLE_COUNT=$(bq ls ${PROJECT_ID}:organizations 2>/dev/null | grep -c "TABLE" || true)
    echo "  Tables: $TABLE_COUNT"

    if [ "$TABLE_COUNT" -ge 14 ]; then
        echo -e "${GREEN}✓ Bootstrap already complete (${TABLE_COUNT} tables found)${NC}"
        exit 0
    fi
fi

# Run bootstrap
echo ""
echo -e "${YELLOW}Running bootstrap...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/api/v1/admin/bootstrap" \
    -H "Content-Type: application/json" \
    -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}" \
    -d '{}' 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}Bootstrap failed (HTTP $HTTP_CODE):${NC}"
    echo "$BODY"
    exit 1
fi

# Parse response
STATUS=$(echo "$BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
TABLES_CREATED=$(echo "$BODY" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('tables_created', [])))" 2>/dev/null || echo "0")
TOTAL_TABLES=$(echo "$BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('total_tables', 0))" 2>/dev/null || echo "0")

echo ""
if [ "$STATUS" = "SUCCESS" ]; then
    echo -e "${GREEN}✓ Bootstrap complete!${NC}"
    echo "  Dataset created: organizations"
    echo "  Tables created: $TABLES_CREATED"
    echo "  Total tables: $TOTAL_TABLES"
else
    echo -e "${YELLOW}Bootstrap status: $STATUS${NC}"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
fi

echo ""
echo -e "${BLUE}Meta tables created:${NC}"
bq ls ${PROJECT_ID}:organizations 2>/dev/null | head -20

echo ""
echo -e "${GREEN}✓ Environment ready for user signups${NC}"
