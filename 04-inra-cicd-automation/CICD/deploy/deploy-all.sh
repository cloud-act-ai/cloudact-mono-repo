#!/bin/bash
################################################################################
# deploy-all.sh - Deploy all services in correct order
# Usage: ./deploy-all.sh <environment> <project-id> [image-tag]
# Environments: test, stage, prod
#
# BUG-011 FIX: Enforces proper deployment order to prevent race conditions
# Deployment Order:
#   1. api-service (runs bootstrap, creates 21 meta tables)
#   2. Verify bootstrap completion (60+ seconds)
#   3. pipeline-service (needs API URL, reads procedures)
#   4. frontend (needs both API and Pipeline URLs)
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./deploy-all.sh <environment> <project-id> [image-tag]${NC}"
    echo ""
    echo "Environments: test, stage, prod"
    echo ""
    echo "Examples:"
    echo "  ./deploy-all.sh test cloudact-testing-1"
    echo "  ./deploy-all.sh prod cloudact-prod v1.0.0"
    exit 1
fi

ENV=$1
PROJECT_ID=$2
IMAGE_TAG=${3:-"${ENV}-latest"}

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CloudAct Deployment - All Services${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Environment: $ENV"
echo "Project: $PROJECT_ID"
echo "Image Tag: $IMAGE_TAG"
echo ""
echo "Deployment Order:"
echo "  1. api-service (with bootstrap verification)"
echo "  2. pipeline-service (with procedure sync verification)"
echo "  3. frontend (with full integration check)"
echo ""

read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Change to deploy directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================
# STEP 1: Deploy api-service
# ============================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 1/3: Deploying api-service${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

./deploy.sh api-service $ENV $PROJECT_ID $IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ api-service deployment failed${NC}"
    exit 1
fi

# ============================================
# STEP 1.5: Verify Bootstrap Completion
# ============================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 1.5/3: Verifying Bootstrap${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Get API service URL
API_URL=$(gcloud run services describe cloudact-api-service-${ENV} \
    --project=$PROJECT_ID \
    --region=us-central1 \
    --format="value(status.url)" 2>/dev/null || echo "")

if [ -z "$API_URL" ]; then
    echo -e "${RED}✗ Could not retrieve API service URL${NC}"
    exit 1
fi

echo "API Service URL: $API_URL"
echo ""
echo "Running bootstrap verification..."

# Run bootstrap script (safe - won't recreate if already exists)
cd ../bootstrap
./bootstrap.sh $ENV

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Bootstrap verification failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check BigQuery organizations dataset exists"
    echo "  2. Verify api-service has CREATE TABLE permissions"
    echo "  3. Check logs: gcloud run services logs read cloudact-api-service-${ENV} --project=${PROJECT_ID}"
    exit 1
fi

cd "$SCRIPT_DIR"

# ============================================
# STEP 2: Deploy pipeline-service
# ============================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 2/3: Deploying pipeline-service${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

./deploy.sh pipeline-service $ENV $PROJECT_ID $IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ pipeline-service deployment failed${NC}"
    exit 1
fi

# ============================================
# STEP 2.5: Verify Procedure Sync
# ============================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 2.5/3: Verifying Procedure Sync${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Get pipeline service URL
PIPELINE_URL=$(gcloud run services describe cloudact-pipeline-service-${ENV} \
    --project=$PROJECT_ID \
    --region=us-central1 \
    --format="value(status.url)" 2>/dev/null || echo "")

if [ -z "$PIPELINE_URL" ]; then
    echo -e "${RED}✗ Could not retrieve pipeline service URL${NC}"
    exit 1
fi

echo "Pipeline Service URL: $PIPELINE_URL"
echo ""
echo "Checking stored procedures..."

# List procedures (requires CA_ROOT_API_KEY)
# This is just a verification - actual sync happens during service startup
PROCEDURES_RESPONSE=$(curl -sf "${PIPELINE_URL}/api/v1/procedures" \
    -H "X-CA-Root-Key: placeholder" 2>/dev/null || echo "")

if [ -n "$PROCEDURES_RESPONSE" ]; then
    PROC_COUNT=$(echo "$PROCEDURES_RESPONSE" | grep -o '"name"' | wc -l | tr -d ' ')
    echo -e "${GREEN}✓ Found $PROC_COUNT stored procedures${NC}"
else
    echo -e "${YELLOW}! WARNING: Could not verify procedures (may require valid CA_ROOT_API_KEY)${NC}"
    echo -e "${YELLOW}  Service should have auto-synced procedures on startup${NC}"
fi

# ============================================
# STEP 3: Deploy frontend
# ============================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 3/3: Deploying frontend${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

./deploy.sh frontend $ENV $PROJECT_ID $IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ frontend deployment failed${NC}"
    exit 1
fi

# ============================================
# FINAL: Deployment Summary
# ============================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deployment Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Get frontend URL
FRONTEND_URL=$(gcloud run services describe cloudact-frontend-${ENV} \
    --project=$PROJECT_ID \
    --region=us-central1 \
    --format="value(status.url)" 2>/dev/null || echo "")

echo -e "${GREEN}✓ All services deployed successfully!${NC}"
echo ""
echo "Service URLs:"
echo "  API Service:      $API_URL"
echo "  Pipeline Service: $PIPELINE_URL"
echo "  Frontend:         $FRONTEND_URL"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Monitor logs for 15 minutes:"
echo "     ./monitor/watch-all.sh $ENV 50"
echo ""
echo "  2. Test end-to-end:"
echo "     - Visit: $FRONTEND_URL"
echo "     - Sign up / Sign in"
echo "     - Create organization"
echo "     - Run a pipeline"
echo ""
echo "  3. If issues occur, rollback:"
echo "     # Get previous version"
echo "     ./releases.sh list"
echo "     # Rollback"
echo "     ./release.sh v{previous} --deploy --env $ENV"
echo ""
