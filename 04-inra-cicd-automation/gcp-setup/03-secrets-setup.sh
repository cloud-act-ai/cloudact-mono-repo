#!/bin/bash
################################################################################
# 03-secrets-setup.sh - Setup Secret Manager secrets
# Usage: ./03-secrets-setup.sh <project-id> <environment>
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./03-secrets-setup.sh <project-id> <environment>${NC}"
    echo "Environments: test, stage, prod"
    exit 1
fi

PROJECT_ID=$1
ENV=$2

if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

echo -e "${YELLOW}Setting up secrets for project: $PROJECT_ID ($ENV)${NC}"
gcloud config set project $PROJECT_ID

# Required secrets for CloudAct
SECRETS=(
    "ca-root-api-key-${ENV}"
    "supabase-url-${ENV}"
    "supabase-anon-key-${ENV}"
    "supabase-service-key-${ENV}"
    "stripe-secret-key-${ENV}"
    "stripe-webhook-secret-${ENV}"
)

echo -e "${YELLOW}Creating secrets (empty placeholders)...${NC}"
for secret in "${SECRETS[@]}"; do
    echo -n "Creating $secret... "
    if gcloud secrets create $secret \
        --replication-policy="automatic" \
        --project=$PROJECT_ID 2>/dev/null; then
        echo -e "${GREEN}✓ Created${NC}"
    else
        echo -e "${YELLOW}Already exists${NC}"
    fi
done

echo ""
echo -e "${GREEN}Secrets created!${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: You must add secret values manually:${NC}"
for secret in "${SECRETS[@]}"; do
    echo "  gcloud secrets versions add $secret --data-file=- <<< 'YOUR_VALUE'"
done
echo ""
echo "Next: Run 04-iam-setup.sh"
