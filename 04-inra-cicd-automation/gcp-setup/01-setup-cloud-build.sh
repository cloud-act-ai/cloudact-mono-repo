#!/bin/bash
################################################################################
# 01-setup-cloud-build.sh - Setup Cloud Build for CI/CD
# Usage: ./01-setup-cloud-build.sh <project-id>
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ "$#" -lt 1 ]; then
    echo -e "${RED}Usage: ./01-setup-cloud-build.sh <project-id>${NC}"
    exit 1
fi

PROJECT_ID=$1
REGION="us-central1"

echo -e "${YELLOW}Setting up Cloud Build for project: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "Cloud Build Service Account: $CLOUD_BUILD_SA"

# Grant required roles to Cloud Build SA
ROLES=(
    "roles/run.admin"
    "roles/iam.serviceAccountUser"
    "roles/artifactregistry.writer"
    "roles/secretmanager.secretAccessor"
    "roles/logging.logWriter"
)

echo -e "${YELLOW}Granting IAM roles to Cloud Build SA...${NC}"
for role in "${ROLES[@]}"; do
    echo -n "Granting $role... "
    if gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$CLOUD_BUILD_SA" \
        --role="$role" \
        --condition=None \
        --quiet 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
    fi
done

# Create Cloud Build trigger connection (manual step info)
echo ""
echo -e "${GREEN}Cloud Build setup complete!${NC}"
echo ""
echo "Manual steps required:"
echo "  1. Connect your GitHub repository in Cloud Console"
echo "  2. Create triggers for each environment (test/stage/prod)"
echo ""
echo "Next: Run 02-artifactory-setup.sh"
