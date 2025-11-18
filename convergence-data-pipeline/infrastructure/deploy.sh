#!/bin/bash
# ============================================
# Convergence Pipeline - Deployment Script
# ============================================
# Automates the complete deployment process:
# 1. Terraform infrastructure
# 2. Docker image build and push
# 3. Kubernetes deployment
# ============================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# ============================================
# Configuration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# Functions
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# ============================================
# Pre-flight Checks
# ============================================

log_info "Starting pre-flight checks..."

# Check required commands
check_command gcloud
check_command terraform
check_command kubectl
check_command docker

# Check environment variables
if [ -z "${PROJECT_ID:-}" ]; then
    log_error "PROJECT_ID environment variable is not set"
    exit 1
fi

if [ -z "${ENVIRONMENT:-}" ]; then
    log_warning "ENVIRONMENT not set, defaulting to 'dev'"
    export ENVIRONMENT="dev"
fi

if [ -z "${REGION:-}" ]; then
    log_warning "REGION not set, defaulting to 'us-central1'"
    export REGION="us-central1"
fi

log_info "Configuration:"
log_info "  Project ID: $PROJECT_ID"
log_info "  Environment: $ENVIRONMENT"
log_info "  Region: $REGION"

# ============================================
# Step 1: Deploy Terraform Infrastructure
# ============================================

log_info "Step 1: Deploying Terraform infrastructure..."

cd "$SCRIPT_DIR/terraform"

# Initialize Terraform if needed
if [ ! -d ".terraform" ]; then
    log_info "Initializing Terraform..."
    terraform init
fi

# Plan
log_info "Planning Terraform changes..."
terraform plan \
    -var="project_id=$PROJECT_ID" \
    -var="environment=$ENVIRONMENT" \
    -var="region=$REGION" \
    -out=tfplan

# Apply
log_info "Applying Terraform changes..."
read -p "Do you want to apply these changes? (yes/no): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    terraform apply tfplan
    log_success "Terraform infrastructure deployed"
else
    log_warning "Terraform deployment skipped"
    exit 0
fi

# Get outputs
export CLUSTER_NAME=$(terraform output -raw gke_cluster_name)
export SERVICE_ACCOUNT_EMAIL=$(terraform output -raw service_account_email)
export LB_IP=$(terraform output -raw load_balancer_ip)

log_info "Cluster: $CLUSTER_NAME"
log_info "Service Account: $SERVICE_ACCOUNT_EMAIL"
log_info "Load Balancer IP: $LB_IP"

# ============================================
# Step 2: Build and Push Docker Image
# ============================================

log_info "Step 2: Building and pushing Docker image..."

cd "$PROJECT_ROOT"

# Get version from git or use timestamp
if command -v git &> /dev/null && [ -d .git ]; then
    VERSION=$(git rev-parse --short HEAD)
else
    VERSION=$(date +%s)
fi

IMAGE_NAME="gcr.io/$PROJECT_ID/convergence-pipeline"
IMAGE_TAG="$VERSION"

log_info "Building image: $IMAGE_NAME:$IMAGE_TAG"

# Build
docker build \
    --build-arg APP_VERSION="$VERSION" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg VCS_REF="$VERSION" \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -t "$IMAGE_NAME:latest" \
    -f infrastructure/docker/Dockerfile \
    .

log_success "Docker image built"

# Configure Docker for GCR
log_info "Configuring Docker authentication..."
gcloud auth configure-docker --quiet

# Push
log_info "Pushing image to GCR..."
docker push "$IMAGE_NAME:$IMAGE_TAG"
docker push "$IMAGE_NAME:latest"

log_success "Docker image pushed to GCR"

# ============================================
# Step 3: Deploy to Kubernetes
# ============================================

log_info "Step 3: Deploying to Kubernetes..."

# Connect to cluster
log_info "Connecting to GKE cluster..."
gcloud container clusters get-credentials "$CLUSTER_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID"

# Verify connection
kubectl cluster-info
log_success "Connected to Kubernetes cluster"

# Update manifests with project-specific values
cd "$SCRIPT_DIR/kubernetes"

# Create temporary directory for processed manifests
TEMP_DIR=$(mktemp -d)
log_info "Processing Kubernetes manifests in $TEMP_DIR..."

for file in *.yaml; do
    sed -e "s/PROJECT_ID/$PROJECT_ID/g" \
        -e "s|gcr.io/PROJECT_ID/convergence-pipeline:latest|$IMAGE_NAME:$IMAGE_TAG|g" \
        "$file" > "$TEMP_DIR/$file"
done

# Deploy resources
log_info "Deploying Kubernetes resources..."

kubectl apply -f "$TEMP_DIR/namespace.yaml" || true
kubectl apply -f "$TEMP_DIR/serviceaccount.yaml"
kubectl apply -f "$TEMP_DIR/configmap.yaml"

# Check if secrets exist, if not warn
if ! kubectl get secret convergence-pipeline-secrets &> /dev/null; then
    log_warning "Secret 'convergence-pipeline-secrets' does not exist!"
    log_warning "Please create it before the deployment can work:"
    log_warning "  kubectl create secret generic convergence-pipeline-secrets \\"
    log_warning "    --from-literal=API_SECRET_KEY=\$(openssl rand -base64 32)"

    # Create a dummy secret for now
    kubectl apply -f "$TEMP_DIR/secrets.yaml" || true
fi

kubectl apply -f "$TEMP_DIR/deployment.yaml"
kubectl apply -f "$TEMP_DIR/service.yaml"
kubectl apply -f "$TEMP_DIR/hpa.yaml"
kubectl apply -f "$TEMP_DIR/network-policy.yaml"

log_success "Kubernetes resources deployed"

# Clean up temp directory
rm -rf "$TEMP_DIR"

# ============================================
# Step 4: Wait for Deployment
# ============================================

log_info "Step 4: Waiting for deployment to be ready..."

kubectl rollout status deployment/convergence-pipeline --timeout=5m

log_success "Deployment is ready"

# ============================================
# Step 5: Verify Deployment
# ============================================

log_info "Step 5: Verifying deployment..."

# Get pod status
log_info "Pod status:"
kubectl get pods -l app=convergence-pipeline

# Get service status
log_info "Service status:"
kubectl get service convergence-pipeline-service

# Get HPA status
log_info "HPA status:"
kubectl get hpa convergence-pipeline-hpa

# Test health endpoint
log_info "Testing health endpoint..."
sleep 10  # Wait for LB to be ready

CURRENT_LB_IP=$(kubectl get service convergence-pipeline-service \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

if [ -n "$CURRENT_LB_IP" ]; then
    log_info "Load Balancer IP: $CURRENT_LB_IP"

    if curl -f -s "http://$CURRENT_LB_IP/health" > /dev/null; then
        log_success "Health check passed!"
    else
        log_warning "Health check failed. The service might not be ready yet."
    fi
else
    log_warning "Load Balancer IP not yet assigned. Please wait a few minutes."
fi

# ============================================
# Completion
# ============================================

log_success "Deployment completed successfully!"
echo
echo "============================================"
echo "Deployment Summary"
echo "============================================"
echo "Project ID:        $PROJECT_ID"
echo "Environment:       $ENVIRONMENT"
echo "Region:            $REGION"
echo "Cluster:           $CLUSTER_NAME"
echo "Image:             $IMAGE_NAME:$IMAGE_TAG"
echo "Load Balancer IP:  ${CURRENT_LB_IP:-Pending...}"
echo "============================================"
echo
echo "Next steps:"
echo "1. Wait for Load Balancer IP (may take 5-10 minutes):"
echo "   kubectl get service convergence-pipeline-service -w"
echo
echo "2. Test the application:"
echo "   curl http://\$LB_IP/health"
echo
echo "3. Access API documentation:"
echo "   open http://\$LB_IP/docs"
echo
echo "4. View logs:"
echo "   kubectl logs -l app=convergence-pipeline -f"
echo
echo "============================================"
