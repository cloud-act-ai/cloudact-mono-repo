# Quick Start Guide - 5 Minutes to Production

This guide gets the Convergence Data Pipeline running on GCP in 5 minutes.

## Prerequisites Checklist

- [ ] Google Cloud SDK installed (`gcloud --version`)
- [ ] Terraform installed (`terraform --version`)
- [ ] kubectl installed (`kubectl version --client`)
- [ ] Docker installed (`docker --version`)
- [ ] GCP project created
- [ ] Billing enabled on GCP project
- [ ] You have Owner/Editor role on the project

## Step 1: Environment Setup (30 seconds)

```bash
# Set your GCP project ID
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export ENVIRONMENT="dev"

# Authenticate with GCP
gcloud auth login
gcloud auth application-default login
gcloud config set project $PROJECT_ID
```

## Step 2: Configure Terraform (1 minute)

```bash
cd infrastructure/terraform

# Copy example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit configuration (REQUIRED: update PROJECT_ID)
nano terraform.tfvars
```

**Minimum required change**:
```hcl
project_id = "your-actual-gcp-project-id"  # Change this!
```

## Step 3: Deploy Infrastructure (2 minutes)

```bash
# Initialize Terraform
terraform init

# Preview changes
terraform plan -var="project_id=$PROJECT_ID"

# Deploy (type 'yes' when prompted)
terraform apply -var="project_id=$PROJECT_ID"
```

**What gets created**:
- GKE Autopilot cluster (takes ~5 minutes)
- VPC network with Cloud NAT
- Cloud Storage bucket
- Service account with IAM roles
- Cloud Armor security policy
- Static IP for load balancer

## Step 4: Build and Deploy Application (1.5 minutes)

```bash
# Return to project root
cd ../..

# Build Docker image
docker build \
  -t gcr.io/$PROJECT_ID/convergence-pipeline:latest \
  -f infrastructure/docker/Dockerfile .

# Authenticate Docker with GCR
gcloud auth configure-docker

# Push to GCR
docker push gcr.io/$PROJECT_ID/convergence-pipeline:latest

# Connect to GKE cluster
gcloud container clusters get-credentials \
  convergence-pipeline-cluster \
  --region=$REGION \
  --project=$PROJECT_ID

# Update Kubernetes manifests
cd infrastructure/kubernetes
sed -i "s/PROJECT_ID/$PROJECT_ID/g" *.yaml

# Create application secret
kubectl create secret generic convergence-pipeline-secrets \
  --from-literal=API_SECRET_KEY="$(openssl rand -base64 32)"

# Deploy to Kubernetes
kubectl apply -f .

# Wait for deployment
kubectl rollout status deployment/convergence-pipeline
```

## Step 5: Verify and Test (30 seconds)

```bash
# Get load balancer IP (may take 2-3 minutes to assign)
kubectl get service convergence-pipeline-service

# Once IP is assigned:
export LB_IP=$(kubectl get service convergence-pipeline-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Test health endpoint
curl http://$LB_IP/health

# Expected response:
# {
#   "status": "healthy",
#   "service": "Convergence Data Pipeline",
#   "version": "1.0.0",
#   "environment": "dev"
# }
```

## Access Your API

Once deployed, access:

- **Health Check**: `http://$LB_IP/health`
- **API Docs**: `http://$LB_IP/docs` (Swagger UI)
- **API ReDoc**: `http://$LB_IP/redoc`
- **Metrics**: `http://$LB_IP/metrics`

## One-Command Deployment

Alternatively, use the automated script:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export ENVIRONMENT="dev"

cd infrastructure
./deploy.sh
```

## Monitor Your Deployment

```bash
# View pods
kubectl get pods

# View logs
kubectl logs -l app=convergence-pipeline -f

# Check autoscaling
kubectl get hpa

# View all resources
kubectl get all
```

## Common Issues

### Issue: "Permission denied" errors
**Solution**: Ensure you have Owner/Editor role:
```bash
gcloud projects get-iam-policy $PROJECT_ID
```

### Issue: Image pull errors
**Solution**: Verify image exists in GCR:
```bash
gcloud container images list --repository=gcr.io/$PROJECT_ID
```

### Issue: Load balancer IP not assigned
**Solution**: Wait 2-3 minutes, GCP needs time to provision:
```bash
kubectl get service convergence-pipeline-service -w
```

### Issue: Pods not starting
**Solution**: Check pod logs:
```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name>
```

## Clean Up (Optional)

To delete all resources:

```bash
cd infrastructure
./cleanup.sh
# Type 'DELETE' when prompted
```

## Next Steps

1. **Configure secrets** in GCP Secret Manager
2. **Set up monitoring** in Cloud Console
3. **Configure custom domain** and SSL certificate
4. **Enable alerting** for production readiness
5. **Review security settings** in Cloud Armor

## Production Deployment

For production, update `terraform.tfvars`:

```hcl
environment = "production"
min_replicas = 3
max_replicas = 20
enable_cloud_armor = true
enable_cmek = true
enable_private_endpoint = true

authorized_networks = [
  {
    cidr_block   = "203.0.113.0/24"  # Your office IP
    display_name = "Corporate Network"
  }
]
```

## Get Help

- **Documentation**: See `infrastructure/README.md`
- **Troubleshooting**: Check logs with `kubectl logs -l app=convergence-pipeline`
- **GCP Console**: https://console.cloud.google.com
- **Issues**: File an issue on GitHub

---

**Deployment Time**: 5-10 minutes
**Cost**: ~$80-120/month (dev environment)
**Status**: Production-ready ✓
