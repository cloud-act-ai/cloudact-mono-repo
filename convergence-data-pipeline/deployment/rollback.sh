#!/bin/bash
################################################################################
# Rollback Script for Convergence Data Pipeline
# Usage: ./rollback.sh <environment> [revision]
# Rolls back Cloud Run service to previous or specified revision
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
TARGET_REVISION="${2:-}"
REGION="us-central1"
DRY_RUN=false

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
Usage: $0 <environment> [revision] [options]

Environments:
  development    Rollback development environment
  staging        Rollback staging environment
  production     Rollback production environment

Arguments:
  revision       Specific revision to rollback to (optional)
                 If not specified, will rollback to previous revision

Options:
  --dry-run      Show what would be rolled back without actually doing it
  --region       GCP region (default: us-central1)
  --list         List all available revisions and exit
  --help         Show this help message

Examples:
  # Rollback to previous revision
  $0 production

  # Rollback to specific revision
  $0 staging convergence-api-staging-00042-abc

  # List all available revisions
  $0 production --list

  # Dry run
  $0 production --dry-run

EOF
    exit 1
}

# Parse arguments
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --list)
            LIST_ONLY=true
            shift
            ;;
        --help)
            usage
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

# Restore positional parameters
set -- "${POSITIONAL_ARGS[@]}"

ENVIRONMENT="${1:-}"
TARGET_REVISION="${2:-}"

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
        ;;
    staging)
        GCP_PROJECT="${GCP_PROJECT_STAGING:-}"
        SERVICE_NAME="convergence-api-staging"
        ;;
    production)
        GCP_PROJECT="${GCP_PROJECT_PROD:-}"
        SERVICE_NAME="convergence-api"
        ;;
esac

# Validate GCP project
if [[ -z "$GCP_PROJECT" ]]; then
    log_error "GCP_PROJECT not set for environment: $ENVIRONMENT"
    log_info "Set GCP_PROJECT_DEV, GCP_PROJECT_STAGING, or GCP_PROJECT_PROD environment variable"
    exit 1
fi

log_info "=========================================="
log_info "Convergence Data Pipeline Rollback"
log_info "=========================================="
log_info "Environment:    $ENVIRONMENT"
log_info "GCP Project:    $GCP_PROJECT"
log_info "Service Name:   $SERVICE_NAME"
log_info "Region:         $REGION"
log_info "=========================================="

# Set GCP project
log_info "Setting GCP project to: $GCP_PROJECT"
gcloud config set project "$GCP_PROJECT" --quiet

# Get current revision
log_info "Getting current service status..."

CURRENT_REVISION=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --format='value(status.latestReadyRevisionName)' 2>/dev/null || echo "")

if [[ -z "$CURRENT_REVISION" ]]; then
    log_error "Service $SERVICE_NAME not found in region $REGION"
    exit 1
fi

log_info "Current revision: $CURRENT_REVISION"

# Get all revisions
log_info "Fetching available revisions..."

REVISIONS=$(gcloud run revisions list \
    --service="$SERVICE_NAME" \
    --region="$REGION" \
    --format='table(metadata.name,status.conditions.status,metadata.creationTimestamp)' \
    --sort-by=~metadata.creationTimestamp)

echo "$REVISIONS"

# If list only, exit here
if [[ "${LIST_ONLY:-false}" == "true" ]]; then
    exit 0
fi

# Determine target revision
if [[ -z "$TARGET_REVISION" ]]; then
    log_info "No target revision specified, finding previous revision..."

    # Get the second most recent revision (skip current)
    TARGET_REVISION=$(gcloud run revisions list \
        --service="$SERVICE_NAME" \
        --region="$REGION" \
        --format='value(metadata.name)' \
        --sort-by=~metadata.creationTimestamp \
        --limit=2 | tail -n 1)

    if [[ -z "$TARGET_REVISION" ]]; then
        log_error "No previous revision found to rollback to"
        exit 1
    fi

    log_info "Previous revision found: $TARGET_REVISION"
else
    # Validate specified revision exists
    REVISION_EXISTS=$(gcloud run revisions describe "$TARGET_REVISION" \
        --service="$SERVICE_NAME" \
        --region="$REGION" \
        --format='value(metadata.name)' 2>/dev/null || echo "")

    if [[ -z "$REVISION_EXISTS" ]]; then
        log_error "Revision $TARGET_REVISION not found"
        exit 1
    fi

    log_info "Using specified revision: $TARGET_REVISION"
fi

# Check if target is same as current
if [[ "$TARGET_REVISION" == "$CURRENT_REVISION" ]]; then
    log_warning "Target revision is the same as current revision. Nothing to rollback."
    exit 0
fi

# Get revision details
log_info "Getting target revision details..."

TARGET_IMAGE=$(gcloud run revisions describe "$TARGET_REVISION" \
    --region="$REGION" \
    --format='value(spec.containers[0].image)')

TARGET_CREATED=$(gcloud run revisions describe "$TARGET_REVISION" \
    --region="$REGION" \
    --format='value(metadata.creationTimestamp)')

log_info "Target image: $TARGET_IMAGE"
log_info "Created at: $TARGET_CREATED"

# Confirm rollback
if [[ "$DRY_RUN" == "true" ]]; then
    log_warning "DRY RUN MODE - No actual rollback will occur"
else
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_warning "You are about to rollback PRODUCTION!"
        echo "Current revision: $CURRENT_REVISION"
        echo "Target revision:  $TARGET_REVISION"
        read -p "Are you sure you want to continue? (yes/no): " confirm

        if [[ "$confirm" != "yes" ]]; then
            log_info "Rollback cancelled"
            exit 0
        fi
    fi
fi

# Perform rollback
log_info "Rolling back service to revision: $TARGET_REVISION"

if [[ "$DRY_RUN" == "false" ]]; then
    gcloud run services update-traffic "$SERVICE_NAME" \
        --region="$REGION" \
        --to-revisions="$TARGET_REVISION=100"

    log_success "Rollback completed successfully!"
else
    log_info "[DRY RUN] Would rollback to: $TARGET_REVISION"
fi

# Get service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --format='value(status.url)')

# Health check
if [[ "$DRY_RUN" == "false" ]]; then
    log_info "Running health check..."
    sleep 10

    response=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || echo "000")

    if [[ "$response" == "200" ]]; then
        log_success "Health check passed!"
    else
        log_error "Health check failed with status: $response"
        log_error "You may need to perform another rollback or investigate the issue"
        exit 1
    fi
else
    log_info "[DRY RUN] Would check health at: $SERVICE_URL/health"
fi

# Summary
log_success "=========================================="
log_success "Rollback Summary"
log_success "=========================================="
log_info "Environment:        $ENVIRONMENT"
log_info "Service:            $SERVICE_NAME"
log_info "Previous Revision:  $CURRENT_REVISION"
log_info "Current Revision:   $TARGET_REVISION"
log_info "Service URL:        $SERVICE_URL"
log_success "=========================================="

# Save rollback info
if [[ "$DRY_RUN" == "false" ]]; then
    ROLLBACK_LOG="rollback-$(date +%Y%m%d-%H%M%S).log"
    cat > "$ROLLBACK_LOG" <<EOF
Rollback performed: $(date)
Environment: $ENVIRONMENT
Service: $SERVICE_NAME
From Revision: $CURRENT_REVISION
To Revision: $TARGET_REVISION
Performed by: $(whoami)
Service URL: $SERVICE_URL
EOF

    log_info "Rollback details saved to: $ROLLBACK_LOG"
fi

log_success "Rollback completed successfully!"
