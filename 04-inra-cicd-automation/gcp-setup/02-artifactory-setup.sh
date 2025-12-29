#!/bin/bash
################################################################################
# 02-artifactory-setup.sh - Setup Artifact Registry repositories
# Usage: ./02-artifactory-setup.sh <project-id> [region]
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ "$#" -lt 1 ]; then
    echo -e "${RED}Usage: ./02-artifactory-setup.sh <project-id> [region]${NC}"
    exit 1
fi

PROJECT_ID=$1
REGION=${2:-"us-central1"}

echo -e "${YELLOW}Setting up Artifact Registry for project: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

# Repository names for each service
REPOS=(
    "cloudact-api-service"
    "cloudact-pipeline-service"
    "cloudact-frontend"
)

echo -e "${YELLOW}Creating Artifact Registry repositories...${NC}"
for repo in "${REPOS[@]}"; do
    echo -n "Creating $repo... "
    if gcloud artifacts repositories create $repo \
        --repository-format=docker \
        --location=$REGION \
        --description="Docker images for $repo" \
        --project=$PROJECT_ID 2>/dev/null; then
        echo -e "${GREEN}✓ Created${NC}"
    else
        echo -e "${YELLOW}Already exists${NC}"
    fi
done

# Configure Docker authentication
echo ""
echo -e "${YELLOW}Configuring Docker authentication...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

echo ""
echo -e "${GREEN}Artifact Registry setup complete!${NC}"
echo ""
echo "Repository URLs:"
for repo in "${REPOS[@]}"; do
    echo "  ${REGION}-docker.pkg.dev/${PROJECT_ID}/${repo}"
done
echo ""
echo "Next: Run 03-kms-setup.sh"
