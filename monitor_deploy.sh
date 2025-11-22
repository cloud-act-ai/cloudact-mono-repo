#!/bin/bash

################################################################################
# monitor_deploy.sh
#
# Monitor deployment - Check health and recent logs
#
# Usage: ./monitor_deploy.sh [stage|prod]
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./monitor_deploy.sh [stage|prod]"
    exit 1
fi

ENV=$1

if [ "$ENV" = "stage" ]; then
    PROJECT_ID="gac-stage-471220"
    SERVICE_NAME="convergence-pipeline-stage"
    echo -e "${YELLOW}Monitoring STAGING${NC}"
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    SERVICE_NAME="convergence-pipeline-prod"
    echo -e "${YELLOW}Monitoring PRODUCTION${NC}"
else
    echo -e "${RED}Error: Environment must be 'stage' or 'prod'${NC}"
    exit 1
fi

REGION="us-central1"

# Set active project
gcloud config set project $PROJECT_ID

# Get service URL
echo -e "${GREEN}Getting service URL...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --platform=managed \
    --region=$REGION \
    --format="value(status.url)" 2>/dev/null || echo "")

if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}Service URL not found. Deployment might have failed.${NC}"
else
    echo -e "${BLUE}Service URL: $SERVICE_URL${NC}"

    # Check health with retry (2 minutes)
    echo -e "${GREEN}Checking health endpoint (waiting up to 2 mins)...${NC}"

    END_TIME=$((SECONDS + 120))

    while [ $SECONDS -lt $END_TIME ]; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health")
        
        if [ "$HTTP_CODE" == "200" ]; then
            echo -e "${GREEN}Health Check: PASSED (200 OK)${NC}"
            exit 0
        fi
        
        echo -e "${YELLOW}Health Check: $HTTP_CODE - Retrying in 10s...${NC}"
        sleep 10
    done

    echo -e "${RED}Health Check: FAILED (Timed out after 2 mins)${NC}"
fi

# Fetch recent logs
echo -e "${GREEN}Fetching recent error logs (last 1 hour)...${NC}"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME AND severity>=ERROR" \
    --limit=10 \
    --format="table(timestamp,textPayload,protoPayload.status.message)" \
    --project=$PROJECT_ID

echo ""
echo -e "${GREEN}Monitoring check complete.${NC}"
