#!/bin/bash
################################################################################
# deploy-all.sh - Build and deploy all CloudAct services
# Usage: ./deploy-all.sh <environment> <project-id> [tag]
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./deploy-all.sh <environment> <project-id> [tag]${NC}"
    echo ""
    echo "Environments: test, stage, prod"
    echo ""
    echo "This script deploys ALL services:"
    echo "  - api-service"
    echo "  - pipeline-service"
    echo "  - frontend"
    echo ""
    echo "Examples:"
    echo "  ./deploy-all.sh test cloudact-testing-1"
    echo "  ./deploy-all.sh prod cloudact-prod v1.2.3"
    exit 1
fi

ENV=$1
PROJECT_ID=$2
TAG=${3:-$(date +%Y%m%d-%H%M%S)}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  CloudAct Full Deployment (Cloud Build)                          ║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║  Environment: ${ENV}${NC}"
echo -e "${BLUE}║  Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}║  Tag: ${TAG}${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Services to deploy (in order: backends first, then frontend)
SERVICES=("api-service" "pipeline-service" "frontend")

for SERVICE in "${SERVICES[@]}"; do
    echo ""
    echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  Deploying: $SERVICE${NC}"
    echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
    $SCRIPT_DIR/cicd.sh $SERVICE $ENV $PROJECT_ID $TAG
done

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ALL SERVICES DEPLOYED SUCCESSFULLY!                             ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Services deployed:                                              ║${NC}"
echo -e "${GREEN}║    ✓ api-service                                                 ║${NC}"
echo -e "${GREEN}║    ✓ pipeline-service                                            ║${NC}"
echo -e "${GREEN}║    ✓ frontend                                                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"

# Show deployed URLs
echo ""
echo -e "${BLUE}Deployment URLs:${NC}"
gcloud run services describe cloudact-api-service-${ENV} --project=$PROJECT_ID --region=us-central1 --format="value(status.url)" 2>/dev/null | xargs -I {} echo "  API Service: {}"
gcloud run services describe cloudact-pipeline-service-${ENV} --project=$PROJECT_ID --region=us-central1 --format="value(status.url)" 2>/dev/null | xargs -I {} echo "  Pipeline Service: {}"
gcloud run services describe cloudact-frontend-${ENV} --project=$PROJECT_ID --region=us-central1 --format="value(status.url)" 2>/dev/null | xargs -I {} echo "  Frontend: {}"
