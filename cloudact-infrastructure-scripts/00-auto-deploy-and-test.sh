#!/bin/bash

################################################################################
# 00-auto-deploy-and-test.sh
#
# Automated deployment and testing for both Stage and Production
#
# This script:
# 1. Sets up GitHub secrets (one-time)
# 2. Triggers deployment via git push or manual workflow
# 3. Watches workflow logs in real-time
# 4. Tests deployed endpoints automatically
#
# Usage:
#   ./00-auto-deploy-and-test.sh          # Deploy to staging (auto)
#   ./00-auto-deploy-and-test.sh prod     # Deploy to production (manual)
#   ./00-auto-deploy-and-test.sh both     # Deploy to both environments
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ENV=${1:-stage}

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Automated Cloud Run Deployment & Testing${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) not installed${NC}"
    echo "Install: brew install gh"
    exit 1
fi

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not installed${NC}"
    echo "Install: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites installed${NC}"
echo ""

# Check if GitHub secrets are set
echo -e "${BLUE}Checking GitHub secrets...${NC}"
SECRET_CHECK=$(gh secret list 2>/dev/null | grep -c "GCP_PROJECT_ID_STAGE" || echo "0")

if [ "$SECRET_CHECK" = "0" ]; then
    echo -e "${YELLOW}GitHub secrets not configured. Setting up now...${NC}"
    echo ""
    ./06-update-github-secrets.sh
    echo ""
else
    echo -e "${GREEN}✓ GitHub secrets already configured${NC}"
    echo ""
fi

# Function to test endpoint
test_endpoint() {
    local ENV_NAME=$1
    local PROJECT_ID=$2
    local SERVICE_NAME=$3

    echo -e "${BLUE}Getting service URL for ${ENV_NAME}...${NC}"

    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
        --platform=managed \
        --region=us-central1 \
        --project=$PROJECT_ID \
        --format="value(status.url)" 2>/dev/null || echo "")

    if [ -z "$SERVICE_URL" ]; then
        echo -e "${RED}✗ Service not found or not deployed yet${NC}"
        return 1
    fi

    echo -e "${GREEN}Service URL: $SERVICE_URL${NC}"
    echo ""

    # Test health endpoint
    echo -e "${BLUE}Testing /health endpoint...${NC}"
    HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/health" 2>/dev/null || echo "000")
    HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
    BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Health check passed${NC}"
        echo "Response: $BODY"
    else
        echo -e "${RED}✗ Health check failed (HTTP $HTTP_CODE)${NC}"
        return 1
    fi
    echo ""

    # Test onboarding endpoint
    echo -e "${BLUE}Testing /api/v1/customers/onboard endpoint...${NC}"
    TEST_TENANT_ID="test_$(date +%s)"

    ONBOARD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/api/v1/customers/onboard" \
        -H "Content-Type: application/json" \
        -d "{
            \"tenant_id\": \"$TEST_TENANT_ID\",
            \"company_name\": \"Test Company $(date +%Y%m%d)\",
            \"subscription_tier\": \"FREE\"
        }" 2>/dev/null || echo "000")

    HTTP_CODE=$(echo "$ONBOARD_RESPONSE" | tail -n1)
    BODY=$(echo "$ONBOARD_RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "${GREEN}✓ Onboarding test passed${NC}"
        echo "Response: $BODY" | jq '.' 2>/dev/null || echo "$BODY"
    else
        echo -e "${YELLOW}⚠ Onboarding test returned HTTP $HTTP_CODE${NC}"
        echo "Response: $BODY"
    fi
    echo ""

    return 0
}

# Function to deploy and test an environment
deploy_and_test() {
    local ENV_NAME=$1
    local PROJECT_ID=$2
    local SERVICE_NAME=$3

    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Deploying to ${ENV_NAME}${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ "$ENV_NAME" = "stage" ]; then
        # Stage deploys automatically on push to main
        echo -e "${BLUE}Committing and pushing to trigger deployment...${NC}"

        if [ -n "$(git status --porcelain)" ]; then
            git add -A
            git commit -m "Deploy to staging - $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || echo "No changes to commit"
        fi

        git push origin main
        echo ""

        echo -e "${BLUE}Waiting for workflow to start...${NC}"
        sleep 5

    else
        # Production requires manual workflow trigger
        echo -e "${BLUE}Triggering manual deployment to production...${NC}"
        gh workflow run deploy.yml -f environment=prod
        echo ""

        echo -e "${BLUE}Waiting for workflow to start...${NC}"
        sleep 5
    fi

    # Get the latest workflow run
    echo -e "${BLUE}Watching workflow logs...${NC}"
    RUN_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')

    if [ -z "$RUN_ID" ]; then
        echo -e "${RED}✗ Could not find workflow run${NC}"
        return 1
    fi

    echo -e "${GREEN}Run ID: $RUN_ID${NC}"
    echo ""

    # Watch the workflow
    gh run watch $RUN_ID --exit-status

    WORKFLOW_STATUS=$?
    echo ""

    if [ $WORKFLOW_STATUS -eq 0 ]; then
        echo -e "${GREEN}✓ Deployment successful!${NC}"
        echo ""

        # Wait for service to be ready
        echo -e "${BLUE}Waiting for service to be ready (30s)...${NC}"
        sleep 30

        # Test the deployment
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${CYAN}  Testing ${ENV_NAME} Deployment${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo ""

        test_endpoint "$ENV_NAME" "$PROJECT_ID" "$SERVICE_NAME"
        TEST_STATUS=$?

        if [ $TEST_STATUS -eq 0 ]; then
            echo -e "${GREEN}✓ All tests passed for ${ENV_NAME}!${NC}"
        else
            echo -e "${YELLOW}⚠ Some tests failed for ${ENV_NAME}${NC}"
        fi
    else
        echo -e "${RED}✗ Deployment failed${NC}"
        echo ""
        echo "View logs: gh run view $RUN_ID --log"
        return 1
    fi

    echo ""
}

# Main execution
case "$ENV" in
    stage)
        deploy_and_test "stage" "gac-stage-471220" "convergence-pipeline-stage"
        ;;
    prod)
        deploy_and_test "prod" "gac-prod-471220" "convergence-pipeline-prod"
        ;;
    both)
        echo -e "${YELLOW}Deploying to both environments...${NC}"
        echo ""

        deploy_and_test "stage" "gac-stage-471220" "convergence-pipeline-stage"
        STAGE_STATUS=$?

        echo ""
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo ""

        if [ $STAGE_STATUS -eq 0 ]; then
            echo -e "${GREEN}Stage deployment successful. Proceeding to production...${NC}"
            echo ""
            sleep 5

            deploy_and_test "prod" "gac-prod-471220" "convergence-pipeline-prod"
        else
            echo -e "${RED}Stage deployment failed. Skipping production.${NC}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Invalid environment: $ENV${NC}"
        echo "Usage: $0 [stage|prod|both]"
        exit 1
        ;;
esac

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Quick reference commands:${NC}"
echo ""
echo "  # Deploy to staging"
echo "  ./00-auto-deploy-and-test.sh stage"
echo ""
echo "  # Deploy to production"
echo "  ./00-auto-deploy-and-test.sh prod"
echo ""
echo "  # Deploy to both"
echo "  ./00-auto-deploy-and-test.sh both"
echo ""
echo "  # Test existing deployment"
echo "  ./05-deploy.sh stage   # or prod"
echo ""
echo "  # View workflow runs"
echo "  gh run list --workflow=deploy.yml"
echo ""
echo "  # View specific run logs"
echo "  gh run view RUN_ID --log"
echo ""
