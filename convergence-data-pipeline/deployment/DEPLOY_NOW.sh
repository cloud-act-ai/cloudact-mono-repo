#!/bin/bash
################################################################################
# Quick Deploy Script - Convergence Data Pipeline to Cloud Run
# Usage: ./DEPLOY_NOW.sh [production|staging|development]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-production}"
PROJECT_ID="gac-prod-471220"
REGION="us-central1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Convergence Data Pipeline - Quick Deploy${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Project:     ${PROJECT_ID}${NC}"
echo -e "${BLUE}Region:      ${REGION}${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Step 1: Check prerequisites
echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

# Check if service account exists
if ! gcloud iam service-accounts describe convergence-api@${PROJECT_ID}.iam.gserviceaccount.com --project=${PROJECT_ID} &> /dev/null; then
    echo -e "${RED}ERROR: Service account 'convergence-api' does not exist${NC}"
    echo -e "${YELLOW}Creating service account...${NC}"

    # Create service account
    gcloud iam service-accounts create convergence-api \
        --project=${PROJECT_ID} \
        --display-name="Convergence API Service Account"

    # Grant permissions
    echo -e "${YELLOW}Granting IAM permissions...${NC}"
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:convergence-api@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/bigquery.dataEditor" \
        --quiet

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:convergence-api@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/bigquery.jobUser" \
        --quiet

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:convergence-api@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/pubsub.publisher" \
        --quiet

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:convergence-api@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:convergence-api@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/logging.logWriter" \
        --quiet

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:convergence-api@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/cloudtrace.agent" \
        --quiet

    echo -e "${GREEN}Service account created and configured${NC}"
else
    echo -e "${GREEN}Service account exists${NC}"
fi

# Step 2: Set GCP project
echo -e "\n${YELLOW}[2/5] Setting GCP project...${NC}"
gcloud config set project ${PROJECT_ID} --quiet
echo -e "${GREEN}Project set to: ${PROJECT_ID}${NC}"

# Step 3: Get image tag
echo -e "\n${YELLOW}[3/5] Preparing Docker image...${NC}"
IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
echo -e "${GREEN}Image tag: ${IMAGE_TAG}${NC}"

# Step 4: Build and push image using Cloud Build
echo -e "\n${YELLOW}[4/5] Building Docker image with Cloud Build...${NC}"

# Ensure Artifact Registry repository exists
if ! gcloud artifacts repositories describe convergence --location=us --project=${PROJECT_ID} &> /dev/null; then
    echo -e "${YELLOW}Creating Artifact Registry repository...${NC}"
    gcloud artifacts repositories create convergence \
        --repository-format=docker \
        --location=us \
        --project=${PROJECT_ID} \
        --description="Convergence Data Pipeline images" \
        --quiet || echo "Using existing gcr.io"
fi

# Build using Cloud Build
gcloud builds submit \
    --project=${PROJECT_ID} \
    --region=${REGION} \
    --tag=us-docker.pkg.dev/${PROJECT_ID}/convergence/api:${IMAGE_TAG} \
    --timeout=900s \
    .

echo -e "${GREEN}Image built: us-docker.pkg.dev/${PROJECT_ID}/convergence/api:${IMAGE_TAG}${NC}"

# Step 5: Deploy to Cloud Run
echo -e "\n${YELLOW}[5/5] Deploying to Cloud Run...${NC}"

# Set environment-specific configuration
case "${ENVIRONMENT}" in
    production)
        SERVICE_NAME="convergence-data-pipeline"
        MIN_INSTANCES=2
        MAX_INSTANCES=50
        MEMORY="4Gi"
        CPU=4
        ;;
    staging)
        SERVICE_NAME="convergence-data-pipeline-staging"
        MIN_INSTANCES=1
        MAX_INSTANCES=10
        MEMORY="2Gi"
        CPU=2
        ;;
    development)
        SERVICE_NAME="convergence-data-pipeline-dev"
        MIN_INSTANCES=0
        MAX_INSTANCES=5
        MEMORY="2Gi"
        CPU=2
        ;;
    *)
        echo -e "${RED}Invalid environment: ${ENVIRONMENT}${NC}"
        exit 1
        ;;
esac

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
    --image=us-docker.pkg.dev/${PROJECT_ID}/convergence/api:${IMAGE_TAG} \
    --project=${PROJECT_ID} \
    --region=${REGION} \
    --platform=managed \
    --service-account=convergence-api@${PROJECT_ID}.iam.gserviceaccount.com \
    --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_LOCATION=US,ENVIRONMENT=${ENVIRONMENT},VERSION=${IMAGE_TAG},APP_NAME=convergence-data-pipeline,LOG_LEVEL=INFO,ENABLE_TRACING=true,ENABLE_METRICS=true,OTEL_SERVICE_NAME=convergence-api,ADMIN_METADATA_DATASET=metadata,LOCK_BACKEND=firestore,DISABLE_AUTH=false" \
    --allow-unauthenticated \
    --memory=${MEMORY} \
    --cpu=${CPU} \
    --concurrency=80 \
    --max-instances=${MAX_INSTANCES} \
    --min-instances=${MIN_INSTANCES} \
    --timeout=3600 \
    --port=8080

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --project=${PROJECT_ID} \
    --region=${REGION} \
    --format='value(status.url)')

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Service:     ${SERVICE_NAME}${NC}"
echo -e "${GREEN}Environment: ${ENVIRONMENT}${NC}"
echo -e "${GREEN}URL:         ${SERVICE_URL}${NC}"
echo -e "${GREEN}Image:       us-docker.pkg.dev/${PROJECT_ID}/convergence/api:${IMAGE_TAG}${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Test health endpoint
echo -e "${YELLOW}Testing health endpoint...${NC}"
sleep 5
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health" || echo "000")

if [[ "${HEALTH_STATUS}" == "200" ]]; then
    echo -e "${GREEN}Health check PASSED (HTTP ${HEALTH_STATUS})${NC}"
else
    echo -e "${RED}Health check FAILED (HTTP ${HEALTH_STATUS})${NC}"
    echo -e "${YELLOW}Check logs: gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}' --project=${PROJECT_ID} --limit=50${NC}"
fi

echo -e "\n${BLUE}Access API documentation: ${SERVICE_URL}/docs${NC}"
echo -e "${BLUE}Access health check: ${SERVICE_URL}/health${NC}\n"
