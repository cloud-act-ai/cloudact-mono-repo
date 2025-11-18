#!/bin/bash
################################################################################
# Deployment Script for Convergence Data Pipeline
# Usage: ./deploy.sh <environment> [options]
# Environments: development, staging, production
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-}"
DRY_RUN=false
SKIP_TESTS=false
SKIP_BUILD=false
USE_CLOUD_BUILD=false
REGION="us-central1"
TIMEOUT=3600

# Function to print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
usage() {
    cat << EOF
Usage: $0 <environment> [options]

Environments:
  development    Deploy to development environment
  staging        Deploy to staging environment
  production     Deploy to production environment

Options:
  --dry-run              Show what would be deployed without actually deploying
  --skip-tests           Skip running tests before deployment
  --skip-build           Use existing Docker image (requires --image-tag)
  --cloud-build          Use Cloud Build instead of local build
  --image-tag TAG        Specify Docker image tag to deploy
  --region REGION        GCP region (default: us-central1)
  --help                 Show this help message

Examples:
  # Deploy to development
  $0 development

  # Deploy to staging using Cloud Build
  $0 staging --cloud-build

  # Deploy specific image to production
  $0 production --skip-build --image-tag v1.2.3

  # Dry run to see what would be deployed
  $0 production --dry-run

EOF
    exit 1
}

# Parse arguments
while [[ $# -gt 1 ]]; do
    case "$2" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --cloud-build)
            USE_CLOUD_BUILD=true
            shift
            ;;
        --image-tag)
            IMAGE_TAG="$3"
            shift 2
            ;;
        --region)
            REGION="$3"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            log_error "Unknown option: $2"
            usage
            ;;
    esac
done

# Validate environment
if [[ -z "$ENVIRONMENT" ]]; then
    log_error "Environment is required"
    usage
fi

if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    usage
fi

# Load environment-specific configuration
case "$ENVIRONMENT" in
    development)
        GCP_PROJECT="${GCP_PROJECT_DEV:-}"
        SERVICE_NAME="convergence-api-dev"
        MIN_INSTANCES=0
        MAX_INSTANCES=5
        MEMORY="2Gi"
        CPU=2
        ;;
    staging)
        GCP_PROJECT="${GCP_PROJECT_STAGING:-}"
        SERVICE_NAME="convergence-api-staging"
        MIN_INSTANCES=1
        MAX_INSTANCES=10
        MEMORY="2Gi"
        CPU=2
        ;;
    production)
        GCP_PROJECT="${GCP_PROJECT_PROD:-}"
        SERVICE_NAME="convergence-api"
        MIN_INSTANCES=2
        MAX_INSTANCES=50
        MEMORY="4Gi"
        CPU=4
        ;;
esac

# Validate GCP project
if [[ -z "$GCP_PROJECT" ]]; then
    log_error "GCP_PROJECT not set for environment: $ENVIRONMENT"
    log_info "Set GCP_PROJECT_DEV, GCP_PROJECT_STAGING, or GCP_PROJECT_PROD environment variable"
    exit 1
fi

# Set image tag if not provided
if [[ -z "${IMAGE_TAG:-}" ]]; then
    IMAGE_TAG="$(git rev-parse --short HEAD)"
fi

IMAGE_URL="us-docker.pkg.dev/${GCP_PROJECT}/convergence/api:${IMAGE_TAG}"

log_info "=========================================="
log_info "Convergence Data Pipeline Deployment"
log_info "=========================================="
log_info "Environment:    $ENVIRONMENT"
log_info "GCP Project:    $GCP_PROJECT"
log_info "Service Name:   $SERVICE_NAME"
log_info "Region:         $REGION"
log_info "Image Tag:      $IMAGE_TAG"
log_info "Image URL:      $IMAGE_URL"
log_info "Dry Run:        $DRY_RUN"
log_info "=========================================="

if [[ "$DRY_RUN" == "true" ]]; then
    log_warning "DRY RUN MODE - No actual deployment will occur"
fi

# Confirm production deployment
if [[ "$ENVIRONMENT" == "production" ]] && [[ "$DRY_RUN" == "false" ]]; then
    read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        log_info "Deployment cancelled"
        exit 0
    fi
fi

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI not found. Please install Google Cloud SDK"
    exit 1
fi

if ! command -v docker &> /dev/null && [[ "$USE_CLOUD_BUILD" == "false" ]]; then
    log_error "docker not found. Please install Docker or use --cloud-build"
    exit 1
fi

# Set GCP project
log_info "Setting GCP project to: $GCP_PROJECT"
if [[ "$DRY_RUN" == "false" ]]; then
    gcloud config set project "$GCP_PROJECT"
fi

# Run tests
if [[ "$SKIP_TESTS" == "false" ]]; then
    log_info "Running tests..."

    if [[ "$DRY_RUN" == "false" ]]; then
        if command -v pytest &> /dev/null; then
            pytest tests/unit/ -v --maxfail=5 || {
                log_error "Tests failed!"
                exit 1
            }
            log_success "Tests passed"
        else
            log_warning "pytest not found, skipping tests"
        fi
    else
        log_info "[DRY RUN] Would run: pytest tests/unit/ -v --maxfail=5"
    fi
else
    log_warning "Skipping tests (--skip-tests)"
fi

# Build Docker image
if [[ "$SKIP_BUILD" == "false" ]]; then
    if [[ "$USE_CLOUD_BUILD" == "true" ]]; then
        log_info "Building Docker image using Cloud Build..."

        if [[ "$DRY_RUN" == "false" ]]; then
            gcloud builds submit \
                --config=deployment/cloudbuild.yaml \
                --substitutions="_ENVIRONMENT=$ENVIRONMENT,SHORT_SHA=$IMAGE_TAG" \
                --region="$REGION" \
                --timeout="${TIMEOUT}s"
        else
            log_info "[DRY RUN] Would run: gcloud builds submit --config=deployment/cloudbuild.yaml"
        fi
    else
        log_info "Building Docker image locally..."

        if [[ "$DRY_RUN" == "false" ]]; then
            # Configure Docker for Artifact Registry
            gcloud auth configure-docker us-docker.pkg.dev --quiet

            # Build image
            docker build \
                -t "$IMAGE_URL" \
                -f deployment/Dockerfile \
                --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
                --build-arg VCS_REF="$(git rev-parse HEAD)" \
                --build-arg VERSION="$IMAGE_TAG" \
                .

            # Push image
            log_info "Pushing Docker image..."
            docker push "$IMAGE_URL"
        else
            log_info "[DRY RUN] Would build and push: $IMAGE_URL"
        fi
    fi

    log_success "Docker image built: $IMAGE_URL"
else
    log_warning "Skipping build (--skip-build)"
fi

# Deploy to Cloud Run
log_info "Deploying to Cloud Run..."

DEPLOY_CMD="gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_URL \
    --region=$REGION \
    --platform=managed \
    --service-account=convergence-api@${GCP_PROJECT}.iam.gserviceaccount.com \
    --set-env-vars=GCP_PROJECT_ID=${GCP_PROJECT},BIGQUERY_LOCATION=US,ENVIRONMENT=${ENVIRONMENT},VERSION=${IMAGE_TAG} \
    --allow-unauthenticated \
    --memory=$MEMORY \
    --cpu=$CPU \
    --concurrency=80 \
    --max-instances=$MAX_INSTANCES \
    --min-instances=$MIN_INSTANCES \
    --timeout=$TIMEOUT"

if [[ "$DRY_RUN" == "false" ]]; then
    eval "$DEPLOY_CMD"
else
    log_info "[DRY RUN] Would deploy with:"
    echo "$DEPLOY_CMD"
fi

# Get service URL
log_info "Getting service URL..."

if [[ "$DRY_RUN" == "false" ]]; then
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --format='value(status.url)')

    log_success "Deployment successful!"
    log_info "Service URL: $SERVICE_URL"

    # Health check
    log_info "Running health check..."
    sleep 10

    response=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || echo "000")

    if [[ "$response" == "200" ]]; then
        log_success "Health check passed!"
    else
        log_error "Health check failed with status: $response"
        exit 1
    fi
else
    log_info "[DRY RUN] Would check health at service URL"
fi

log_success "=========================================="
log_success "Deployment completed successfully!"
log_success "=========================================="
log_info "Environment: $ENVIRONMENT"
log_info "Service: $SERVICE_NAME"
if [[ "$DRY_RUN" == "false" ]]; then
    log_info "URL: $SERVICE_URL"
fi
log_info "Image: $IMAGE_URL"
log_success "=========================================="
