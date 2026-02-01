#!/bin/bash
# =============================================================================
# Build Cloud Run Jobs Docker Image
# =============================================================================
# Builds the scheduler jobs Docker image that includes both API service code
# and job scripts.
#
# Usage:
#   ./build-jobs-image.sh <environment>
#   ./build-jobs-image.sh test
#   ./build-jobs-image.sh prod
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Environment
ENV="${1:-}"

if [[ -z "$ENV" ]]; then
    echo -e "${RED}ERROR: Environment required${NC}"
    echo "Usage: $0 <environment>"
    echo "  Environments: test, stage, prod"
    exit 1
fi

# Environment configuration
case "$ENV" in
    test|stage)
        PROJECT_ID="cloudact-testing-1"
        ;;
    prod)
        PROJECT_ID="cloudact-prod"
        ;;
    *)
        echo -e "${RED}ERROR: Invalid environment: $ENV${NC}"
        echo "  Valid environments: test, stage, prod"
        exit 1
        ;;
esac

IMAGE_NAME="cloudact-jobs-${ENV}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG="${ENV}-${TIMESTAMP}"

echo "============================================================"
echo -e "${BLUE}Building Cloud Run Jobs Image${NC}"
echo "============================================================"
echo "Environment:  $ENV"
echo "Project:      $PROJECT_ID"
echo "Image:        gcr.io/${PROJECT_ID}/${IMAGE_NAME}"
echo "Tag:          $TAG"
echo "============================================================"
echo ""

# Change to repo root for build context
cd "$REPO_ROOT"

# Build the image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build \
    -f 05-scheduler-jobs/Dockerfile \
    -t "gcr.io/${PROJECT_ID}/${IMAGE_NAME}:${TAG}" \
    -t "gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest" \
    --build-arg TARGET_ENV="${ENV}" \
    --build-arg VERSION="${TAG}" \
    .

echo ""
echo -e "${GREEN}✓ Image built successfully${NC}"
echo ""

# Push to GCR
echo -e "${YELLOW}Pushing to Google Container Registry...${NC}"
docker push "gcr.io/${PROJECT_ID}/${IMAGE_NAME}:${TAG}"
docker push "gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest"

echo ""
echo -e "${GREEN}✓ Image pushed successfully${NC}"
echo ""
echo "============================================================"
echo "Images:"
echo "  gcr.io/${PROJECT_ID}/${IMAGE_NAME}:${TAG}"
echo "  gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest"
echo "============================================================"
