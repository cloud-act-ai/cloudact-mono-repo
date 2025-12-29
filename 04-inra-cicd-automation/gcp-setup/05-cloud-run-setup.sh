#!/bin/bash
################################################################################
# 05-cloud-run-setup.sh - Create Cloud Run services
# Usage: ./05-cloud-run-setup.sh <project-id> <environment>
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./05-cloud-run-setup.sh <project-id> <environment>${NC}"
    echo "Environments: test, stage, prod"
    exit 1
fi

PROJECT_ID=$1
ENV=$2
REGION="us-central1"

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

echo -e "${YELLOW}Setting up Cloud Run services for: $PROJECT_ID ($ENV)${NC}"
gcloud config set project $PROJECT_ID

# Service configurations
declare -A SERVICES
SERVICES["api-service"]="8000|2Gi|2|300"
SERVICES["pipeline-service"]="8001|2Gi|2|300"
SERVICES["frontend"]="3000|1Gi|1|60"

# Create service account if not exists
SA_NAME="cloudact-sa-${ENV}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo -e "${YELLOW}Creating service account: $SA_NAME${NC}"
if gcloud iam service-accounts create $SA_NAME \
    --display-name="CloudAct Service Account ($ENV)" \
    --project=$PROJECT_ID 2>/dev/null; then
    echo -e "${GREEN}✓ Created${NC}"
else
    echo -e "${YELLOW}Already exists${NC}"
fi

# Grant required roles to service account
SA_ROLES=(
    "roles/bigquery.dataEditor"
    "roles/bigquery.jobUser"
    "roles/cloudkms.cryptoKeyEncrypterDecrypter"
    "roles/secretmanager.secretAccessor"
    "roles/logging.logWriter"
    "roles/monitoring.metricWriter"
)

echo -e "${YELLOW}Granting IAM roles to service account...${NC}"
for role in "${SA_ROLES[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$role" \
        --condition=None \
        --quiet 2>/dev/null || true
done

# Create placeholder Cloud Run services
echo ""
echo -e "${YELLOW}Creating Cloud Run services...${NC}"

for service in "${!SERVICES[@]}"; do
    IFS='|' read -r PORT MEMORY CPU TIMEOUT <<< "${SERVICES[$service]}"
    SERVICE_NAME="cloudact-${service}-${ENV}"

    echo -n "Creating $SERVICE_NAME... "

    # Deploy with a placeholder image (Cloud Run requires an image)
    # This creates the service structure; actual deployment happens via CICD
    if gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --project=$PROJECT_ID 2>/dev/null; then
        echo -e "${YELLOW}Already exists${NC}"
    else
        # Create service with placeholder (will be updated by deploy script)
        gcloud run deploy $SERVICE_NAME \
            --image="gcr.io/cloudrun/placeholder" \
            --region=$REGION \
            --project=$PROJECT_ID \
            --platform=managed \
            --no-allow-unauthenticated \
            --service-account=$SA_EMAIL \
            --memory=$MEMORY \
            --cpu=$CPU \
            --timeout=$TIMEOUT \
            --max-instances=10 \
            --port=$PORT \
            --set-env-vars="ENVIRONMENT=${ENV}" \
            --quiet 2>/dev/null && echo -e "${GREEN}✓ Created${NC}" || echo -e "${RED}✗ Failed${NC}"
    fi
done

echo ""
echo -e "${GREEN}Cloud Run setup complete for $ENV environment!${NC}"
echo ""
echo -e "${BLUE}Services created:${NC}"
for service in "${!SERVICES[@]}"; do
    SERVICE_NAME="cloudact-${service}-${ENV}"
    URL=$(gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format="value(status.url)" 2>/dev/null || echo "N/A")
    echo "  $SERVICE_NAME: $URL"
done
echo ""
echo "Next: Use CICD scripts to build and deploy your services"
