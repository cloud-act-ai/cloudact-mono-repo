#!/bin/bash
# Master script to load all demo data
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo "================================================"
echo "  Demo Data Loader - Full Load"
echo "  Target: ${PROJECT_ID}:${DATASET}"
echo "================================================"
echo ""

# Parse arguments
SKIP_VALIDATION=false
LOAD_GENAI=true
LOAD_CLOUD=true
LOAD_SUBSCRIPTIONS=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --genai-only)
            LOAD_CLOUD=false
            LOAD_SUBSCRIPTIONS=false
            shift
            ;;
        --cloud-only)
            LOAD_GENAI=false
            LOAD_SUBSCRIPTIONS=false
            shift
            ;;
        --subscriptions-only)
            LOAD_GENAI=false
            LOAD_CLOUD=false
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-validation    Skip environment validation"
            echo "  --genai-only         Only load GenAI data"
            echo "  --cloud-only         Only load cloud billing data"
            echo "  --subscriptions-only Only load subscription plans"
            echo "  -h, --help           Show this help"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Step 0: Validate environment
if [[ "$SKIP_VALIDATION" == "false" ]]; then
    log_info "Step 0: Validating environment..."
    bash "${SCRIPT_DIR}/00-validate-env.sh"
    echo ""
fi

# Step 0b: Load pricing seed data (REQUIRED before GenAI cost calculation)
# This populates genai_payg_pricing table used by payg_cost processor
if [[ "$LOAD_GENAI" == "true" ]]; then
    log_info "Step 0b: Loading GenAI pricing seed data..."
    bash "${SCRIPT_DIR}/00-load-pricing-seed.sh"
    echo ""
fi

# Step 1: Load GenAI data
if [[ "$LOAD_GENAI" == "true" ]]; then
    log_info "Step 1: Loading GenAI usage data..."
    bash "${SCRIPT_DIR}/01-load-genai-data.sh"
    echo ""
fi

# Step 2: Load Cloud billing data
if [[ "$LOAD_CLOUD" == "true" ]]; then
    log_info "Step 2: Loading Cloud billing data..."
    bash "${SCRIPT_DIR}/02-load-cloud-data.sh"
    echo ""
fi

# Step 3: Load Subscription plans
if [[ "$LOAD_SUBSCRIPTIONS" == "true" ]]; then
    log_info "Step 3: Loading Subscription plans..."
    bash "${SCRIPT_DIR}/03-load-subscriptions.sh"
    echo ""
fi

echo "================================================"
log_info "All data loaded successfully!"
echo "================================================"
echo ""
echo "Next steps - Run pipelines to process the data:"
echo ""
echo "  # GenAI cost calculation"
echo "  curl -X POST 'http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/genai/payg/cost' \\"
echo "    -H 'X-API-Key: \$ORG_API_KEY' \\"
echo "    -d '{\"start_date\":\"2025-01-01\",\"end_date\":\"2025-12-31\"}'"
echo ""
echo "  # SaaS subscription costs"
echo "  curl -X POST 'http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/subscription/costs/subscription_cost' \\"
echo "    -H 'X-API-Key: \$ORG_API_KEY'"
echo ""
echo "  # Cloud FOCUS conversion (for each provider)"
echo "  curl -X POST 'http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/gcp/cost/focus_convert' \\"
echo "    -H 'X-API-Key: \$ORG_API_KEY'"
echo ""
