#!/bin/bash
# Configuration for demo data loading scripts
# Usage: source this file before running other scripts

# GCP Project ID - override with environment variable
export PROJECT_ID="${GCP_PROJECT_ID:-cloudact-testing-1}"

# Target dataset for demo data
export DATASET="${DATASET:-genai_community_12282025_local}"

# Organization slug
export ORG_SLUG="genai_community_12282025"

# Resolve paths relative to this script
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

# Export functions for use in other scripts
export -f log_info log_warn log_error check_requirements check_auth check_dataset
