#!/bin/bash
################################################################################
# verify-secrets.sh - Verify Secret Manager secrets for CloudAct
# Usage: ./verify-secrets.sh [environment]
################################################################################

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# Required secrets for each service
FRONTEND_SECRETS="ca-root-api-key stripe-secret-key stripe-webhook-secret supabase-service-role-key smtp-password"
BACKEND_SECRETS="ca-root-api-key supabase-service-role-key smtp-password"

check_env() {
    local ENV=$1
    local PROJECT_ID=$2
    local SA_KEY_FILE=$3

    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Environment: ${ENV} (${PROJECT_ID})${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Activate correct service account
    if [ -f "$SA_KEY_FILE" ]; then
        gcloud auth activate-service-account --key-file="$SA_KEY_FILE" 2>/dev/null
        gcloud config set project "$PROJECT_ID" 2>/dev/null
    fi

    # Get existing secrets
    EXISTING=$(gcloud secrets list --project=$PROJECT_ID --format="value(name)" 2>/dev/null)

    echo -e "${YELLOW}Frontend Secrets:${NC}"
    for secret in $FRONTEND_SECRETS; do
        SECRET_NAME="${secret}-${ENV}"
        if echo "$EXISTING" | grep -q "^${SECRET_NAME}$"; then
            echo -e "  ${GREEN}✓${NC} $SECRET_NAME"
        else
            echo -e "  ${RED}✗${NC} $SECRET_NAME ${RED}(MISSING)${NC}"
        fi
    done

    echo ""
    echo -e "${YELLOW}Backend Secrets:${NC}"
    for secret in $BACKEND_SECRETS; do
        SECRET_NAME="${secret}-${ENV}"
        if echo "$EXISTING" | grep -q "^${SECRET_NAME}$"; then
            echo -e "  ${GREEN}✓${NC} $SECRET_NAME"
        else
            echo -e "  ${RED}✗${NC} $SECRET_NAME ${RED}(MISSING)${NC}"
        fi
    done
    echo ""
}

if [ -n "$1" ]; then
    # Check specific environment
    case $1 in
        test) check_env "test" "cloudact-testing-1" "$HOME/.gcp/cloudact-testing-1-e44da390bf82.json" ;;
        stage) check_env "stage" "cloudact-stage" "$HOME/.gcp/cloudact-stage.json" ;;
        prod) check_env "prod" "cloudact-prod" "$HOME/.gcp/cloudact-prod.json" ;;
        *) echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"; exit 1 ;;
    esac
else
    # Check all environments
    check_env "test" "cloudact-testing-1" "$HOME/.gcp/cloudact-testing-1-e44da390bf82.json"
    check_env "stage" "cloudact-testing-1" "$HOME/.gcp/cloudact-testing-1-e44da390bf82.json"
    check_env "prod" "cloudact-prod" "$HOME/.gcp/cloudact-prod.json"
fi
