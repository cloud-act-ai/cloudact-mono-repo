# Cloud Run Deployment Configuration - READY TO DEPLOY

**Project:** Convergence Data Pipeline
**Target:** Google Cloud Run
**GCP Project:** gac-prod-471220
**Region:** us-central1
**Status:** CONFIGURED - Pre-checks required before deployment

---

## Current Infrastructure Status

### Existing Resources (Verified)
- **GCP Project:** `gac-prod-471220` (Active)
- **Active Service Account:** `cloudact-common@gac-prod-471220.iam.gserviceaccount.com`
- **Artifact Registry:** `gcr.io` (us location) - 928 MB used
- **Existing Cloud Run Services:**
  - `convergence-pipeline-prod` (Last deployed: Nov 16, 2025)
  - `convergence-pipeline-stage` (Last deployed: Nov 18, 2025)

### Missing Resources (Need Creation)
- **Service Account:** `convergence-api@gac-prod-471220.iam.gserviceaccount.com` (Not found)
- **Artifact Registry:** `convergence` repository (Docker format, recommended for new deployments)

---

## Pre-Deployment Checklist

### 1. Create Required Service Account

```bash
# Create service account
gcloud iam service-accounts create convergence-api \
  --project=gac-prod-471220 \
  --display-name="Convergence API Service Account" \
  --description="Service account for convergence-data-pipeline Cloud Run service"

# Grant required IAM roles
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/cloudtrace.agent"

# Verify service account creation
gcloud iam service-accounts describe \
  convergence-api@gac-prod-471220.iam.gserviceaccount.com \
  --project=gac-prod-471220
```

### 2. Create Artifact Registry Repository (Recommended)

```bash
# Create dedicated repository for convergence images
gcloud artifacts repositories create convergence \
  --repository-format=docker \
  --location=us \
  --project=gac-prod-471220 \
  --description="Convergence Data Pipeline Docker images"

# Configure Docker authentication
gcloud auth configure-docker us-docker.pkg.dev
```

**Note:** Current deployment uses `gcr.io` (legacy). Consider migrating to Artifact Registry for better features.

### 3. Enable Required GCP APIs

```bash
# Enable all required APIs (if not already enabled)
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  bigquery.googleapis.com \
  pubsub.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudtrace.googleapis.com \
  logging.googleapis.com \
  --project=gac-prod-471220
```

### 4. Initialize BigQuery Metadata Tables

```bash
# Run metadata initialization script
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Set environment variables
export GCP_PROJECT_ID=gac-prod-471220
export BIGQUERY_LOCATION=US
export ENVIRONMENT=production

# Initialize metadata tables
python src/scripts/init_metadata_tables.py
```

### 5. Configure Environment Variables

Required environment variables for Cloud Run deployment:

```bash
# Core GCP Configuration
GCP_PROJECT_ID=gac-prod-471220
BIGQUERY_LOCATION=US
ENVIRONMENT=production
VERSION=<GIT_SHA>

# Application Configuration
APP_NAME=convergence-data-pipeline
API_HOST=0.0.0.0
API_PORT=8080
LOG_LEVEL=INFO

# Security Configuration
DISABLE_AUTH=false
API_KEY_SECRET_KEY=<STORE_IN_SECRET_MANAGER>
ENABLE_DEV_MODE=false

# Database Configuration
ADMIN_METADATA_DATASET=metadata
LOCK_BACKEND=firestore
FIRESTORE_LOCK_COLLECTION=pipeline_locks

# Observability
ENABLE_TRACING=true
ENABLE_METRICS=true
OTEL_SERVICE_NAME=convergence-api

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=500
RATE_LIMIT_REQUESTS_PER_HOUR=20000
RATE_LIMIT_PIPELINE_CONCURRENCY=10
```

---

## Deployment Options

### Option 1: Using Cloud Build (Recommended)

**Best for:** Automated CI/CD pipelines with built-in testing, health checks, and gradual rollout.

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Submit build to Cloud Build
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --substitutions="_ENVIRONMENT=production,_REGION=us-central1" \
  --timeout=1800s

# Monitor build progress
gcloud builds list --project=gac-prod-471220 --limit=5
```

**Features:**
- Automated testing before deployment
- Multi-stage Docker build optimization
- Health checks on new revision
- Gradual traffic migration (25% → 50% → 100%)
- Automatic rollback on failure
- Keeps last 5 revisions for rollback

**Service Configuration (from cloudbuild.yaml):**
- Service Name: `convergence-api`
- Min Instances: 2
- Max Instances: 50
- Memory: 4Gi
- CPU: 4 cores
- Concurrency: 80
- Timeout: 3600s (1 hour)

### Option 2: Using Deployment Script

**Best for:** Manual deployments with full control and dry-run support.

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Set environment variables
export GCP_PROJECT_PROD=gac-prod-471220

# Dry run to preview deployment
./deployment/deploy.sh production --dry-run

# Deploy to production
./deployment/deploy.sh production

# Deploy using Cloud Build
./deployment/deploy.sh production --cloud-build

# Deploy specific image tag
./deployment/deploy.sh production --skip-build --image-tag v1.0.0
```

**Script Features:**
- Interactive confirmation for production
- Automated tests before deployment
- Local or Cloud Build options
- Health check verification
- Color-coded status output

### Option 3: Direct gcloud Command (Quick Deploy)

**Best for:** Quick deployments of pre-built images or hotfixes.

```bash
# Get current git commit SHA
IMAGE_TAG=$(git rev-parse --short HEAD)

# Option A: Using existing gcr.io (current setup)
IMAGE_URL="gcr.io/gac-prod-471220/convergence-api:${IMAGE_TAG}"

# Option B: Using new Artifact Registry (if created)
IMAGE_URL="us-docker.pkg.dev/gac-prod-471220/convergence/api:${IMAGE_TAG}"

# Deploy to Cloud Run
gcloud run deploy convergence-data-pipeline \
  --image=${IMAGE_URL} \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --platform=managed \
  --service-account=convergence-api@gac-prod-471220.iam.gserviceaccount.com \
  --set-env-vars="GCP_PROJECT_ID=gac-prod-471220,BIGQUERY_LOCATION=US,ENVIRONMENT=production,VERSION=${IMAGE_TAG},APP_NAME=convergence-data-pipeline,LOG_LEVEL=INFO,ENABLE_TRACING=true,ENABLE_METRICS=true,OTEL_SERVICE_NAME=convergence-api,ADMIN_METADATA_DATASET=metadata,LOCK_BACKEND=firestore,DISABLE_AUTH=false" \
  --allow-unauthenticated \
  --memory=4Gi \
  --cpu=4 \
  --concurrency=80 \
  --max-instances=50 \
  --min-instances=2 \
  --timeout=3600 \
  --port=8080

# Get service URL
SERVICE_URL=$(gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='value(status.url)')

echo "Deployment successful! Service URL: ${SERVICE_URL}"

# Test health endpoint
curl -s ${SERVICE_URL}/health | jq .
```

---

## Build and Push Docker Image

### Build Locally and Push

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Get git commit SHA
IMAGE_TAG=$(git rev-parse --short HEAD)

# Option A: Build and push to gcr.io (current)
gcloud auth configure-docker gcr.io
docker build \
  -t gcr.io/gac-prod-471220/convergence-api:${IMAGE_TAG} \
  -t gcr.io/gac-prod-471220/convergence-api:latest \
  -f deployment/Dockerfile \
  --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  --build-arg VERSION="${IMAGE_TAG}" \
  .

docker push gcr.io/gac-prod-471220/convergence-api:${IMAGE_TAG}
docker push gcr.io/gac-prod-471220/convergence-api:latest

# Option B: Build and push to Artifact Registry (recommended)
gcloud auth configure-docker us-docker.pkg.dev
docker build \
  -t us-docker.pkg.dev/gac-prod-471220/convergence/api:${IMAGE_TAG} \
  -t us-docker.pkg.dev/gac-prod-471220/convergence/api:latest \
  -f deployment/Dockerfile \
  --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  --build-arg VERSION="${IMAGE_TAG}" \
  .

docker push us-docker.pkg.dev/gac-prod-471220/convergence/api:${IMAGE_TAG}
docker push us-docker.pkg.dev/gac-prod-471220/convergence/api:latest
```

### Build with Cloud Build

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

IMAGE_TAG=$(git rev-parse --short HEAD)

gcloud builds submit \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --tag=us-docker.pkg.dev/gac-prod-471220/convergence/api:${IMAGE_TAG} \
  --file=deployment/Dockerfile \
  --timeout=900s \
  .
```

---

## Post-Deployment Verification

### 1. Check Service Status

```bash
# Verify deployment
gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format=yaml

# Get service URL
SERVICE_URL=$(gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='value(status.url)')

echo "Service URL: ${SERVICE_URL}"
```

### 2. Health Check

```bash
# Test health endpoint
curl -X GET ${SERVICE_URL}/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "<git-sha>",
#   "timestamp": "2025-11-17T..."
# }
```

### 3. API Documentation

```bash
# Access API documentation (if enabled)
open "${SERVICE_URL}/docs"
```

### 4. Monitor Logs

```bash
# View recent logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-data-pipeline" \
  --project=gac-prod-471220 \
  --limit=50 \
  --format=json

# Stream logs in real-time
gcloud logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-data-pipeline" \
  --project=gac-prod-471220
```

### 5. Check Metrics

```bash
# View Cloud Run metrics
gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='table(
    status.traffic[].revisionName,
    status.traffic[].percent,
    status.conditions[].status
  )'
```

---

## Rollback Procedures

### Rollback to Previous Revision

```bash
# List recent revisions
gcloud run revisions list \
  --service=convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --limit=10

# Rollback to specific revision
PREVIOUS_REVISION="convergence-data-pipeline-00001-abc"

gcloud run services update-traffic convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --to-revisions=${PREVIOUS_REVISION}=100

# Verify rollback
gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='value(status.latestReadyRevisionName)'
```

### Using Rollback Script

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Interactive rollback
./deployment/rollback.sh

# Rollback to specific revision
./deployment/rollback.sh --revision convergence-data-pipeline-00001-abc
```

---

## Configuration Files Summary

### Key Files Verified

1. **deployment/cloudbuild.yaml**
   - Multi-environment CI/CD pipeline
   - Automated testing, health checks, gradual rollout
   - Configured for production deployment

2. **deployment/Dockerfile**
   - Multi-stage build for optimization
   - Python 3.11-slim base image
   - Non-root user for security
   - Health check enabled
   - Uvicorn server configuration

3. **deployment/deploy.sh**
   - Interactive deployment script
   - Dry-run support
   - Environment-specific configurations
   - Health check verification

4. **.env.example**
   - Complete environment variable reference
   - 185 configuration options documented
   - Security and performance settings

5. **requirements.txt**
   - FastAPI 0.109.0
   - Google Cloud libraries (BigQuery, Pub/Sub, Secret Manager, etc.)
   - Polars for data processing
   - OpenTelemetry for observability

### Environment Templates

- `deployment/environments/production.env.template` - Production configuration template
- `deployment/environments/staging.env` - Staging environment
- `deployment/environments/development.env` - Development environment

---

## Critical Warnings

### BEFORE DEPLOYMENT

1. **Service Account Creation Required**
   - The service account `convergence-api@gac-prod-471220.iam.gserviceaccount.com` does NOT exist
   - Run the service account creation commands in Pre-Deployment Checklist first

2. **Artifact Registry Repository**
   - Current: Using `gcr.io` (legacy)
   - Recommended: Create `convergence` repository in Artifact Registry
   - Update image URLs if migrating

3. **BigQuery Metadata Tables**
   - Run `init_metadata_tables.py` before first deployment
   - Creates required tables: x_meta_api_keys, x_meta_pipeline_runs, etc.

4. **Environment Variables**
   - DO NOT commit secrets to git
   - Use Secret Manager for sensitive values (API keys, tokens, etc.)
   - Review `.env.example` for all required variables

5. **Existing Services**
   - Services `convergence-pipeline-prod` and `convergence-pipeline-stage` already exist
   - New service will be named `convergence-api` (or `convergence-data-pipeline`)
   - Ensure no naming conflicts

6. **Firestore for Distributed Locks**
   - Application uses Firestore for pipeline locks
   - Ensure Firestore is enabled and configured
   - Collection: `pipeline_locks`

---

## Recommended Deployment Sequence

### First-Time Production Deployment

```bash
# Step 1: Create service account
<Run service account creation commands>

# Step 2: Create Artifact Registry (optional but recommended)
<Run Artifact Registry creation commands>

# Step 3: Enable APIs
<Run API enablement commands>

# Step 4: Initialize BigQuery metadata
python src/scripts/init_metadata_tables.py

# Step 5: Build and push Docker image
<Run build commands>

# Step 6: Deploy using Cloud Build (recommended)
gcloud builds submit --config=deployment/cloudbuild.yaml ...

# Step 7: Verify deployment
<Run post-deployment verification commands>
```

### Subsequent Deployments

```bash
# Quick deployment with existing infrastructure
./deployment/deploy.sh production --cloud-build
```

---

## Support and Troubleshooting

### Common Issues

1. **Service Account Not Found**
   - Error: `Service account convergence-api@... does not exist`
   - Solution: Run service account creation commands

2. **Permission Denied**
   - Error: `Permission denied on BigQuery dataset`
   - Solution: Grant required IAM roles to service account

3. **Health Check Failed**
   - Error: `Health check endpoint returns 503/500`
   - Solution: Check logs for application startup errors, verify environment variables

4. **Image Not Found**
   - Error: `The requested image ... was not found`
   - Solution: Build and push Docker image first

### Logs and Monitoring

```bash
# Application logs
gcloud logging read "resource.type=cloud_run_revision" --project=gac-prod-471220 --limit=100

# Cloud Build logs
gcloud builds list --project=gac-prod-471220 --limit=10

# Service metrics
gcloud monitoring dashboards list --project=gac-prod-471220
```

### Contact

- **Documentation:** `/Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline/deployment/README.md`
- **Project Repository:** Git repository at current location
- **Environment:** GCP Project `gac-prod-471220`

---

**Generated:** 2025-11-17
**Last Updated:** 2025-11-17
**Deployment Status:** READY (Pre-checks required)
