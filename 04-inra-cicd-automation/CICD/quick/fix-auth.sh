#!/bin/bash
################################################################################
# fix-auth.sh - Fix Cloud Run authentication to allow public access
# Usage: ./fix-auth.sh <environment>
# The API handles its own authentication via X-CA-Root-Key and X-API-Key headers
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}Usage: ./fix-auth.sh <environment>${NC}"
    echo "Environments: test, stage, prod"
    exit 1
fi

ENV=$1
REGION="us-central1"

# Get project ID
case $ENV in
    test)  PROJECT_ID="cloudact-testing-1" ;;
    stage) PROJECT_ID="cloudact-stage" ;;
    prod)  PROJECT_ID="cloudact-prod" ;;
    *)
        echo -e "${RED}Error: Invalid environment. Use: test, stage, prod${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Fixing Cloud Run Authentication for: $ENV${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Services to fix
SERVICES=("api-service" "pipeline-service" "frontend")

for SERVICE in "${SERVICES[@]}"; do
    SERVICE_NAME="cloudact-${SERVICE}-${ENV}"
    echo -e "${YELLOW}Fixing $SERVICE_NAME...${NC}"

    # Check if service exists
    if gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID &>/dev/null; then
        # Add allUsers as invoker
        gcloud run services add-iam-policy-binding $SERVICE_NAME \
            --region=$REGION \
            --member="allUsers" \
            --role="roles/run.invoker" \
            --project=$PROJECT_ID \
            --quiet 2>/dev/null && echo -e "${GREEN}✓ $SERVICE_NAME - Public access enabled${NC}" || echo -e "${RED}✗ $SERVICE_NAME - Failed${NC}"
    else
        echo -e "${YELLOW}⚠ $SERVICE_NAME - Service not found, skipping${NC}"
    fi
done

echo ""
echo -e "${GREEN}Done! Verifying health checks...${NC}"
echo ""

# Get URLs and test health
for SERVICE in "api-service" "pipeline-service"; do
    SERVICE_NAME="cloudact-${SERVICE}-${ENV}"
    URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format="value(status.url)" 2>/dev/null || echo "")

    if [ -n "$URL" ]; then
        echo -n "Testing $SERVICE_NAME: "
        if curl -sf "${URL}/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ OK${NC}"
        else
            echo -e "${RED}✗ Failed${NC}"
        fi
    fi
done

# Test custom domains for prod
if [ "$ENV" = "prod" ]; then
    echo ""
    echo -e "${YELLOW}Testing custom domains...${NC}"
    echo -n "api.cloudact.ai: "
    curl -sf "https://api.cloudact.ai/health" > /dev/null 2>&1 && echo -e "${GREEN}✓ OK${NC}" || echo -e "${RED}✗ Failed${NC}"
    echo -n "pipeline.cloudact.ai: "
    curl -sf "https://pipeline.cloudact.ai/health" > /dev/null 2>&1 && echo -e "${GREEN}✓ OK${NC}" || echo -e "${RED}✗ Failed${NC}"
fi

echo ""
echo -e "${GREEN}Authentication fix complete!${NC}"
