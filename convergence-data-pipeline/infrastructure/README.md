# Convergence Data Pipeline - Infrastructure as Code

Production-ready infrastructure configuration for deploying the multi-tenant BigQuery data pipeline system to Google Cloud Platform (GCP).

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Terraform Deployment](#terraform-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Docker Setup](#docker-setup)
- [Configuration](#configuration)
- [Monitoring & Observability](#monitoring--observability)
- [Security](#security)
- [Cost Optimization](#cost-optimization)
- [Troubleshooting](#troubleshooting)

---

## Overview

This infrastructure provides:

- **GKE Autopilot Cluster**: Managed Kubernetes with auto-scaling and cost optimization
- **Cloud Armor**: DDoS protection and WAF (Web Application Firewall)
- **Cloud Storage**: Data lake for pipeline artifacts
- **IAM & Workload Identity**: Secure GCP API access for pods
- **VPC Networking**: Private cluster with Cloud NAT
- **Load Balancer**: Global HTTP(S) load balancing
- **Auto-scaling**: Horizontal Pod Autoscaler (2-10 pods)
- **Security**: Network policies, pod security, non-root containers

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Cloud Armor   │ (DDoS Protection, WAF)
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Load Balancer  │ (Global HTTPS)
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼───┐          ┌────▼────┐        ┌────▼────┐
    │ Pod 1 │          │  Pod 2  │        │  Pod N  │
    └───┬───┘          └────┬────┘        └────┬────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼─────┐      ┌──────▼──────┐    ┌──────▼──────┐
    │BigQuery │      │Cloud Storage│    │Secret Manager│
    └─────────┘      └─────────────┘    └─────────────┘
```

**Key Components:**
- **GKE Autopilot**: Auto-manages nodes, patching, and scaling
- **Workload Identity**: Secure service account binding
- **Private Nodes**: No public IPs for security
- **Cloud NAT**: Outbound internet access for private nodes
- **Network Policies**: Pod-level firewall rules

---

## Directory Structure

```
infrastructure/
├── terraform/                  # Terraform configuration
│   ├── main.tf                # Main resources and providers
│   ├── variables.tf           # Input variables
│   ├── outputs.tf             # Output values
│   ├── gke.tf                 # GKE cluster configuration
│   ├── iam.tf                 # Service accounts and IAM
│   ├── network.tf             # VPC, Cloud Armor, LB
│   └── terraform.tfvars.example  # Example variables
│
├── kubernetes/                # Kubernetes manifests
│   ├── namespace.yaml         # Optional namespace
│   ├── serviceaccount.yaml    # Workload Identity SA
│   ├── configmap.yaml         # Application config
│   ├── secrets.yaml           # Secrets template
│   ├── deployment.yaml        # Pod deployment + PDB
│   ├── service.yaml           # Load balancer service
│   ├── hpa.yaml               # Horizontal Pod Autoscaler
│   └── network-policy.yaml    # Network security policies
│
├── docker/                    # Docker configuration
│   ├── Dockerfile             # Multi-stage production image
│   ├── .dockerignore          # Build context exclusions
│   └── docker-compose.yml     # Local development
│
└── README.md                  # This file
```

---

## Prerequisites

### Required Tools

1. **Google Cloud SDK** (gcloud)
   ```bash
   # Install
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL

   # Initialize
   gcloud init
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Terraform** (v1.5+)
   ```bash
   # macOS
   brew install terraform

   # Linux
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   ```

3. **kubectl** (Kubernetes CLI)
   ```bash
   # Install
   gcloud components install kubectl

   # Or via package manager
   brew install kubectl  # macOS
   ```

4. **Docker** (for local development)
   ```bash
   # macOS
   brew install --cask docker

   # Linux
   curl -fsSL https://get.docker.com | sh
   ```

### GCP Project Setup

1. **Create GCP Project** (if needed)
   ```bash
   export PROJECT_ID="your-project-id"
   gcloud projects create $PROJECT_ID
   gcloud config set project $PROJECT_ID
   ```

2. **Enable Billing**
   ```bash
   # Link billing account (find ID in GCP Console)
   gcloud billing projects link $PROJECT_ID \
     --billing-account=YOUR_BILLING_ACCOUNT_ID
   ```

3. **Enable Required APIs** (Terraform will do this, but you can enable manually)
   ```bash
   gcloud services enable \
     compute.googleapis.com \
     container.googleapis.com \
     bigquery.googleapis.com \
     storage.googleapis.com \
     secretmanager.googleapis.com \
     cloudkms.googleapis.com \
     logging.googleapis.com \
     monitoring.googleapis.com
   ```

---

## Quick Start

### 1. Set Environment Variables

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export ENVIRONMENT="dev"  # dev, staging, or production
```

### 2. Deploy Infrastructure

```bash
# Navigate to Terraform directory
cd infrastructure/terraform

# Copy and customize variables
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars  # Edit with your values

# Initialize Terraform
terraform init

# Preview changes
terraform plan -var="project_id=$PROJECT_ID" -var="environment=$ENVIRONMENT"

# Deploy
terraform apply -var="project_id=$PROJECT_ID" -var="environment=$ENVIRONMENT"
```

### 3. Deploy Application

```bash
# Connect to GKE cluster
gcloud container clusters get-credentials convergence-pipeline-cluster \
  --region=$REGION --project=$PROJECT_ID

# Verify connection
kubectl cluster-info
kubectl get nodes

# Build and push Docker image
cd ../..  # Back to project root
docker build -t gcr.io/$PROJECT_ID/convergence-pipeline:v1.0.0 \
  -f infrastructure/docker/Dockerfile .
docker push gcr.io/$PROJECT_ID/convergence-pipeline:v1.0.0

# Update Kubernetes manifests with your project ID
cd infrastructure/kubernetes
sed -i "s/PROJECT_ID/$PROJECT_ID/g" *.yaml

# Deploy to Kubernetes
kubectl apply -f namespace.yaml  # Optional
kubectl apply -f serviceaccount.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml  # Configure secrets first!
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
kubectl apply -f network-policy.yaml

# Check deployment
kubectl get all
kubectl get pods -w
```

### 4. Access Application

```bash
# Get load balancer IP
export LB_IP=$(kubectl get service convergence-pipeline-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Test health endpoint
curl http://$LB_IP/health

# Access API docs
open http://$LB_IP/docs  # macOS
xdg-open http://$LB_IP/docs  # Linux
```

---

## Terraform Deployment

### Configuration

Edit `terraform.tfvars`:

```hcl
# Project Configuration
project_id  = "my-project-prod"
region      = "us-central1"
environment = "production"

# GKE Configuration
gke_cluster_name        = "convergence-pipeline-cluster"
enable_private_endpoint = false  # true for production
enable_private_nodes    = true

# Autoscaling
min_replicas = 3
max_replicas = 20

# Security
enable_cloud_armor   = true
enable_cmek          = true  # Customer-managed encryption keys
rate_limit_threshold = 1000

# IAM
create_service_account = true
enable_workload_identity = true
```

### Commands

```bash
# Initialize
terraform init

# Plan (preview changes)
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Show outputs
terraform output

# Destroy (CAUTION!)
terraform destroy
```

### Important Outputs

```bash
# Get all outputs
terraform output

# Specific outputs
terraform output gke_cluster_name
terraform output load_balancer_ip
terraform output service_account_email
```

---

## Kubernetes Deployment

### Step-by-Step Deployment

#### 1. Update Configuration Files

Replace `PROJECT_ID` placeholders:

```bash
cd infrastructure/kubernetes

# Method 1: Manual replacement
export PROJECT_ID="your-project-id"
sed -i "s/PROJECT_ID/$PROJECT_ID/g" *.yaml

# Method 2: Use envsubst
export PROJECT_ID="your-project-id"
for f in *.yaml; do
  envsubst < $f > ${f%.yaml}.tmp.yaml
  mv ${f%.yaml}.tmp.yaml $f
done
```

#### 2. Create Secrets

```bash
# Option A: Create from literal values
kubectl create secret generic convergence-pipeline-secrets \
  --from-literal=API_SECRET_KEY="$(openssl rand -base64 32)" \
  --from-literal=DATABASE_URL="your-db-url"

# Option B: Create from file
kubectl create secret generic convergence-pipeline-secrets \
  --from-env-file=../../.env

# Option C: Use GCP Secret Manager (recommended)
# Store secrets in Secret Manager and access via Workload Identity
```

#### 3. Deploy Resources

```bash
# Deploy in order
kubectl apply -f namespace.yaml       # Optional
kubectl apply -f serviceaccount.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
kubectl apply -f network-policy.yaml
```

#### 4. Verify Deployment

```bash
# Check all resources
kubectl get all

# Check pods
kubectl get pods
kubectl describe pod <pod-name>

# Check logs
kubectl logs -f deployment/convergence-pipeline

# Check autoscaling
kubectl get hpa

# Check network policies
kubectl get networkpolicy
```

### Updating Deployment

```bash
# Update image
kubectl set image deployment/convergence-pipeline \
  convergence-pipeline=gcr.io/$PROJECT_ID/convergence-pipeline:v1.1.0

# Update ConfigMap
kubectl edit configmap convergence-pipeline-config

# Rollout status
kubectl rollout status deployment/convergence-pipeline

# Rollback
kubectl rollout undo deployment/convergence-pipeline
```

---

## Docker Setup

### Build Production Image

```bash
# Build with tags
docker build \
  --build-arg APP_VERSION=1.0.0 \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -t convergence-pipeline:latest \
  -t convergence-pipeline:1.0.0 \
  -t gcr.io/$PROJECT_ID/convergence-pipeline:latest \
  -t gcr.io/$PROJECT_ID/convergence-pipeline:1.0.0 \
  -f infrastructure/docker/Dockerfile .

# Push to GCR
docker push gcr.io/$PROJECT_ID/convergence-pipeline:latest
docker push gcr.io/$PROJECT_ID/convergence-pipeline:1.0.0
```

### Local Development with Docker Compose

```bash
# Start all services
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# View logs
docker-compose -f infrastructure/docker/docker-compose.yml logs -f api

# Stop services
docker-compose -f infrastructure/docker/docker-compose.yml down

# Rebuild and restart
docker-compose -f infrastructure/docker/docker-compose.yml up -d --build
```

### Access Local Services

- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

---

## Configuration

### Environment Variables

Configure in `kubernetes/configmap.yaml`:

| Variable | Description | Default |
|----------|-------------|---------|
| `GCP_PROJECT_ID` | GCP Project ID | Required |
| `ENVIRONMENT` | Environment (dev/staging/production) | `production` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `true` |
| `ENABLE_TRACING` | Enable distributed tracing | `true` |

### Secrets

Store sensitive data in `kubernetes/secrets.yaml` or GCP Secret Manager:

- `API_SECRET_KEY`: Application secret key
- Database credentials
- External API keys

**Best Practice**: Use GCP Secret Manager with Workload Identity instead of Kubernetes Secrets.

---

## Monitoring & Observability

### Cloud Logging

```bash
# View application logs
gcloud logging read "resource.type=k8s_container AND \
  resource.labels.container_name=convergence-pipeline" \
  --limit 50 --format json

# Tail logs
gcloud logging tail "resource.type=k8s_container"
```

### Cloud Monitoring

Access in GCP Console:
- **Dashboards**: Monitoring > Dashboards > GKE
- **Metrics Explorer**: Custom metrics from `/metrics` endpoint
- **Uptime Checks**: Create for `/health` endpoint

### Kubernetes Monitoring

```bash
# Pod metrics
kubectl top pods
kubectl top nodes

# HPA status
kubectl get hpa
kubectl describe hpa convergence-pipeline-hpa

# Events
kubectl get events --sort-by='.lastTimestamp'
```

### Prometheus Metrics

Application exposes Prometheus metrics at `/metrics`:

```bash
# Access metrics
curl http://$LB_IP/metrics
```

---

## Security

### Network Security

1. **Cloud Armor**: DDoS protection, rate limiting, WAF rules
2. **Network Policies**: Pod-level firewall rules
3. **Private Nodes**: No public IPs on GKE nodes
4. **Authorized Networks**: Restrict k8s API access

### Pod Security

1. **Non-root User**: Containers run as UID 1000
2. **Read-only Root Filesystem**: Where possible
3. **Drop Capabilities**: Minimal Linux capabilities
4. **Security Context**: seccomp, AppArmor profiles

### IAM & Access Control

1. **Workload Identity**: Secure GCP API access
2. **Least Privilege**: Minimal IAM roles
3. **Service Accounts**: Dedicated per service
4. **RBAC**: Kubernetes role-based access control

### Secrets Management

**Option 1: Kubernetes Secrets**
```bash
kubectl create secret generic app-secrets \
  --from-literal=key=value
```

**Option 2: GCP Secret Manager** (Recommended)
```bash
# Create secret
echo -n "secret-value" | gcloud secrets create my-secret --data-file=-

# Grant access
gcloud secrets add-iam-policy-binding my-secret \
  --member="serviceAccount:SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Cost Optimization

### GKE Autopilot Benefits

- **Auto-scaling**: Pay only for running pods
- **Right-sizing**: Automatic resource optimization
- **No node management**: No wasted capacity

### Resource Limits

Set appropriate limits in `deployment.yaml`:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "1Gi"
  limits:
    cpu: "1000m"
    memory: "2Gi"
```

### Autoscaling

HPA scales pods based on CPU/memory:

```yaml
minReplicas: 2   # Min for high availability
maxReplicas: 10  # Max to control costs
targetCPUUtilization: 80
```

### Cost Monitoring

```bash
# Estimate costs
gcloud billing projects describe $PROJECT_ID

# View current usage
gcloud billing accounts list
```

**Recommendations:**
- Use preemptible nodes for dev/staging
- Set budget alerts in GCP Console
- Review Cloud Billing reports monthly
- Use committed use discounts for production

---

## Troubleshooting

### Common Issues

#### 1. Pods Not Starting

```bash
# Check pod status
kubectl get pods
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>

# Common causes:
# - Image pull errors (check image tag)
# - Resource limits too low
# - ConfigMap/Secret missing
```

#### 2. Load Balancer Not Working

```bash
# Check service
kubectl get service convergence-pipeline-service

# Check endpoints
kubectl get endpoints convergence-pipeline-service

# Common causes:
# - Pods not ready (check readiness probe)
# - Firewall rules blocking traffic
# - Health check failing
```

#### 3. Workload Identity Issues

```bash
# Verify binding
gcloud iam service-accounts get-iam-policy SA_EMAIL

# Check annotation
kubectl describe sa convergence-pipeline-sa

# Common causes:
# - Missing annotation on K8s SA
# - Missing IAM binding
# - Wrong namespace
```

#### 4. High Memory/CPU Usage

```bash
# Check resource usage
kubectl top pods

# Check HPA
kubectl get hpa

# Solutions:
# - Increase resource limits
# - Scale up replicas
# - Optimize application code
```

### Debugging Commands

```bash
# Exec into pod
kubectl exec -it <pod-name> -- /bin/bash

# Port forward
kubectl port-forward <pod-name> 8000:8000

# Get events
kubectl get events --sort-by='.lastTimestamp'

# Describe resource
kubectl describe <resource-type> <resource-name>
```

### Logs

```bash
# Pod logs
kubectl logs <pod-name> -f

# Previous pod logs (after crash)
kubectl logs <pod-name> --previous

# All pods in deployment
kubectl logs -l app=convergence-pipeline --tail=100 -f
```

---

## Additional Resources

### Documentation

- [GKE Autopilot](https://cloud.google.com/kubernetes-engine/docs/concepts/autopilot-overview)
- [Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Cloud Armor](https://cloud.google.com/armor/docs)
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)

### Support

- **Issues**: File on GitHub repository
- **Documentation**: See main README.md
- **GCP Support**: https://cloud.google.com/support

---

## License

Proprietary - CloudAct Data Engineering Team

---

**Last Updated**: 2024-01
**Version**: 1.0.0
