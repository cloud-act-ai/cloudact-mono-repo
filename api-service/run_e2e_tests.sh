#!/bin/bash
#
# Run E2E Integration Tests for User Onboarding
#
# Usage:
#   ./run_e2e_tests.sh              # Run all E2E tests
#   ./run_e2e_tests.sh full         # Run complete onboarding journey
#   ./run_e2e_tests.sh bootstrap    # Run bootstrap only
#   ./run_e2e_tests.sh onboard      # Run org onboarding only
#   ./run_e2e_tests.sh integration  # Run integration setup only
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a service is running
check_service() {
    local service_name=$1
    local service_url=$2

    info "Checking if $service_name is running..."

    if curl -s -f "$service_url/health" > /dev/null; then
        info "$service_name is running ✓"
        return 0
    else
        error "$service_name is NOT running at $service_url"
        return 1
    fi
}

# Function to verify environment variables
check_env_vars() {
    local required_vars=(
        "GCP_PROJECT_ID"
        "CA_ROOT_API_KEY"
        "OPENAI_API_KEY"
        "KMS_KEY_NAME"
        "GOOGLE_APPLICATION_CREDENTIALS"
    )

    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "Please set these variables before running E2E tests:"
        echo "  export GCP_PROJECT_ID=\"your-project-id\""
        echo "  export CA_ROOT_API_KEY=\"your-admin-key\""
        echo "  export OPENAI_API_KEY=\"sk-your-openai-key\""
        echo "  export KMS_KEY_NAME=\"projects/.../cryptoKeys/...\""
        echo "  export GOOGLE_APPLICATION_CREDENTIALS=\"/path/to/sa.json\""
        exit 1
    fi

    info "All required environment variables are set ✓"
}

# Main script

echo "=================================================="
echo "  E2E Integration Tests - User Onboarding"
echo "=================================================="
echo ""

# Set REQUIRES_INTEGRATION_TESTS to enable tests
export REQUIRES_INTEGRATION_TESTS=true

# Get test type from argument
TEST_TYPE="${1:-all}"

# Check environment variables
info "Step 1: Checking environment variables..."
check_env_vars

# Check services
info "Step 2: Checking service availability..."
API_SERVICE_URL="${API_SERVICE_URL:-http://localhost:8000}"
PIPELINE_SERVICE_URL="${PIPELINE_SERVICE_URL:-http://localhost:8001}"

if ! check_service "API Service" "$API_SERVICE_URL"; then
    error "API Service is not running. Please start it first:"
    echo "  cd api-service"
    echo "  python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload"
    exit 1
fi

if ! check_service "Pipeline Service" "$PIPELINE_SERVICE_URL"; then
    error "Pipeline Service is not running. Please start it first:"
    echo "  cd data-pipeline-service"
    echo "  python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload"
    exit 1
fi

# Run tests based on type
info "Step 3: Running E2E tests..."
echo ""

case "$TEST_TYPE" in
    "full")
        info "Running complete onboarding journey test..."
        pytest tests/test_06_user_onboarding_e2e.py::test_complete_user_onboarding_e2e -v -s --log-cli-level=INFO
        ;;
    "bootstrap")
        info "Running bootstrap only test..."
        pytest tests/test_06_user_onboarding_e2e.py::test_bootstrap_only -v -s --log-cli-level=INFO
        ;;
    "onboard")
        info "Running org onboarding only test..."
        pytest tests/test_06_user_onboarding_e2e.py::test_org_onboarding_only -v -s --log-cli-level=INFO
        ;;
    "integration")
        info "Running integration setup only test..."
        pytest tests/test_06_user_onboarding_e2e.py::test_integration_setup_only -v -s --log-cli-level=INFO
        ;;
    "all"|*)
        info "Running all E2E tests..."
        pytest tests/test_06_user_onboarding_e2e.py -m integration -v -s --log-cli-level=INFO
        ;;
esac

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo -e "${GREEN}✓ E2E Tests PASSED${NC}"
    echo "=================================================="
    exit 0
else
    echo ""
    echo "=================================================="
    echo -e "${RED}✗ E2E Tests FAILED${NC}"
    echo "=================================================="
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Check service logs for errors"
    echo "  2. Verify GCP credentials are valid"
    echo "  3. Check KMS key is accessible"
    echo "  4. Verify OpenAI API key is valid"
    echo "  5. Review tests/E2E_TEST_GUIDE.md for details"
    exit 1
fi
