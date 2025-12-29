#!/bin/bash
################################################################################
# validate-env.sh - Validate environment variables before deployment
# Usage: ./validate-env.sh <environment> <service>
# Environments: test, stage, prod
# Services: api-service, pipeline-service, frontend
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./validate-env.sh <environment> <service>${NC}"
    echo "Environments: test, stage, prod"
    echo "Services: api-service, pipeline-service, frontend"
    exit 1
fi

ENV=$1
SERVICE=$2
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Required environment variables by service
FRONTEND_REQUIRED=(
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
    "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID"
    "NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID"
    "NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID"
    "NEXT_PUBLIC_APP_URL"
    "NEXT_PUBLIC_API_SERVICE_URL"
    "NEXT_PUBLIC_PIPELINE_SERVICE_URL"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "SUPABASE_SERVICE_ROLE_KEY"
    "CA_ROOT_API_KEY"
)

BACKEND_REQUIRED=(
    "GCP_PROJECT_ID"
    "BIGQUERY_LOCATION"
    "CA_ROOT_API_KEY"
)

# Required secrets by service
FRONTEND_SECRETS=(
    "ca-root-api-key"
    "stripe-secret-key"
    "stripe-webhook-secret"
    "supabase-service-role-key"
)

BACKEND_SECRETS=(
    "ca-root-api-key"
)

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
echo -e "${BLUE}  Validating: ${SERVICE} for ${ENV}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Function to check if value looks like a placeholder
is_placeholder() {
    local value=$1
    [[ "$value" =~ ^(your-|YOUR_|xxx|XXX|placeholder|PLACEHOLDER|TODO|todo|changeme|CHANGEME) ]]
}

# Function to validate Stripe keys
validate_stripe_key() {
    local key=$1
    local key_type=$2

    case $key_type in
        publishable)
            if [[ "$ENV" == "prod" ]]; then
                [[ "$key" =~ ^pk_live_ ]] && return 0
                echo -e "${RED}  ✗ Stripe publishable key must be LIVE (pk_live_*) for prod${NC}"
                return 1
            else
                [[ "$key" =~ ^pk_test_ ]] && return 0
                [[ "$key" =~ ^pk_live_ ]] && { echo -e "${YELLOW}  ! Using LIVE Stripe key in ${ENV} (not recommended)${NC}"; WARNINGS=$((WARNINGS+1)); return 0; }
                return 1
            fi
            ;;
        secret)
            if [[ "$ENV" == "prod" ]]; then
                [[ "$key" =~ ^sk_live_ ]] && return 0
                echo -e "${RED}  ✗ Stripe secret key must be LIVE (sk_live_*) for prod${NC}"
                return 1
            else
                [[ "$key" =~ ^sk_test_ ]] && return 0
                [[ "$key" =~ ^sk_live_ ]] && { echo -e "${YELLOW}  ! Using LIVE Stripe secret key in ${ENV} (not recommended)${NC}"; WARNINGS=$((WARNINGS+1)); return 0; }
                return 1
            fi
            ;;
        webhook)
            [[ "$key" =~ ^whsec_ ]] && return 0
            return 1
            ;;
        price)
            [[ "$key" =~ ^price_ ]] && return 0
            return 1
            ;;
    esac
    return 1
}

# Function to validate Supabase URL
validate_supabase_url() {
    local url=$1
    [[ "$url" =~ ^https://[a-z]+\.supabase\.co$ ]] && return 0
    return 1
}

# Validate env file exists and check variables
validate_env_file() {
    local file=$1
    shift
    local vars=("$@")

    if [ ! -f "$file" ]; then
        echo -e "${RED}  ✗ Environment file not found: $file${NC}"
        ERRORS=$((ERRORS+1))
        return
    fi

    echo -e "${YELLOW}Checking env file: $file${NC}"

    for var in "${vars[@]}"; do
        local value=$(grep "^${var}=" "$file" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")

        if [ -z "$value" ]; then
            echo -e "${RED}  ✗ ${var} is missing or empty${NC}"
            ERRORS=$((ERRORS+1))
            continue
        fi

        if is_placeholder "$value"; then
            echo -e "${RED}  ✗ ${var} appears to be a placeholder${NC}"
            ERRORS=$((ERRORS+1))
            continue
        fi

        # Specific validations
        case $var in
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
                if ! validate_stripe_key "$value" "publishable"; then
                    ERRORS=$((ERRORS+1))
                else
                    echo -e "${GREEN}  ✓ ${var} (${value:0:15}...)${NC}"
                fi
                ;;
            STRIPE_SECRET_KEY)
                if ! validate_stripe_key "$value" "secret"; then
                    ERRORS=$((ERRORS+1))
                else
                    echo -e "${GREEN}  ✓ ${var} (${value:0:15}...)${NC}"
                fi
                ;;
            STRIPE_WEBHOOK_SECRET)
                if ! validate_stripe_key "$value" "webhook"; then
                    echo -e "${RED}  ✗ ${var} invalid format (should start with whsec_)${NC}"
                    ERRORS=$((ERRORS+1))
                else
                    echo -e "${GREEN}  ✓ ${var} (${value:0:10}...)${NC}"
                fi
                ;;
            NEXT_PUBLIC_STRIPE_*_PRICE_ID)
                if ! validate_stripe_key "$value" "price"; then
                    echo -e "${RED}  ✗ ${var} invalid format (should start with price_)${NC}"
                    ERRORS=$((ERRORS+1))
                else
                    echo -e "${GREEN}  ✓ ${var} ($value)${NC}"
                fi
                ;;
            NEXT_PUBLIC_SUPABASE_URL)
                if ! validate_supabase_url "$value"; then
                    echo -e "${YELLOW}  ! ${var} format unusual: $value${NC}"
                    WARNINGS=$((WARNINGS+1))
                else
                    echo -e "${GREEN}  ✓ ${var} ($value)${NC}"
                fi
                ;;
            *KEY*|*SECRET*|*PASSWORD*)
                echo -e "${GREEN}  ✓ ${var} (${value:0:10}...redacted)${NC}"
                ;;
            *)
                echo -e "${GREEN}  ✓ ${var}${NC}"
                ;;
        esac
    done
}

# Validate secrets in Secret Manager
validate_secrets() {
    local secrets=("$@")

    echo ""
    echo -e "${YELLOW}Checking Secret Manager secrets...${NC}"

    # Activate correct service account
    if [ -f "$SA_KEY_FILE" ]; then
        gcloud auth activate-service-account --key-file="$SA_KEY_FILE" 2>/dev/null
        gcloud config set project "$PROJECT_ID" 2>/dev/null
    else
        echo -e "${RED}  ✗ Service account key not found: $SA_KEY_FILE${NC}"
        ERRORS=$((ERRORS+1))
        return
    fi

    EXISTING=$(gcloud secrets list --project=$PROJECT_ID --format="value(name)" 2>/dev/null)

    for secret in "${secrets[@]}"; do
        SECRET_NAME="${secret}-${ENV}"
        if echo "$EXISTING" | grep -q "^${SECRET_NAME}$"; then
            # Check if secret has versions
            VERSION_COUNT=$(gcloud secrets versions list "$SECRET_NAME" --project=$PROJECT_ID --format="value(name)" 2>/dev/null | wc -l | tr -d ' ')
            if [ "$VERSION_COUNT" -gt 0 ]; then
                echo -e "${GREEN}  ✓ ${SECRET_NAME} ($VERSION_COUNT version(s))${NC}"
            else
                echo -e "${RED}  ✗ ${SECRET_NAME} has no versions${NC}"
                ERRORS=$((ERRORS+1))
            fi
        else
            echo -e "${RED}  ✗ ${SECRET_NAME} not found${NC}"
            ERRORS=$((ERRORS+1))
        fi
    done
}

# Select variables and secrets based on service
case $SERVICE in
    frontend)
        REQUIRED_VARS=("${FRONTEND_REQUIRED[@]}")
        REQUIRED_SECRETS=("${FRONTEND_SECRETS[@]}")
        # For frontend, also check .env.production
        if [ "$ENV" == "prod" ]; then
            ENV_FILE="$REPO_ROOT/01-fronted-system/.env.production"
        fi
        ;;
    api-service|pipeline-service)
        REQUIRED_VARS=("${BACKEND_REQUIRED[@]}")
        REQUIRED_SECRETS=("${BACKEND_SECRETS[@]}")
        ;;
    *)
        echo -e "${RED}Error: Service must be api-service, pipeline-service, or frontend${NC}"
        exit 1
        ;;
esac

# Run validations
validate_env_file "$ENV_FILE" "${REQUIRED_VARS[@]}"
validate_secrets "${REQUIRED_SECRETS[@]}"

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Validation passed with $WARNINGS warning(s)${NC}"
    else
        echo -e "${GREEN}✓ All validations passed!${NC}"
    fi
    exit 0
else
    echo -e "${RED}✗ Validation failed with $ERRORS error(s)${NC}"
    echo ""
    echo -e "${YELLOW}Fix the errors above before deploying.${NC}"
    exit 1
fi
