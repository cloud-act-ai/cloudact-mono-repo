#!/bin/bash

################################################################################
# 04-setup-cloud-run.sh
#
# Setup Cloud Run service (initial deployment placeholder)
#
# Usage: ./04-setup-cloud-run.sh [stage|prod]
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./04-setup-cloud-run.sh [stage|prod]"
    exit 1
fi

ENV=$1

# Load environment config
if [ "$ENV" = "stage" ]; then
    PROJECT_ID="gac-stage-471220"
    SERVICE_NAME="convergence-pipeline-stage"
    REGION="us-central1"
    echo -e "${YELLOW}Setting up Cloud Run for STAGING${NC}"
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    SERVICE_NAME="convergence-pipeline-prod"
    REGION="us-central1"
    echo -e "${YELLOW}Setting up Cloud Run for PRODUCTION${NC}"
else
    echo -e "${RED}Error: Environment must be 'stage' or 'prod'${NC}"
    exit 1
fi

echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Set active project
gcloud config set project $PROJECT_ID

echo -e "${GREEN}[1/1] Cloud Run service will be created on first deployment${NC}"
echo ""
echo "Service configuration:"
echo "  Name: $SERVICE_NAME"
echo "  Region: $REGION"
echo "  Platform: managed"
echo "  Allow unauthenticated: yes"
echo ""
echo -e "${GREEN}✓ Cloud Run setup ready for $ENV!${NC}"
echo ""
echo "Next step: Run ./05-deploy.sh $ENV to deploy the application"
