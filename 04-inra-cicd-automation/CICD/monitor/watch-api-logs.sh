#!/bin/bash
################################################################################
# watch-api-logs.sh - Watch Cloud Run logs in real-time
# Usage: ./watch-api-logs.sh [test|stage|prod] [api|pipeline|frontend]
################################################################################

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

ENV=${1:-test}
SERVICE=${2:-api}
PROJECT_ID=${3:-cloudact-testing-1}

# Map service shorthand to full name
case $SERVICE in
    api) SERVICE_NAME="cloudact-api-service-${ENV}" ;;
    pipeline) SERVICE_NAME="cloudact-pipeline-service-${ENV}" ;;
    frontend) SERVICE_NAME="cloudact-frontend-${ENV}" ;;
    *) SERVICE_NAME="cloudact-${SERVICE}-${ENV}" ;;
esac

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Watching logs: ${SERVICE_NAME}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Press Ctrl+C to stop"
echo ""

# Stream logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}" \
    --project=$PROJECT_ID \
    --limit=50 \
    --format="table(timestamp.date('%H:%M:%S'),severity,jsonPayload.msg,jsonPayload.path,jsonPayload.status_code)" \
    --freshness=5m

echo ""
echo -e "${YELLOW}For live streaming, use:${NC}"
echo "gcloud alpha logging tail \"resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}\" --project=$PROJECT_ID"
