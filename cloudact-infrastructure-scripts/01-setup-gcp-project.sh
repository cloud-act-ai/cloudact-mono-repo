#!/bin/bash

################################################################################
# 01-setup-gcp-project.sh
#
# Initial GCP project setup - Enable required APIs
#
# Usage: ./01-setup-gcp-project.sh [stage|prod]
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./01-setup-gcp-project.sh [stage|prod]"
    exit 1
fi

ENV=$1

# Load environment config
if [ "$ENV" = "stage" ]; then
    PROJECT_ID="gac-stage-471220"
    echo -e "${YELLOW}Setting up STAGING environment${NC}"
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    echo -e "${YELLOW}Setting up PRODUCTION environment${NC}"
else
    echo -e "${RED}Error: Environment must be 'stage' or 'prod'${NC}"
    exit 1
fi

echo "Project ID: $PROJECT_ID"
echo ""

# Set active project
echo -e "${GREEN}[1/5] Setting active GCP project...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${GREEN}[2/5] Enabling Cloud Run API...${NC}"
gcloud services enable run.googleapis.com

echo -e "${GREEN}[3/5] Enabling Cloud Build API...${NC}"
gcloud services enable cloudbuild.googleapis.com

echo -e "${GREEN}[4/5] Enabling BigQuery API...${NC}"
gcloud services enable bigquery.googleapis.com

echo -e "${GREEN}[5/5] Enabling Cloud KMS API...${NC}"
gcloud services enable cloudkms.googleapis.com

echo ""
echo -e "${GREEN}✓ GCP project setup complete for $ENV!${NC}"
echo ""
echo "Enabled APIs:"
echo "  - Cloud Run"
echo "  - Cloud Build"
echo "  - BigQuery"
echo "  - Cloud KMS"
echo ""
echo "Next step: Run ./02-setup-kms.sh $ENV"
