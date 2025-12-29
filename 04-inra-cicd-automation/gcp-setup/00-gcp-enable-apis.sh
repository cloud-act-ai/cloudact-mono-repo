#!/bin/bash
################################################################################
# 00-gcp-enable-apis.sh - Enable required GCP APIs
# Usage: ./00-gcp-enable-apis.sh <project-id>
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ "$#" -lt 1 ]; then
    echo -e "${RED}Usage: ./00-gcp-enable-apis.sh <project-id>${NC}"
    exit 1
fi

PROJECT_ID=$1

echo -e "${YELLOW}Enabling GCP APIs for project: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

APIS=(
    "run.googleapis.com"
    "cloudbuild.googleapis.com"
    "artifactregistry.googleapis.com"
    "bigquery.googleapis.com"
    "bigquerystorage.googleapis.com"
    "cloudkms.googleapis.com"
    "secretmanager.googleapis.com"
    "iam.googleapis.com"
    "iamcredentials.googleapis.com"
    "logging.googleapis.com"
    "monitoring.googleapis.com"
    "cloudscheduler.googleapis.com"
    "serviceusage.googleapis.com"
)

for api in "${APIS[@]}"; do
    echo -n "Enabling $api... "
    if gcloud services enable $api --project=$PROJECT_ID 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
    fi
done

echo -e "${GREEN}API enablement complete!${NC}"
echo "Next: Run 01-setup-cloud-build.sh"
