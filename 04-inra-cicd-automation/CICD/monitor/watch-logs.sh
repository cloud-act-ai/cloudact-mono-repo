#!/bin/bash
################################################################################
# watch-logs.sh - Monitor Cloud Run logs for errors
# Usage: ./watch-logs.sh <environment> <project-id> [duration-minutes]
# Environments: test, stage, prod
# Default duration: 30 minutes
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./watch-logs.sh <environment> <project-id> [duration-minutes]${NC}"
    echo ""
    echo "Environments: test, stage, prod"
    echo "Default duration: 30 minutes"
    echo ""
    echo "Examples:"
    echo "  ./watch-logs.sh test cloudact-testing-1"
    echo "  ./watch-logs.sh prod cloudact-prod 60"
    exit 1
fi

ENV=$1
PROJECT_ID=$2
DURATION_MINUTES=${3:-30}
REGION="us-central1"

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

# Services to monitor
SERVICE1="cloudact-api-service-${ENV}"
SERVICE2="cloudact-pipeline-service-${ENV}"
SERVICE3="cloudact-frontend-${ENV}"

# Calculate end time
END_TIME=$(($(date +%s) + (DURATION_MINUTES * 60)))

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Cloud Run Log Monitor${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Environment: $ENV"
echo "Duration: ${DURATION_MINUTES} minutes"
echo "Monitoring services:"
echo "  - $SERVICE1"
echo "  - $SERVICE2"
echo "  - $SERVICE3"
echo ""
echo "Started at: $(date)"
echo "Will run until: $(date -r $END_TIME 2>/dev/null || date -d @$END_TIME 2>/dev/null || echo "in $DURATION_MINUTES minutes")"
echo ""
echo -e "${YELLOW}Watching for errors (press Ctrl+C to stop)...${NC}"
echo ""

# Create log file
LOG_FILE="/tmp/cloudrun-monitor-${ENV}-$(date +%Y%m%d-%H%M%S).log"
echo "Logs saved to: $LOG_FILE"
echo ""

# Error counters
ERROR_COUNT_S1=0
ERROR_COUNT_S2=0
ERROR_COUNT_S3=0
CHECK_COUNT=0

# Function to check logs for a service using gcloud logging
check_service_logs() {
    local service=$1

    # Use gcloud logging read to get recent errors
    local filter="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$service\" AND severity>=ERROR AND timestamp>=\"$(date -u -v-30S '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '30 seconds ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo '')\""

    local errors=$(gcloud logging read "$filter" \
        --project="$PROJECT_ID" \
        --limit=10 \
        --format="value(textPayload)" \
        2>/dev/null || true)

    if [ -n "$errors" ] && [ "$errors" != "" ]; then
        echo -e "${RED}[$(date '+%H:%M:%S')] ERRORS in $service:${NC}"
        echo "$errors" | head -5
        echo ""
        echo "[$(date '+%H:%M:%S')] $service errors:" >> "$LOG_FILE"
        echo "$errors" >> "$LOG_FILE"
        echo "" >> "$LOG_FILE"
        return 1
    fi
    return 0
}

# Main monitoring loop
while [ $(date +%s) -lt $END_TIME ]; do
    REMAINING=$(( (END_TIME - $(date +%s)) / 60 ))
    CHECK_COUNT=$((CHECK_COUNT + 1))

    # Check each service
    if ! check_service_logs "$SERVICE1"; then
        ERROR_COUNT_S1=$((ERROR_COUNT_S1 + 1))
    fi

    if ! check_service_logs "$SERVICE2"; then
        ERROR_COUNT_S2=$((ERROR_COUNT_S2 + 1))
    fi

    if ! check_service_logs "$SERVICE3"; then
        ERROR_COUNT_S3=$((ERROR_COUNT_S3 + 1))
    fi

    # Status update every 6 checks (~1 minute)
    if [ $((CHECK_COUNT % 6)) -eq 0 ]; then
        echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ All services checked. ${REMAINING} minutes remaining.${NC}"
    fi

    # Wait before next check
    sleep 10
done

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Monitoring Complete - Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Finished at: $(date)"
echo "Total checks performed: $CHECK_COUNT"
echo ""

TOTAL_ERRORS=$((ERROR_COUNT_S1 + ERROR_COUNT_S2 + ERROR_COUNT_S3))

if [ "$ERROR_COUNT_S1" -gt 0 ]; then
    echo -e "${RED}$SERVICE1: $ERROR_COUNT_S1 error occurrences${NC}"
else
    echo -e "${GREEN}$SERVICE1: No errors${NC}"
fi

if [ "$ERROR_COUNT_S2" -gt 0 ]; then
    echo -e "${RED}$SERVICE2: $ERROR_COUNT_S2 error occurrences${NC}"
else
    echo -e "${GREEN}$SERVICE2: No errors${NC}"
fi

if [ "$ERROR_COUNT_S3" -gt 0 ]; then
    echo -e "${RED}$SERVICE3: $ERROR_COUNT_S3 error occurrences${NC}"
else
    echo -e "${GREEN}$SERVICE3: No errors${NC}"
fi

echo ""
if [ $TOTAL_ERRORS -gt 0 ]; then
    echo -e "${RED}Total error occurrences: $TOTAL_ERRORS${NC}"
    echo "See detailed logs: $LOG_FILE"
    exit 1
else
    echo -e "${GREEN}✓ No errors detected during monitoring period${NC}"
    exit 0
fi
