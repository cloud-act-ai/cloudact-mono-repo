#!/bin/bash
# =============================================================================
# Run Cloud Run Job
# =============================================================================
# Executes a Cloud Run Job manually.
#
# Usage:
#   ./run-job.sh <environment> <job-name>
#   ./run-job.sh prod bootstrap
#   ./run-job.sh test org-sync-all
#
# Available jobs:
#   - bootstrap           Initial system bootstrap
#   - bootstrap-sync      Sync bootstrap schema
#   - org-sync-all        Sync all org datasets
#   - quota-reset-daily   Reset daily quotas
#   - quota-reset-monthly Reset monthly quotas
#   - stale-cleanup       Fix stuck concurrent counters
#   - quota-cleanup       Delete old quota records
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Arguments
ENV="${1:-}"
JOB_NAME="${2:-}"

if [[ -z "$ENV" ]] || [[ -z "$JOB_NAME" ]]; then
    echo -e "${RED}ERROR: Environment and job name required${NC}"
    echo ""
    echo "Usage: $0 <environment> <job-name>"
    echo ""
    echo "Environments: test, stage, prod"
    echo ""
    echo "Available jobs:"
    echo ""
    echo "  MANUAL (Run before/after releases):"
    echo "    manual-supabase-migrate  - Run Supabase migrations (BEFORE frontend)"
    echo "    manual-bootstrap         - Initial system bootstrap (one-time)"
    echo "    manual-bootstrap-sync    - Sync bootstrap schema (AFTER API deploy)"
    echo "    manual-org-sync-all      - Sync all org datasets (AFTER bootstrap-sync)"
    echo ""
    echo "  SCHEDULED (auto-run, can also run manually):"
    echo "    15min-stale-cleanup         - Fix stuck concurrent counters (every 15 min)"
    echo "    daily-quota-reset           - Reset daily quotas (00:00 UTC)"
    echo "    daily-quota-cleanup         - Delete old quota records (01:00 UTC)"
    echo "    monthly-quota-reset         - Reset monthly quotas (1st of month)"
    echo ""
    echo "  SHORTCUTS (legacy names still work):"
    echo "    bootstrap, org-sync-all, stale-cleanup, quota-reset, etc."
    echo ""
    echo "  NOTE: Billing sync jobs removed (consolidated to Supabase)"
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

# Normalize job name
# 1. Handle shortcut names (legacy compatibility)
# 2. Add cloudact- prefix if not present
case "$JOB_NAME" in
    # Shortcuts for manual jobs
    supabase-migrate|migrate)
        FULL_JOB_NAME="cloudact-manual-supabase-migrate"
        ;;
    bootstrap)
        FULL_JOB_NAME="cloudact-manual-bootstrap"
        ;;
    bootstrap-sync)
        FULL_JOB_NAME="cloudact-manual-bootstrap-sync"
        ;;
    org-sync-all|org-sync)
        FULL_JOB_NAME="cloudact-manual-org-sync-all"
        ;;
    # Shortcuts for scheduled jobs
    stale-cleanup|stale)
        FULL_JOB_NAME="cloudact-15min-stale-cleanup"
        ;;
    quota-reset-daily|quota-reset|quota-daily)
        FULL_JOB_NAME="cloudact-daily-quota-reset"
        ;;
    quota-cleanup)
        FULL_JOB_NAME="cloudact-daily-quota-cleanup"
        ;;
    quota-reset-monthly|quota-monthly)
        FULL_JOB_NAME="cloudact-monthly-quota-reset"
        ;;
    # Deprecated billing sync jobs - show helpful message
    billing-sync-retry|billing-retry|billing-sync-reconcile|billing-reconcile|reconcile)
        echo -e "${RED}ERROR: Billing sync jobs have been removed (consolidated to Supabase)${NC}"
        exit 1
        ;;
    # Already has prefix
    cloudact-*)
        FULL_JOB_NAME="$JOB_NAME"
        ;;
    # Add cloudact- prefix
    *)
        FULL_JOB_NAME="cloudact-${JOB_NAME}"
        ;;
esac

REGION="us-central1"

echo "============================================================"
echo -e "${BLUE}Running Cloud Run Job${NC}"
echo "============================================================"
echo "Environment:  $ENV"
echo "Project:      $PROJECT_ID"
echo "Job:          $FULL_JOB_NAME"
echo "Region:       $REGION"
echo "============================================================"
echo ""

# Set project
gcloud config set project "$PROJECT_ID" --quiet

# Check if job exists
if ! gcloud run jobs describe "$FULL_JOB_NAME" --region="$REGION" &>/dev/null; then
    echo -e "${RED}ERROR: Job not found: $FULL_JOB_NAME${NC}"
    echo ""
    echo "Available jobs:"
    gcloud run jobs list --region="$REGION" --format="table(name)" 2>/dev/null || echo "  (none found)"
    exit 1
fi

# Confirm for production
if [[ "$ENV" == "prod" ]]; then
    echo -e "${YELLOW}⚠️  WARNING: Running job in PRODUCTION${NC}"
    read -p "Are you sure? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
fi

# Execute job
echo -e "${YELLOW}Executing job...${NC}"
EXECUTION=$(gcloud run jobs execute "$FULL_JOB_NAME" \
    --region="$REGION" \
    --wait \
    --format="value(metadata.name)" 2>&1) || {
    echo -e "${RED}✗ Job execution failed${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}✓ Job executed successfully${NC}"
echo ""
echo "Execution: $EXECUTION"
echo ""

# Show logs
echo "============================================================"
echo -e "${BLUE}Job Logs${NC}"
echo "============================================================"
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=$FULL_JOB_NAME" \
    --limit=50 \
    --format="table(timestamp,textPayload)" \
    --order=asc \
    2>/dev/null || echo "  (no logs found yet - may take a moment)"

echo ""
echo "============================================================"
echo -e "${GREEN}Done${NC}"
echo "============================================================"
