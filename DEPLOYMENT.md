# Deployment Guide - Convergence Data Pipeline

**Version:** 2.0.0
**Last Updated:** 2025-11-19
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Infrastructure Setup (One-Time)](#1-infrastructure-setup-one-time)
3. [Local Deployment](#2-local-deployment)
4. [Staging Deployment](#3-staging-deployment)
5. [Production Deployment](#4-production-deployment)
6. [Cloud Scheduler Setup](#5-cloud-scheduler-setup)
7. [Monitoring & Operations](#6-monitoring--operations)
8. [Rollback Procedures](#7-rollback-procedures)
9. [Troubleshooting](#troubleshooting)
10. [Quick Reference](#quick-reference)

---

## Overview

The Convergence Data Pipeline is a production-ready multi-tenant data processing system deployed on Google Cloud Platform (GCP) using Cloud Run.

### Architecture Overview

```
┌─────────────────┐
│   GitHub Repo   │
└────────┬────────┘
         │
    ┌────┴────────────────────────┐
    │                             │
    v                             v
┌──────────────┐         ┌──────────────┐
│ GitHub       │         │ Cloud Build  │
│ Actions      │         │ (GCP)        │
└──────┬───────┘         └──────┬───────┘
       │                        │
       └────────┬───────────────┘
                │
    ┌───────────┴───────────────┐
    │                           │
    v                           v
┌──────────────┐       ┌──────────────┐
│ Artifact     │       │ Cloud Run    │
│ Registry     │──────>│ (Service)    │
└──────────────┘       └──────┬───────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    v                   v
            ┌──────────────┐    ┌──────────────┐
            │  BigQuery    │    │  Cloud KMS   │
            │  (Data)      │    │  (Security)  │
            └──────────────┘    └──────────────┘
                    │
                    v
            ┌──────────────┐
            │  Cloud       │
            │  Scheduler   │
            └──────────────┘
```

### Environments

| Environment | Purpose | GCP Project | Deployment Method |
|-------------|---------|-------------|-------------------|
| **Local/Dev** | Development & Testing | gac-prod-471220 | Manual (`uvicorn`) |
| **Staging** | Pre-production Validation | gac-stage-471220 | Auto (GitHub Actions) |
| **Production** | Live Service | gac-prod-471220 | Manual/Auto (GitHub Actions) |

### Deployment Methods

**Method 1: GitHub Actions (Recommended)**
- Automated CI/CD pipeline
- Built-in testing and validation
- Environment protection rules
- Push to main → auto-deploy to staging/production

**Method 2: Cloud Build**
- Native GCP integration
- Faster builds (GCP network)
- Manual trigger via `gcloud builds submit`

**Method 3: Manual Deployment**
- Direct `gcloud run deploy`
- Suitable for testing and hotfixes
- Use `deployment/deploy.sh` script

---

## 1. Infrastructure Setup (One-Time)

### Prerequisites

**Required GCP Projects:**
- Development: `gac-prod-471220` (or your dev project)
- Staging: `gac-stage-471220`
- Production: `gac-prod-471220`

**Required Tools:**
- `gcloud` CLI (authenticated)
- `gh` CLI (for GitHub Actions)
- Python 3.11+
- Docker (optional)
- `curl` and `jq`

**Required APIs (enable for each project):**

```bash
# Set project context
export PROJECT_ID="gac-prod-471220"  # Change per environment

# Enable required APIs
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  bigquery.googleapis.com \
  cloudkms.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project=${PROJECT_ID}
```

---

### 1.1 Service Account Setup

**Create Cloud Run Service Account:**

```bash
# For each environment (dev, staging, prod)
for ENV in dev staging prod; do
  if [ "$ENV" = "dev" ] || [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
  else
    PROJECT_ID="gac-stage-471220"
  fi

  # Create service account
  gcloud iam service-accounts create convergence-api-${ENV} \
    --display-name="Convergence API Service Account (${ENV})" \
    --project=${PROJECT_ID}

  # Grant BigQuery permissions
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:convergence-api-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/bigquery.admin"

  # Grant Cloud KMS permissions
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:convergence-api-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"

  # Grant Secret Manager permissions
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:convergence-api-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

  # Grant Cloud Run Invoker (for scheduler)
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:convergence-api-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/run.invoker"
done
```

**Create GitHub Actions Service Account (if using GitHub Actions):**

```bash
# Create service account for GitHub Actions
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deployer" \
  --project=gac-prod-471220

# Grant deployment permissions across all environments
for PROJECT_ID in gac-prod-471220 gac-stage-471220; do
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:github-actions@gac-prod-471220.iam.gserviceaccount.com" \
    --role="roles/run.admin"

  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:github-actions@gac-prod-471220.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:github-actions@gac-prod-471220.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:github-actions@gac-prod-471220.iam.gserviceaccount.com" \
    --role="roles/cloudbuild.builds.editor"
done
```

---

### 1.2 KMS Setup

**Use Automated Script (Recommended):**

```bash
# Navigate to scripts directory
cd /home/user/cloudact-backend-systems

# Run KMS setup for all environments
python3 scripts/setup_kms_infrastructure.py local
python3 scripts/setup_kms_infrastructure.py staging
python3 scripts/setup_kms_infrastructure.py production
```

**Manual KMS Setup (Alternative):**

```bash
# For each environment
for ENV in dev staging prod; do
  if [ "$ENV" = "dev" ] || [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    KEYRING_NAME="convergence-keyring-${ENV}"
  else
    PROJECT_ID="gac-stage-471220"
    KEYRING_NAME="convergence-keyring-${ENV}"
  fi

  LOCATION="us-central1"
  KEY_NAME="api-key-encryption"
  SERVICE_ACCOUNT="convergence-api-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com"

  # Create KMS keyring
  gcloud kms keyrings create ${KEYRING_NAME} \
    --location=${LOCATION} \
    --project=${PROJECT_ID}

  # Create encryption key
  gcloud kms keys create ${KEY_NAME} \
    --location=${LOCATION} \
    --keyring=${KEYRING_NAME} \
    --purpose=encryption \
    --project=${PROJECT_ID}

  # Grant service account access
  gcloud kms keys add-iam-policy-binding ${KEY_NAME} \
    --location=${LOCATION} \
    --keyring=${KEYRING_NAME} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
    --project=${PROJECT_ID}

  echo "✓ KMS setup complete for ${ENV}"
  echo "  Key: projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/${KEYRING_NAME}/cryptoKeys/${KEY_NAME}"
done
```

**Verify KMS Setup:**

```bash
# List keyrings
gcloud kms keyrings list \
  --location=us-central1 \
  --project=gac-prod-471220

# Test encryption
echo "test" | gcloud kms encrypt \
  --location=us-central1 \
  --keyring=convergence-keyring-prod \
  --key=api-key-encryption \
  --plaintext-file=- \
  --ciphertext-file=- \
  --project=gac-prod-471220 | base64
```

---

### 1.3 Artifact Registry Setup

**Create Docker Repositories:**

```bash
# Create repository for each environment
for PROJECT_ID in gac-prod-471220 gac-stage-471220; do
  gcloud artifacts repositories create convergence \
    --repository-format=docker \
    --location=us \
    --description="Convergence API Docker images" \
    --project=${PROJECT_ID}

  echo "✓ Artifact Registry created: us-docker.pkg.dev/${PROJECT_ID}/convergence"
done
```

**Grant Access to Service Accounts:**

```bash
# Grant GitHub Actions service account access
for PROJECT_ID in gac-prod-471220 gac-stage-471220; do
  gcloud artifacts repositories add-iam-policy-binding convergence \
    --location=us \
    --member="serviceAccount:github-actions@gac-prod-471220.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer" \
    --project=${PROJECT_ID}
done
```

---

### 1.4 Secret Manager Setup

**Generate Admin API Keys:**

```bash
# Generate admin API key using secure script
cd /home/user/cloudact-backend-systems
python3 scripts/generate_admin_key.py

# Output: admin_<random_token>
```

**Store Admin Keys in Secret Manager:**

```bash
# For each environment
for ENV in dev staging prod; do
  if [ "$ENV" = "dev" ] || [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
  else
    PROJECT_ID="gac-stage-471220"
  fi

  # Generate secure admin key
  ADMIN_KEY=$(python3 scripts/generate_admin_key.py --no-prompt)

  # Store in Secret Manager
  echo -n "${ADMIN_KEY}" | gcloud secrets create admin-api-key-${ENV} \
    --data-file=- \
    --replication-policy=automatic \
    --project=${PROJECT_ID}

  # Grant service account access
  gcloud secrets add-iam-policy-binding admin-api-key-${ENV} \
    --member="serviceAccount:convergence-api-${ENV}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=${PROJECT_ID}

  echo "✓ Admin API key stored for ${ENV}"
  echo "  Secret: admin-api-key-${ENV}"
  echo "  Key: ${ADMIN_KEY}" >> /tmp/admin-keys-${ENV}.txt  # SAVE THIS FILE SECURELY
done

echo "⚠️  IMPORTANT: Admin keys saved to /tmp/admin-keys-*.txt"
echo "   Copy these to a secure location and DELETE the files!"
```

---

### 1.5 GitHub Actions Setup (Optional)

**Setup Workload Identity Federation:**

```bash
PROJECT_ID="gac-prod-471220"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')

# Create Workload Identity Pool
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions Pool" \
  --project=${PROJECT_ID}

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository_owner=='YOUR_GITHUB_ORG'" \
  --project=${PROJECT_ID}

# Bind service account to Workload Identity
gcloud iam service-accounts add-iam-policy-binding \
  github-actions@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO" \
  --project=${PROJECT_ID}

echo "✓ Workload Identity Federation configured"
echo "  Provider: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github"
```

**Configure GitHub Secrets:**

Navigate to: `GitHub Repository > Settings > Secrets and variables > Actions`

Add the following secrets:

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `GCP_PROJECT_DEV` | `gac-prod-471220` | Development GCP project |
| `GCP_PROJECT_STAGING` | `gac-stage-471220` | Staging GCP project |
| `GCP_PROJECT_PROD` | `gac-prod-471220` | Production GCP project |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` | Workload Identity Provider |
| `GCP_SERVICE_ACCOUNT` | `github-actions@gac-prod-471220.iam.gserviceaccount.com` | GitHub Actions service account |

---

### 1.6 Infrastructure Setup Checklist

**Verify Infrastructure:**

```bash
# Check service accounts
for PROJECT_ID in gac-prod-471220 gac-stage-471220; do
  echo "=== ${PROJECT_ID} ==="
  gcloud iam service-accounts list --project=${PROJECT_ID}
done

# Check KMS keys
for PROJECT_ID in gac-prod-471220 gac-stage-471220; do
  echo "=== ${PROJECT_ID} ==="
  gcloud kms keyrings list --location=us-central1 --project=${PROJECT_ID}
done

# Check Artifact Registry
for PROJECT_ID in gac-prod-471220 gac-stage-471220; do
  echo "=== ${PROJECT_ID} ==="
  gcloud artifacts repositories list --location=us --project=${PROJECT_ID}
done

# Check Secrets
for PROJECT_ID in gac-prod-471220 gac-stage-471220; do
  echo "=== ${PROJECT_ID} ==="
  gcloud secrets list --project=${PROJECT_ID}
done
```

**Infrastructure Checklist:**

- [ ] Service accounts created for all environments
- [ ] KMS keyrings and keys created
- [ ] Artifact Registry repositories created
- [ ] Admin API keys generated and stored in Secret Manager
- [ ] GitHub Actions Workload Identity configured (if using GitHub Actions)
- [ ] All required GCP APIs enabled
- [ ] IAM permissions granted to service accounts

---

## 2. Local Deployment

### 2.1 Clone Repository

```bash
git clone https://github.com/gc-cloudact-ai/cloudact-backend-systems.git
cd cloudact-backend-systems/convergence-data-pipeline
```

### 2.2 Install Dependencies

```bash
# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2.3 Configure Environment

**Create `.env` file:**

```bash
cat > .env << 'EOF'
# GCP Configuration
GCP_PROJECT_ID=gac-prod-471220
BIGQUERY_LOCATION=US
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# KMS Configuration
GCP_KMS_KEY_NAME=projects/gac-prod-471220/locations/us-central1/keyRings/convergence-keyring-dev/cryptoKeys/api-key-encryption

# Application
ENVIRONMENT=development
LOG_LEVEL=DEBUG
API_HOST=0.0.0.0
API_PORT=8000

# Security
ADMIN_API_KEY=your-admin-key-here
DISABLE_AUTH=false  # Set to true only for local testing
EOF
```

**Set up Google Application Credentials:**

```bash
# Download service account key from GCP Console
# IAM & Admin > Service Accounts > convergence-api-dev > Keys > Add Key

# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

### 2.4 Generate Admin API Key

```bash
# Generate secure admin key
python3 scripts/generate_admin_key.py

# Update .env file with generated key
export ADMIN_API_KEY='<generated-key>'
```

### 2.5 Start Application

```bash
# Start FastAPI server
python3 -m uvicorn src.app.main:app --reload --port 8000

# Expected output:
# INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
# INFO:     Started reloader process
```

### 2.6 Bootstrap System (First Time Only)

```bash
# In a new terminal, run bootstrap
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: ${ADMIN_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'

# Expected response:
# {
#   "status": "success",
#   "message": "Bootstrap completed successfully",
#   "dataset": "tenants",
#   "tables_created": 11
# }
```

**Verify Bootstrap:**

```bash
# Check BigQuery dataset
bq ls gac-prod-471220:tenants

# Expected output: 11 tables
# tenant_profiles
# tenant_api_keys
# tenant_subscriptions
# tenant_usage_quotas
# tenant_cloud_credentials
# tenant_pipeline_configs
# tenant_scheduled_pipeline_runs
# tenant_pipeline_execution_queue
# tenant_pipeline_runs
# tenant_step_logs
# tenant_dq_results
```

### 2.7 Run Local Tests

```bash
# Set test environment variables
export ADMIN_API_KEY='your-admin-key'
export API_URL='http://localhost:8000'

# Run local test suite
./tests/local_test_suite.sh

# Expected: 10/10 tests passed
```

### 2.8 Local Development Checklist

- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] `.env` file configured
- [ ] Service account credentials downloaded
- [ ] Admin API key generated
- [ ] Application started successfully
- [ ] Bootstrap completed
- [ ] Local tests passing

---

## 3. Staging Deployment

### 3.1 Build & Deploy to Cloud Run

**Option A: GitHub Actions (Recommended)**

```bash
# Push to main branch triggers auto-deployment
git checkout main
git pull origin main
git merge develop
git push origin main

# Monitor deployment
gh run list --limit 1
gh run watch
```

**Option B: Cloud Build (Manual)**

```bash
# Set environment
export PROJECT_ID="gac-stage-471220"
export REGION="us-central1"
export SERVICE_NAME="convergence-api-staging"

# Build and push image
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging,_REGION=${REGION} \
  --project=${PROJECT_ID} \
  --timeout=20m

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image=us-docker.pkg.dev/${PROJECT_ID}/convergence/api:staging-latest \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=convergence-api-staging@${PROJECT_ID}.iam.gserviceaccount.com \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --concurrency=100 \
  --min-instances=1 \
  --max-instances=10 \
  --project=${PROJECT_ID}
```

**Option C: Deployment Script**

```bash
cd cloudact-infrastructure-scripts
./05-deploy.sh stage
```

### 3.2 Environment Variables

**Set Required Environment Variables:**

```bash
# Get admin API key from Secret Manager
ADMIN_KEY=$(gcloud secrets versions access latest \
  --secret=admin-api-key-staging \
  --project=gac-stage-471220)

# Get KMS key name
KMS_KEY_NAME="projects/gac-stage-471220/locations/us-central1/keyRings/convergence-keyring-staging/cryptoKeys/api-key-encryption"

# Update Cloud Run service with environment variables
gcloud run services update convergence-api-staging \
  --set-env-vars="ENVIRONMENT=staging" \
  --set-env-vars="GCP_PROJECT_ID=gac-stage-471220" \
  --set-env-vars="BIGQUERY_LOCATION=US" \
  --set-env-vars="GCP_KMS_KEY_NAME=${KMS_KEY_NAME}" \
  --set-env-vars="LOG_LEVEL=INFO" \
  --update-secrets=ADMIN_API_KEY=admin-api-key-staging:latest \
  --region=us-central1 \
  --project=gac-stage-471220
```

### 3.3 Bootstrap Staging (First Time Only)

```bash
# Get staging service URL
STAGING_URL=$(gcloud run services describe convergence-api-staging \
  --region=us-central1 \
  --project=gac-stage-471220 \
  --format='value(status.url)')

# Get admin API key
ADMIN_KEY=$(gcloud secrets versions access latest \
  --secret=admin-api-key-staging \
  --project=gac-stage-471220)

# Run bootstrap
curl -X POST "${STAGING_URL}/api/v1/admin/bootstrap" \
  -H "X-Admin-Key: ${ADMIN_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'

# Verify
bq ls gac-stage-471220:tenants
```

### 3.4 Run Staging Tests

```bash
# Set test environment
export STAGING_URL="${STAGING_URL}"
export ADMIN_API_KEY="${ADMIN_KEY}"

# Run staging test suite
./tests/staging_test_suite.sh

# Expected: 10/10 tests passed
```

### 3.5 Staging Deployment Checklist

- [ ] Docker image built and pushed to Artifact Registry
- [ ] Cloud Run service deployed successfully
- [ ] Environment variables configured
- [ ] Secrets mounted from Secret Manager
- [ ] Bootstrap completed
- [ ] Staging tests passing
- [ ] Service URL accessible via HTTPS
- [ ] Logs showing no errors

---

## 4. Production Deployment

### 4.1 Pre-Deployment Checklist

**Critical Requirements:**

- [ ] All staging tests passing
- [ ] Load testing completed (if applicable)
- [ ] Security review completed
- [ ] Database migration scripts prepared (if needed)
- [ ] Backup plan documented
- [ ] Rollback plan documented
- [ ] On-call engineer notified
- [ ] Deployment window scheduled
- [ ] Stakeholders notified

### 4.2 Build & Deploy to Production

**Option A: GitHub Actions (with Approval)**

```bash
# Push to main branch (requires approval)
git checkout main
git pull origin main
git merge develop
git push origin main

# GitHub Actions will:
# 1. Wait for deployment approval
# 2. Build Docker image
# 3. Push to Artifact Registry
# 4. Deploy to Cloud Run (production)
# 5. Run health checks
# 6. Create deployment tag
```

**Option B: Manual Deployment (Recommended for Production)**

```bash
# Set environment
export PROJECT_ID="gac-prod-471220"
export REGION="us-central1"
export SERVICE_NAME="convergence-api-prod"
export VERSION="v1.1.0"  # Update version number

# Build production image
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=production,_REGION=${REGION},_VERSION=${VERSION} \
  --project=${PROJECT_ID} \
  --timeout=20m

# Deploy to Cloud Run with blue-green strategy
gcloud run deploy ${SERVICE_NAME} \
  --image=us-docker.pkg.dev/${PROJECT_ID}/convergence/api:production-${VERSION} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=convergence-api-prod@${PROJECT_ID}.iam.gserviceaccount.com \
  --memory=4Gi \
  --cpu=4 \
  --timeout=300 \
  --concurrency=200 \
  --min-instances=2 \
  --max-instances=50 \
  --no-traffic \
  --tag=blue \
  --project=${PROJECT_ID}
```

### 4.3 Environment Variables (Production)

```bash
# Get admin API key from Secret Manager
ADMIN_KEY=$(gcloud secrets versions access latest \
  --secret=admin-api-key-prod \
  --project=gac-prod-471220)

# Get KMS key name
KMS_KEY_NAME="projects/gac-prod-471220/locations/us-central1/keyRings/convergence-keyring-prod/cryptoKeys/api-key-encryption"

# Update Cloud Run service with environment variables
gcloud run services update convergence-api-prod \
  --set-env-vars="ENVIRONMENT=production" \
  --set-env-vars="GCP_PROJECT_ID=gac-prod-471220" \
  --set-env-vars="BIGQUERY_LOCATION=US" \
  --set-env-vars="GCP_KMS_KEY_NAME=${KMS_KEY_NAME}" \
  --set-env-vars="LOG_LEVEL=INFO" \
  --set-env-vars="VERSION=${VERSION}" \
  --update-secrets=ADMIN_API_KEY=admin-api-key-prod:latest \
  --region=us-central1 \
  --project=gac-prod-471220
```

### 4.4 Gradual Traffic Migration

```bash
# Get production URL
PROD_URL=$(gcloud run services describe convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format='value(status.url)')

# Get new revision name
NEW_REVISION=$(gcloud run revisions list \
  --service=convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format='value(name)' \
  --sort-by=~metadata.creationTimestamp \
  --limit=1)

# Gradually shift traffic (25% → 50% → 100%)
echo "Shifting 25% traffic to new revision..."
gcloud run services update-traffic convergence-api-prod \
  --to-revisions=${NEW_REVISION}=25 \
  --region=us-central1 \
  --project=gac-prod-471220

# Monitor for 10 minutes
echo "Monitoring... Check logs and metrics"
sleep 600

# Shift 50% traffic
echo "Shifting 50% traffic to new revision..."
gcloud run services update-traffic convergence-api-prod \
  --to-revisions=${NEW_REVISION}=50 \
  --region=us-central1 \
  --project=gac-prod-471220

# Monitor for 10 minutes
sleep 600

# Shift 100% traffic
echo "Shifting 100% traffic to new revision..."
gcloud run services update-traffic convergence-api-prod \
  --to-revisions=${NEW_REVISION}=100 \
  --region=us-central1 \
  --project=gac-prod-471220

echo "✓ Production deployment complete!"
```

### 4.5 Verify Production Deployment

```bash
# Health check
curl "${PROD_URL}/health"

# Expected response:
# {
#   "status": "healthy",
#   "service": "convergence-data-pipeline",
#   "version": "1.1.0",
#   "environment": "production"
# }

# Run production test suite (non-destructive)
export PROD_URL="${PROD_URL}"
export ADMIN_API_KEY="${ADMIN_KEY}"
./tests/production_test_suite.sh

# Expected: 10/10 tests passed
```

### 4.6 Post-Deployment Monitoring

```bash
# Monitor logs for errors
gcloud logging tail "resource.type=cloud_run_revision AND severity>=ERROR" \
  --project=gac-prod-471220 \
  --limit=50

# Check request metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="convergence-api-prod"' \
  --project=gac-prod-471220

# Check latency metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies" AND resource.labels.service_name="convergence-api-prod"' \
  --project=gac-prod-471220
```

### 4.7 Production Deployment Checklist

- [ ] Pre-deployment checklist completed
- [ ] Production image built and tagged with version
- [ ] Cloud Run service deployed with `--no-traffic`
- [ ] Environment variables configured
- [ ] Health checks passing on new revision
- [ ] Gradual traffic migration (25% → 50% → 100%)
- [ ] Production tests passing
- [ ] Logs showing no errors
- [ ] Metrics within normal ranges
- [ ] Previous revision available for rollback
- [ ] Deployment documented and tagged in Git

---

## 5. Cloud Scheduler Setup

### 5.1 Overview

Cloud Scheduler maintains system health through automated maintenance jobs:

| Job Name | Schedule | Purpose | Endpoint |
|----------|----------|---------|----------|
| **Daily Quota Reset** | `0 0 * * *` (Midnight UTC) | Reset pipeline quotas | `POST /api/v1/scheduler/reset-daily-quotas` |
| **Orphaned Pipeline Cleanup** | `*/30 * * * *` (Every 30 min) | Clean up stuck pipelines | `POST /api/v1/scheduler/cleanup-orphaned-pipelines` |

### 5.2 Deploy Scheduler Jobs

**Using Deployment Script (Recommended):**

```bash
# Set environment variables
export ADMIN_API_KEY="your-admin-api-key"
export API_BASE_URL="https://convergence-api-prod-XXXXX.run.app"
export GCP_PROJECT_ID="gac-prod-471220"
export GCP_REGION="us-central1"

# Deploy jobs
cd convergence-data-pipeline/deployment
chmod +x deploy-scheduler-jobs.sh
./deploy-scheduler-jobs.sh

# Expected output:
# ✓ Job 'reset-daily-quotas' created successfully
# ✓ Job 'cleanup-orphaned-pipelines' created successfully
```

**Manual Job Creation:**

```bash
# Job 1: Daily Quota Reset
gcloud scheduler jobs create http reset-daily-quotas \
  --location=us-central1 \
  --schedule="0 0 * * *" \
  --uri="${API_BASE_URL}/api/v1/scheduler/reset-daily-quotas" \
  --http-method=POST \
  --headers="X-Admin-Key=${ADMIN_API_KEY},Content-Type=application/json" \
  --attempt-deadline=180s \
  --max-retry-attempts=3 \
  --max-backoff=3600s \
  --min-backoff=30s \
  --time-zone="UTC" \
  --project=${GCP_PROJECT_ID}

# Job 2: Orphaned Pipeline Cleanup
gcloud scheduler jobs create http cleanup-orphaned-pipelines \
  --location=us-central1 \
  --schedule="*/30 * * * *" \
  --uri="${API_BASE_URL}/api/v1/scheduler/cleanup-orphaned-pipelines" \
  --http-method=POST \
  --headers="X-Admin-Key=${ADMIN_API_KEY},Content-Type=application/json" \
  --attempt-deadline=300s \
  --max-retry-attempts=2 \
  --max-backoff=1800s \
  --min-backoff=60s \
  --time-zone="UTC" \
  --project=${GCP_PROJECT_ID}
```

### 5.3 Test Scheduler Jobs

```bash
# Test quota reset job
gcloud scheduler jobs run reset-daily-quotas \
  --location=us-central1 \
  --project=gac-prod-471220

# Test cleanup job
gcloud scheduler jobs run cleanup-orphaned-pipelines \
  --location=us-central1 \
  --project=gac-prod-471220

# View job status
gcloud scheduler jobs describe reset-daily-quotas \
  --location=us-central1 \
  --project=gac-prod-471220 \
  --format="value(state,lastAttemptTime,scheduleTime)"
```

### 5.4 Monitor Scheduler Jobs

```bash
# View execution logs
gcloud logging read \
  'resource.type=cloud_scheduler_job AND resource.labels.job_id=reset-daily-quotas' \
  --limit=20 \
  --format=json \
  --project=gac-prod-471220

# List all scheduler jobs
gcloud scheduler jobs list \
  --location=us-central1 \
  --project=gac-prod-471220
```

### 5.5 Update Scheduler Jobs

```bash
# Update schedule (e.g., change cleanup to every 15 minutes)
gcloud scheduler jobs update http cleanup-orphaned-pipelines \
  --schedule="*/15 * * * *" \
  --location=us-central1 \
  --project=gac-prod-471220

# Update API URL (after deployment)
gcloud scheduler jobs update http reset-daily-quotas \
  --uri="https://new-api-url.run.app/api/v1/scheduler/reset-daily-quotas" \
  --location=us-central1 \
  --project=gac-prod-471220
```

### 5.6 Scheduler Setup Checklist

- [ ] Cloud Scheduler API enabled
- [ ] Admin API key configured in job headers
- [ ] API base URL set correctly
- [ ] Jobs created successfully
- [ ] Test runs successful
- [ ] Execution logs visible
- [ ] Alert policies configured for job failures

---

## 6. Monitoring & Operations

### 6.1 Health Checks

**Automated Health Monitoring:**

```bash
# Continuous health check (every 30 seconds)
watch -n 30 'curl -s https://convergence-api-prod-XXXXX.run.app/health | jq'

# Check health endpoint
curl https://convergence-api-prod-XXXXX.run.app/health

# Expected response:
# {
#   "status": "healthy",
#   "service": "convergence-data-pipeline",
#   "version": "1.1.0",
#   "environment": "production",
#   "timestamp": "2025-11-19T12:00:00Z"
# }
```

**Cloud Run Service Health:**

```bash
# Check service status
gcloud run services describe convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220

# List revisions
gcloud run revisions list \
  --service=convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --limit=5
```

### 6.2 Logging

**View Application Logs:**

```bash
# Tail logs in real-time
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-api-prod" \
  --project=gac-prod-471220

# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-api-prod" \
  --limit=100 \
  --project=gac-prod-471220

# Filter for errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=50 \
  --project=gac-prod-471220
```

**Structured Log Queries:**

```bash
# View tenant onboarding logs
gcloud logging read \
  'resource.type=cloud_run_revision AND jsonPayload.tenant_id!="" AND jsonPayload.msg=~"onboard"' \
  --limit=20 \
  --project=gac-prod-471220

# View API authentication failures
gcloud logging read \
  'resource.type=cloud_run_revision AND severity>=WARNING AND jsonPayload.msg=~"authentication"' \
  --limit=20 \
  --project=gac-prod-471220
```

### 6.3 Metrics & Dashboards

**Key Metrics to Monitor:**

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Availability** | 99.9% | < 99.5% |
| **Response Time (P95)** | < 200ms | > 500ms |
| **Response Time (P99)** | < 500ms | > 1000ms |
| **Error Rate** | < 0.1% | > 1% |
| **Request Rate** | Varies | Anomaly detection |
| **Instance Count** | 2-50 | > 45 (scaling limit) |

**View Request Metrics:**

```bash
# Request count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="convergence-api-prod"' \
  --project=gac-prod-471220

# Request latencies
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies" AND resource.labels.service_name="convergence-api-prod"' \
  --project=gac-prod-471220

# Instance count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/instance_count" AND resource.labels.service_name="convergence-api-prod"' \
  --project=gac-prod-471220
```

### 6.4 Alerts

**Create Alert Policies:**

```bash
# Alert: High error rate
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Convergence API - High Error Rate" \
  --condition-display-name="Error rate > 1%" \
  --condition-threshold-value=0.01 \
  --condition-threshold-duration=300s \
  --condition-filter='
    resource.type="cloud_run_revision"
    AND resource.labels.service_name="convergence-api-prod"
    AND metric.type="run.googleapis.com/request_count"
    AND metric.labels.response_code_class="5xx"
  ' \
  --project=gac-prod-471220

# Alert: Health check failures
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Convergence API - Health Check Failures" \
  --condition-display-name="Health check failed 2+ times" \
  --condition-threshold-value=2 \
  --condition-threshold-duration=300s \
  --condition-filter='
    resource.type="cloud_run_revision"
    AND resource.labels.service_name="convergence-api-prod"
    AND metric.type="run.googleapis.com/request_count"
    AND metric.labels.response_code="503"
  ' \
  --project=gac-prod-471220
```

**Recommended Alerts:**

- Health check failures (> 2 consecutive)
- Error rate spike (> 1% in 5 minutes)
- Response time degradation (P95 > 500ms)
- KMS encryption failures
- BigQuery quota limits reached
- Cloud Scheduler job failures
- Instance scaling limits reached

### 6.5 Operations Checklist

- [ ] Health endpoint monitored continuously
- [ ] Application logs centralized and searchable
- [ ] Error logs reviewed daily
- [ ] Key metrics dashboards created
- [ ] Alert policies configured
- [ ] Notification channels set up (email, PagerDuty, Slack)
- [ ] On-call rotation established
- [ ] Runbooks documented for common issues

---

## 7. Rollback Procedures

### 7.1 Quick Rollback (Traffic Routing)

**Immediate rollback by routing traffic to previous revision:**

```bash
# Get previous revision
PREV_REVISION=$(gcloud run revisions list \
  --service=convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format='value(name)' \
  --sort-by=~metadata.creationTimestamp \
  --limit=2 | tail -n 1)

# Route 100% traffic to previous revision
gcloud run services update-traffic convergence-api-prod \
  --to-revisions=${PREV_REVISION}=100 \
  --region=us-central1 \
  --project=gac-prod-471220

echo "✓ Rolled back to revision: ${PREV_REVISION}"

# Verify rollback
gcloud run services describe convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format='value(status.traffic)'
```

### 7.2 Full Rollback (Redeploy Previous Version)

**Redeploy previous Docker image:**

```bash
# Get previous revision's image
PREV_IMAGE=$(gcloud run revisions describe ${PREV_REVISION} \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format='value(spec.containers[0].image)')

# Redeploy with previous image
gcloud run deploy convergence-api-prod \
  --image=${PREV_IMAGE} \
  --region=us-central1 \
  --project=gac-prod-471220

echo "✓ Redeployed previous image: ${PREV_IMAGE}"
```

### 7.3 Database Rollback (If Schema Changed)

**If database schema was modified during deployment:**

```bash
# 1. Backup current state
bq extract \
  --destination_format=AVRO \
  gac-prod-471220:tenants.tenant_profiles \
  gs://backup-bucket/rollback-$(date +%Y%m%d)/tenant_profiles_*.avro

# 2. Force recreate tables with old schema
curl -X POST https://convergence-api-prod-XXXXX.run.app/api/v1/admin/bootstrap \
  -H "X-Admin-Key: ${ADMIN_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "force_recreate_dataset": false,
    "force_recreate_tables": true
  }'

# 3. Restore data from backup
bq load \
  --source_format=AVRO \
  gac-prod-471220:tenants.tenant_profiles \
  gs://backup-bucket/rollback-$(date +%Y%m%d)/tenant_profiles_*.avro
```

### 7.4 Verify Rollback

```bash
# Check service health
curl https://convergence-api-prod-XXXXX.run.app/health

# Check current revision
gcloud run services describe convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format='value(status.traffic)'

# Run production tests
./tests/production_test_suite.sh

# Monitor logs for errors
gcloud logging tail "resource.type=cloud_run_revision AND severity>=ERROR" \
  --project=gac-prod-471220
```

### 7.5 Rollback Checklist

- [ ] Identify issue requiring rollback
- [ ] Notify stakeholders of rollback
- [ ] Execute rollback procedure (traffic routing or redeploy)
- [ ] Verify rollback success (health checks, tests)
- [ ] Monitor logs and metrics post-rollback
- [ ] Document rollback reason and steps taken
- [ ] Create issue to fix the problem
- [ ] Schedule new deployment after fix

---

## Troubleshooting

### Common Issues

#### Issue: Deployment Fails During Build

**Symptoms:**
- Cloud Build fails
- "Image build failed" error

**Solutions:**

```bash
# Check build logs
gcloud builds list --project=gac-prod-471220 --limit=5
gcloud builds log BUILD_ID --project=gac-prod-471220

# Common fixes:
# 1. Check Dockerfile syntax
# 2. Verify requirements.txt dependencies
# 3. Check build timeout (increase if needed)
# 4. Verify Artifact Registry permissions
```

#### Issue: Service Won't Start

**Symptoms:**
- Cloud Run service stuck in "Creating..."
- Health checks failing
- Container crashes on startup

**Solutions:**

```bash
# Check container startup logs
gcloud logging read "resource.type=cloud_run_revision AND textPayload=~'Uvicorn'" \
  --limit=50 \
  --project=gac-prod-471220

# Check environment variables
gcloud run services describe convergence-api-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format=yaml | grep -A 20 env:

# Common fixes:
# 1. Verify GOOGLE_APPLICATION_CREDENTIALS not set (use service account)
# 2. Check all required environment variables present
# 3. Verify service account has necessary permissions
# 4. Check memory/CPU limits (increase if needed)
```

#### Issue: KMS Encryption Timeout

**Symptoms:**
- Tenant API key generation takes 30+ seconds
- "KMS timeout" errors

**Solutions:**

```bash
# Check KMS permissions
gcloud kms keys get-iam-policy api-key-encryption \
  --location=us-central1 \
  --keyring=convergence-keyring-prod \
  --project=gac-prod-471220

# Test KMS encryption
echo "test" | gcloud kms encrypt \
  --location=us-central1 \
  --keyring=convergence-keyring-prod \
  --key=api-key-encryption \
  --plaintext-file=- \
  --ciphertext-file=- \
  --project=gac-prod-471220

# Common fixes:
# 1. Verify service account has cloudkms.cryptoKeyEncrypterDecrypter role
# 2. Check network connectivity from Cloud Run to KMS
# 3. Verify KMS key exists and is enabled
```

#### Issue: BigQuery Permission Denied

**Symptoms:**
- "Permission denied" when creating datasets/tables
- Bootstrap fails

**Solutions:**

```bash
# Check service account permissions
gcloud projects get-iam-policy gac-prod-471220 \
  --flatten="bindings[].members" \
  --filter="bindings.members:convergence-api-prod@gac-prod-471220.iam.gserviceaccount.com"

# Grant BigQuery Admin role
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api-prod@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/bigquery.admin"
```

#### Issue: Cloud Scheduler Jobs Failing

**Symptoms:**
- Scheduler jobs show FAILURE status
- HTTP 401 Unauthorized errors

**Solutions:**

```bash
# Check job execution logs
gcloud logging read \
  'resource.type=cloud_scheduler_job AND resource.labels.job_id=reset-daily-quotas' \
  --limit=20 \
  --project=gac-prod-471220

# Update admin API key in job
ADMIN_KEY=$(gcloud secrets versions access latest \
  --secret=admin-api-key-prod \
  --project=gac-prod-471220)

gcloud scheduler jobs update http reset-daily-quotas \
  --headers="X-Admin-Key=${ADMIN_KEY},Content-Type=application/json" \
  --location=us-central1 \
  --project=gac-prod-471220
```

---

## Quick Reference

### Deploy to Staging

```bash
# GitHub Actions
git push origin main

# Cloud Build
gcloud builds submit --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging \
  --project=gac-stage-471220

# Deployment Script
cd cloudact-infrastructure-scripts
./05-deploy.sh stage
```

### Deploy to Production

```bash
# GitHub Actions (with approval)
git push origin main

# Manual deployment
gcloud builds submit --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=production,_VERSION=v1.1.0 \
  --project=gac-prod-471220

gcloud run deploy convergence-api-prod \
  --image=us-docker.pkg.dev/gac-prod-471220/convergence/api:production-v1.1.0 \
  --region=us-central1 \
  --project=gac-prod-471220
```

### Rollback Production

```bash
# Get previous revision
PREV=$(gcloud run revisions list --service=convergence-api-prod \
  --region=us-central1 --project=gac-prod-471220 \
  --format='value(name)' --sort-by=~metadata.creationTimestamp \
  --limit=2 | tail -n 1)

# Rollback
gcloud run services update-traffic convergence-api-prod \
  --to-revisions=$PREV=100 \
  --region=us-central1 \
  --project=gac-prod-471220
```

### View Logs

```bash
# Tail logs
gcloud logging tail "resource.type=cloud_run_revision" \
  --project=gac-prod-471220

# View errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=50 \
  --project=gac-prod-471220
```

### Check Service Health

```bash
# Production
curl https://convergence-api-prod-XXXXX.run.app/health

# Staging
curl https://convergence-api-staging-XXXXX.run.app/health
```

---

## Support & Resources

**Documentation:**
- Main README: `/home/user/cloudact-backend-systems/README.md`
- CLAUDE.md: `/home/user/cloudact-backend-systems/CLAUDE.md`
- Testing Guide: `/home/user/cloudact-backend-systems/convergence-data-pipeline/docs/TESTING.md`

**Scripts:**
- KMS Setup: `/home/user/cloudact-backend-systems/scripts/setup_kms_infrastructure.py`
- Admin Key Generation: `/home/user/cloudact-backend-systems/scripts/generate_admin_key.py`
- Deployment: `/home/user/cloudact-backend-systems/cloudact-infrastructure-scripts/05-deploy.sh`

**GCP Resources:**
- Cloud Run: https://console.cloud.google.com/run
- Cloud Build: https://console.cloud.google.com/cloud-build
- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
- Secret Manager: https://console.cloud.google.com/security/secret-manager
- Cloud KMS: https://console.cloud.google.com/security/kms
- BigQuery: https://console.cloud.google.com/bigquery

**Support Channels:**
- GitHub Issues: https://github.com/gc-cloudact-ai/cloudact-backend-systems/issues
- On-call: Check on-call rotation schedule

---

**Last Updated:** 2025-11-19
**Version:** 2.0.0
**Maintainer:** DevOps Team
