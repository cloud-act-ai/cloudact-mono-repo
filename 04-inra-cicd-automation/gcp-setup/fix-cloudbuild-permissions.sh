#!/bin/bash
# ============================================================================
# Fix Cloud Build Permissions
# ============================================================================
# Grants necessary IAM permissions for Cloud Build to:
# - Access Cloud Storage (for source uploads)
# - Push images to GCR/Artifact Registry
# - Deploy to Cloud Run
#
# Usage:
#   ./fix-cloudbuild-permissions.sh <project-id>
#   ./fix-cloudbuild-permissions.sh cloudact-prod
#
# Run this if you see errors like:
#   "storage.objects.get access denied"
#   "Permission denied on resource"
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Project ID required${NC}"
    echo ""
    echo "Usage: $0 <project-id>"
    echo "Example: $0 cloudact-prod"
    exit 1
fi

PROJECT_ID="$1"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Fix Cloud Build Permissions${NC}"
echo -e "${BLUE}  Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Get project number
echo -e "${YELLOW}Getting project number...${NC}"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)" 2>/dev/null)

if [ -z "$PROJECT_NUMBER" ]; then
    echo -e "${RED}Error: Could not get project number for ${PROJECT_ID}${NC}"
    echo "Make sure you have access to the project and gcloud is configured correctly."
    exit 1
fi

echo -e "Project Number: ${GREEN}${PROJECT_NUMBER}${NC}"
echo ""

# Define service accounts
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo -e "${YELLOW}Service Accounts:${NC}"
echo "  Compute: $COMPUTE_SA"
echo "  Cloud Build: $CLOUDBUILD_SA"
echo ""

# Function to add IAM binding
add_iam_binding() {
    local member="$1"
    local role="$2"
    local description="$3"

    echo -n "  Adding $description... "

    if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$member" \
        --role="$role" \
        --quiet >/dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Grant permissions to Compute Engine service account
echo -e "${YELLOW}Granting permissions to Compute Engine SA...${NC}"
add_iam_binding "$COMPUTE_SA" "roles/storage.admin" "Storage Admin"
add_iam_binding "$COMPUTE_SA" "roles/cloudbuild.builds.builder" "Cloud Build Builder"
echo ""

# Grant permissions to Cloud Build service account
echo -e "${YELLOW}Granting permissions to Cloud Build SA...${NC}"
add_iam_binding "$CLOUDBUILD_SA" "roles/storage.admin" "Storage Admin"
add_iam_binding "$CLOUDBUILD_SA" "roles/run.admin" "Cloud Run Admin"
add_iam_binding "$CLOUDBUILD_SA" "roles/iam.serviceAccountUser" "Service Account User"
add_iam_binding "$CLOUDBUILD_SA" "roles/artifactregistry.admin" "Artifact Registry Admin"
echo ""

# Verify permissions
echo -e "${YELLOW}Verifying permissions...${NC}"
echo "  Waiting 5 seconds for IAM propagation..."
sleep 5

# Test storage access
echo -n "  Testing storage access... "
if gsutil ls "gs://${PROJECT_ID}_cloudbuild/" >/dev/null 2>&1 || \
   gsutil mb -p "$PROJECT_ID" "gs://${PROJECT_ID}_cloudbuild/" >/dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}Bucket may not exist yet (will be created on first build)${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Permissions fixed successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "You can now run Cloud Build commands like:"
echo "  gcloud builds submit --tag gcr.io/${PROJECT_ID}/my-image:tag ."
echo ""
echo "Or deploy directly:"
echo "  gcloud run deploy my-service --source . --region us-central1"
