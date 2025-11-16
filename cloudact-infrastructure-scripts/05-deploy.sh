#!/bin/bash

################################################################################
# 05-deploy.sh
#
# Main deployment script - Build and deploy to Cloud Run
#
# Usage: ./05-deploy.sh [stage|prod]
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./05-deploy.sh [stage|prod]"
    exit 1
fi

ENV=$1

# Load environment config
if [ "$ENV" = "stage" ]; then
    PROJECT_ID="gac-stage-471220"
    SERVICE_NAME="convergence-pipeline-stage"
    SERVICE_ACCOUNT="convergence-sa-stage@gac-stage-471220.iam.gserviceaccount.com"
    echo -e "${YELLOW}Deploying to STAGING${NC}"
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    SERVICE_NAME="convergence-pipeline-prod"
    SERVICE_ACCOUNT="convergence-sa-prod@gac-prod-471220.iam.gserviceaccount.com"
    echo -e "${YELLOW}Deploying to PRODUCTION${NC}"
else
    echo -e "${RED}Error: Environment must be 'stage' or 'prod'${NC}"
    exit 1
fi

REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
SOURCE_DIR="../convergence-data-pipeline"

echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo "Image: $IMAGE_NAME"
echo ""

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}Error: Source directory not found: $SOURCE_DIR${NC}"
    exit 1
fi

# Set active project
gcloud config set project $PROJECT_ID

# Build with Cloud Build
echo -e "${GREEN}[1/3] Building Docker image with Cloud Build...${NC}"
gcloud builds submit $SOURCE_DIR \
    --tag=$IMAGE_NAME \
    --timeout=20m

# Deploy to Cloud Run
echo -e "${GREEN}[2/3] Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_NAME \
    --platform=managed \
    --region=$REGION \
    --allow-unauthenticated \
    --service-account=$SERVICE_ACCOUNT \
    --memory=2Gi \
    --cpu=2 \
    --timeout=300 \
    --max-instances=10 \
    --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_LOCATION=US,ENVIRONMENT=${ENV}"

# Get service URL
echo -e "${GREEN}[3/3] Getting service URL...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --platform=managed \
    --region=$REGION \
    --format="value(status.url)")

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}Service URL: $SERVICE_URL${NC}"
echo ""
echo "Testing health endpoint..."
curl -s "${SERVICE_URL}/health" | jq '.' || echo "Health check endpoint not responding"
echo ""
echo "Deployment summary:"
echo "  Environment: $ENV"
echo "  Project: $PROJECT_ID"
echo "  Service: $SERVICE_NAME"
echo "  Region: $REGION"
echo "  URL: $SERVICE_URL"
