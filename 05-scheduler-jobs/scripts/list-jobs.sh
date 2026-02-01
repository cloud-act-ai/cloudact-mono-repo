#!/bin/bash
# =============================================================================
# List Cloud Run Jobs
# =============================================================================
# Lists all Cloud Run Jobs and their recent executions.
#
# Usage:
#   ./list-jobs.sh <environment>
#   ./list-jobs.sh prod
#   ./list-jobs.sh test
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

echo "============================================================"
echo -e "${BLUE}CloudAct Cloud Run Jobs${NC}"
echo "============================================================"
echo "Environment:  $ENV"
echo "Project:      $PROJECT_ID"
echo "Region:       $REGION"
echo "============================================================"
echo ""

# Set project
gcloud config set project "$PROJECT_ID" --quiet

# List jobs
echo -e "${CYAN}Cloud Run Jobs:${NC}"
echo "------------------------------------------------------------"
gcloud run jobs list \
    --region="$REGION" \
    --format="table(name,status.conditions[0].status:label=READY,status.latestCreatedExecution.name:label=LAST_EXECUTION)" \
    2>/dev/null || echo "  (no jobs found)"

echo ""

# List schedulers
echo -e "${CYAN}Cloud Scheduler Triggers:${NC}"
echo "------------------------------------------------------------"
gcloud scheduler jobs list \
    --location="$REGION" \
    --format="table(name,schedule,state,lastAttemptTime.date():label=LAST_RUN)" \
    2>/dev/null | grep -E "^cloudact|^NAME" || echo "  (no schedulers found)"

echo ""

# Recent executions
echo -e "${CYAN}Recent Executions (last 10):${NC}"
echo "------------------------------------------------------------"

# Get all cloudact jobs
JOBS=$(gcloud run jobs list --region="$REGION" --format="value(name)" 2>/dev/null | grep "^cloudact" || true)

if [[ -z "$JOBS" ]]; then
    echo "  (no jobs found)"
else
    for job in $JOBS; do
        echo ""
        echo -e "${YELLOW}$job:${NC}"
        gcloud run jobs executions list \
            --job="$job" \
            --region="$REGION" \
            --limit=3 \
            --format="table(name,status.conditions[0].type:label=STATUS,createTime.date():label=CREATED)" \
            2>/dev/null | tail -n +2 | head -3 || echo "    (no executions)"
    done
fi

echo ""
echo "============================================================"
echo "Commands:"
echo "  Run job:     ./run-job.sh $ENV <job-name>"
echo "  View logs:   gcloud logging read 'resource.type=cloud_run_job' --limit=50"
echo "============================================================"
