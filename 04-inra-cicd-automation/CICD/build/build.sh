#!/bin/bash
################################################################################
# build.sh - Build Docker images using Cloud Build (remote) from Git
# Usage: ./build.sh <service> <environment> <project-id> [tag] [--local]
# Services: api-service, pipeline-service, frontend
# Environments: test, stage, prod
#
# By default, builds from Git (current branch/commit)
# Use --local flag to upload local files instead
#
# Dynamically selects service account based on project:
#   cloudact-testing-1 → cloudact-testing-1@cloudact-testing-1.iam.gserviceaccount.com
#   cloudact-stage     → cloudact-stage@cloudact-stage.iam.gserviceaccount.com
#   cloudact-prod      → cloudact-prod@cloudact-prod.iam.gserviceaccount.com
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# Parse arguments
USE_LOCAL=false
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --local)
            USE_LOCAL=true
            shift
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done
set -- "${POSITIONAL_ARGS[@]}"

if [ "$#" -lt 3 ]; then
    echo -e "${RED}Usage: ./build.sh <service> <environment> <project-id> [tag] [--local]${NC}"
    echo ""
    echo "Services: api-service, pipeline-service, frontend"
    echo "Environments: test, stage, prod"
    echo ""
    echo "Options:"
    echo "  --local    Upload local files instead of building from Git"
    echo ""
    echo "Examples:"
    echo "  ./build.sh api-service test cloudact-testing-1           # Build from Git"
    echo "  ./build.sh api-service test cloudact-testing-1 v1.0.0    # Build with tag"
    echo "  ./build.sh frontend prod cloudact-prod v2.0.0 --local    # Upload local files"
    exit 1
fi

SERVICE=$1
ENV=$2
PROJECT_ID=$3
TAG=${4:-$(date +%Y%m%d-%H%M%S)}
REGION="us-central1"

# Validate service and set source directory
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

# Get Git info
cd "$REPO_ROOT"
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
GIT_COMMIT=$(git rev-parse HEAD)
GIT_COMMIT_SHORT=$(git rev-parse --short HEAD)
GIT_REMOTE=$(git config --get remote.origin.url 2>/dev/null || echo "")

# Extract repo info from Git remote URL
# Supports: git@github.com:user/repo.git or https://github.com/user/repo.git
if [[ "$GIT_REMOTE" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    GIT_OWNER="${BASH_REMATCH[1]}"
    GIT_REPO="${BASH_REMATCH[2]}"
fi

# Dynamic service account based on project
SERVICE_ACCOUNT="${PROJECT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Building: $SERVICE ($ENV) via Cloud Build${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Source: $SOURCE_DIR"
echo "Project: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT"
echo "Tag: $TAG"
echo "Environment: $ENV"
echo ""
echo -e "${YELLOW}Git Info:${NC}"
echo "  Branch: $GIT_BRANCH"
echo "  Commit: $GIT_COMMIT_SHORT ($GIT_COMMIT)"
echo "  Remote: $GIT_REMOTE"
if [ "$USE_LOCAL" = true ]; then
    echo -e "  Source: ${YELLOW}LOCAL FILES${NC} (--local flag)"
else
    echo -e "  Source: ${GREEN}GIT REPOSITORY${NC}"
fi
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
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo -e "${YELLOW}Cloud Build configuration:${NC}"
echo "  TARGET_ENV: $ENV"
echo "  Uses: .env.${ENV} (or .env.production for prod)"
echo ""
echo -e "${YELLOW}Target images:${NC}"
echo "  - $IMAGE_VERSION"
echo "  - $IMAGE_LATEST"
echo "  - $IMAGE_ENV_LATEST"
echo ""

# Switch to correct service account and project
echo -e "${YELLOW}Switching to service account: $SERVICE_ACCOUNT${NC}"
gcloud config set account $SERVICE_ACCOUNT 2>/dev/null || {
    echo -e "${YELLOW}Service account not found locally, using current account${NC}"
}
gcloud config set project $PROJECT_ID

# Build and push using Cloud Build
echo -e "${YELLOW}Building with Cloud Build (remote)...${NC}"

# Common substitutions
SUBSTITUTIONS="_ENVIRONMENT=$ENV,_TARGET_ENV=$ENV,_VERSION=$TAG,_BUILD_DATE=$BUILD_DATE,_IMAGE_VERSION=$IMAGE_VERSION,_IMAGE_LATEST=$IMAGE_LATEST,_IMAGE_ENV_LATEST=$IMAGE_ENV_LATEST,_GIT_COMMIT=$GIT_COMMIT_SHORT"

if [ "$USE_LOCAL" = true ]; then
    # Upload local files
    echo -e "${YELLOW}Uploading local files to Cloud Build...${NC}"

    if [ -f "$SCRIPT_DIR/cloudbuild.yaml" ]; then
        gcloud builds submit \
            --project=$PROJECT_ID \
            --config=$SCRIPT_DIR/cloudbuild.yaml \
            --substitutions="$SUBSTITUTIONS" \
            $REPO_ROOT/$SOURCE_DIR
    else
        gcloud builds submit \
            --project=$PROJECT_ID \
            --tag=$IMAGE_VERSION \
            --timeout=1800s \
            $REPO_ROOT/$SOURCE_DIR

        gcloud container images add-tag $IMAGE_VERSION $IMAGE_LATEST --quiet
        gcloud container images add-tag $IMAGE_VERSION $IMAGE_ENV_LATEST --quiet
    fi
else
    # Build from Git repository using Cloud Source Repositories mirror or GitHub
    echo -e "${YELLOW}Building from Git repository...${NC}"

    # Check if Cloud Source Repository mirror exists
    CSR_REPO="github_${GIT_OWNER}_${GIT_REPO}"

    # Create a temporary cloudbuild.yaml in the source directory if needed
    TEMP_CLOUDBUILD="$REPO_ROOT/$SOURCE_DIR/cloudbuild-temp.yaml"

    cat > "$TEMP_CLOUDBUILD" << EOFCB
# Temporary Cloud Build config - auto-generated
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '--platform=linux/amd64'
      - '--build-arg=ENVIRONMENT=$ENV'
      - '--build-arg=TARGET_ENV=$ENV'
      - '--build-arg=VERSION=$TAG'
      - '--build-arg=BUILD_DATE=$BUILD_DATE'
      - '--build-arg=GIT_COMMIT=$GIT_COMMIT_SHORT'
      - '-t'
      - '$IMAGE_VERSION'
      - '-t'
      - '$IMAGE_LATEST'
      - '-t'
      - '$IMAGE_ENV_LATEST'
      - '-f'
      - '$SOURCE_DIR/Dockerfile'
      - '$SOURCE_DIR'
images:
  - '$IMAGE_VERSION'
  - '$IMAGE_LATEST'
  - '$IMAGE_ENV_LATEST'
options:
  logging: CLOUD_LOGGING_ONLY
  machineType: 'E2_HIGHCPU_8'
timeout: '1800s'
EOFCB

    # Try to build from GitHub using gcloud builds submit with --git-source-dir
    # This requires Cloud Build GitHub App to be connected
    if gcloud builds submit \
        --project=$PROJECT_ID \
        --git-source-dir="$SOURCE_DIR" \
        --git-source-revision="$GIT_COMMIT" \
        --region="$REGION" \
        --config="$TEMP_CLOUDBUILD" \
        "https://github.com/${GIT_OWNER}/${GIT_REPO}.git" 2>/dev/null; then
        echo -e "${GREEN}Built from GitHub directly${NC}"
    else
        # Fallback: Upload local files if GitHub connection not available
        echo -e "${YELLOW}GitHub connection not available, falling back to local upload...${NC}"
        rm -f "$TEMP_CLOUDBUILD"

        if [ -f "$SCRIPT_DIR/cloudbuild.yaml" ]; then
            gcloud builds submit \
                --project=$PROJECT_ID \
                --config=$SCRIPT_DIR/cloudbuild.yaml \
                --substitutions="$SUBSTITUTIONS" \
                $REPO_ROOT/$SOURCE_DIR
        else
            gcloud builds submit \
                --project=$PROJECT_ID \
                --tag=$IMAGE_VERSION \
                --timeout=1800s \
                $REPO_ROOT/$SOURCE_DIR

            gcloud container images add-tag $IMAGE_VERSION $IMAGE_LATEST --quiet
            gcloud container images add-tag $IMAGE_VERSION $IMAGE_ENV_LATEST --quiet
        fi
    fi

    # Cleanup temp file
    rm -f "$TEMP_CLOUDBUILD"
fi

echo ""
echo -e "${GREEN}✓ Cloud Build complete!${NC}"
echo ""
echo "Images created in GCR:"
echo "  - $IMAGE_VERSION"
echo "  - $IMAGE_LATEST"
echo "  - $IMAGE_ENV_LATEST"
echo ""
echo "Built from:"
echo "  - Branch: $GIT_BRANCH"
echo "  - Commit: $GIT_COMMIT_SHORT"
echo ""
echo "Next: Run deploy.sh to deploy to Cloud Run"

# Output image name for chaining
echo "$IMAGE_VERSION" > /tmp/cloudact-last-build-${SERVICE}-${ENV}
