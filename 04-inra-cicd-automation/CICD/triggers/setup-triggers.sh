#!/bin/bash
################################################################################
# setup-triggers.sh - Create Cloud Build triggers for automatic deployments
# 
# Prerequisites:
#   1. Cloud Build GitHub App must be connected to your repository
#      Visit: https://console.cloud.google.com/cloud-build/triggers/connect
#   2. Service accounts must exist with proper permissions
#
# Creates:
#   - Stage trigger: On push to main → deploy to cloudact-stage
#   - Prod trigger: On tag v* → deploy to cloudact-prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# GitHub repository info
GITHUB_OWNER="cloud-act-ai"
GITHUB_REPO="cloudact-mono-repo"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CloudAct CI/CD Trigger Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}"
echo ""

# ============================================
# Check prerequisites
# ============================================
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if GitHub is connected to Cloud Build
echo "Verifying GitHub connection..."
if ! gcloud builds triggers list --project=cloudact-stage 2>/dev/null | grep -q "github"; then
    echo -e "${RED}Error: GitHub is not connected to Cloud Build${NC}"
    echo ""
    echo "Please connect GitHub first:"
    echo "  1. Go to: https://console.cloud.google.com/cloud-build/triggers/connect?project=cloudact-stage"
    echo "  2. Select 'GitHub' and authorize"
    echo "  3. Select repository: ${GITHUB_OWNER}/${GITHUB_REPO}"
    echo "  4. Run this script again"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ GitHub connected${NC}"

# ============================================
# Create Stage Trigger
# ============================================
echo ""
echo -e "${YELLOW}Creating Stage Trigger...${NC}"
echo "  Project: cloudact-stage"
echo "  Trigger: On push to main branch"
echo ""

# Delete existing trigger if exists
gcloud builds triggers delete cloudact-deploy-stage \
    --project=cloudact-stage \
    --region=us-central1 \
    --quiet 2>/dev/null || true

# Create new trigger
gcloud builds triggers create github \
    --project=cloudact-stage \
    --region=us-central1 \
    --name="cloudact-deploy-stage" \
    --description="Deploy all services to stage on push to main" \
    --repo-name="${GITHUB_REPO}" \
    --repo-owner="${GITHUB_OWNER}" \
    --branch-pattern="^main$" \
    --build-config="04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml" \
    --substitutions="_BUILD_DATE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo -e "${GREEN}✓ Stage trigger created${NC}"

# ============================================
# Create Prod Trigger
# ============================================
echo ""
echo -e "${YELLOW}Creating Prod Trigger...${NC}"
echo "  Project: cloudact-prod"
echo "  Trigger: On tag v* (e.g., v3.0.5)"
echo ""

# Delete existing trigger if exists
gcloud builds triggers delete cloudact-deploy-prod \
    --project=cloudact-prod \
    --region=us-central1 \
    --quiet 2>/dev/null || true

# Create new trigger
gcloud builds triggers create github \
    --project=cloudact-prod \
    --region=us-central1 \
    --name="cloudact-deploy-prod" \
    --description="Deploy all services to prod on version tag" \
    --repo-name="${GITHUB_REPO}" \
    --repo-owner="${GITHUB_OWNER}" \
    --tag-pattern="^v.*" \
    --build-config="04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml" \
    --substitutions="_BUILD_DATE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo -e "${GREEN}✓ Prod trigger created${NC}"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Triggers Created Successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Triggers:"
echo ""
echo -e "${BLUE}Stage (cloudact-stage):${NC}"
echo "  Trigger: Push to main branch"
echo "  Action:  Build & deploy all services to stage"
echo "  Console: https://console.cloud.google.com/cloud-build/triggers?project=cloudact-stage"
echo ""
echo -e "${BLUE}Prod (cloudact-prod):${NC}"
echo "  Trigger: Tag matching v* (e.g., v3.0.5)"
echo "  Action:  Build & deploy all services to prod"
echo "  Console: https://console.cloud.google.com/cloud-build/triggers?project=cloudact-prod"
echo ""
echo "Usage:"
echo ""
echo "  # Deploy to Stage (automatic on push):"
echo "  git push origin main"
echo ""
echo "  # Deploy to Prod (create version tag):"
echo "  git tag v3.0.6"
echo "  git push origin v3.0.6"
echo ""
