#!/bin/bash
################################################################################
# 05-iam-setup.sh - Setup IAM roles and permissions
# Usage: ./05-iam-setup.sh <project-id> <environment>
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./05-iam-setup.sh <project-id> <environment>${NC}"
    echo "Environments: test, stage, prod"
    exit 1
fi

PROJECT_ID=$1
ENV=$2

if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

echo -e "${YELLOW}Setting up IAM for project: $PROJECT_ID ($ENV)${NC}"
gcloud config set project $PROJECT_ID

SA_NAME="cloudact-sa-${ENV}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Ensure service account exists
echo -e "${YELLOW}Ensuring service account exists...${NC}"
gcloud iam service-accounts create $SA_NAME \
    --display-name="CloudAct Service Account ($ENV)" \
    --project=$PROJECT_ID 2>/dev/null || true

# Full list of required roles
ROLES=(
    # BigQuery
    "roles/bigquery.dataEditor"
    "roles/bigquery.jobUser"
    "roles/bigquery.dataViewer"

    # Cloud KMS
    "roles/cloudkms.cryptoKeyEncrypterDecrypter"

    # Secret Manager
    "roles/secretmanager.secretAccessor"

    # Logging & Monitoring
    "roles/logging.logWriter"
    "roles/monitoring.metricWriter"
    "roles/cloudtrace.agent"

    # Cloud Run (for invoking other services)
    "roles/run.invoker"

    # Storage (for temp files if needed)
    "roles/storage.objectViewer"
)

echo -e "${YELLOW}Granting IAM roles to $SA_EMAIL...${NC}"
for role in "${ROLES[@]}"; do
    echo -n "Granting $role... "
    if gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$role" \
        --condition=None \
        --quiet 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}Already granted${NC}"
    fi
done

# Grant Cloud Build SA permission to impersonate service account
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo ""
echo -e "${YELLOW}Granting Cloud Build SA permission to use service account...${NC}"
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/iam.serviceAccountUser" \
    --project=$PROJECT_ID \
    --quiet 2>/dev/null || true

# ============================================
# Cloud Build Permissions (for gcloud builds submit)
# ============================================
echo ""
echo -e "${YELLOW}Granting Cloud Build permissions for deployments...${NC}"

# Cloud Build SA needs these for building and deploying
CLOUDBUILD_ROLES=(
    "roles/storage.admin"
    "roles/run.admin"
    "roles/iam.serviceAccountUser"
    "roles/artifactregistry.admin"
)

for role in "${CLOUDBUILD_ROLES[@]}"; do
    echo -n "Granting $role to Cloud Build SA... "
    if gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$CLOUD_BUILD_SA" \
        --role="$role" \
        --quiet 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}Already granted${NC}"
    fi
done

# Compute SA also needs storage access for Cloud Run source deploys
echo ""
echo -e "${YELLOW}Granting Compute SA permissions for Cloud Run deploys...${NC}"
echo -n "Granting storage.admin to Compute SA... "
if gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/storage.admin" \
    --quiet 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}Already granted${NC}"
fi

echo ""
echo -e "${GREEN}IAM setup complete for $ENV environment!${NC}"
echo ""
echo "Service Account: $SA_EMAIL"
echo "Cloud Build SA: $CLOUD_BUILD_SA"
echo "Compute SA: $COMPUTE_SA"
echo ""
echo "Next: Run 06-cloud-run-setup.sh"
