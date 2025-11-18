# Cloud Run Deployment - Ready Status

## Executive Summary

**Status:** VALIDATED & READY TO DEPLOY
**Project:** convergence-data-pipeline
**GCP Project ID:** gac-prod-471220
**Region:** us-central1
**Deployment Method:** Cloud Run (Fully Managed)

---

## Quick Start (Fastest Path to Production)

### Option 1: One-Command Deploy (Recommended)

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Deploy to production
./DEPLOY_NOW.sh production
```

This script will:
1. Create service account if missing
2. Build Docker image via Cloud Build
3. Deploy to Cloud Run with optimal settings
4. Run health checks
5. Display service URL

### Option 2: Use Existing Deployment Script

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

# Set environment variable
export GCP_PROJECT_PROD=gac-prod-471220

# Deploy using Cloud Build
./deployment/deploy.sh production --cloud-build
```

### Option 3: Use Cloud Build Pipeline (CI/CD)

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --substitutions="_ENVIRONMENT=production,_REGION=us-central1"
```

---

## Current Infrastructure State

### Existing Resources ✓
- **GCP Project:** gac-prod-471220 (Active, Accessible)
- **Active Service Account:** cloudact-common@gac-prod-471220.iam.gserviceaccount.com
- **Container Registry:** gcr.io (928 MB used)
- **Region:** us-central1
- **Existing Services:**
  - convergence-pipeline-prod (deployed Nov 16)
  - convergence-pipeline-stage (deployed Nov 18)

### Missing Resources (Auto-Created by Scripts)
- **Service Account:** convergence-api@gac-prod-471220.iam.gserviceaccount.com
- **Artifact Registry:** convergence repository (optional, will use gcr.io if not created)
- **BigQuery Dataset:** metadata (created by init script)

### Configuration Files ✓
All required files exist and validated:
- ✓ deployment/Dockerfile (Multi-stage, optimized)
- ✓ deployment/cloudbuild.yaml (Full CI/CD pipeline)
- ✓ deployment/deploy.sh (Interactive deployment)
- ✓ requirements.txt (All dependencies listed)
- ✓ .env.example (Complete configuration reference)
- ✓ src/app/main.py (FastAPI application entry point)

---

## Deployment Configuration

### Production Settings (from cloudbuild.yaml)

| Parameter | Value | Description |
|-----------|-------|-------------|
| Service Name | convergence-api | Cloud Run service name |
| Min Instances | 2 | Always-on instances for zero cold starts |
| Max Instances | 50 | Auto-scales up to 50 instances |
| Memory | 4Gi | 4 GB RAM per instance |
| CPU | 4 cores | 4 vCPUs per instance |
| Concurrency | 80 | Max 80 concurrent requests per instance |
| Timeout | 3600s | 1 hour request timeout (for long pipelines) |
| Port | 8080 | Container port |
| Platform | Managed | Fully managed Cloud Run |
| Authentication | Unauthenticated | Public access (auth handled by app) |

### Environment Variables

Core variables set automatically:
```bash
GCP_PROJECT_ID=gac-prod-471220
BIGQUERY_LOCATION=US
ENVIRONMENT=production
VERSION=<git-sha>
APP_NAME=convergence-data-pipeline
LOG_LEVEL=INFO
ENABLE_TRACING=true
ENABLE_METRICS=true
OTEL_SERVICE_NAME=convergence-api
ADMIN_METADATA_DATASET=metadata
LOCK_BACKEND=firestore
DISABLE_AUTH=false
```

---

## Pre-Deployment Requirements

### Critical: Service Account Creation

The service account `convergence-api@gac-prod-471220.iam.gserviceaccount.com` **does not exist** and must be created before deployment.

**Solution:** The DEPLOY_NOW.sh script automatically creates it, OR run manually:

```bash
# Create service account
gcloud iam service-accounts create convergence-api \
  --project=gac-prod-471220 \
  --display-name="Convergence API Service Account"

# Grant required permissions
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
```

### Optional: Initialize BigQuery Metadata

**Only needed on first deployment:**

```bash
cd /Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline

export GCP_PROJECT_ID=gac-prod-471220
export BIGQUERY_LOCATION=US

python src/scripts/init_metadata_tables.py
```

Creates tables:
- x_meta_api_keys (tenant authentication)
- x_meta_pipeline_runs (execution tracking)
- x_meta_pipeline_steps (step-level tracking)
- x_meta_data_quality_results (DQ results)

---

## Post-Deployment Verification

### 1. Get Service URL

```bash
SERVICE_URL=$(gcloud run services describe convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --format='value(status.url)')

echo "Service URL: ${SERVICE_URL}"
```

### 2. Health Check

```bash
curl ${SERVICE_URL}/health

# Expected output:
# {
#   "status": "healthy",
#   "version": "<git-sha>",
#   "timestamp": "2025-11-17T..."
# }
```

### 3. API Documentation

```bash
# Open API docs in browser
open "${SERVICE_URL}/docs"

# Or access directly
curl ${SERVICE_URL}/docs
```

### 4. Monitor Logs

```bash
# View recent logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-data-pipeline" \
  --project=gac-prod-471220 \
  --limit=50

# Stream logs in real-time
gcloud logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-data-pipeline" \
  --project=gac-prod-471220
```

---

## Rollback Procedure

### If deployment fails or has issues:

```bash
# List revisions
gcloud run revisions list \
  --service=convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic convergence-data-pipeline \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --to-revisions=<PREVIOUS_REVISION>=100
```

---

## Deployment Methods Comparison

| Method | Pros | Cons | Use Case |
|--------|------|------|----------|
| **DEPLOY_NOW.sh** | Fastest, auto-creates prerequisites, simple | Less control over build process | Quick deployments, demos |
| **deploy.sh** | Full control, dry-run support, interactive | Requires manual SA creation | Production with oversight |
| **Cloud Build** | Full CI/CD, testing, gradual rollout | Longer deployment time | Enterprise production |
| **Direct gcloud** | Maximum control, manual steps | Most complex, error-prone | Emergency hotfixes |

---

## Cost Estimation

### Production Configuration

**Base Costs (always running with min_instances=2):**
- 2 instances × 4 vCPU × 4 GB RAM × 24h/day × 30 days
- Estimated: $150-200/month base cost

**Auto-scaling Costs:**
- Additional instances billed per request
- Estimated: $0.10-0.50 per 1000 requests

**BigQuery:**
- Storage: ~$0.02/GB/month
- Queries: $5/TB scanned

**Total Estimated Monthly Cost:** $200-500 (depending on traffic)

### Cost Optimization Tips
1. Reduce min_instances to 1 for staging
2. Set min_instances to 0 for development
3. Use request-based autoscaling
4. Monitor with Cloud Billing alerts

---

## Next Steps

### Immediate Actions (Choose One)

**Fastest (Recommended for First Deploy):**
```bash
./DEPLOY_NOW.sh production
```

**Production-Ready (With Testing):**
```bash
# Run tests first
pytest tests/unit/ -v

# Deploy with Cloud Build
gcloud builds submit --config=deployment/cloudbuild.yaml ...
```

**Manual Control:**
```bash
# Review DEPLOYMENT_READY.md for detailed steps
cat DEPLOYMENT_READY.md
```

### After Successful Deployment

1. **Set up monitoring:**
   - Cloud Run metrics dashboard
   - Log-based metrics
   - Error alerting

2. **Configure domain (optional):**
   ```bash
   gcloud run services update convergence-data-pipeline \
     --add-custom-domain=api.yourdomain.com
   ```

3. **Set up CI/CD:**
   - Configure GitHub Actions (workflows exist)
   - Set up automatic deployments on push

4. **Security hardening:**
   - Review IAM permissions
   - Enable VPC connector (if needed)
   - Configure secret rotation

---

## Support & Troubleshooting

### Common Issues

**1. Service Account Not Found**
- Run: `./DEPLOY_NOW.sh` (auto-creates) or create manually

**2. Permission Denied**
- Verify you're authenticated: `gcloud auth list`
- Check IAM permissions on project

**3. Build Timeout**
- Increase timeout: `--timeout=1800s`
- Check requirements.txt for slow dependencies

**4. Health Check Failed**
- Check logs: `gcloud logging read ...`
- Verify environment variables
- Ensure port 8080 is exposed

### Getting Help

- **Full Documentation:** `/Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline/DEPLOYMENT_READY.md`
- **Deployment Guide:** `deployment/README.md`
- **Logs:** `gcloud logging read ...`

---

## Files Created

1. **DEPLOY_NOW.sh** - Quick deployment script (executable)
2. **DEPLOYMENT_READY.md** - Comprehensive deployment guide
3. **DEPLOYMENT_SUMMARY.md** - This file (quick reference)
4. **validate_deployment_readiness.sh** - Pre-deployment validation

---

**Last Updated:** 2025-11-17
**Status:** READY TO DEPLOY
**Validated:** Configuration files, project access, existing infrastructure

**Ready Command:**
```bash
./DEPLOY_NOW.sh production
```
