#!/bin/bash

################################################################################
# simple_deploy.sh
#
# Simple deployment script - Build locally and deploy to Cloud Run
#
# Usage: ./simple_deploy.sh [stage|prod]
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./simple_deploy.sh [stage|prod]"
    exit 1
fi

ENV=$1

# Load environment config
if [ "$ENV" = "stage" ]; then
    PROJECT_ID="${GCP_PROJECT_ID:-cloudact-testing-1}"
    SERVICE_NAME="cloudact-pipeline-stage"
    SERVICE_ACCOUNT="cloudact-sa-stage@${PROJECT_ID}.iam.gserviceaccount.com"
    DEPLOY_ENV="staging"
    # KMS Config for Staging
    KMS_PROJECT_ID="${PROJECT_ID}"
    KMS_LOCATION="us-central1"
    KMS_KEYRING="cloudact-keyring"
    KMS_KEY="api-key-encryption"
    echo -e "${YELLOW}Deploying to STAGING${NC}"
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="${GCP_PROJECT_ID:-cloudact-testing-1}"
    SERVICE_NAME="cloudact-pipeline-prod"
    SERVICE_ACCOUNT="cloudact-sa-prod@${PROJECT_ID}.iam.gserviceaccount.com"
    DEPLOY_ENV="production"
    # KMS Config for Production
    KMS_PROJECT_ID="${PROJECT_ID}"
    KMS_LOCATION="us-central1"
    KMS_KEYRING="cloudact-keyring"
    KMS_KEY="api-key-encryption"
    echo -e "${YELLOW}Deploying to PRODUCTION${NC}"
else
    echo -e "${RED}Error: Environment must be 'stage' or 'prod'${NC}"
    exit 1
fi

REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
SOURCE_DIR="03-data-pipeline-service"

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
echo -e "${GREEN}[1/4] Setting active project to $PROJECT_ID...${NC}"
gcloud config set project $PROJECT_ID

# Build Docker image locally
echo -e "${GREEN}[2/4] Building Docker image locally...${NC}"
docker build --platform linux/amd64 -t $IMAGE_NAME -f $SOURCE_DIR/Dockerfile $SOURCE_DIR

# Push Docker image to GCR
echo -e "${GREEN}[3/4] Pushing Docker image to GCR...${NC}"
docker push $IMAGE_NAME

# Deploy to Cloud Run
echo -e "${GREEN}[4/4] Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --project=$PROJECT_ID \
    --image=$IMAGE_NAME \
    --platform=managed \
    --region=$REGION \
    --allow-unauthenticated \
    --service-account=$SERVICE_ACCOUNT \
    --memory=2Gi \
    --cpu=2 \
    --timeout=300 \
    --max-instances=10 \
    --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_LOCATION=US,ENVIRONMENT=${DEPLOY_ENV},KMS_PROJECT_ID=${KMS_PROJECT_ID},KMS_LOCATION=${KMS_LOCATION},KMS_KEYRING=${KMS_KEYRING},KMS_KEY=${KMS_KEY}" \
    --set-secrets="CA_ROOT_API_KEY=ca-root-api-key-${ENV}:latest"

# Get service URL
echo -e "${GREEN}Getting service URL...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --project=$PROJECT_ID \
    --platform=managed \
    --region=$REGION \
    --format="value(status.url)")

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}Service URL: $SERVICE_URL${NC}"
echo ""
