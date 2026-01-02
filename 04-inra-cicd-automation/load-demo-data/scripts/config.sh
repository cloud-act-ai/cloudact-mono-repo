#!/bin/bash
# Configuration for demo data loading scripts
# Usage: source this file before running other scripts
#
# Environment Variables (override defaults):
#   ENVIRONMENT       - local, stage, prod (default: local)
#   GCP_PROJECT_ID    - GCP project (auto-set per environment)
#   ORG_SLUG          - Organization slug (required for most scripts)
#   ORG_API_KEY       - Organization API key (required for pipeline scripts)
#   CA_ROOT_API_KEY   - System admin key (required for procedure sync)
#   DEMO_PREFIX       - Prefix for demo orgs (default: demo_)

# ======================================================
# Environment Configuration
# ======================================================

export ENVIRONMENT="${ENVIRONMENT:-local}"

# Environment-specific defaults
case "$ENVIRONMENT" in
    local|test)
        export PROJECT_ID="${GCP_PROJECT_ID:-cloudact-testing-1}"
        export PIPELINE_SERVICE_URL="${PIPELINE_SERVICE_URL:-http://localhost:8001}"
        export API_SERVICE_URL="${API_SERVICE_URL:-http://localhost:8000}"
        export SUPABASE_PROJECT="kwroaccbrxppfiysqlzs"
        ;;
    stage)
        export PROJECT_ID="${GCP_PROJECT_ID:-cloudact-stage}"
        export PIPELINE_SERVICE_URL="${PIPELINE_SERVICE_URL:-https://cloudact-pipeline-stage.run.app}"
        export API_SERVICE_URL="${API_SERVICE_URL:-https://cloudact-api-stage.run.app}"
        export SUPABASE_PROJECT="kwroaccbrxppfiysqlzs"
        ;;
    prod)
        export PROJECT_ID="${GCP_PROJECT_ID:-cloudact-prod}"
        export PIPELINE_SERVICE_URL="${PIPELINE_SERVICE_URL:-https://pipeline.cloudact.ai}"
        export API_SERVICE_URL="${API_SERVICE_URL:-https://api.cloudact.ai}"
        export SUPABASE_PROJECT="ovfxswhkkshouhsryzaf"
        ;;
    *)
        echo "ERROR: Unknown environment: $ENVIRONMENT"
        echo "Valid values: local, test, stage, prod"
        exit 1
        ;;
esac

# ======================================================
# Demo Organization Configuration
# ======================================================

# Demo prefix marker - used to identify demo orgs
export DEMO_PREFIX="${DEMO_PREFIX:-demo_}"

# Organization slug (required - no default)
# Set via: export ORG_SLUG="demo_acme_01022026"
export ORG_SLUG="${ORG_SLUG:-}"

# Dataset naming: {org_slug}_{env_suffix}
ENV_SUFFIX="prod"
[[ "$ENVIRONMENT" == "local" || "$ENVIRONMENT" == "test" ]] && ENV_SUFFIX="local"
export DATASET="${DATASET:-${ORG_SLUG}_${ENV_SUFFIX}}"

# ======================================================
# Demo Data Date Range
# ======================================================

export START_DATE="${START_DATE:-2025-01-01}"
export END_DATE="${END_DATE:-2026-01-02}"

# ======================================================
# Demo Data Markers (for identifying demo data in real orgs)
# ======================================================

# These markers are embedded in demo data files for safe identification/deletion
export DEMO_CREDENTIAL_PATTERN="demo"         # x_credential_id contains "demo"
export DEMO_RUN_ID_PATTERN="run_demo_"        # x_run_id starts with "run_demo_"
export DEMO_DATA_SOURCE_ORG="india_inc_01022026"  # Original org_slug in demo data files

# ======================================================
# Paths
# ======================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DATA_DIR="${SCRIPT_DIR}/../data"
export SCHEMA_DIR="${SCRIPT_DIR}/../schemas"

# Colors for output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate required tools
check_requirements() {
    if ! command -v bq &> /dev/null; then
        log_error "bq (BigQuery CLI) is not installed. Install Google Cloud SDK."
        exit 1
    fi

    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud is not installed. Install Google Cloud SDK."
        exit 1
    fi
}

# Validate GCP authentication
check_auth() {
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 > /dev/null 2>&1; then
        log_error "Not authenticated with GCP. Run: gcloud auth login"
        exit 1
    fi

    local active_account=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
    log_info "Authenticated as: ${active_account}"
}

# Validate dataset exists
check_dataset() {
    if ! bq show "${PROJECT_ID}:${DATASET}" > /dev/null 2>&1; then
        log_error "Dataset ${PROJECT_ID}:${DATASET} does not exist"
        exit 1
    fi
    log_info "Target dataset: ${PROJECT_ID}:${DATASET}"
}

# Validate ORG_SLUG is set
check_org_slug() {
    if [[ -z "$ORG_SLUG" ]]; then
        log_error "ORG_SLUG environment variable is required"
        log_error "Set it with: export ORG_SLUG='demo_acme_01022026'"
        exit 1
    fi
    log_info "Organization: ${ORG_SLUG}"
}

# Check if org is a demo org (has demo prefix)
is_demo_org() {
    [[ "$ORG_SLUG" == ${DEMO_PREFIX}* ]]
}

# Show current configuration
show_config() {
    echo ""
    echo "========================================"
    echo "  Current Configuration"
    echo "========================================"
    echo "  Environment:     ${ENVIRONMENT}"
    echo "  GCP Project:     ${PROJECT_ID}"
    echo "  Organization:    ${ORG_SLUG:-<not set>}"
    echo "  Dataset:         ${DATASET:-<not set>}"
    echo "  Date Range:      ${START_DATE} to ${END_DATE}"
    echo "  API Service:     ${API_SERVICE_URL}"
    echo "  Pipeline Svc:    ${PIPELINE_SERVICE_URL}"
    echo "  Supabase:        ${SUPABASE_PROJECT}"
    is_demo_org && echo "  Demo Org:        YES (prefix: ${DEMO_PREFIX})"
    echo "========================================"
    echo ""
}

# Export functions for use in other scripts
export -f log_info log_warn log_error check_requirements check_auth check_dataset check_org_slug is_demo_org show_config
