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

# Get repository info from current git repo
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')

echo "Repository: $REPO"
echo ""

# Use existing prod key for both environments (same key, different projects)
SA_KEY="$HOME/.gcp/gac-prod-471220-e34944040b62.json"

if [ ! -f "$SA_KEY" ]; then
    echo -e "${RED}Error: Service account key not found: $SA_KEY${NC}"
    echo ""
    echo "Please ensure the service account key exists at: $SA_KEY"
    exit 1
fi

echo -e "${GREEN}Using service account key: $SA_KEY${NC}"
echo ""

# Update secrets
echo -e "${GREEN}[1/5] Setting GCP_PROJECT_ID_STAGE...${NC}"
gh secret set GCP_PROJECT_ID_STAGE --body "gac-stage-471220"

echo -e "${GREEN}[2/5] Setting GCP_PROJECT_ID_PROD...${NC}"
gh secret set GCP_PROJECT_ID_PROD --body "gac-prod-471220"

echo -e "${GREEN}[3/5] Setting GCP_SA_KEY_STAGE (using prod key)...${NC}"
gh secret set GCP_SA_KEY_STAGE < $SA_KEY

echo -e "${GREEN}[4/5] Setting GCP_SA_KEY_PROD...${NC}"
gh secret set GCP_SA_KEY_PROD < $SA_KEY

echo -e "${GREEN}[5/5] Setting CLOUD_RUN_REGION...${NC}"
gh secret set CLOUD_RUN_REGION --body "us-central1"

echo ""
echo -e "${GREEN}✓ GitHub secrets updated successfully!${NC}"
echo ""
echo "Secrets set:"
echo "  - GCP_PROJECT_ID_STAGE"
echo "  - GCP_PROJECT_ID_PROD"
echo "  - GCP_SA_KEY_STAGE"
echo "  - GCP_SA_KEY_PROD"
echo "  - CLOUD_RUN_REGION"
echo ""
echo -e "${YELLOW}Next: Push to main branch or manually trigger workflow${NC}"
