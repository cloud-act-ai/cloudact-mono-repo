#!/bin/bash
# =============================================================================
# Cloud Scheduler Jobs Deployment Script
# =============================================================================
# This script deploys critical maintenance jobs to Google Cloud Scheduler:
# 1. Daily Quota Reset (midnight UTC)
# 2. Orphaned Pipeline Cleanup (every 30 minutes)
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Admin API key generated and stored in environment
# - API deployed and accessible
#
# Usage:
#   export ADMIN_API_KEY="your-admin-key-here"
#   export API_BASE_URL="https://your-api.run.app"
#   ./deployment/deploy-scheduler-jobs.sh
# =============================================================================

set -e  # Exit on error

# =============================================================================
# Configuration
# =============================================================================
PROJECT_ID="${GCP_PROJECT_ID:-gac-prod-471220}"
REGION="${GCP_REGION:-us-central1}"
API_BASE_URL="${API_BASE_URL}"
ADMIN_API_KEY="${ADMIN_API_KEY}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Validation
# =============================================================================
echo "=================================================="
echo "Cloud Scheduler Jobs Deployment"
echo "=================================================="
echo ""

if [ -z "$ADMIN_API_KEY" ]; then
  echo -e "${RED}Error: ADMIN_API_KEY environment variable not set${NC}"
  echo "Please set it with: export ADMIN_API_KEY='your-admin-key-here'"
  exit 1
fi

if [ -z "$API_BASE_URL" ]; then
  echo -e "${RED}Error: API_BASE_URL environment variable not set${NC}"
  echo "Please set it with: export API_BASE_URL='https://your-api.run.app'"
  exit 1
fi

echo "Configuration:"
echo "  Project ID:    $PROJECT_ID"
echo "  Region:        $REGION"
echo "  API Base URL:  $API_BASE_URL"
echo "  Admin Key:     ${ADMIN_API_KEY:0:20}... (masked)"
echo ""

# =============================================================================
# Helper Functions
# =============================================================================
create_or_update_job() {
  local JOB_NAME=$1
  local SCHEDULE=$2
  local URI=$3
  local DEADLINE=$4
  local MAX_RETRIES=$5
  local DESCRIPTION=$6

  echo -e "${YELLOW}Deploying job: $JOB_NAME${NC}"

  # Try to create the job
  if gcloud scheduler jobs create http "$JOB_NAME" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="UTC" \
    --uri="$URI" \
    --http-method=POST \
    --headers="X-Admin-Key=${ADMIN_API_KEY},Content-Type=application/json" \
    --attempt-deadline="$DEADLINE" \
    --max-retry-attempts="$MAX_RETRIES" \
    --description="$DESCRIPTION" 2>/dev/null; then

    echo -e "${GREEN}✓ Job '$JOB_NAME' created successfully${NC}"
  else
    # Job exists, update it
    echo "  Job exists, updating..."
    if gcloud scheduler jobs update http "$JOB_NAME" \
      --project="$PROJECT_ID" \
      --location="$REGION" \
      --schedule="$SCHEDULE" \
      --time-zone="UTC" \
      --uri="$URI" \
      --http-method=POST \
      --headers="X-Admin-Key=${ADMIN_API_KEY},Content-Type=application/json" \
      --attempt-deadline="$DEADLINE" \
      --max-retry-attempts="$MAX_RETRIES" \
      --description="$DESCRIPTION" 2>/dev/null; then

      echo -e "${GREEN}✓ Job '$JOB_NAME' updated successfully${NC}"
    else
      echo -e "${RED}✗ Failed to create/update job '$JOB_NAME'${NC}"
      return 1
    fi
  fi

  echo ""
}

# =============================================================================
# Deploy Jobs
# =============================================================================
echo "Deploying Cloud Scheduler jobs..."
echo ""

# Job 1: Daily Quota Reset
create_or_update_job \
  "reset-daily-quotas" \
  "0 0 * * *" \
  "${API_BASE_URL}/api/v1/scheduler/reset-daily-quotas" \
  "180s" \
  "3" \
  "Reset daily pipeline quotas at midnight UTC"

# Job 2: Orphaned Pipeline Cleanup
create_or_update_job \
  "cleanup-orphaned-pipelines" \
  "*/30 * * * *" \
  "${API_BASE_URL}/api/v1/scheduler/cleanup-orphaned-pipelines" \
  "300s" \
  "2" \
  "Clean up orphaned pipelines every 30 minutes"

# =============================================================================
# Verification
# =============================================================================
echo "=================================================="
echo "Deployment Complete!"
echo "=================================================="
echo ""

echo "Deployed jobs:"
gcloud scheduler jobs list \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --filter="name:(reset-daily-quotas OR cleanup-orphaned-pipelines)" \
  --format="table(name,schedule,state,httpTarget.uri)"

echo ""
echo "=================================================="
echo "Testing & Monitoring"
echo "=================================================="
echo ""
echo "Test jobs manually (optional):"
echo "  gcloud scheduler jobs run reset-daily-quotas --location=$REGION --project=$PROJECT_ID"
echo "  gcloud scheduler jobs run cleanup-orphaned-pipelines --location=$REGION --project=$PROJECT_ID"
echo ""
echo "View job logs:"
echo "  gcloud logging read 'resource.type=cloud_scheduler_job AND resource.labels.job_id=reset-daily-quotas' --limit=10"
echo "  gcloud logging read 'resource.type=cloud_scheduler_job AND resource.labels.job_id=cleanup-orphaned-pipelines' --limit=10"
echo ""
echo "Monitor execution:"
echo "  gcloud scheduler jobs describe reset-daily-quotas --location=$REGION --project=$PROJECT_ID"
echo "  gcloud scheduler jobs describe cleanup-orphaned-pipelines --location=$REGION --project=$PROJECT_ID"
echo ""
echo -e "${GREEN}✓ All jobs deployed successfully!${NC}"
echo ""
