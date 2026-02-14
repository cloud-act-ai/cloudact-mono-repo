#!/bin/bash
################################################################################
# status.sh - Check status of all services across environments
# Usage: ./status.sh [environment]
################################################################################

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../environments.conf" 2>/dev/null || {
    # Inline config if source fails
    get_project_id() {
        case $1 in
            test)  echo "cloudact-testing-1" ;;
            stage) echo "cloudact-stage" ;;
            prod)  echo "cloudact-prod" ;;
        esac
    }
    SERVICES=("api-service" "pipeline-service" "chat-backend" "frontend")
    REGION="us-central1"
}

check_environment() {
    local env=$1
    local project_id=$(get_project_id $env)

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Environment: ${env^^} (${project_id})${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    for service in "${SERVICES[@]}"; do
        SERVICE_NAME="cloudact-${service}-${env}"

        # Get service info
        INFO=$(gcloud run services describe $SERVICE_NAME \
            --project=$project_id \
            --region=$REGION \
            --format="json" 2>/dev/null)

        if [ -z "$INFO" ]; then
            echo -e "  ${service}: ${RED}NOT DEPLOYED${NC}"
            continue
        fi

        URL=$(echo $INFO | jq -r '.status.url // "N/A"')
        READY=$(echo $INFO | jq -r '.status.conditions[] | select(.type=="Ready") | .status' 2>/dev/null || echo "Unknown")
        IMAGE=$(echo $INFO | jq -r '.spec.template.spec.containers[0].image // "N/A"' | sed 's/.*://')

        # Health check
        HEALTH_STATUS="${YELLOW}?${NC}"
        if [ "$URL" != "N/A" ]; then
            if curl -sf "${URL}/health" > /dev/null 2>&1; then
                HEALTH_STATUS="${GREEN}✓${NC}"
            else
                HEALTH_STATUS="${RED}✗${NC}"
            fi
        fi

        # Status color
        STATUS_COLOR=$RED
        [ "$READY" == "True" ] && STATUS_COLOR=$GREEN

        echo -e "  ${service}:"
        echo -e "    Status:  ${STATUS_COLOR}${READY}${NC}  Health: ${HEALTH_STATUS}"
        echo -e "    Image:   ${IMAGE}"
        echo -e "    URL:     ${URL}"
        echo ""
    done
}

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CloudAct Service Status${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$1" ]; then
    # Check specific environment
    check_environment $1
else
    # Check all environments
    for env in test stage prod; do
        check_environment $env
    done
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "Checked at: $(date)"
echo ""
