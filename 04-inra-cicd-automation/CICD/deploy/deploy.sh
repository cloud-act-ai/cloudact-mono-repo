#!/bin/bash
################################################################################
# deploy.sh - Deploy to Cloud Run
# Usage: ./deploy.sh <service> <environment> <project-id> [image-tag]
# Services: api-service, pipeline-service, frontend
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 3 ]; then
    echo -e "${RED}Usage: ./deploy.sh <service> <environment> <project-id> [image-tag]${NC}"
    echo ""
    echo "Services: api-service, pipeline-service, frontend"
    echo "Environments: test, stage, prod"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh api-service test cloudact-testing-1"
    echo "  ./deploy.sh pipeline-service stage cloudact-prod latest"
    exit 1
fi

SERVICE=$1
ENV=$2
PROJECT_ID=$3
IMAGE_TAG=${4:-"${ENV}-latest"}
REGION="us-central1"

# Service configuration
case $SERVICE in
    api-service)
        PORT=8000
        MEMORY="8Gi"
        CPU=2
        TIMEOUT=300
        MAX_INSTANCES=10
        ;;
    pipeline-service)
        PORT=8001
        MEMORY="8Gi"
        CPU=2
        TIMEOUT=300
        MAX_INSTANCES=10
        ;;
    frontend)
        PORT=3000
        MEMORY="8Gi"
        CPU=2
        TIMEOUT=60
        MAX_INSTANCES=20
        ;;
    *)
        echo -e "${RED}Error: Invalid service. Use: api-service, pipeline-service, frontend${NC}"
        exit 1
        ;;
esac

# Environment-specific min instances (prod ramps up, stage/test minimal)
case $ENV in
    prod)
        MIN_INSTANCES=2
        ;;
    stage)
        MIN_INSTANCES=1
        ;;
    test)
        MIN_INSTANCES=0
        ;;
esac

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

# Cloud Run service name and image
SERVICE_NAME="cloudact-${SERVICE}-${ENV}"
# Use GCR (Google Container Registry)
IMAGE="gcr.io/${PROJECT_ID}/cloudact-${SERVICE}-${ENV}:${IMAGE_TAG}"
SA_EMAIL="cloudact-sa-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com"

# KMS Configuration
KMS_PROJECT_ID="${PROJECT_ID}"
KMS_LOCATION="us-central1"
KMS_KEYRING="cloudact-keyring"
KMS_KEY="api-key-encryption"

# Environment-specific settings
# NOTE: All environments use --allow-unauthenticated because the API handles
# its own authentication via X-CA-Root-Key and X-API-Key headers.
# Cloud Run IAM auth is NOT used - app-level auth is enforced instead.
case $ENV in
    test)
        ALLOW_UNAUTH="--allow-unauthenticated"
        ENV_NAME="development"
        ;;
    stage)
        ALLOW_UNAUTH="--allow-unauthenticated"
        ENV_NAME="staging"
        ;;
    prod)
        ALLOW_UNAUTH="--allow-unauthenticated"
        ENV_NAME="production"
        ;;
esac

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deploying: $SERVICE_NAME${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Image: $IMAGE"
echo "Service Account: $SA_EMAIL"
echo "Environment: $ENV_NAME"
echo ""

# Set active project
gcloud config set project $PROJECT_ID

# Build environment variables based on service type
COMMON_ENV_VARS="GCP_PROJECT_ID=${PROJECT_ID},BIGQUERY_LOCATION=US,ENVIRONMENT=${ENV_NAME}"

if [ "$SERVICE" = "frontend" ]; then
    # Frontend needs API URLs and app configuration
    # Get URLs dynamically from existing Cloud Run services
    API_URL=$(gcloud run services describe cloudact-api-service-${ENV} --project=$PROJECT_ID --region=$REGION --format="value(status.url)" 2>/dev/null || echo "")
    PIPELINE_URL=$(gcloud run services describe cloudact-pipeline-service-${ENV} --project=$PROJECT_ID --region=$REGION --format="value(status.url)" 2>/dev/null || echo "")
    APP_URL=$(gcloud run services describe cloudact-frontend-${ENV} --project=$PROJECT_ID --region=$REGION --format="value(status.url)" 2>/dev/null || echo "")

    # Fallback to service name pattern if not found
    [ -z "$API_URL" ] && API_URL="https://cloudact-api-service-${ENV}-${PROJECT_ID}.${REGION}.run.app"
    [ -z "$PIPELINE_URL" ] && PIPELINE_URL="https://cloudact-pipeline-service-${ENV}-${PROJECT_ID}.${REGION}.run.app"
    [ -z "$APP_URL" ] && APP_URL="https://cloudact-frontend-${ENV}-${PROJECT_ID}.${REGION}.run.app"

    # Load environment-specific configuration
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ENV_VARS_CONF="$SCRIPT_DIR/../secrets/env-vars.conf"
    if [ -f "$ENV_VARS_CONF" ]; then
        source "$ENV_VARS_CONF"
    fi

    # Get environment-specific Supabase/Stripe config
    ENV_UPPER=$(echo "$ENV" | tr '[:lower:]' '[:upper:]')
    SUPABASE_URL_VAR="${ENV_UPPER}_SUPABASE_URL"
    SUPABASE_ANON_KEY_VAR="${ENV_UPPER}_SUPABASE_ANON_KEY"
    STRIPE_PUB_KEY_VAR="${ENV_UPPER}_STRIPE_PUBLISHABLE_KEY"
    STRIPE_STARTER_VAR="${ENV_UPPER}_STRIPE_STARTER_PRICE_ID"
    STRIPE_PRO_VAR="${ENV_UPPER}_STRIPE_PROFESSIONAL_PRICE_ID"
    STRIPE_SCALE_VAR="${ENV_UPPER}_STRIPE_SCALE_PRICE_ID"

    SUPABASE_URL="${!SUPABASE_URL_VAR}"
    SUPABASE_ANON_KEY="${!SUPABASE_ANON_KEY_VAR}"
    STRIPE_PUB_KEY="${!STRIPE_PUB_KEY_VAR}"
    STRIPE_STARTER="${!STRIPE_STARTER_VAR}"
    STRIPE_PRO="${!STRIPE_PRO_VAR}"
    STRIPE_SCALE="${!STRIPE_SCALE_VAR}"

    echo -e "${YELLOW}Service URLs:${NC}"
    echo "  API: $API_URL"
    echo "  Pipeline: $PIPELINE_URL"
    echo "  App: $APP_URL"
    echo -e "${YELLOW}Supabase:${NC} $SUPABASE_URL"
    echo -e "${YELLOW}Stripe Pub Key:${NC} ${STRIPE_PUB_KEY:0:20}..."

    # Build env vars with Supabase and Stripe public config
    ENV_VARS="${COMMON_ENV_VARS},NEXT_PUBLIC_API_SERVICE_URL=${API_URL},API_SERVICE_URL=${API_URL},NEXT_PUBLIC_PIPELINE_SERVICE_URL=${PIPELINE_URL},PIPELINE_SERVICE_URL=${PIPELINE_URL},NEXT_PUBLIC_APP_URL=${APP_URL},NODE_ENV=production"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL},NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${STRIPE_PUB_KEY}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=${STRIPE_STARTER}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID=${STRIPE_PRO}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=${STRIPE_SCALE}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_DEFAULT_TRIAL_DAYS=14"

    # Frontend needs: CA_ROOT_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
    SECRETS_FLAG="--set-secrets=CA_ROOT_API_KEY=ca-root-api-key-${ENV}:latest,STRIPE_SECRET_KEY=stripe-secret-key-${ENV}:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook-secret-${ENV}:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key-${ENV}:latest"
else
    # Backend services
    # Get pipeline service URL for api-service to proxy requests
    PIPELINE_URL=$(gcloud run services describe cloudact-pipeline-service-${ENV} --project=$PROJECT_ID --region=$REGION --format="value(status.url)" 2>/dev/null || echo "")
    [ -z "$PIPELINE_URL" ] && PIPELINE_URL="https://cloudact-pipeline-service-${ENV}-${PROJECT_ID}.${REGION}.run.app"

    # Get API service URL for pipeline-service to call for validation
    API_URL=$(gcloud run services describe cloudact-api-service-${ENV} --project=$PROJECT_ID --region=$REGION --format="value(status.url)" 2>/dev/null || echo "")
    [ -z "$API_URL" ] && API_URL="https://cloudact-api-service-${ENV}-${PROJECT_ID}.${REGION}.run.app"

    if [ "$SERVICE" = "api-service" ]; then
        # api-service needs pipeline URL for proxying pipeline triggers
        ENV_VARS="${COMMON_ENV_VARS},KMS_PROJECT_ID=${KMS_PROJECT_ID},KMS_LOCATION=${KMS_LOCATION},KMS_KEYRING=${KMS_KEYRING},KMS_KEY=${KMS_KEY},PIPELINE_SERVICE_URL=${PIPELINE_URL}"
        echo -e "${YELLOW}Pipeline Service URL: ${PIPELINE_URL}${NC}"
    elif [ "$SERVICE" = "pipeline-service" ]; then
        # pipeline-service needs api URL for validation calls
        ENV_VARS="${COMMON_ENV_VARS},KMS_PROJECT_ID=${KMS_PROJECT_ID},KMS_LOCATION=${KMS_LOCATION},KMS_KEYRING=${KMS_KEYRING},KMS_KEY=${KMS_KEY},API_SERVICE_URL=${API_URL}"
        echo -e "${YELLOW}API Service URL: ${API_URL}${NC}"
    else
        ENV_VARS="${COMMON_ENV_VARS},KMS_PROJECT_ID=${KMS_PROJECT_ID},KMS_LOCATION=${KMS_LOCATION},KMS_KEYRING=${KMS_KEYRING},KMS_KEY=${KMS_KEY}"
    fi
    SECRETS_FLAG="--set-secrets=CA_ROOT_API_KEY=ca-root-api-key-${ENV}:latest"
fi

# BUG-004 FIX: Validate deployment order before deploying pipeline-service
if [ "$SERVICE" = "pipeline-service" ]; then
    API_EXISTS=$(gcloud run services list --project=$PROJECT_ID --region=$REGION --filter="metadata.name=cloudact-api-service-${ENV}" --format="value(metadata.name)" 2>/dev/null || echo "")

    if [ -z "$API_EXISTS" ]; then
        echo -e "${RED}✗ ERROR: api-service must be deployed before pipeline-service${NC}"
        echo ""
        echo "Reason: pipeline-service requires:"
        echo "  1. API_SERVICE_URL from deployed api-service"
        echo "  2. Stored procedures created by bootstrap (which runs in api-service)"
        echo "  3. BigQuery organizations dataset initialized"
        echo ""
        echo "Fix: Deploy api-service first:"
        echo "  ./deploy.sh api-service $ENV $PROJECT_ID"
        echo ""
        exit 1
    fi

    # Validate API_SERVICE_URL can be retrieved
    if [ -z "$API_URL" ] || [ "$API_URL" = "https://cloudact-api-service-${ENV}-${PROJECT_ID}.${REGION}.run.app" ]; then
        echo -e "${YELLOW}! WARNING: Could not retrieve actual API service URL, using fallback${NC}"
        echo -e "${YELLOW}  This may cause issues if the actual URL contains a random hash${NC}"
        echo ""
    fi
fi

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --project=$PROJECT_ID \
    --image=$IMAGE \
    --platform=managed \
    --region=$REGION \
    $ALLOW_UNAUTH \
    --service-account=$SA_EMAIL \
    --memory=$MEMORY \
    --cpu=$CPU \
    --timeout=$TIMEOUT \
    --min-instances=$MIN_INSTANCES \
    --max-instances=$MAX_INSTANCES \
    --port=$PORT \
    --set-env-vars="$ENV_VARS" \
    $SECRETS_FLAG

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --project=$PROJECT_ID \
    --platform=managed \
    --region=$REGION \
    --format="value(status.url)")

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}Service URL: $SERVICE_URL${NC}"
echo ""

# Health check with version validation
echo -e "${YELLOW}Running health check and version validation...${NC}"

# Wait for service to be ready (max 60 seconds)
MAX_RETRIES=12
RETRY_INTERVAL=5
HEALTH_OK=false

for i in $(seq 1 $MAX_RETRIES); do
    HEALTH_RESPONSE=$(curl -sf "${SERVICE_URL}/health" 2>/dev/null || echo "")
    if [ -n "$HEALTH_RESPONSE" ]; then
        HEALTH_OK=true
        break
    fi
    echo -e "${YELLOW}  Waiting for service... (attempt $i/$MAX_RETRIES)${NC}"
    sleep $RETRY_INTERVAL
done

if [ "$HEALTH_OK" = true ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"

    # Validate deployed version
    DEPLOYED_VERSION=$(echo "$HEALTH_RESPONSE" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' 2>/dev/null || echo "unknown")

    echo ""
    echo -e "${BLUE}Version Validation:${NC}"
    echo "  Expected: $IMAGE_TAG"
    echo "  Deployed: $DEPLOYED_VERSION"

    if [ "$DEPLOYED_VERSION" = "$IMAGE_TAG" ]; then
        echo -e "${GREEN}✓ Version matches - deployment verified!${NC}"
    elif [ "$DEPLOYED_VERSION" = "unknown" ]; then
        echo -e "${YELLOW}! Could not verify version (health endpoint may not include version)${NC}"
    else
        echo -e "${RED}✗ Version mismatch! Expected '$IMAGE_TAG' but got '$DEPLOYED_VERSION'${NC}"
        echo -e "${YELLOW}  This may indicate a caching issue or incorrect image tag${NC}"
    fi

    # BUG-001 FIX: Verify bootstrap completion after api-service deployment
    if [ "$SERVICE" = "api-service" ]; then
        echo ""
        echo -e "${YELLOW}Verifying bootstrap completion...${NC}"

        # Check if bootstrap endpoint is available
        BOOTSTRAP_STATUS=$(curl -sf "${SERVICE_URL}/api/v1/admin/bootstrap/status" \
            -H "X-CA-Root-Key: placeholder-will-fail-if-not-bootstrapped" 2>/dev/null || echo "")

        if [ -n "$BOOTSTRAP_STATUS" ]; then
            # Parse status from JSON response
            STATUS=$(echo "$BOOTSTRAP_STATUS" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' 2>/dev/null || echo "unknown")

            if [ "$STATUS" = "bootstrapped" ] || [ "$STATUS" = "SYNCED" ]; then
                echo -e "${GREEN}✓ Bootstrap already completed${NC}"
            else
                echo -e "${YELLOW}! Bootstrap status: $STATUS${NC}"
                echo -e "${YELLOW}! WARNING: You may need to run bootstrap manually:${NC}"
                echo "  cd ../bootstrap && ./bootstrap.sh $ENV"
            fi
        else
            echo -e "${YELLOW}! WARNING: Could not check bootstrap status${NC}"
            echo -e "${YELLOW}  Run bootstrap script to ensure system is initialized:${NC}"
            echo "  cd ../bootstrap && ./bootstrap.sh $ENV"
        fi

        echo ""
        echo -e "${BLUE}NEXT STEPS:${NC}"
        echo "  1. Verify bootstrap: cd ../bootstrap && ./bootstrap.sh $ENV"
        echo "  2. Deploy pipeline-service: ./deploy.sh pipeline-service $ENV $PROJECT_ID"
        echo "  3. Deploy frontend: ./deploy.sh frontend $ENV $PROJECT_ID"
    fi
else
    echo -e "${RED}✗ Health check failed after ${MAX_RETRIES} attempts${NC}"
    echo "  Check logs at: https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}/logs?project=${PROJECT_ID}"
    exit 1
fi
