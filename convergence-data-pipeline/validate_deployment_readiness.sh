#!/bin/bash
################################################################################
# Deployment Readiness Validation Script
# Checks if all prerequisites are met before deploying to Cloud Run
################################################################################

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ID="${1:-gac-prod-471220}"
REGION="${2:-us-central1}"
SERVICE_ACCOUNT="convergence-api@${PROJECT_ID}.iam.gserviceaccount.com"

CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Print functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((CHECKS_PASSED++))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((CHECKS_FAILED++))
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((CHECKS_WARNING++))
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Start validation
print_header "Cloud Run Deployment Readiness Check"
print_info "Project ID: ${PROJECT_ID}"
print_info "Region: ${REGION}"
print_info "Service Account: ${SERVICE_ACCOUNT}"
echo ""

# Check 1: gcloud CLI
print_check "Checking gcloud CLI installation..."
if command -v gcloud &> /dev/null; then
    GCLOUD_VERSION=$(gcloud version --format="value(version)")
    print_pass "gcloud CLI installed (version: ${GCLOUD_VERSION})"
else
    print_fail "gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check 2: Authentication
print_check "Checking GCP authentication..."
ACTIVE_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
if [[ -n "$ACTIVE_ACCOUNT" ]]; then
    print_pass "Authenticated as: ${ACTIVE_ACCOUNT}"
else
    print_fail "Not authenticated. Run: gcloud auth login"
fi

# Check 3: Project access
print_check "Checking GCP project access..."
if gcloud projects describe "$PROJECT_ID" &> /dev/null; then
    PROJECT_NAME=$(gcloud projects describe "$PROJECT_ID" --format="value(name)")
    print_pass "Project accessible: ${PROJECT_NAME}"
else
    print_fail "Cannot access project: ${PROJECT_ID}"
fi

# Check 4: Docker
print_check "Checking Docker installation..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
    print_pass "Docker installed (version: ${DOCKER_VERSION})"

    # Check if Docker daemon is running
    if docker info &> /dev/null; then
        print_pass "Docker daemon is running"
    else
        print_warn "Docker daemon is not running. Start Docker Desktop or service"
    fi
else
    print_warn "Docker not found. Required for local builds only"
fi

# Check 5: Service Account
print_check "Checking service account existence..."
if gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" &> /dev/null; then
    print_pass "Service account exists: ${SERVICE_ACCOUNT}"
else
    print_fail "Service account NOT found: ${SERVICE_ACCOUNT}"
    print_info "Create with: gcloud iam service-accounts create convergence-api --project=${PROJECT_ID}"
fi

# Check 6: Required APIs
print_check "Checking required GCP APIs..."
REQUIRED_APIS=(
    "run.googleapis.com"
    "cloudbuild.googleapis.com"
    "artifactregistry.googleapis.com"
    "bigquery.googleapis.com"
    "secretmanager.googleapis.com"
    "pubsub.googleapis.com"
    "logging.googleapis.com"
    "cloudtrace.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
    if gcloud services list --project="$PROJECT_ID" --enabled --filter="name:$api" --format="value(name)" 2>/dev/null | grep -q "$api"; then
        print_pass "API enabled: ${api}"
    else
        print_fail "API NOT enabled: ${api}"
        print_info "Enable with: gcloud services enable ${api} --project=${PROJECT_ID}"
    fi
done

# Check 7: Artifact Registry
print_check "Checking Artifact Registry repositories..."
if gcloud artifacts repositories describe convergence --location=us --project="$PROJECT_ID" &> /dev/null; then
    print_pass "Artifact Registry 'convergence' repository exists"
else
    print_warn "Artifact Registry 'convergence' repository NOT found"
    print_info "Using gcr.io is OK, or create with: gcloud artifacts repositories create convergence --repository-format=docker --location=us --project=${PROJECT_ID}"
fi

# Check 8: BigQuery Dataset
print_check "Checking BigQuery metadata dataset..."
if bq show --project_id="$PROJECT_ID" metadata &> /dev/null; then
    print_pass "BigQuery dataset 'metadata' exists"
else
    print_warn "BigQuery dataset 'metadata' NOT found"
    print_info "Will be created by init_metadata_tables.py"
fi

# Check 9: Required files
print_check "Checking required deployment files..."
REQUIRED_FILES=(
    "deployment/Dockerfile"
    "deployment/cloudbuild.yaml"
    "deployment/deploy.sh"
    "requirements.txt"
    "src/app/main.py"
    ".env.example"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        print_pass "File exists: ${file}"
    else
        print_fail "File NOT found: ${file}"
    fi
done

# Check 10: Python environment
print_check "Checking Python environment..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    print_pass "Python installed (version: ${PYTHON_VERSION})"

    # Check if requirements can be validated
    if [[ -f "requirements.txt" ]]; then
        print_pass "requirements.txt found"
    fi
else
    print_warn "Python3 not found. Required for running init scripts"
fi

# Check 11: Git repository
print_check "Checking Git repository..."
if git rev-parse --git-dir &> /dev/null; then
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    COMMIT_SHA=$(git rev-parse --short HEAD)
    print_pass "Git repository initialized (branch: ${CURRENT_BRANCH}, SHA: ${COMMIT_SHA})"
else
    print_warn "Not in a Git repository"
fi

# Check 12: Existing Cloud Run services
print_check "Checking existing Cloud Run services..."
EXISTING_SERVICES=$(gcloud run services list --project="$PROJECT_ID" --region="$REGION" --format="value(name)" 2>/dev/null)
if [[ -n "$EXISTING_SERVICES" ]]; then
    print_info "Existing services in ${REGION}:"
    echo "$EXISTING_SERVICES" | while read -r service; do
        print_info "  - ${service}"
    done
else
    print_info "No existing Cloud Run services in ${REGION}"
fi

# Check 13: Firestore
print_check "Checking Firestore for distributed locks..."
if gcloud firestore databases list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | grep -q "(default)"; then
    print_pass "Firestore database exists"
else
    print_warn "Firestore NOT enabled. Required for LOCK_BACKEND=firestore"
    print_info "Enable at: https://console.cloud.google.com/firestore/databases?project=${PROJECT_ID}"
fi

# Check 14: Cloud Build service account permissions
print_check "Checking Cloud Build service account..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
if gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" --filter="bindings.members:serviceAccount:${CB_SA}" --format="value(bindings.role)" | grep -q "roles/run.admin"; then
    print_pass "Cloud Build service account has run.admin role"
else
    print_warn "Cloud Build service account may need additional permissions"
    print_info "Grant with: gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:${CB_SA} --role=roles/run.admin"
fi

# Summary
echo ""
print_header "Validation Summary"
echo -e "${GREEN}Passed:  ${CHECKS_PASSED}${NC}"
echo -e "${YELLOW}Warnings: ${CHECKS_WARNING}${NC}"
echo -e "${RED}Failed:  ${CHECKS_FAILED}${NC}"
echo ""

if [[ $CHECKS_FAILED -eq 0 ]]; then
    if [[ $CHECKS_WARNING -eq 0 ]]; then
        print_header "READY TO DEPLOY"
        echo -e "${GREEN}All checks passed! You can proceed with deployment.${NC}"
        echo ""
        echo "Recommended deployment command:"
        echo -e "${BLUE}./deployment/deploy.sh production --cloud-build${NC}"
        exit 0
    else
        print_header "READY WITH WARNINGS"
        echo -e "${YELLOW}Some warnings found, but deployment can proceed.${NC}"
        echo -e "${YELLOW}Review warnings above and address if necessary.${NC}"
        exit 0
    fi
else
    print_header "NOT READY"
    echo -e "${RED}Failed checks must be resolved before deployment.${NC}"
    echo -e "${RED}Review failed checks above and fix issues.${NC}"
    echo ""
    echo "See DEPLOYMENT_READY.md for detailed instructions"
    exit 1
fi
