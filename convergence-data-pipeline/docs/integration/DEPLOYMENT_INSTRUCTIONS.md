# Deployment Instructions - Staging & Production

**Last Updated**: 2025-11-19
**Deployment Status**: ✅ STAGING DEPLOYED & TESTED

---

## What Was Deployed

### 1. GitHub Actions Deployment (Automatic)

**Commits Deployed**:
- `c33c2c1` - Integration documentation
- `9e587dd` - Dry-run validation endpoint

**Trigger**: Push to `main` branch (auto-deploys to staging/production)

**Deployment Flow**:
```
Git Push → GitHub Actions → Build Docker Image → Push to Artifact Registry → Deploy to Cloud Run
```

### 2. Environments Deployed

| Environment | Project ID | Service Name | URL |
|-------------|-----------|--------------|-----|
| **Staging** | gac-stage-471220 | convergence-pipeline-stage | https://convergence-pipeline-stage-820784027009.us-central1.run.app |
| **Production** | gac-prod-471220 | convergence-pipeline-prod | https://convergence-pipeline-prod-820784027009.us-central1.run.app |

---

## Deployment Steps Executed

### Step 1: Code Changes & Documentation

**What was added**:
- ✅ Dry-run validation endpoint (`POST /api/v1/tenants/dryrun`)
- ✅ Integration documentation (`docs/integration/`)
- ✅ Docker testing infrastructure
- ✅ Pipeline configuration guide

**Committed files**:
```bash
git add docs/integration/
git add src/core/processors/setup/tenants/dryrun.py
git add docs/DOCKER_TESTING.md docs/PIPELINE_CONFIG_GUIDE.md
git commit -m "docs: add comprehensive integration and deployment documentation"
git push origin main
```

### Step 2: GitHub Actions Auto-Deployment

**Status**: ✅ SUCCESS

**What GitHub Actions did**:
1. Built Docker image from `deployment/Dockerfile`
2. Tagged image: `staging-9e587dd`, `staging-latest`
3. Pushed to Artifact Registry: `us-docker.pkg.dev/gac-stage-471220/convergence/api`
4. Deployed to Cloud Run service: `convergence-pipeline-stage`
5. Health check verified: `/health` returns 200 OK
6. Deployment completed in ~5 minutes

**View deployment logs**:
```bash
gh run list --limit 1
gh run view <run_id> --log
```

### Step 3: Environment Configuration

**Set ADMIN_API_KEY** (required for bootstrap):
```bash
gcloud run services update convergence-pipeline-stage \
  --update-env-vars ADMIN_API_KEY=cloudact_admin_1234 \
  --region=us-central1 \
  --project=gac-prod-471220
```

**Environment Variables Set**:
- `ADMIN_API_KEY`: `cloudact_admin_1234` (testing only - change for production!)
- `GCP_PROJECT_ID`: `gac-stage-471220`
- `BIGQUERY_LOCATION`: `US`
- `ENVIRONMENT`: `staging`

### Step 4: Bootstrap System

**Execute bootstrap** to create central dataset and tables:
```bash
curl -X POST https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/admin/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-admin-key: cloudact_admin_1234" \
  -d '{}'
```

**Bootstrap created**:
- ✅ Central dataset: `gac-stage-471220:tenants`
- ✅ 11 management tables:
  - tenant_profiles
  - tenant_api_keys
  - tenant_subscriptions
  - tenant_usage_quotas
  - tenant_cloud_credentials
  - tenant_pipeline_configs
  - tenant_scheduled_pipeline_runs
  - tenant_pipeline_execution_queue
  - tenant_pipeline_runs
  - tenant_step_logs
  - tenant_dq_results

### Step 5: Test Tenant Onboarding

**Onboarded test tenant**: `stg_acminc_23423`

```bash
curl -X POST https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "stg_acminc_23423",
    "company_name": "Acme Inc",
    "admin_email": "admin@acmeinc.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Onboarding created**:
- ✅ Tenant dataset: `gac-stage-471220:stg_acminc_23423`
- ✅ API key: `stg_acminc_23423_api_naXiN2Z1GlpEkV1v`
- ✅ Subscription: PROFESSIONAL (25 daily pipelines, 5 concurrent)
- ✅ Status: ACTIVE

---

## How to Deploy to Production

### Prerequisites

✅ Staging deployment tested and verified
✅ All tests passing
✅ Documentation updated

### Option 1: Automatic Deployment (GitHub Actions)

**Push to main branch** triggers production deployment:

```bash
# Merge to main branch
git checkout main
git merge develop
git push origin main

# GitHub Actions will:
# 1. Build Docker image
# 2. Push to Artifact Registry (production)
# 3. Deploy to Cloud Run (convergence-pipeline-prod)
# 4. Run health checks
# 5. Create deployment tag
```

**Monitor deployment**:
```bash
gh run list --limit 1
gh run watch
```

### Option 2: Manual Deployment (deploy.sh)

```bash
# Set environment variables
export GCP_PROJECT_PROD="gac-prod-471220"

# Deploy using deploy script
./deployment/deploy.sh production --cloud-build

# Script will:
# - Prompt for confirmation
# - Build Docker image via Cloud Build
# - Deploy to Cloud Run
# - Run health checks
# - Display service URL
```

### Post-Production Deployment Steps

1. **Set ADMIN_API_KEY** (use secure key for production!):
```bash
gcloud run services update convergence-pipeline-prod \
  --update-env-vars ADMIN_API_KEY=<secure-production-key> \
  --region=us-central1 \
  --project=gac-prod-471220
```

2. **Run Bootstrap** (one-time only):
```bash
curl -X POST https://convergence-pipeline-prod-820784027009.us-central1.run.app/api/v1/admin/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <secure-production-key>" \
  -d '{}'
```

3. **Verify Deployment**:
```bash
# Health check
curl https://convergence-pipeline-prod-820784027009.us-central1.run.app/health

# Check bootstrap
bq ls gac-prod-471220:tenants
```

4. **Onboard First Production Tenant** (if needed):
```bash
curl -X POST https://convergence-pipeline-prod-820784027009.us-central1.run.app/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "customer_001",
    "company_name": "Customer Company",
    "admin_email": "admin@customer.com",
    "subscription_plan": "ENTERPRISE"
  }'
```

---

## Rollback Procedure

If deployment fails or issues arise:

### Quick Rollback (Traffic Routing)

```bash
# Get previous revision
PREV_REV=$(gcloud run revisions list \
  --service=convergence-pipeline-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format='value(name)' \
  --sort-by=~metadata.creationTimestamp \
  --limit=2 | tail -n 1)

# Route 100% traffic to previous revision
gcloud run services update-traffic convergence-pipeline-prod \
  --to-revisions=$PREV_REV=100 \
  --region=us-central1 \
  --project=gac-prod-471220
```

### Verify Rollback

```bash
# Check current revision
gcloud run services describe convergence-pipeline-prod \
  --region=us-central1 \
  --project=gac-prod-471220

# Test health
curl https://convergence-pipeline-prod-820784027009.us-central1.run.app/health
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing in CI
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Staging deployment tested
- [ ] Breaking changes documented
- [ ] Database migrations prepared (if any)

### Deployment

- [ ] GitHub Actions deployment triggered
- [ ] Build completed successfully
- [ ] Docker image pushed to Artifact Registry
- [ ] Cloud Run service updated
- [ ] Health checks passing
- [ ] Previous revision available for rollback

### Post-Deployment

- [ ] Health check returns 200 OK
- [ ] API endpoints responding correctly
- [ ] Logs showing no errors
- [ ] Metrics looking normal
- [ ] Bootstrap completed (if first deployment)
- [ ] Test tenant onboarded successfully
- [ ] Team notified

---

## Monitoring

### Check Deployment Status

```bash
# Cloud Run service status
gcloud run services describe convergence-pipeline-prod \
  --region=us-central1 \
  --project=gac-prod-471220

# Recent revisions
gcloud run revisions list \
  --service=convergence-pipeline-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --limit=5

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-pipeline-prod" \
  --limit=50 \
  --project=gac-prod-471220
```

### Health Monitoring

```bash
# Continuous health check
watch -n 10 'curl -s https://convergence-pipeline-prod-820784027009.us-central1.run.app/health | jq'
```

---

## Troubleshooting

### Deployment Fails

**Check build logs**:
```bash
gh run view <run_id> --log
```

**Check Cloud Run logs**:
```bash
gcloud logging tail "resource.type=cloud_run_revision" \
  --project=gac-prod-471220
```

### Service Not Responding

**Check revision status**:
```bash
gcloud run revisions describe <revision_name> \
  --region=us-central1 \
  --project=gac-prod-471220
```

**Check environment variables**:
```bash
gcloud run services describe convergence-pipeline-prod \
  --region=us-central1 \
  --project=gac-prod-471220 \
  --format=yaml | grep -A 20 env:
```

---

## Important Notes

### ADMIN_API_KEY Security

⚠️ **CRITICAL**: The ADMIN_API_KEY `cloudact_admin_1234` is for **TESTING ONLY**.

**For production**:
1. Generate a secure random key:
   ```bash
   openssl rand -base64 32
   ```
2. Store in Secret Manager:
   ```bash
   echo -n "your-secure-key" | gcloud secrets create admin-api-key \
     --data-file=- \
     --project=gac-prod-471220
   ```
3. Mount in Cloud Run:
   ```bash
   gcloud run services update convergence-pipeline-prod \
     --update-secrets=ADMIN_API_KEY=admin-api-key:latest \
     --region=us-central1 \
     --project=gac-prod-471220
   ```

### One-Time Bootstrap

Bootstrap should be run **ONCE per environment**. It creates:
- Central `tenants` dataset
- All management tables

**Do NOT run bootstrap multiple times** unless you're resetting the entire system.

---

## Summary

### Staging Environment ✅

- **Deployed**: 2025-11-19
- **Status**: ACTIVE & TESTED
- **URL**: https://convergence-pipeline-stage-820784027009.us-central1.run.app
- **Bootstrap**: COMPLETED
- **Test Tenant**: stg_acminc_23423 (ACTIVE)

### Production Environment

- **Status**: READY TO DEPLOY
- **URL**: https://convergence-pipeline-prod-820784027009.us-central1.run.app
- **Next Steps**:
  1. Push to main branch OR run deploy.sh
  2. Set secure ADMIN_API_KEY
  3. Run bootstrap
  4. Onboard first customer

---

**Deployment Contact**: DevOps Team
**Documentation**: `docs/integration/` directory
