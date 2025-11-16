#!/bin/bash

################################################################################
# 06-update-github-secrets.sh
#
# Update GitHub repository secrets for CI/CD
#
# Prerequisites:
# - GitHub CLI (gh) installed and authenticated
# - Service account JSON keys downloaded
#
# Usage: ./06-update-github-secrets.sh
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}GitHub Secrets Setup${NC}"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) not installed${NC}"
    echo "Install: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Get repository info
REPO_OWNER="your-org"  # Update this
REPO_NAME="convergence-data-pipeline"  # Update this
REPO="${REPO_OWNER}/${REPO_NAME}"

echo "Repository: $REPO"
echo ""

# Secrets directory
SECRETS_DIR="./secrets"

if [ ! -d "$SECRETS_DIR" ]; then
    echo -e "${YELLOW}Creating secrets directory...${NC}"
    mkdir -p $SECRETS_DIR
    echo ""
    echo -e "${BLUE}Please place service account JSON keys in: $SECRETS_DIR/${NC}"
    echo "  - stage-sa-key.json (for staging)"
    echo "  - prod-sa-key.json (for production)"
    echo ""
    echo "Download keys from GCP Console:"
    echo "  1. Go to IAM & Admin > Service Accounts"
    echo "  2. Find convergence-sa-stage@gac-stage-471220.iam.gserviceaccount.com"
    echo "  3. Create key (JSON) and save as $SECRETS_DIR/stage-sa-key.json"
    echo "  4. Repeat for prod service account"
    echo ""
    exit 1
fi

# Check for key files
STAGE_KEY="$SECRETS_DIR/stage-sa-key.json"
PROD_KEY="$SECRETS_DIR/prod-sa-key.json"

if [ ! -f "$STAGE_KEY" ]; then
    echo -e "${RED}Error: Stage service account key not found: $STAGE_KEY${NC}"
    exit 1
fi

if [ ! -f "$PROD_KEY" ]; then
    echo -e "${RED}Error: Prod service account key not found: $PROD_KEY${NC}"
    exit 1
fi

# Update secrets
echo -e "${GREEN}[1/6] Setting GCP_PROJECT_ID_STAGE...${NC}"
gh secret set GCP_PROJECT_ID_STAGE --body "gac-stage-471220" --repo $REPO

echo -e "${GREEN}[2/6] Setting GCP_PROJECT_ID_PROD...${NC}"
gh secret set GCP_PROJECT_ID_PROD --body "gac-prod-471220" --repo $REPO

echo -e "${GREEN}[3/6] Setting GCP_SA_KEY_STAGE...${NC}"
gh secret set GCP_SA_KEY_STAGE < $STAGE_KEY --repo $REPO

echo -e "${GREEN}[4/6] Setting GCP_SA_KEY_PROD...${NC}"
gh secret set GCP_SA_KEY_PROD < $PROD_KEY --repo $REPO

echo -e "${GREEN}[5/6] Setting CLOUD_RUN_REGION...${NC}"
gh secret set CLOUD_RUN_REGION --body "us-central1" --repo $REPO

echo -e "${GREEN}[6/6] Setting CLOUD_RUN_SERVICE_STAGE...${NC}"
gh secret set CLOUD_RUN_SERVICE_STAGE --body "convergence-pipeline-stage" --repo $REPO

echo ""
echo -e "${GREEN}✓ GitHub secrets updated successfully!${NC}"
echo ""
echo "Secrets set:"
echo "  - GCP_PROJECT_ID_STAGE"
echo "  - GCP_PROJECT_ID_PROD"
echo "  - GCP_SA_KEY_STAGE"
echo "  - GCP_SA_KEY_PROD"
echo "  - CLOUD_RUN_REGION"
echo "  - CLOUD_RUN_SERVICE_STAGE"
echo ""
echo -e "${YELLOW}IMPORTANT: Delete the key files after upload!${NC}"
echo "  rm $SECRETS_DIR/*.json"
