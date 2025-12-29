#!/bin/bash
################################################################################
# release.sh - Create versioned release with git tag and Docker images
# Usage: ./release.sh <version> [--deploy] [--env stage|prod]
#
# Examples:
#   ./release.sh v1.0.0                    # Tag and build only
#   ./release.sh v1.0.1 --deploy           # Tag, build, and deploy to prod
#   ./release.sh v1.1.0 --deploy --env stage  # Deploy to stage first
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Parse arguments
VERSION=""
DEPLOY=false
ENV="prod"

while [[ $# -gt 0 ]]; do
    case $1 in
        v*)
            VERSION=$1
            ;;
        --deploy)
            DEPLOY=true
            ;;
        --env)
            ENV=$2
            shift
            ;;
        -h|--help)
            echo "Usage: ./release.sh <version> [--deploy] [--env stage|prod]"
            echo ""
            echo "Arguments:"
            echo "  version     Semantic version (e.g., v1.0.0, v1.2.3)"
            echo ""
            echo "Options:"
            echo "  --deploy    Deploy after building"
            echo "  --env       Target environment (default: prod)"
            echo ""
            echo "Examples:"
            echo "  ./release.sh v1.0.0                      # Create release, build images"
            echo "  ./release.sh v1.0.1 --deploy             # Create and deploy to prod"
            echo "  ./release.sh v1.1.0 --deploy --env stage # Deploy to stage"
            echo ""
            echo "Workflow:"
            echo "  1. Validates version format"
            echo "  2. Creates git tag"
            echo "  3. Builds all service images with version tag"
            echo "  4. Pushes to GCR with version tag"
            echo "  5. Optionally deploys to specified environment"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

# Validate version
if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Version required${NC}"
    echo "Usage: ./release.sh <version> [--deploy] [--env stage|prod]"
    echo "Example: ./release.sh v1.0.0"
    exit 1
fi

# Validate version format (vX.Y.Z or vX.Y.Z-suffix)
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+)?$ ]]; then
    echo -e "${RED}Error: Invalid version format${NC}"
    echo "Expected: vX.Y.Z or vX.Y.Z-suffix (e.g., v1.0.0, v1.2.3-beta)"
    exit 1
fi

# Get project ID based on environment
case $ENV in
    test)  PROJECT_ID="cloudact-testing-1" ;;
    stage) PROJECT_ID="cloudact-stage" ;;
    prod)  PROJECT_ID="cloudact-prod" ;;
    *)
        echo -e "${RED}Error: Invalid environment. Use: test, stage, prod${NC}"
        exit 1
        ;;
esac

SERVICES=("api-service" "pipeline-service" "frontend")

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CloudAct Release: ${VERSION}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Version:     $VERSION"
echo "Environment: $ENV"
echo "Project:     $PROJECT_ID"
echo "Deploy:      $DEPLOY"
echo ""

# Check for uncommitted changes
cd "$REPO_ROOT"
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    git status --short
    echo ""
    read -p "Continue anyway? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        echo "Aborted."
        exit 1
    fi
fi

# Check if tag already exists
if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Tag $VERSION already exists${NC}"
    read -p "Use existing tag? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        echo "Aborted."
        exit 1
    fi
else
    # Create git tag
    echo -e "${CYAN}Creating git tag: $VERSION${NC}"
    git tag -a "$VERSION" -m "Release $VERSION"
    echo -e "${GREEN}✓ Git tag created${NC}"
fi

# Get commit hash for reference
COMMIT_HASH=$(git rev-parse --short HEAD)
echo "Commit: $COMMIT_HASH"
echo ""

# Build all services
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Building Images${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

for service in "${SERVICES[@]}"; do
    echo -e "${YELLOW}Building: $service${NC}"
    $SCRIPT_DIR/build/build.sh $service $ENV $VERSION 2>&1 | tail -5
done

echo -e "${GREEN}✓ All images built${NC}"
echo ""

# Push all services
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Pushing Images to GCR${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Activate service account
gcloud auth activate-service-account --key-file=$HOME/.gcp/cloudact-${ENV}.json 2>/dev/null || true

for service in "${SERVICES[@]}"; do
    echo -e "${YELLOW}Pushing: $service${NC}"

    # Tag and push with version
    LOCAL_IMAGE="cloudact-${service}:${ENV}-${VERSION}"
    GCR_IMAGE="gcr.io/${PROJECT_ID}/cloudact-${service}-${ENV}:${VERSION}"
    GCR_LATEST="gcr.io/${PROJECT_ID}/cloudact-${service}-${ENV}:latest"

    docker tag $LOCAL_IMAGE $GCR_IMAGE
    docker tag $LOCAL_IMAGE $GCR_LATEST
    docker push $GCR_IMAGE 2>&1 | tail -3
    docker push $GCR_LATEST 2>&1 | tail -3

    echo -e "${GREEN}✓ Pushed: $GCR_IMAGE${NC}"
done

echo ""

# Push git tag to remote
echo -e "${YELLOW}Pushing git tag to remote...${NC}"
git push origin "$VERSION" 2>/dev/null || echo "Tag may already exist on remote"
echo -e "${GREEN}✓ Git tag pushed${NC}"
echo ""

# Deploy if requested
if [ "$DEPLOY" = true ]; then
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Deploying to $ENV${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ "$ENV" = "prod" ]; then
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  WARNING: PRODUCTION DEPLOYMENT${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        read -p "Deploy $VERSION to PRODUCTION? Type 'yes' to confirm: " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Deployment cancelled. Images are built and pushed."
            echo "To deploy later: ./deploy/deploy.sh <service> prod $PROJECT_ID $VERSION"
            exit 0
        fi
    fi

    # Deploy each service with version tag
    for service in "${SERVICES[@]}"; do
        echo -e "${YELLOW}Deploying: $service${NC}"
        $SCRIPT_DIR/deploy/deploy.sh $service $ENV $PROJECT_ID $VERSION 2>&1 | tail -10
    done

    echo ""
    echo -e "${GREEN}✓ Deployment complete${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Release $VERSION Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Git Tag:    $VERSION (commit: $COMMIT_HASH)"
echo "Images:"
for service in "${SERVICES[@]}"; do
    echo "  - gcr.io/${PROJECT_ID}/cloudact-${service}-${ENV}:${VERSION}"
done
echo ""

if [ "$DEPLOY" = true ]; then
    echo "Deployed to: $ENV"
    echo ""
    echo "Service URLs:"
    for service in "${SERVICES[@]}"; do
        URL=$(gcloud run services describe cloudact-${service}-${ENV} \
            --project=$PROJECT_ID \
            --region=us-central1 \
            --format="value(status.url)" 2>/dev/null || echo "N/A")
        echo "  $service: $URL"
    done
else
    echo "To deploy this version:"
    echo "  ./release.sh $VERSION --deploy --env $ENV"
    echo ""
    echo "Or deploy individual services:"
    echo "  ./deploy/deploy.sh api-service $ENV $PROJECT_ID $VERSION"
fi

echo ""
echo "To rollback:"
echo "  ./release.sh <previous-version> --deploy --env $ENV"
echo ""
