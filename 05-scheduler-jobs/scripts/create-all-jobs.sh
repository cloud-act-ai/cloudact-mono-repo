#!/bin/bash
# =============================================================================
# Create All Cloud Run Jobs
# =============================================================================
# Creates Cloud Run Jobs and Cloud Scheduler triggers for CloudAct.
#
# Usage:
#   ./create-all-jobs.sh <environment>
#   ./create-all-jobs.sh prod
#   ./create-all-jobs.sh test
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

create_job() {
    local JOB_NAME="$1"
    local SCRIPT_PATH="$2"
    local TIMEOUT="$3"
    local MEMORY="${4:-2Gi}"
    local CPU="${5:-1}"

    echo ""
    echo -e "${YELLOW}Creating job: $JOB_NAME${NC}"

    # Delete existing job if exists
    if gcloud run jobs describe "$JOB_NAME" --region="$REGION" &>/dev/null; then
        echo "  Updating existing job..."
        gcloud run jobs update "$JOB_NAME" \
            --region="$REGION" \
            --image="gcr.io/${PROJECT_ID}/cloudact-api-service-${ENV}:latest" \
            --command="python" \
            --args="$SCRIPT_PATH" \
            --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},ENVIRONMENT=${ENV}" \
            --set-secrets="CA_ROOT_API_KEY=ca-root-api-key-${ENV}:latest" \
            --service-account="$SERVICE_ACCOUNT" \
            --task-timeout="$TIMEOUT" \
            --memory="$MEMORY" \
            --cpu="$CPU" \
            --max-retries=1 \
            --quiet
    else
        echo "  Creating new job..."
        gcloud run jobs create "$JOB_NAME" \
            --region="$REGION" \
            --image="gcr.io/${PROJECT_ID}/cloudact-api-service-${ENV}:latest" \
            --command="python" \
            --args="$SCRIPT_PATH" \
            --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},ENVIRONMENT=${ENV}" \
            --set-secrets="CA_ROOT_API_KEY=ca-root-api-key-${ENV}:latest" \
            --service-account="$SERVICE_ACCOUNT" \
            --task-timeout="$TIMEOUT" \
            --memory="$MEMORY" \
            --cpu="$CPU" \
            --max-retries=1 \
            --quiet
    fi

    echo -e "${GREEN}  ✓ Job created: $JOB_NAME${NC}"
}

create_scheduler() {
    local SCHEDULER_NAME="$1"
    local JOB_NAME="$2"
    local SCHEDULE="$3"
    local DESCRIPTION="$4"

    echo ""
    echo -e "${YELLOW}Creating scheduler: $SCHEDULER_NAME${NC}"

    # Delete existing scheduler if exists
    if gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" &>/dev/null; then
        gcloud scheduler jobs delete "$SCHEDULER_NAME" --location="$REGION" --quiet
    fi

    gcloud scheduler jobs create http "$SCHEDULER_NAME" \
        --location="$REGION" \
        --schedule="$SCHEDULE" \
        --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
        --http-method=POST \
        --oauth-service-account-email="$SERVICE_ACCOUNT" \
        --description="$DESCRIPTION" \
        --time-zone="UTC" \
        --quiet

    echo -e "${GREEN}  ✓ Scheduler created: $SCHEDULER_NAME${NC}"
}

# =============================================================================
# Create Manual Jobs (No Scheduler)
# =============================================================================

echo ""
echo "============================================================"
echo -e "${BLUE}Creating Manual Jobs${NC}"
echo "============================================================"

# Bootstrap job
create_job "cloudact-bootstrap" \
    "05-scheduler-jobs/jobs/bootstrap.py" \
    "30m" \
    "4Gi" \
    "2"

# Bootstrap sync job
create_job "cloudact-bootstrap-sync" \
    "05-scheduler-jobs/jobs/bootstrap_sync.py" \
    "30m" \
    "4Gi" \
    "2"

# Org sync all job
create_job "cloudact-org-sync-all" \
    "05-scheduler-jobs/jobs/org_sync_all.py" \
    "60m" \
    "4Gi" \
    "2"

# =============================================================================
# Create Scheduled Jobs
# =============================================================================

echo ""
echo "============================================================"
echo -e "${BLUE}Creating Scheduled Jobs${NC}"
echo "============================================================"

# Daily quota reset (00:00 UTC)
create_job "cloudact-quota-reset-daily" \
    "05-scheduler-jobs/jobs/quota_reset_daily.py" \
    "15m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-quota-reset-daily-trigger" \
    "cloudact-quota-reset-daily" \
    "0 0 * * *" \
    "Reset daily pipeline quotas at midnight UTC"

# Monthly quota reset (00:05 UTC on 1st)
create_job "cloudact-quota-reset-monthly" \
    "05-scheduler-jobs/jobs/quota_reset_monthly.py" \
    "15m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-quota-reset-monthly-trigger" \
    "cloudact-quota-reset-monthly" \
    "5 0 1 * *" \
    "Reset monthly pipeline quotas on 1st of month"

# Stale cleanup (every 15 minutes)
create_job "cloudact-stale-cleanup" \
    "05-scheduler-jobs/jobs/stale_cleanup.py" \
    "10m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-stale-cleanup-trigger" \
    "cloudact-stale-cleanup" \
    "*/15 * * * *" \
    "Fix stuck concurrent pipeline counters"

# Quota cleanup (01:00 UTC daily)
create_job "cloudact-quota-cleanup" \
    "05-scheduler-jobs/jobs/quota_cleanup.py" \
    "30m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-quota-cleanup-trigger" \
    "cloudact-quota-cleanup" \
    "0 1 * * *" \
    "Delete quota records older than 90 days"

# Billing sync retry (every 5 minutes)
create_job "cloudact-billing-sync-retry" \
    "05-scheduler-jobs/jobs/billing_sync.py,retry" \
    "10m" \
    "1Gi" \
    "1"

create_scheduler "cloudact-billing-sync-retry-trigger" \
    "cloudact-billing-sync-retry" \
    "*/5 * * * *" \
    "Process pending billing sync queue items"

# Billing sync reconcile (02:00 UTC daily)
create_job "cloudact-billing-sync-reconcile" \
    "05-scheduler-jobs/jobs/billing_sync.py,reconcile" \
    "30m" \
    "2Gi" \
    "1"

create_scheduler "cloudact-billing-sync-reconcile-trigger" \
    "cloudact-billing-sync-reconcile" \
    "0 2 * * *" \
    "Full Stripe to BigQuery reconciliation"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "============================================================"
echo -e "${GREEN}✓ All jobs created successfully!${NC}"
echo "============================================================"
echo ""
echo "Manual Jobs (run with ./run-job.sh):"
echo "  - cloudact-bootstrap"
echo "  - cloudact-bootstrap-sync"
echo "  - cloudact-org-sync-all"
echo ""
echo "Scheduled Jobs:"
echo "  - cloudact-quota-reset-daily     (00:00 UTC daily)"
echo "  - cloudact-quota-reset-monthly   (00:05 UTC 1st of month)"
echo "  - cloudact-stale-cleanup         (every 15 minutes)"
echo "  - cloudact-quota-cleanup         (01:00 UTC daily)"
echo "  - cloudact-billing-sync-retry    (every 5 minutes)"
echo "  - cloudact-billing-sync-reconcile (02:00 UTC daily)"
echo ""
echo "View jobs:  ./list-jobs.sh $ENV"
echo "Run job:    ./run-job.sh $ENV <job-name>"
echo "============================================================"
