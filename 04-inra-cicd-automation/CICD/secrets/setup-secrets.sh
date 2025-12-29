#!/bin/bash
################################################################################
# setup-secrets.sh - Setup Secret Manager secrets for CloudAct
# Usage: ./setup-secrets.sh <environment>
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 1 ]; then
    echo -e "${RED}Usage: ./setup-secrets.sh <environment>${NC}"
    echo "Environments: test, stage, prod"
    exit 1
fi

ENV=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Environment configuration
case $ENV in
    test)
        PROJECT_ID="cloudact-testing-1"
        SA_KEY_FILE="$HOME/.gcp/cloudact-testing-1-e44da390bf82.json"
        ENV_FILE="$REPO_ROOT/01-fronted-system/.env.test"
        ;;
    stage)
        PROJECT_ID="cloudact-stage"
        SA_KEY_FILE="$HOME/.gcp/cloudact-stage.json"
        ENV_FILE="$REPO_ROOT/01-fronted-system/.env.stage"
        ;;
    prod)
        PROJECT_ID="cloudact-prod"
        SA_KEY_FILE="$HOME/.gcp/cloudact-prod.json"
        ENV_FILE="$REPO_ROOT/01-fronted-system/.env.prod"
        ;;
    *)
        echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Setting up secrets for: ${ENV}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Env file: $ENV_FILE"
echo ""

# Activate service account
if [ -f "$SA_KEY_FILE" ]; then
    echo -e "${YELLOW}Activating service account...${NC}"
    gcloud auth activate-service-account --key-file="$SA_KEY_FILE"
    gcloud config set project "$PROJECT_ID"
else
    echo -e "${RED}Error: Service account key not found: $SA_KEY_FILE${NC}"
    exit 1
fi

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: Environment file not found: $ENV_FILE${NC}"
    exit 1
fi

# Function to create or update secret
create_or_update_secret() {
    local SECRET_NAME=$1
    local SECRET_VALUE=$2

    if [ -z "$SECRET_VALUE" ]; then
        echo -e "${YELLOW}  ⚠ Skipping $SECRET_NAME (empty value)${NC}"
        return
    fi

    # Check if secret exists
    if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
        echo -e "${YELLOW}  → Updating $SECRET_NAME${NC}"
        echo -n "$SECRET_VALUE" | gcloud secrets versions add "$SECRET_NAME" --project="$PROJECT_ID" --data-file=- --quiet
    else
        echo -e "${GREEN}  + Creating $SECRET_NAME${NC}"
        echo -n "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" --project="$PROJECT_ID" --data-file=- --replication-policy="automatic" --quiet
    fi
}

# Function to grant secret access to service account
grant_secret_access() {
    local SECRET_NAME=$1
    local SA_EMAIL="cloudact-sa-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com"

    echo -e "${YELLOW}  → Granting access to $SA_EMAIL${NC}"
    gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
        --project="$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet 2>/dev/null || true
}

# Extract values from env file
extract_env_value() {
    local KEY=$1
    grep "^${KEY}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'"
}

echo -e "${BLUE}Extracting secrets from env file...${NC}"
CA_ROOT_API_KEY=$(extract_env_value "CA_ROOT_API_KEY")
STRIPE_SECRET_KEY=$(extract_env_value "STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET=$(extract_env_value "STRIPE_WEBHOOK_SECRET")
SUPABASE_SERVICE_ROLE_KEY=$(extract_env_value "SUPABASE_SERVICE_ROLE_KEY")

echo ""
echo -e "${BLUE}Creating/updating secrets...${NC}"

# Required secrets for all services
create_or_update_secret "ca-root-api-key-${ENV}" "$CA_ROOT_API_KEY"
grant_secret_access "ca-root-api-key-${ENV}"

# Frontend-specific secrets
create_or_update_secret "stripe-secret-key-${ENV}" "$STRIPE_SECRET_KEY"
grant_secret_access "stripe-secret-key-${ENV}"

create_or_update_secret "stripe-webhook-secret-${ENV}" "$STRIPE_WEBHOOK_SECRET"
grant_secret_access "stripe-webhook-secret-${ENV}"

create_or_update_secret "supabase-service-role-key-${ENV}" "$SUPABASE_SERVICE_ROLE_KEY"
grant_secret_access "supabase-service-role-key-${ENV}"

echo ""
echo -e "${GREEN}✓ Secrets setup complete for ${ENV}${NC}"
echo ""

# List all secrets
echo -e "${BLUE}Current secrets in ${PROJECT_ID}:${NC}"
gcloud secrets list --project="$PROJECT_ID" --format="table(name,createTime)"
