#!/bin/bash
################################################################################
# deploy.sh - Deploy to Cloud Run
# Usage: ./deploy.sh <service> <environment> <project-id> [image-tag]
# Services: api-service, pipeline-service, frontend
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 3 ]; then
    echo -e "${RED}Usage: ./deploy.sh <service> <environment> <project-id> [image-tag]${NC}"
    echo ""
    echo "Services: api-service, pipeline-service, frontend"
    echo "Environments: test, stage, prod"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh api-service test cloudact-testing-1"
    echo "  ./deploy.sh pipeline-service stage cloudact-prod latest"
    exit 1
fi

SERVICE=$1
ENV=$2
PROJECT_ID=$3
IMAGE_TAG=${4:-"${ENV}-latest"}
REGION="us-central1"

# Service configuration
case $SERVICE in
    api-service)
        PORT=8000
        MEMORY="2Gi"
        CPU=2
        TIMEOUT=300
        MAX_INSTANCES=10
        ;;
    pipeline-service)
        PORT=8001
        MEMORY="2Gi"
        CPU=2
        TIMEOUT=300
        MAX_INSTANCES=10
        ;;
    frontend)
        PORT=3000
        MEMORY="1Gi"
        CPU=1
        TIMEOUT=60
        MAX_INSTANCES=20
        ;;
    *)
        echo -e "${RED}Error: Invalid service. Use: api-service, pipeline-service, frontend${NC}"
        exit 1
        ;;
esac

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

# Cloud Run service name and image
SERVICE_NAME="cloudact-${SERVICE}-${ENV}"
# Use GCR (Google Container Registry)
IMAGE="gcr.io/${PROJECT_ID}/cloudact-${SERVICE}-${ENV}:${IMAGE_TAG}"
SA_EMAIL="cloudact-sa-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com"

# KMS Configuration
KMS_PROJECT_ID="${PROJECT_ID}"
KMS_LOCATION="us-central1"
KMS_KEYRING="cloudact-keyring"
KMS_KEY="api-key-encryption"

# Environment-specific settings
case $ENV in
    test)
        ALLOW_UNAUTH="--allow-unauthenticated"
        ENV_NAME="development"
        ;;
    stage)
        ALLOW_UNAUTH="--allow-unauthenticated"
        ENV_NAME="staging"
        ;;
    prod)
        ALLOW_UNAUTH="--no-allow-unauthenticated"
        ENV_NAME="production"
        ;;
esac

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deploying: $SERVICE_NAME${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Image: $IMAGE"
echo "Service Account: $SA_EMAIL"
echo "Environment: $ENV_NAME"
echo ""

# Set active project
gcloud config set project $PROJECT_ID

# Build environment variables based on service type
COMMON_ENV_VARS="GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_LOCATION=US,ENVIRONMENT=${ENV_NAME}"

if [ "$SERVICE" = "frontend" ]; then
    # Frontend needs API URLs and app configuration
    API_URL="https://cloudact-api-service-${ENV}-2adubqjovq-uc.a.run.app"
    PIPELINE_URL="https://cloudact-pipeline-service-${ENV}-2adubqjovq-uc.a.run.app"
    APP_URL="https://cloudact-frontend-${ENV}-2adubqjovq-uc.a.run.app"

    ENV_VARS="${COMMON_ENV_VARS},NEXT_PUBLIC_API_SERVICE_URL=${API_URL},API_SERVICE_URL=${API_URL},NEXT_PUBLIC_PIPELINE_SERVICE_URL=${PIPELINE_URL},PIPELINE_SERVICE_URL=${PIPELINE_URL},NEXT_PUBLIC_APP_URL=${APP_URL},NODE_ENV=production"
    SECRETS_FLAG="--set-secrets=CA_ROOT_API_KEY=ca-root-api-key-${ENV}:latest"
else
    # Backend services
    ENV_VARS="${COMMON_ENV_VARS},KMS_PROJECT_ID=${KMS_PROJECT_ID},KMS_LOCATION=${KMS_LOCATION},KMS_KEYRING=${KMS_KEYRING},KMS_KEY=${KMS_KEY}"
    SECRETS_FLAG="--set-secrets=CA_ROOT_API_KEY=ca-root-api-key-${ENV}:latest"
fi

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --project=$PROJECT_ID \
    --image=$IMAGE \
    --platform=managed \
    --region=$REGION \
    $ALLOW_UNAUTH \
    --service-account=$SA_EMAIL \
    --memory=$MEMORY \
    --cpu=$CPU \
    --timeout=$TIMEOUT \
    --max-instances=$MAX_INSTANCES \
    --port=$PORT \
    --set-env-vars="$ENV_VARS" \
    $SECRETS_FLAG

# Get service URL
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

# Health check
echo -e "${YELLOW}Running health check...${NC}"
if curl -sf "${SERVICE_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${YELLOW}! Health check pending (service may still be starting)${NC}"
fi
