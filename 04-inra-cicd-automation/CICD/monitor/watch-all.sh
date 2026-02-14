#!/bin/bash
################################################################################
# watch-all.sh - Watch Cloud Run logs for all services
# Usage: ./watch-all.sh [test|stage|prod] [limit]
################################################################################

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

ENV=${1:-test}
LIMIT=${2:-20}
PROJECT_ID=${3:-cloudact-testing-1}

SERVICES=("cloudact-api-service-${ENV}" "cloudact-pipeline-service-${ENV}" "cloudact-chat-backend-${ENV}" "cloudact-frontend-${ENV}")

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CloudAct Logs Viewer - Environment: ${ENV}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

for SERVICE in "${SERVICES[@]}"; do
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}📋 ${SERVICE}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE}" \
        --project=$PROJECT_ID \
        --limit=$LIMIT \
        --format="table(timestamp.date('%H:%M:%S'),severity,jsonPayload.msg)" \
        --freshness=10m 2>/dev/null || echo "  No logs found or service not deployed"

    echo ""
done

echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Usage:${NC}"
echo "  ./watch-all.sh test 50        # Last 50 logs from test env"
echo "  ./watch-all.sh prod 100       # Last 100 logs from prod env"
echo ""
echo -e "${YELLOW}For live streaming a single service:${NC}"
echo "  gcloud alpha logging tail \"resource.type=cloud_run_revision AND resource.labels.service_name=cloudact-api-service-${ENV}\" --project=$PROJECT_ID"
