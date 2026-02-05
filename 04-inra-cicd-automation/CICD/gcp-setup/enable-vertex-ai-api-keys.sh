#!/bin/bash
# =============================================================================
# Enable Vertex AI API Keys and Batch Embedding for CloudAct
# =============================================================================
# This script:
# 1. Enables required APIs for Vertex AI and Gemini
# 2. Disables organization policies blocking API key creation
# 3. Grants IAM roles for batch embedding
# 4. Provides instructions for creating API keys via AI Studio
#
# IMPORTANT: Gemini API keys MUST be created through AI Studio, not gcloud!
#            https://aistudio.google.com/app/apikey
#
# Usage:
#   ./enable-vertex-ai-api-keys.sh [prod|stage]
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Owner or Organization Policy Administrator role
# =============================================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default to prod
ENV="${1:-prod}"

# Project mapping
case "$ENV" in
    prod)
        PROJECT_ID="cloudact-prod"
        ;;
    stage)
        PROJECT_ID="cloudact-testing-1"
        ;;
    *)
        echo -e "${RED}Error: Unknown environment '$ENV'. Use 'prod' or 'stage'${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Vertex AI / Gemini API Setup - $ENV${NC}"
echo -e "${BLUE}  Project: $PROJECT_ID${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Confirm before proceeding
if [[ "${2}" != "--yes" ]]; then
    read -p "Continue with project $PROJECT_ID? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Set project
echo -e "${YELLOW}Setting project to $PROJECT_ID...${NC}"
gcloud config set project "$PROJECT_ID"

# =============================================================================
# Step 1: Enable Required APIs
# =============================================================================
echo ""
echo -e "${GREEN}Step 1: Enabling required APIs...${NC}"

APIS=(
    "aiplatform.googleapis.com"           # Vertex AI
    "generativelanguage.googleapis.com"   # Generative Language (Gemini)
    "apikeys.googleapis.com"              # API Keys
    "cloudresourcemanager.googleapis.com" # Resource Manager (for org policies)
    "orgpolicy.googleapis.com"            # Organization Policy
    "iam.googleapis.com"                  # IAM
    "storage.googleapis.com"              # Cloud Storage (for batch jobs)
)

for api in "${APIS[@]}"; do
    echo -e "  Enabling ${BLUE}$api${NC}..."
    gcloud services enable "$api" --project="$PROJECT_ID" 2>/dev/null || true
done

echo -e "${GREEN}APIs enabled.${NC}"

# =============================================================================
# Step 2: Check and Modify Organization Policies
# =============================================================================
echo ""
echo -e "${GREEN}Step 2: Checking organization policies...${NC}"

# Policies that might block API key creation
POLICIES_TO_CHECK=(
    "iam.managed.disableServiceAccountApiKeyCreation"
    "iam.disableServiceAccountKeyCreation"
)

echo ""
echo -e "${YELLOW}Checking current policy status...${NC}"
for policy in "${POLICIES_TO_CHECK[@]}"; do
    echo -e "  ${BLUE}$policy${NC}:"
    gcloud org-policies describe "$policy" --project="$PROJECT_ID" 2>/dev/null || echo "    (No policy set - using default)"
done

echo ""
echo -e "${YELLOW}To modify org policies, you need Organization Policy Administrator role.${NC}"
echo -e "${YELLOW}If using a service account, modify via Console:${NC}"
echo ""
echo "  https://console.cloud.google.com/iam-admin/orgpolicies/iam-managed.disableServiceAccountApiKeyCreation?project=$PROJECT_ID"
echo ""
echo "  Set enforcement to 'Off' and save."
echo ""

# Try to set policy (may fail without proper permissions)
read -p "Attempt to modify policies now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    for policy in "${POLICIES_TO_CHECK[@]}"; do
        echo -e "  ${YELLOW}Resetting $policy...${NC}"
        gcloud org-policies reset "$policy" --project="$PROJECT_ID" 2>/dev/null || {
            echo -e "  ${RED}Failed - modify via Console instead${NC}"
        }
    done
fi

# =============================================================================
# Step 3: Grant Batch Embedding IAM Roles
# =============================================================================
echo ""
echo -e "${GREEN}Step 3: Setting up batch embedding permissions...${NC}"

# Get project number
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo -e "  Granting roles to ${BLUE}$SERVICE_ACCOUNT${NC}..."

# Vertex AI roles
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/aiplatform.user" \
    --condition=None --quiet 2>/dev/null || true

# Storage roles for batch input/output
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/storage.objectViewer" \
    --condition=None --quiet 2>/dev/null || true

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/storage.objectCreator" \
    --condition=None --quiet 2>/dev/null || true

echo -e "${GREEN}Roles granted.${NC}"

# =============================================================================
# Step 4: Verify Setup
# =============================================================================
echo ""
echo -e "${GREEN}Step 4: Verification${NC}"
echo ""

echo "Enabled APIs:"
gcloud services list --enabled --project="$PROJECT_ID" \
    --filter="NAME:(aiplatform OR generativelanguage OR apikeys OR storage)" \
    --format="table(NAME)"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${RED}IMPORTANT: Create your API key through AI Studio (NOT gcloud):${NC}"
echo ""
echo "  1. Go to: https://aistudio.google.com/app/apikey"
echo "  2. Click 'Create API Key'"
echo "  3. Select project: $PROJECT_ID"
echo "  4. Copy and save the key securely"
echo ""
echo "Quick Links:"
echo "  - AI Studio API Keys: https://aistudio.google.com/app/apikey"
echo "  - Vertex AI Console:  https://console.cloud.google.com/vertex-ai?project=$PROJECT_ID"
echo "  - API Credentials:    https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo ""
echo "Test your API key:"
cat << 'TESTCMD'
  curl 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
TESTCMD
echo ""
echo "Batch Embedding Example (Python):"
cat << 'EXAMPLE'
  from google.cloud import aiplatform

  aiplatform.init(project="PROJECT_ID", location="us-central1")

  batch_job = aiplatform.BatchPredictionJob.create(
      job_display_name="batch-embedding-job",
      model_name="publishers/google/models/text-embedding-004",
      gcs_source="gs://BUCKET/input.jsonl",
      gcs_destination_prefix="gs://BUCKET/output/",
  )
EXAMPLE
echo ""
