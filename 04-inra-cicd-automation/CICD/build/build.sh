#!/bin/bash
################################################################################
# build.sh - Build Docker images using Cloud Build (remote)
# Usage: ./build.sh <service> <environment> <project-id> [tag]
# Services: api-service, pipeline-service, frontend
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 3 ]; then
    echo -e "${RED}Usage: ./build.sh <service> <environment> <project-id> [tag]${NC}"
    echo ""
    echo "Services: api-service, pipeline-service, frontend"
    echo "Environments: test, stage, prod"
    echo ""
    echo "Examples:"
    echo "  ./build.sh api-service test cloudact-testing-1"
    echo "  ./build.sh pipeline-service stage cloudact-prod v1.2.3"
    exit 1
fi

SERVICE=$1
ENV=$2
PROJECT_ID=$3
TAG=${4:-$(date +%Y%m%d-%H%M%S)}
REGION="us-central1"

# Validate service
case $SERVICE in
    api-service)
        SOURCE_DIR="02-api-service"
        ;;
    pipeline-service)
        SOURCE_DIR="03-data-pipeline-service"
        ;;
    frontend)
        SOURCE_DIR="01-fronted-system"
        ;;
    *)
        echo -e "${RED}Error: Invalid service. Use: api-service, pipeline-service, frontend${NC}"
        exit 1
        ;;
esac

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

# Navigate to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Building: $SERVICE ($ENV) via Cloud Build${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Source: $SOURCE_DIR"
echo "Project: $PROJECT_ID"
echo "Tag: $TAG"
echo "Environment: $ENV"
echo ""

# Check source directory exists
if [ ! -d "$REPO_ROOT/$SOURCE_DIR" ]; then
    echo -e "${RED}Error: Source directory not found: $REPO_ROOT/$SOURCE_DIR${NC}"
    exit 1
fi

# Check Dockerfile exists
if [ ! -f "$REPO_ROOT/$SOURCE_DIR/Dockerfile" ]; then
    echo -e "${RED}Error: Dockerfile not found in $SOURCE_DIR${NC}"
    exit 1
fi

# GCR image paths
GCR_REPO="gcr.io/${PROJECT_ID}/cloudact-${SERVICE}-${ENV}"
IMAGE_VERSION="${GCR_REPO}:${TAG}"
IMAGE_LATEST="${GCR_REPO}:latest"
IMAGE_ENV_LATEST="${GCR_REPO}:${ENV}-latest"

echo -e "${YELLOW}Cloud Build configuration:${NC}"
echo "  TARGET_ENV: $ENV"
echo "  Uses: .env.${ENV} (or .env.production for prod)"
echo ""
echo -e "${YELLOW}Target images:${NC}"
echo "  - $IMAGE_VERSION"
echo "  - $IMAGE_LATEST"
echo "  - $IMAGE_ENV_LATEST"
echo ""

# Set project
gcloud config set project $PROJECT_ID

# Build and push using Cloud Build
echo -e "${YELLOW}Building with Cloud Build (remote)...${NC}"
gcloud builds submit \
    --project=$PROJECT_ID \
    --tag=$IMAGE_VERSION \
    --timeout=1800s \
    --substitutions="_ENVIRONMENT=$ENV,_TARGET_ENV=$ENV,_VERSION=$TAG" \
    $REPO_ROOT/$SOURCE_DIR

# Add latest and env-latest tags using gcloud
echo -e "${YELLOW}Adding latest tags...${NC}"
gcloud container images add-tag $IMAGE_VERSION $IMAGE_LATEST --quiet
gcloud container images add-tag $IMAGE_VERSION $IMAGE_ENV_LATEST --quiet

echo ""
echo -e "${GREEN}✓ Cloud Build complete!${NC}"
echo ""
echo "Images created in GCR:"
echo "  - $IMAGE_VERSION"
echo "  - $IMAGE_LATEST"
echo "  - $IMAGE_ENV_LATEST"
echo ""
echo "Next: Run deploy.sh to deploy to Cloud Run"

# Output image name for chaining
echo "$IMAGE_VERSION" > /tmp/cloudact-last-build-${SERVICE}-${ENV}
