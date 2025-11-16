#!/bin/bash

################################################################################
# 03-setup-cloud-build.sh
#
# Setup Cloud Build configuration and permissions
#
# Usage: ./03-setup-cloud-build.sh [stage|prod]
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./03-setup-cloud-build.sh [stage|prod]"
    exit 1
fi

ENV=$1

# Load environment config
if [ "$ENV" = "stage" ]; then
    PROJECT_ID="gac-stage-471220"
    echo -e "${YELLOW}Setting up Cloud Build for STAGING${NC}"
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    echo -e "${YELLOW}Setting up Cloud Build for PRODUCTION${NC}"
else
    echo -e "${RED}Error: Environment must be 'stage' or 'prod'${NC}"
    exit 1
fi

echo "Project: $PROJECT_ID"
echo ""

# Set active project
gcloud config set project $PROJECT_ID

# Get Cloud Build service account
echo -e "${GREEN}[1/3] Getting Cloud Build service account...${NC}"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "Cloud Build SA: $BUILD_SA"

# Grant Cloud Run Admin role to Cloud Build
echo -e "${GREEN}[2/3] Granting Cloud Run Admin role...${NC}"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$BUILD_SA" \
    --role="roles/run.admin" \
    --condition=None

# Grant Service Account User role
echo -e "${GREEN}[3/3] Granting Service Account User role...${NC}"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$BUILD_SA" \
    --role="roles/iam.serviceAccountUser" \
    --condition=None

echo ""
echo -e "${GREEN}✓ Cloud Build setup complete for $ENV!${NC}"
echo ""
echo "Cloud Build service account has permissions to:"
echo "  - Deploy to Cloud Run"
echo "  - Use service accounts"
echo ""
echo "Next step: Run ./04-setup-cloud-run.sh $ENV"
