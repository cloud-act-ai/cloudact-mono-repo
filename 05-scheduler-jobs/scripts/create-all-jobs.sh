#!/bin/bash
# =============================================================================
# Create All Cloud Run Jobs
# =============================================================================
# Creates Cloud Run Jobs and Cloud Scheduler triggers for CloudAct.
# Deletes existing jobs first for a clean slate.
#
# Usage:
#   ./create-all-jobs.sh <environment>
#   ./create-all-jobs.sh prod
#   ./create-all-jobs.sh stage
#
# Job Categories:
#   MANUAL (Release)  - Run before/after releases
#   EVERY 5 MINUTES   - High-frequency operational jobs
#   EVERY 15 MINUTES  - Medium-frequency maintenance jobs
#   DAILY             - Daily maintenance and cleanup
#   MONTHLY           - Monthly quota resets
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get script directory
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
        FULL_ENV="staging"
        SECRET_ENV="test"  # Secrets in cloudact-testing-1 use -test suffix
        SUPABASE_SECRET_ENV="stage"  # Exception: supabase-access-token uses -stage
        ;;
    prod)
        PROJECT_ID="cloudact-prod"
        FULL_ENV="production"
        SECRET_ENV="prod"
        SUPABASE_SECRET_ENV="prod"
        ;;
    *)
        echo -e "${RED}ERROR: Invalid environment: $ENV${NC}"
        echo "  Valid environments: test, stage, prod"
        exit 1
        ;;
esac

REGION="us-central1"
SERVICE_ACCOUNT="cloudact-jobs@${PROJECT_ID}.iam.gserviceaccount.com"

echo "============================================================"
echo -e "${BLUE}CloudAct Cloud Run Jobs Setup${NC}"
echo "============================================================"
echo "Environment:      $ENV"
echo "Project:          $PROJECT_ID"
echo "Region:           $REGION"
echo "Service Account:  $SERVICE_ACCOUNT"
echo "============================================================"
echo ""

# Check if authenticated
if ! gcloud auth print-identity-token &>/dev/null; then
    echo -e "${RED}ERROR: Not authenticated with gcloud${NC}"
    echo "Run: gcloud auth login"
    exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID" --quiet

# Create service account if not exists
echo -e "${YELLOW}Checking service account...${NC}"
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" &>/dev/null; then
    echo "Creating service account..."
    gcloud iam service-accounts create cloudact-jobs \
        --display-name="CloudAct Jobs Service Account" \
        --description="Service account for Cloud Run Jobs"

    # Grant BigQuery access
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/bigquery.admin" \
        --quiet

    # Grant Secret Manager access
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet

    echo -e "${GREEN}✓ Service account created${NC}"
else
    echo -e "${GREEN}✓ Service account exists${NC}"
fi

# =============================================================================
# Job Definitions
# =============================================================================

IMAGE_NAME="cloudact-jobs-${ENV}"

# All jobs to manage (for deletion) - including old names for cleanup
ALL_JOBS=(
    # Old names (for cleanup)
    "cloudact-supabase-migrate"
    "cloudact-bootstrap"
    "cloudact-bootstrap-sync"
    "cloudact-org-sync-all"
    "cloudact-billing-sync-retry"
    "cloudact-stale-cleanup"
    "cloudact-quota-reset-daily"
    "cloudact-quota-cleanup"
    "cloudact-billing-sync-reconcile"
    "cloudact-quota-reset-monthly"
    # New names with category prefix
    "cloudact-manual-supabase-migrate"
    "cloudact-manual-bootstrap"
    "cloudact-manual-bootstrap-sync"
    "cloudact-manual-org-sync-all"
    "cloudact-5min-billing-sync-retry"
    "cloudact-15min-stale-cleanup"
    "cloudact-daily-quota-reset"
    "cloudact-daily-quota-cleanup"
    "cloudact-daily-billing-reconcile"
    "cloudact-daily-stale-cleanup"
    "cloudact-daily-pipelines"
    "cloudact-monthly-quota-reset"
)
# Note: billing sync jobs (5min-billing-sync-retry, daily-billing-reconcile) are deprecated
# Note: 15min-stale-cleanup moved to daily-stale-cleanup (self-healing handles most cases)
# and will be deleted but not recreated (consolidated to Supabase)

# All schedulers to manage (for deletion)
ALL_SCHEDULERS=(
    # Old names
    "cloudact-billing-sync-retry-trigger"
    "cloudact-stale-cleanup-trigger"
    "cloudact-quota-reset-daily-trigger"
    "cloudact-quota-cleanup-trigger"
    "cloudact-billing-sync-reconcile-trigger"
    "cloudact-quota-reset-monthly-trigger"
    # New names
    "cloudact-5min-billing-sync-retry-trigger"
    "cloudact-15min-stale-cleanup-trigger"
    "cloudact-daily-quota-reset-trigger"
    "cloudact-daily-quota-cleanup-trigger"
    "cloudact-daily-billing-reconcile-trigger"
    "cloudact-daily-stale-cleanup-trigger"
    "cloudact-daily-pipelines-trigger"
    "cloudact-monthly-quota-reset-trigger"
)
# Note: billing sync schedulers are deprecated and will be deleted but not recreated
# Note: 15min-stale-cleanup-trigger moved to daily-stale-cleanup-trigger

delete_job() {
    local JOB_NAME="$1"
    if gcloud run jobs describe "$JOB_NAME" --region="$REGION" &>/dev/null; then
        echo "  Deleting: $JOB_NAME"
        gcloud run jobs delete "$JOB_NAME" --region="$REGION" --quiet 2>/dev/null || true
    fi
}

delete_scheduler() {
    local SCHEDULER_NAME="$1"
    if gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" &>/dev/null; then
        echo "  Deleting: $SCHEDULER_NAME"
        gcloud scheduler jobs delete "$SCHEDULER_NAME" --location="$REGION" --quiet 2>/dev/null || true
    fi
}

create_job() {
    local JOB_NAME="$1"
    local SCRIPT_PATH="$2"
    local TIMEOUT="$3"
    local MEMORY="${4:-2Gi}"
    local CPU="${5:-1}"
    local EXTRA_SECRETS="${6:-}"

    echo -e "  ${CYAN}Creating: $JOB_NAME${NC}"

    local SECRETS="CA_ROOT_API_KEY=ca-root-api-key-${SECRET_ENV}:latest"
    if [[ -n "$EXTRA_SECRETS" ]]; then
        SECRETS="${SECRETS},${EXTRA_SECRETS}"
    fi

    gcloud run jobs create "$JOB_NAME" \
        --region="$REGION" \
        --image="gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest" \
        --command="python" \
        --args="$SCRIPT_PATH" \
        --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},ENVIRONMENT=${FULL_ENV}" \
        --set-secrets="$SECRETS" \
        --service-account="$SERVICE_ACCOUNT" \
        --task-timeout="$TIMEOUT" \
        --memory="$MEMORY" \
        --cpu="$CPU" \
        --max-retries=1 \
        --quiet

    echo -e "  ${GREEN}✓ $JOB_NAME${NC}"
}

create_scheduler() {
    local SCHEDULER_NAME="$1"
    local JOB_NAME="$2"
    local SCHEDULE="$3"
    local DESCRIPTION="$4"

    echo -e "  ${CYAN}Creating scheduler: $SCHEDULER_NAME${NC}"

    gcloud scheduler jobs create http "$SCHEDULER_NAME" \
        --location="$REGION" \
        --schedule="$SCHEDULE" \
        --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
        --http-method=POST \
        --oauth-service-account-email="$SERVICE_ACCOUNT" \
        --description="$DESCRIPTION" \
        --time-zone="UTC" \
        --quiet

    echo -e "  ${GREEN}✓ $SCHEDULER_NAME${NC}"
}

# =============================================================================
# STEP 1: Delete All Existing Jobs and Schedulers
# =============================================================================

echo ""
echo "============================================================"
echo -e "${YELLOW}Deleting Existing Jobs & Schedulers${NC}"
echo "============================================================"

echo "Deleting schedulers..."
for scheduler in "${ALL_SCHEDULERS[@]}"; do
    delete_scheduler "$scheduler"
done

echo "Deleting jobs..."
for job in "${ALL_JOBS[@]}"; do
    delete_job "$job"
done

echo -e "${GREEN}✓ Cleanup complete${NC}"

# =============================================================================
# STEP 2: Create MANUAL Jobs (Run Before/After Releases)
# =============================================================================

echo ""
echo "============================================================"
echo -e "${BLUE}MANUAL JOBS${NC} ${YELLOW}(Run before/after releases)${NC}"
echo "============================================================"
echo ""
echo -e "${YELLOW}NOTE: Run these jobs in order after each release:${NC}"
echo "  1. supabase-migrate  - Before deploying frontend"
echo "  2. bootstrap         - Smart: fresh if new, sync if exists"
echo "  3. org-sync-all      - After bootstrap completes"
echo ""

# 1. Supabase Migrate (BEFORE frontend deploy)
create_job "cloudact-manual-supabase-migrate" \
    "jobs/manual/supabase_migrate.py" \
    "15m" \
    "2Gi" \
    "1" \
    "SUPABASE_ACCESS_TOKEN=supabase-access-token-${SUPABASE_SECRET_ENV}:latest"

# 2. Smart Bootstrap (auto-detects fresh vs sync)
# - Fresh bootstrap if organizations dataset doesn't exist
# - Sync if dataset exists (adds new columns)
create_job "cloudact-manual-bootstrap" \
    "jobs/manual/bootstrap_smart.py" \
    "30m" \
    "4Gi" \
    "2"

# 3. Org Sync All (AFTER bootstrap)
create_job "cloudact-manual-org-sync-all" \
    "jobs/manual/org_sync_all.py" \
    "60m" \
    "4Gi" \
    "2"

# =============================================================================
# STEP 3: Create DAILY Jobs
# =============================================================================
# Note: EVERY 15 MINUTES stale cleanup moved to daily (self-healing handles most cases)
# Note: EVERY 5 MINUTES billing sync jobs removed (consolidated to Supabase)

echo ""
echo "============================================================"
echo -e "${BLUE}DAILY JOBS${NC}"
echo "============================================================"

# 00:00 UTC - Quota reset daily
create_job "cloudact-daily-quota-reset" \
    "jobs/daily/quota_reset_daily.py" \
    "15m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-daily-quota-reset-trigger" \
    "cloudact-daily-quota-reset" \
    "0 0 * * *" \
    "Reset daily pipeline quotas (00:00 UTC)"

# 01:00 UTC - Quota cleanup
create_job "cloudact-daily-quota-cleanup" \
    "jobs/daily/quota_cleanup.py" \
    "30m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-daily-quota-cleanup-trigger" \
    "cloudact-daily-quota-cleanup" \
    "0 1 * * *" \
    "Delete quota records older than 90 days (01:00 UTC)"

# 02:00 UTC - Stale concurrent cleanup (safety net - self-healing handles most cases)
create_job "cloudact-daily-stale-cleanup" \
    "jobs/daily/stale_cleanup.py" \
    "10m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-daily-stale-cleanup-trigger" \
    "cloudact-daily-stale-cleanup" \
    "0 2 * * *" \
    "Fix stuck concurrent counters - safety net (02:00 UTC)"

# 06:00 UTC - Daily pipelines (run cost pipelines for all orgs)
create_job "cloudact-daily-pipelines" \
    "jobs/daily/pipelines_daily.py" \
    "45m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-daily-pipelines-trigger" \
    "cloudact-daily-pipelines" \
    "0 6 * * *" \
    "Run cost pipelines for all organizations (06:00 UTC)"

# 08:00 UTC - Daily alerts processing
create_job "cloudact-daily-alerts" \
    "jobs/daily/alerts_daily.py" \
    "30m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-daily-alerts-trigger" \
    "cloudact-daily-alerts" \
    "0 8 * * *" \
    "Process cost alerts for all organizations (08:00 UTC)"

# Note: billing-reconcile job removed (consolidated to Supabase)

# =============================================================================
# STEP 4: Create MONTHLY Jobs
# =============================================================================

echo ""
echo "============================================================"
echo -e "${BLUE}MONTHLY JOBS${NC}"
echo "============================================================"

# 00:05 UTC on 1st - Monthly quota reset
create_job "cloudact-monthly-quota-reset" \
    "jobs/monthly/quota_reset_monthly.py" \
    "15m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-monthly-quota-reset-trigger" \
    "cloudact-monthly-quota-reset" \
    "5 0 1 * *" \
    "Reset monthly pipeline quotas (00:05 UTC on 1st)"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "============================================================"
echo -e "${GREEN}✓ All jobs created successfully!${NC}"
echo "============================================================"
echo ""
echo -e "${YELLOW}MANUAL JOBS (Run before/after releases):${NC}"
echo "  cloudact-manual-supabase-migrate  - Run BEFORE frontend deploy"
echo "  cloudact-manual-bootstrap         - Smart: fresh if new, sync if exists"
echo "  cloudact-manual-org-sync-all      - Run AFTER bootstrap"
echo ""
echo -e "${CYAN}SCHEDULED JOBS:${NC}"
echo "  Daily:"
echo "    cloudact-daily-quota-reset        (00:00 UTC)"
echo "    cloudact-daily-quota-cleanup      (01:00 UTC)"
echo "    cloudact-daily-stale-cleanup      (02:00 UTC) - safety net"
echo "    cloudact-daily-pipelines          (06:00 UTC)"
echo "    cloudact-daily-alerts             (08:00 UTC)"
echo ""
echo "  Monthly:"
echo "    cloudact-monthly-quota-reset      (00:05 UTC on 1st)"
echo ""
echo -e "${YELLOW}NOTE: Stale cleanup moved from 15min to daily (self-healing handles most cases)${NC}"
echo -e "${YELLOW}NOTE: Billing sync jobs removed (consolidated to Supabase)${NC}"
echo ""
echo "View jobs:  ./list-jobs.sh $ENV"
echo "Run job:    ./run-job.sh $ENV <job-name>"
echo "============================================================"
