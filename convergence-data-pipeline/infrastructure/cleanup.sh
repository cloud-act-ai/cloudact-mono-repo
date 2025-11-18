#!/bin/bash
# ============================================
# Convergence Pipeline - Cleanup Script
# ============================================
# Safely removes all deployed resources
# WARNING: This will delete everything!
# ============================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# ============================================
# Configuration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# ============================================
# Confirmation
# ============================================

echo -e "${RED}============================================${NC}"
echo -e "${RED}WARNING: This will DELETE all resources!${NC}"
echo -e "${RED}============================================${NC}"
echo
echo "This will remove:"
echo "  - Kubernetes deployments and services"
echo "  - GKE cluster"
echo "  - VPC network"
echo "  - Cloud Storage buckets"
echo "  - Service accounts"
echo "  - All other Terraform-managed resources"
echo
read -p "Are you ABSOLUTELY sure? Type 'DELETE' to confirm: " -r
echo

if [ "$REPLY" != "DELETE" ]; then
    log_info "Cleanup cancelled"
    exit 0
fi

# Check environment variables
if [ -z "${PROJECT_ID:-}" ]; then
    log_error "PROJECT_ID environment variable is not set"
    exit 1
fi

if [ -z "${REGION:-}" ]; then
    log_warning "REGION not set, defaulting to 'us-central1'"
    export REGION="us-central1"
fi

# ============================================
# Step 1: Delete Kubernetes Resources
# ============================================

log_info "Step 1: Deleting Kubernetes resources..."

cd "$SCRIPT_DIR/terraform"

# Get cluster name from Terraform
if [ -f "terraform.tfstate" ]; then
    CLUSTER_NAME=$(terraform output -raw gke_cluster_name 2>/dev/null || echo "")

    if [ -n "$CLUSTER_NAME" ]; then
        log_info "Connecting to cluster: $CLUSTER_NAME"

        # Try to connect to cluster
        if gcloud container clusters get-credentials "$CLUSTER_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" 2>/dev/null; then

            log_info "Deleting Kubernetes resources..."

            # Delete in reverse order
            cd "$SCRIPT_DIR/kubernetes"
            kubectl delete -f network-policy.yaml --ignore-not-found=true || true
            kubectl delete -f hpa.yaml --ignore-not-found=true || true
            kubectl delete -f service.yaml --ignore-not-found=true || true
            kubectl delete -f deployment.yaml --ignore-not-found=true || true
            kubectl delete -f secrets.yaml --ignore-not-found=true || true
            kubectl delete -f configmap.yaml --ignore-not-found=true || true
            kubectl delete -f serviceaccount.yaml --ignore-not-found=true || true
            kubectl delete -f namespace.yaml --ignore-not-found=true || true

            log_success "Kubernetes resources deleted"
        else
            log_warning "Could not connect to cluster (it may already be deleted)"
        fi
    fi
fi

# ============================================
# Step 2: Delete Terraform Infrastructure
# ============================================

log_info "Step 2: Deleting Terraform infrastructure..."

cd "$SCRIPT_DIR/terraform"

if [ -f "terraform.tfstate" ]; then
    log_info "Running terraform destroy..."

    terraform destroy \
        -var="project_id=$PROJECT_ID" \
        -var="region=$REGION" \
        -auto-approve

    log_success "Terraform infrastructure deleted"
else
    log_warning "No terraform.tfstate found, skipping Terraform destroy"
fi

# ============================================
# Step 3: Clean Docker Images (Optional)
# ============================================

log_info "Step 3: Cleaning up Docker images..."

read -p "Delete Docker images from GCR? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Listing images in gcr.io/$PROJECT_ID/convergence-pipeline..."

    # List and delete images
    IMAGES=$(gcloud container images list-tags \
        "gcr.io/$PROJECT_ID/convergence-pipeline" \
        --format="get(digest)" 2>/dev/null || echo "")

    if [ -n "$IMAGES" ]; then
        while IFS= read -r digest; do
            log_info "Deleting image with digest: $digest"
            gcloud container images delete \
                "gcr.io/$PROJECT_ID/convergence-pipeline@$digest" \
                --quiet
        done <<< "$IMAGES"

        log_success "Docker images deleted from GCR"
    else
        log_info "No images found in GCR"
    fi
else
    log_info "Skipping Docker image cleanup"
fi

# ============================================
# Step 4: Verify Cleanup
# ============================================

log_info "Step 4: Verifying cleanup..."

# Check for remaining resources
log_info "Checking for remaining GKE clusters..."
REMAINING_CLUSTERS=$(gcloud container clusters list \
    --filter="name:convergence-pipeline" \
    --format="value(name)" \
    --project="$PROJECT_ID" \
    2>/dev/null || echo "")

if [ -n "$REMAINING_CLUSTERS" ]; then
    log_warning "Found remaining clusters: $REMAINING_CLUSTERS"
else
    log_success "No remaining GKE clusters found"
fi

log_info "Checking for remaining storage buckets..."
REMAINING_BUCKETS=$(gcloud storage buckets list \
    --filter="name:$PROJECT_ID-pipeline-data" \
    --format="value(name)" \
    --project="$PROJECT_ID" \
    2>/dev/null || echo "")

if [ -n "$REMAINING_BUCKETS" ]; then
    log_warning "Found remaining buckets: $REMAINING_BUCKETS"
    read -p "Delete these buckets? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        while IFS= read -r bucket; do
            log_info "Deleting bucket: $bucket"
            gcloud storage buckets delete "gs://$bucket" --quiet || true
        done <<< "$REMAINING_BUCKETS"
    fi
else
    log_success "No remaining storage buckets found"
fi

# ============================================
# Completion
# ============================================

log_success "Cleanup completed!"
echo
echo "============================================"
echo "Cleanup Summary"
echo "============================================"
echo "Project ID: $PROJECT_ID"
echo "Region:     $REGION"
echo "============================================"
echo
echo "All resources have been deleted."
echo
echo "Note: Some resources may take a few minutes to fully delete."
echo "Check the GCP Console to verify complete deletion:"
echo "  https://console.cloud.google.com/kubernetes/list?project=$PROJECT_ID"
echo
