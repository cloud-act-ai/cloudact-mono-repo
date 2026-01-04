#!/bin/bash
################################################################################
# push.sh - Push Docker images to Artifact Registry
# Usage: ./push.sh <service> <environment> <project-id> [tag]
# Services: api-service, pipeline-service, frontend
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 3 ]; then
    echo -e "${RED}Usage: ./push.sh <service> <environment> <project-id> [tag]${NC}"
    echo ""
    echo "Services: api-service, pipeline-service, frontend"
    echo "Environments: test, stage, prod"
    echo ""
    echo "Examples:"
    echo "  ./push.sh api-service test cloudact-testing-1"
    echo "  ./push.sh pipeline-service stage cloudact-prod v1.2.3"
    exit 1
fi

SERVICE=$1
ENV=$2
PROJECT_ID=$3
# Get tag from last build file or generate one
RAW_TAG=${4:-$(cat /tmp/cloudact-last-build-${SERVICE}-${ENV} 2>/dev/null | grep -o '[^:]*$' || date +%Y%m%d-%H%M%S)}
# If tag already starts with env prefix, use as-is; otherwise add prefix
if [[ "$RAW_TAG" == ${ENV}-* ]]; then
    TAG="$RAW_TAG"
else
    TAG="${ENV}-${RAW_TAG}"
fi
REGION="us-central1"

# Validate service
case $SERVICE in
    api-service|pipeline-service|frontend)
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

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Pushing: $SERVICE ($ENV) to Artifact Registry${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Tag: $TAG"
echo ""

# Artifact Registry repository (using GCR for simpler setup)
GCR_REPO="gcr.io/${PROJECT_ID}/cloudact-${SERVICE}-${ENV}"
LOCAL_IMAGE="cloudact-${SERVICE}:${TAG}"
# Extract version from tag (remove env prefix if present)
VERSION_ONLY="${TAG#${ENV}-}"
REMOTE_IMAGE="${GCR_REPO}:${VERSION_ONLY}"
REMOTE_LATEST="${GCR_REPO}:latest"
REMOTE_ENV_LATEST="${GCR_REPO}:${ENV}-latest"

# Configure Docker authentication for GCR
echo -e "${YELLOW}Configuring Docker authentication...${NC}"
gcloud auth configure-docker gcr.io --quiet

# Tag for GCR
echo -e "${YELLOW}Tagging image for GCR...${NC}"
docker tag $LOCAL_IMAGE $REMOTE_IMAGE
docker tag $LOCAL_IMAGE $REMOTE_LATEST
docker tag $LOCAL_IMAGE $REMOTE_ENV_LATEST

# Push to GCR
echo -e "${YELLOW}Pushing to GCR...${NC}"
docker push $REMOTE_IMAGE
docker push $REMOTE_LATEST
docker push $REMOTE_ENV_LATEST

echo ""
echo -e "${GREEN}✓ Push complete!${NC}"
echo ""
echo "Images pushed:"
echo "  - $REMOTE_IMAGE"
echo "  - $REMOTE_LATEST"
echo "  - $REMOTE_ENV_LATEST"
echo ""
echo "Next: Run deploy.sh to deploy to Cloud Run"

# Output image URL for chaining
echo "$REMOTE_IMAGE" > /tmp/cloudact-last-push-${SERVICE}-${ENV}
