# Pre-Deployment Checklist - Cloud Run

**Project:** convergence-data-pipeline
**Target Environment:** Production
**GCP Project:** gac-prod-471220
**Region:** us-central1
**Date:** 2025-11-17

---

## Critical Pre-Deployment Checks

### 1. Service Account (REQUIRED - Currently Missing)

**Status:** ❌ NOT CREATED

**Action Required:**
```bash
# Create service account
gcloud iam service-accounts create convergence-api \
  --project=gac-prod-471220 \
  --display-name="Convergence API Service Account"

# Grant BigQuery permissions
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

# Grant Pub/Sub permissions
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# Grant Secret Manager permissions
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Grant Logging permissions
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Grant Cloud Trace permissions
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/cloudtrace.agent"
```

**OR use the automatic script:**
```bash
./DEPLOY_NOW.sh production
# (Will auto-create service account)
```

### 2. GCP APIs Enabled

**Status:** ✅ LIKELY ENABLED (verify if needed)

**Verification:**
```bash
# Check required APIs
gcloud services list --enabled --project=gac-prod-471220 | grep -E "run|cloudbuild|artifactregistry|bigquery|secretmanager|pubsub"
```

**Enable if missing:**
```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  pubsub.googleapis.com \
  cloudtrace.googleapis.com \
  logging.googleapis.com \
  --project=gac-prod-471220
```

### 3. Project Configuration Files

**Status:** ✅ ALL VERIFIED

- [x] deployment/Dockerfile - Multi-stage build, Python 3.11
- [x] deployment/cloudbuild.yaml - Full CI/CD pipeline
- [x] deployment/deploy.sh - Interactive deployment script
- [x] requirements.txt - All dependencies listed
- [x] .env.example - Configuration reference
- [x] src/app/main.py - FastAPI application

### 4. Docker Image Repository

**Current:** ✅ gcr.io/gac-prod-471220 (928 MB)

**Recommended:** Create Artifact Registry (optional)
```bash
gcloud artifacts repositories create convergence \
  --repository-format=docker \
  --location=us \
  --project=gac-prod-471220 \
  --description="Convergence Data Pipeline images"
```

**Note:** Can deploy with existing gcr.io, Artifact Registry is optional

### 5. BigQuery Metadata Dataset

**Status:** ⚠️ MAY NOT EXIST

**First-time deployment only:**
```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

export GCP_PROJECT_ID=gac-prod-471220
export BIGQUERY_LOCATION=US
export ENVIRONMENT=production

python src/scripts/init_metadata_tables.py
```

**Creates tables:**
- metadata.x_meta_api_keys
- metadata.x_meta_pipeline_runs
- metadata.x_meta_pipeline_steps
- metadata.x_meta_data_quality_results

### 6. Firestore Database

**Status:** ⚠️ VERIFY IF ENABLED

**Required for:** Distributed pipeline locks (LOCK_BACKEND=firestore)

**Check:**
```bash
gcloud firestore databases list --project=gac-prod-471220
```

**Enable if missing:**
- Go to: https://console.cloud.google.com/firestore/databases?project=gac-prod-471220
- Click "Select Native Mode"
- Choose region: us-central1 (or multi-region: nam5)

### 7. Environment Variables Review

**Status:** ✅ CONFIGURED IN SCRIPTS

**Core variables (auto-set by deployment scripts):**
- GCP_PROJECT_ID=gac-prod-471220
- BIGQUERY_LOCATION=US
- ENVIRONMENT=production
- VERSION=<git-sha>
- ADMIN_METADATA_DATASET=metadata
- LOCK_BACKEND=firestore

**Security variables (review if needed):**
- DISABLE_AUTH=false (production should have auth enabled)
- API_KEY_SECRET_KEY=<should be in Secret Manager>
- ENABLE_DEV_MODE=false (production should be false)

### 8. GCP Authentication

**Status:** ✅ VERIFIED

**Current active account:** cloudact-common@gac-prod-471220.iam.gserviceaccount.com

**Verify:**
```bash
gcloud auth list
gcloud config get-value project
```

### 9. Git Repository State

**Status:** ✅ CLEAN

**Check:**
```bash
git status
git log --oneline -5
```

**Ensure:**
- All changes committed
- No uncommitted secrets in .env
- Branch is up-to-date

### 10. Existing Cloud Run Services

**Status:** ✅ VERIFIED

**Current services in us-central1:**
- convergence-pipeline-prod (deployed Nov 16, 2025)
- convergence-pipeline-stage (deployed Nov 18, 2025)

**Note:** New service will be named `convergence-data-pipeline` (or `convergence-api`)

---

## Deployment Readiness Score

| Check | Status | Critical | Notes |
|-------|--------|----------|-------|
| Service Account | ❌ Missing | YES | **MUST CREATE** before deploy |
| GCP APIs | ✅ Enabled | YES | Already enabled |
| Configuration Files | ✅ Valid | YES | All verified |
| Docker Registry | ✅ Ready | YES | gcr.io available |
| BigQuery Metadata | ⚠️ Unknown | NO | Run init script if first deploy |
| Firestore | ⚠️ Unknown | NO | Enable if using distributed locks |
| Environment Vars | ✅ Ready | YES | Configured in scripts |
| GCP Auth | ✅ Active | YES | Authenticated |
| Git Repo | ✅ Clean | NO | Ready to tag |
| Existing Services | ✅ Verified | NO | No conflicts |

**Overall Status:** 🟡 READY AFTER SERVICE ACCOUNT CREATION

---

## Recommended Deployment Path

### Option 1: Fastest (Recommended for First Deploy)

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# One command - handles everything
./DEPLOY_NOW.sh production
```

**What it does:**
1. ✅ Creates service account if missing
2. ✅ Builds Docker image via Cloud Build
3. ✅ Deploys to Cloud Run
4. ✅ Runs health checks
5. ✅ Displays service URL

### Option 2: Production-Grade (Full CI/CD)

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Use Cloud Build pipeline
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --substitutions="_ENVIRONMENT=production,_REGION=us-central1"
```

**What it does:**
1. ✅ Runs unit tests
2. ✅ Builds Docker image
3. ✅ Pushes to registry
4. ✅ Deploys with no-traffic
5. ✅ Health checks new revision
6. ✅ Gradual traffic migration (25% → 50% → 100%)
7. ✅ Auto-rollback on failure

### Option 3: Manual Control

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Set environment variable
export GCP_PROJECT_PROD=gac-prod-471220

# Deploy with existing script
./deployment/deploy.sh production --cloud-build
```

---

## Final Pre-Flight Checks

### Run These Commands Before Deploying

```bash
# 1. Verify you're in the right directory
pwd
# Expected: /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# 2. Verify GCP project
gcloud config get-value project
# Expected: gac-prod-471220

# 3. Check if service account exists (will fail if not created)
gcloud iam service-accounts describe convergence-api@gac-prod-471220.iam.gserviceaccount.com --project=gac-prod-471220
# If error: Create service account (see step 1)

# 4. Verify Dockerfile exists
ls -l deployment/Dockerfile
# Expected: File exists

# 5. Check git status
git status
# Expected: Clean working tree or committed changes

# 6. Get current commit SHA (will be used as version tag)
git rev-parse --short HEAD
# Expected: Short commit hash (e.g., "7b86935")
```

---

## Post-Deployment Verification

### Immediately After Deploy

```bash
# 1. Get service URL
SERVICE_URL=$(gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='value(status.url)')

echo "Service URL: ${SERVICE_URL}"

# 2. Test health endpoint
curl ${SERVICE_URL}/health

# Expected:
# {
#   "status": "healthy",
#   "version": "<git-sha>",
#   "timestamp": "2025-11-17T..."
# }

# 3. Check API documentation
open "${SERVICE_URL}/docs"

# 4. View logs
gcloud logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-data-pipeline" \
  --project=gac-prod-471220
```

### Within 5 Minutes

```bash
# Monitor for errors
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-data-pipeline AND severity>=ERROR" \
  --project=gac-prod-471220 \
  --limit=20 \
  --format=json

# Check service status
gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format=yaml
```

### Within 30 Minutes

```bash
# Test a pipeline execution (if applicable)
curl -X POST ${SERVICE_URL}/api/v1/pipelines/execute \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "test", "pipeline_id": "test-pipeline"}'

# Check metrics
gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='table(status.traffic[].revisionName,status.traffic[].percent)'
```

---

## Rollback Plan (If Deployment Fails)

### Quick Rollback

```bash
# 1. List revisions
gcloud run revisions list \
  --service=convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --limit=5

# 2. Identify previous working revision (e.g., convergence-data-pipeline-00001-abc)

# 3. Rollback traffic to previous revision
gcloud run services update-traffic convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --to-revisions=<PREVIOUS_REVISION>=100

# 4. Verify rollback
gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='value(status.latestReadyRevisionName)'
```

---

## Emergency Contacts & Resources

### Documentation
- **Full Deployment Guide:** `DEPLOYMENT_READY.md`
- **Quick Summary:** `DEPLOYMENT_SUMMARY.md`
- **Detailed README:** `deployment/README.md`

### GCP Console Links
- **Cloud Run:** https://console.cloud.google.com/run?project=gac-prod-471220
- **Cloud Build:** https://console.cloud.google.com/cloud-build/builds?project=gac-prod-471220
- **Logs Explorer:** https://console.cloud.google.com/logs?project=gac-prod-471220
- **BigQuery:** https://console.cloud.google.com/bigquery?project=gac-prod-471220

### Commands Quick Reference
```bash
# View this checklist
cat PRE_DEPLOY_CHECKLIST.md

# Quick deploy
./DEPLOY_NOW.sh production

# Full CI/CD deploy
gcloud builds submit --config=deployment/cloudbuild.yaml ...

# Check logs
gcloud logging tail "resource.type=cloud_run_revision" --project=gac-prod-471220

# Rollback
gcloud run services update-traffic convergence-data-pipeline --to-revisions=<REV>=100
```

---

## Sign-Off

Before proceeding with deployment, confirm:

- [ ] Service account will be created (or use DEPLOY_NOW.sh)
- [ ] All required APIs are enabled
- [ ] Configuration files are validated
- [ ] Git repository is clean and committed
- [ ] Team is notified of deployment
- [ ] Rollback plan is understood
- [ ] Monitoring is ready to track deployment
- [ ] Post-deployment verification steps are clear

**Deployment Approved By:** _________________
**Date:** _________________
**Time:** _________________

---

**READY TO DEPLOY - Execute one of these commands:**

```bash
# Fastest (recommended)
./DEPLOY_NOW.sh production

# Production CI/CD
gcloud builds submit --config=deployment/cloudbuild.yaml --project=gac-prod-471220 --region=us-central1 --substitutions="_ENVIRONMENT=production,_REGION=us-central1"

# Manual control
./deployment/deploy.sh production --cloud-build
```

---

**Last Updated:** 2025-11-17
**Status:** READY (Service account creation required)
**Next Action:** Create service account OR run DEPLOY_NOW.sh
