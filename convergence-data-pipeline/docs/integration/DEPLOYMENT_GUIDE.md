# Deployment Guide - Stage & Production

**Version:** 1.0
**Last Updated:** 2025-11-18

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Methods](#deployment-methods)
4. [GitHub Actions Deployment](#github-actions-deployment)
5. [Cloud Build Deployment](#cloud-build-deployment)
6. [Environment Configuration](#environment-configuration)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Convergence Data Pipeline supports deployments to three environments:

| Environment | Purpose | Trigger | Approval Required |
|-------------|---------|---------|-------------------|
| **Development** | Testing, feature development | Auto (push to any branch) | No |
| **Staging** | Pre-production validation | Auto (push to `develop` branch) OR Manual | No |
| **Production** | Live service | Auto (push to `main` branch) OR Manual | Yes |

### Deployment Architecture

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
└──────────────┘       └──────────────┘
```

---

## Prerequisites

### 1. GCP Project Setup

**Required Projects**:
- Development: `your-project-dev`
- Staging: `your-project-staging`
- Production: `your-project-prod`

**Required APIs**:
```bash
# Enable required APIs for each project
for env in dev staging prod; do
  gcloud config set project your-project-$env

  gcloud services enable \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    bigquery.googleapis.com \
    cloudscheduler.googleapis.com \
    secretmanager.googleapis.com
done
```

### 2. Service Accounts

**Cloud Run Service Account**:
```bash
# Create service account for Cloud Run
for env in dev staging prod; do
  gcloud iam service-accounts create convergence-api \
    --display-name="Convergence API Service Account" \
    --project=your-project-$env

  # Grant necessary roles
  gcloud projects add-iam-policy-binding your-project-$env \
    --member="serviceAccount:convergence-api@your-project-$env.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor"

  gcloud projects add-iam-policy-binding your-project-$env \
    --member="serviceAccount:convergence-api@your-project-$env.iam.gserviceaccount.com" \
    --role="roles/bigquery.jobUser"

  gcloud projects add-iam-policy-binding your-project-$env \
    --member="serviceAccount:convergence-api@your-project-$env.iam.gserviceaccount.com" \
    --role="roles/cloudkms.cryptoKeyDecrypter"
done
```

**GitHub Actions Service Account** (if using GitHub Actions):
```bash
# Create service account for GitHub Actions
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deployer" \
  --project=your-project-prod

# Grant deployment permissions
for env in dev staging prod; do
  gcloud projects add-iam-policy-binding your-project-$env \
    --member="serviceAccount:github-actions@your-project-prod.iam.gserviceaccount.com" \
    --role="roles/run.admin"

  gcloud projects add-iam-policy-binding your-project-$env \
    --member="serviceAccount:github-actions@your-project-prod.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

  gcloud projects add-iam-policy-binding your-project-$env \
    --member="serviceAccount:github-actions@your-project-prod.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"
done
```

### 3. Artifact Registry

**Create Docker repositories**:
```bash
for env in dev staging prod; do
  gcloud artifacts repositories create convergence \
    --repository-format=docker \
    --location=us \
    --description="Convergence API Docker images - $env" \
    --project=your-project-$env
done
```

### 4. GitHub Secrets

**Configure GitHub repository secrets**:

Navigate to: `Settings > Secrets and variables > Actions > New repository secret`

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `GCP_PROJECT_DEV` | `your-project-dev` | Development GCP project ID |
| `GCP_PROJECT_STAGING` | `your-project-staging` | Staging GCP project ID |
| `GCP_PROJECT_PROD` | `your-project-prod` | Production GCP project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` | Workload Identity Provider |
| `GCP_SERVICE_ACCOUNT` | `github-actions@your-project-prod.iam.gserviceaccount.com` | GitHub Actions service account |

**Setup Workload Identity Federation**:
```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions" \
  --project=your-project-prod

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --project=your-project-prod

# Bind service account to Workload Identity
gcloud iam service-accounts add-iam-policy-binding github-actions@your-project-prod.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/YOUR_ORG/YOUR_REPO" \
  --project=your-project-prod
```

---

## Deployment Methods

### Method 1: GitHub Actions (Recommended)

**Pros**:
- Automated CI/CD pipeline
- Built-in testing and validation
- Environment protection rules
- Audit trail in GitHub

**Cons**:
- Requires Workload Identity setup
- Longer initial setup time

### Method 2: Cloud Build

**Pros**:
- Native GCP integration
- Faster builds (GCP network)
- Integrated with GCP IAM

**Cons**:
- Manual trigger required
- Less visibility than GitHub Actions

---

## GitHub Actions Deployment

### Automatic Deployment (Branch-Based)

**Development** (auto-deploy on any push):
```bash
# Any branch triggers development deployment
git checkout feature/my-feature
git add .
git commit -m "feat: add new feature"
git push origin feature/my-feature
```

**Staging** (auto-deploy on `develop` branch):
```bash
# Merge to develop triggers staging deployment
git checkout develop
git merge feature/my-feature
git push origin develop
```

**Production** (auto-deploy on `main` branch):
```bash
# Merge to main triggers production deployment (requires approval)
git checkout main
git merge develop
git push origin main
```

### Manual Deployment (Any Environment)

**Via GitHub UI**:

1. Go to: `Actions > CD - Build and Deploy > Run workflow`
2. Select branch: `main` or `develop`
3. Choose environment:
   - `development`
   - `staging`
   - `production`
4. Click `Run workflow`

**Via GitHub CLI**:
```bash
# Install GitHub CLI
brew install gh  # macOS
# or
sudo apt-get install gh  # Linux

# Authenticate
gh auth login

# Trigger staging deployment
gh workflow run cd.yml \
  --ref develop \
  --field environment=staging

# Trigger production deployment
gh workflow run cd.yml \
  --ref main \
  --field environment=production
```

### Deployment Workflow Steps

The GitHub Actions workflow (`.github/workflows/cd.yml`) performs:

1. **Setup** - Determine target environment
2. **Build** - Build and push Docker image to Artifact Registry
3. **Deploy** - Deploy to Cloud Run (with environment-specific config)
4. **Health Check** - Verify deployment health
5. **Notify** - Send deployment notification (on failure)

**Example Workflow Run**:
```
✓ setup (10s)
  └─ environment: production
  └─ gcp_project: your-project-prod
  └─ service_name: convergence-api-prod

✓ build (2m 15s)
  └─ image: us-docker.pkg.dev/your-project-prod/convergence/api:production-abc123

✓ deploy-production (1m 30s)
  └─ url: https://convergence-api-prod-abc123-uc.a.run.app

✓ health-check (45s)
  └─ status: 200 OK
```

---

## Cloud Build Deployment

### Using Cloud Build (Alternative Method)

**Trigger via gcloud**:

```bash
# Deploy to staging
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging,_REGION=us-central1 \
  --project=your-project-staging

# Deploy to production
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=production,_REGION=us-central1 \
  --project=your-project-prod
```

### Cloud Build Steps

The Cloud Build configuration (`deployment/cloudbuild.yaml`) performs:

1. **Setup** - Determine environment from branch or substitution
2. **Quick Test** - Run unit tests
3. **Build Image** - Build Docker image
4. **Push Image** - Push to Artifact Registry
5. **Backup Revision** - Save current revision for rollback
6. **Deploy** - Deploy to Cloud Run (gradual rollout: 25% → 50% → 100%)
7. **Health Check** - Verify new revision health
8. **Traffic Migration** - Gradually shift traffic to new revision
9. **Verify** - Final deployment verification
10. **Cleanup** - Remove old revisions (keep last 5)

**Gradual Rollout**:
- **25% traffic** → Wait 60s → Health check
- **50% traffic** → Wait 60s → Health check
- **100% traffic** → Final verification

---

## Environment Configuration

### Environment-Specific Settings

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| **Min Instances** | 0 | 1 | 2 |
| **Max Instances** | 5 | 10 | 50 |
| **Memory** | 2Gi | 2Gi | 4Gi |
| **CPU** | 2 | 2 | 4 |
| **Concurrency** | 80 | 80 | 80 |
| **Timeout** | 3600s | 3600s | 3600s |
| **Allow Unauthenticated** | Yes | Yes | Yes* |

*Production should use Cloud IAM or API Gateway for authentication.

### Environment Variables

**Set during deployment**:

```yaml
env_vars:
  ENVIRONMENT: production
  GCP_PROJECT_ID: your-project-prod
  BIGQUERY_LOCATION: US
  VERSION: ${SHORT_SHA}
```

**Additional secrets** (set via Secret Manager):

```bash
# Create secrets for each environment
for env in dev staging prod; do
  # KMS encryption key
  echo "projects/your-project-$env/locations/global/keyRings/convergence/cryptoKeys/api-keys" | \
    gcloud secrets create kms-key-name \
    --data-file=- \
    --project=your-project-$env \
    --replication-policy=automatic

  # Database connection (if needed)
  echo "your-connection-string" | \
    gcloud secrets create database-url \
    --data-file=- \
    --project=your-project-$env \
    --replication-policy=automatic
done
```

**Mount secrets in Cloud Run**:
```bash
gcloud run services update convergence-api-prod \
  --update-secrets=KMS_KEY_NAME=kms-key-name:latest \
  --update-secrets=DATABASE_URL=database-url:latest \
  --region=us-central1 \
  --project=your-project-prod
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe convergence-api-prod \
  --region=us-central1 \
  --project=your-project-prod \
  --format='value(status.url)')

# Test health endpoint
curl "$SERVICE_URL/health"

# Expected response:
# {
#   "status": "healthy",
#   "service": "convergence-data-pipeline",
#   "version": "1.0.0",
#   "environment": "production"
# }
```

### 2. Verify Deployment

```bash
# Check Cloud Run service
gcloud run services describe convergence-api-prod \
  --region=us-central1 \
  --project=your-project-prod

# Check current revision
gcloud run revisions list \
  --service=convergence-api-prod \
  --region=us-central1 \
  --project=your-project-prod \
  --limit=5

# Check logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-api-prod" \
  --limit=50 \
  --project=your-project-prod
```

### 3. Test API Endpoints

```bash
# Test onboarding dry-run
curl -X POST "$SERVICE_URL/api/v1/tenants/dryrun" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test_tenant",
    "company_name": "Test Company",
    "admin_email": "admin@test.com",
    "subscription_plan": "STARTER"
  }'

# Test with existing tenant (use your API key)
curl "$SERVICE_URL/api/v1/pipelines/runs?limit=5" \
  -H "X-API-Key: your_api_key"
```

### 4. Monitor Metrics

```bash
# View request count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="convergence-api-prod"' \
  --project=your-project-prod

# View latency
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies" AND resource.labels.service_name="convergence-api-prod"' \
  --project=your-project-prod
```

---

## Rollback Procedures

### Quick Rollback (Traffic Split)

**If new revision has issues**, route traffic back to previous revision:

```bash
# Get previous revision
PREV_REVISION=$(gcloud run revisions list \
  --service=convergence-api-prod \
  --region=us-central1 \
  --project=your-project-prod \
  --format='value(name)' \
  --sort-by=~metadata.creationTimestamp \
  --limit=2 | tail -n 1)

# Route 100% traffic to previous revision
gcloud run services update-traffic convergence-api-prod \
  --to-revisions=$PREV_REVISION=100 \
  --region=us-central1 \
  --project=your-project-prod

echo "Rolled back to: $PREV_REVISION"
```

### Full Rollback (Redeploy Previous Version)

**If traffic split isn't sufficient**:

```bash
# Get previous image digest
PREV_IMAGE=$(gcloud run revisions describe $PREV_REVISION \
  --region=us-central1 \
  --project=your-project-prod \
  --format='value(spec.containers[0].image)')

# Redeploy previous image
gcloud run deploy convergence-api-prod \
  --image=$PREV_IMAGE \
  --region=us-central1 \
  --project=your-project-prod
```

### Rollback via GitHub Actions

**Re-run previous successful deployment**:

1. Go to: `Actions > CD - Build and Deploy`
2. Find last successful deployment
3. Click `Re-run all jobs`

---

## Troubleshooting

### Deployment Fails

**Check build logs**:
```bash
# GitHub Actions
# View logs in GitHub Actions UI

# Cloud Build
gcloud builds list --project=your-project-prod --limit=5
gcloud builds log BUILD_ID --project=your-project-prod
```

**Common issues**:

1. **Image build fails**:
   - Check `deployment/Dockerfile` syntax
   - Verify `requirements.txt` dependencies
   - Check build logs for specific error

2. **Deployment fails**:
   - Verify service account has `roles/run.admin`
   - Check quota limits (CPU, memory, instances)
   - Verify Artifact Registry permissions

3. **Health check fails**:
   - Check application logs for errors
   - Verify `/health` endpoint is accessible
   - Check environment variables are set correctly

### Service Not Responding

**Check logs**:
```bash
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=100 \
  --project=your-project-prod
```

**Check revision status**:
```bash
gcloud run revisions describe REVISION_NAME \
  --region=us-central1 \
  --project=your-project-prod
```

**Check container startup**:
```bash
# View container logs
gcloud logging read "resource.type=cloud_run_revision AND textPayload=~'Uvicorn running'" \
  --limit=10 \
  --project=your-project-prod
```

### Performance Issues

**Scale up instances**:
```bash
gcloud run services update convergence-api-prod \
  --min-instances=5 \
  --max-instances=100 \
  --region=us-central1 \
  --project=your-project-prod
```

**Increase resources**:
```bash
gcloud run services update convergence-api-prod \
  --memory=8Gi \
  --cpu=8 \
  --region=us-central1 \
  --project=your-project-prod
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing (`pytest tests/`)
- [ ] Code review completed
- [ ] CHANGELOG updated
- [ ] Version number incremented
- [ ] Environment variables configured
- [ ] Secrets created in Secret Manager
- [ ] Service accounts have correct permissions
- [ ] Artifact Registry repository exists

### Deployment

- [ ] Choose deployment method (GitHub Actions or Cloud Build)
- [ ] Deploy to staging first
- [ ] Verify staging deployment
- [ ] Run smoke tests on staging
- [ ] Deploy to production
- [ ] Monitor deployment progress

### Post-Deployment

- [ ] Health check passes
- [ ] API endpoints responding
- [ ] Logs showing no errors
- [ ] Metrics looking normal
- [ ] Previous revision available for rollback
- [ ] Documentation updated
- [ ] Team notified of deployment

---

## Best Practices

1. **Always deploy to staging first**
   - Test changes in staging environment
   - Run full test suite
   - Verify health checks pass

2. **Use gradual rollout**
   - Cloud Build implements 25% → 50% → 100% rollout
   - Monitor error rates at each step
   - Rollback if errors increase

3. **Monitor deployments**
   - Watch Cloud Logging during deployment
   - Check Cloud Monitoring for anomalies
   - Set up alerts for critical errors

4. **Keep rollback ready**
   - Previous revision always available
   - Know how to rollback quickly
   - Document rollback procedures

5. **Tag production deployments**
   - GitHub Actions automatically tags prod deployments
   - Use semantic versioning (v1.2.3)
   - Document changes in CHANGELOG

---

## Support

For deployment issues:
- **GitHub Issues**: [Submit Issue](https://github.com/your-org/convergence-data-pipeline/issues)
- **Cloud Logging**: Check logs for errors
- **Cloud Monitoring**: Review metrics and alerts

---

## Quick Reference

### Deploy to Staging

**GitHub Actions**:
```bash
gh workflow run cd.yml --ref develop --field environment=staging
```

**Cloud Build**:
```bash
gcloud builds submit --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging \
  --project=your-project-staging
```

### Deploy to Production

**GitHub Actions**:
```bash
# Push to main branch (auto-deploy with approval)
git push origin main

# OR manual trigger
gh workflow run cd.yml --ref main --field environment=production
```

**Cloud Build**:
```bash
gcloud builds submit --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=production \
  --project=your-project-prod
```

### Rollback

```bash
# Get previous revision
PREV=$(gcloud run revisions list --service=convergence-api-prod \
  --region=us-central1 --project=your-project-prod \
  --format='value(name)' --sort-by=~metadata.creationTimestamp \
  --limit=2 | tail -n 1)

# Rollback
gcloud run services update-traffic convergence-api-prod \
  --to-revisions=$PREV=100 \
  --region=us-central1 \
  --project=your-project-prod
```

---

**Version**: 1.0
**Last Updated**: 2025-11-18
