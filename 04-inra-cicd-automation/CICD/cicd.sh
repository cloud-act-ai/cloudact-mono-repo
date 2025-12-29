#!/bin/bash
################################################################################
# cicd.sh - All-in-one build, push, deploy script
# Usage: ./cicd.sh <service> <environment> <project-id> [tag]
# Services: api-service, pipeline-service, frontend
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 3 ]; then
    echo -e "${RED}Usage: ./cicd.sh <service> <environment> <project-id> [tag]${NC}"
    echo ""
    echo "Services: api-service, pipeline-service, frontend"
    echo "Environments: test, stage, prod"
    echo ""
    echo "This script runs: build → push → deploy"
    echo ""
    echo "Examples:"
    echo "  ./cicd.sh api-service test cloudact-testing-1"
    echo "  ./cicd.sh pipeline-service prod cloudact-prod v1.2.3"
    exit 1
fi

SERVICE=$1
ENV=$2
PROJECT_ID=$3
TAG=${4:-$(date +%Y%m%d-%H%M%S)}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CloudAct CI/CD Pipeline${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Service: $SERVICE"
echo "Environment: $ENV"
echo "Project: $PROJECT_ID"
echo "Tag: $TAG"
echo ""

# Step 1: Build
echo -e "${BLUE}[1/3] BUILD${NC}"
$SCRIPT_DIR/build/build.sh $SERVICE $ENV $TAG

echo ""

# Step 2: Push
echo -e "${BLUE}[2/3] PUSH${NC}"
$SCRIPT_DIR/push/push.sh $SERVICE $ENV $PROJECT_ID $TAG

echo ""

# Step 3: Deploy
echo -e "${BLUE}[3/3] DEPLOY${NC}"
$SCRIPT_DIR/deploy/deploy.sh $SERVICE $ENV $PROJECT_ID "${ENV}-${TAG}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  CI/CD Pipeline Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
