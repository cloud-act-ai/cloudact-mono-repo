# CI/CD Guide

Complete guide for the Continuous Integration and Continuous Deployment pipeline.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Environments](#environments)
4. [GitHub Actions Workflow](#github-actions-workflow)
5. [Deployment Process](#deployment-process)
6. [Infrastructure Setup](#infrastructure-setup)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The project uses **GitHub Actions** for CI/CD, deploying to **Google Cloud Run** with separate staging and production environments.

### Key Features
- Automatic deployment to staging on push to `main`
- Manual deployment to production via workflow dispatch
- Docker-based containerization
- Health checks and automated testing
- Zero-downtime deployments
- Environment-specific configurations

---

## Architecture

```
┌─────────────────┐
│  GitHub Repo    │
│   (main branch) │
└────────┬────────┘
         │
         │ Push to main (auto)
         │ OR
         │ Manual workflow dispatch
         │
         ▼
┌─────────────────┐
│ GitHub Actions  │
│   Workflow      │
└────────┬────────┘
         │
         ├──────────────┬──────────────┐
         ▼              ▼              ▼
    Authenticate    Build Docker   Deploy to
    to GCP          Container      Cloud Run
         │              │              │
         └──────────────┴──────────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
    STAGING                       PRODUCTION
    gac-stage-471220             gac-prod-471220
    Auto on push                 Manual only
```

---

## Environments

### Staging Environment
**Purpose**: Testing and validation before production

| Attribute | Value |
|-----------|-------|
| **GCP Project** | gac-stage-471220 |
| **Service Name** | convergence-pipeline-stage |
| **Region** | us-central1 |
| **URL** | https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app |
| **Deployment** | Automatic on push to `main` |
| **Resources** | 2Gi Memory, 2 CPU, Max 10 instances |

### Production Environment
**Purpose**: Live customer-facing service

| Attribute | Value |
|-----------|-------|
| **GCP Project** | gac-prod-471220 |
| **Service Name** | convergence-pipeline-prod |
| **Region** | us-central1 |
| **URL** | https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app |
| **Deployment** | Manual workflow dispatch only |
| **Resources** | 2Gi Memory, 2 CPU, Max 10 instances |

---

## GitHub Actions Workflow

### Workflow File
Location: `.github/workflows/deploy.yml`

### Triggers

#### 1. Automatic Staging Deployment
```yaml
on:
  push:
    branches:
      - main
```

**Behavior**: Every push to `main` triggers automatic deployment to staging

#### 2. Manual Production Deployment
```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production
```

**Usage**: Go to GitHub Actions → Select "Deploy to Cloud Run" → Run workflow → Choose "production"

### Workflow Steps

```yaml
1. Checkout code
   ├─ actions/checkout@v3

2. Set environment variables
   ├─ Determine target environment
   ├─ Set GCP_PROJECT_ID
   ├─ Set SERVICE_NAME
   └─ Set REGION

3. Authenticate to Google Cloud
   ├─ Use environment-specific service account
   └─ google-github-actions/auth@v1

4. Setup Google Cloud SDK
   └─ google-github-actions/setup-gcloud@v1

5. Configure Docker for GCR
   └─ gcloud auth configure-docker

6. Build and Push Docker Image
   ├─ cd convergence-data-pipeline
   ├─ docker build -f deployment/Dockerfile
   ├─ Tag: gcr.io/$PROJECT_ID/$SERVICE_NAME:$GIT_SHA
   ├─ Tag: gcr.io/$PROJECT_ID/$SERVICE_NAME:latest
   └─ docker push (both tags)

7. Deploy to Cloud Run
   ├─ gcloud run deploy
   ├─ Set environment variables
   ├─ Configure resources
   └─ Allow unauthenticated access

8. Get Service URL
   └─ gcloud run services describe

9. Health Check
   └─ curl -f $SERVICE_URL/health

10. Deployment Summary
    └─ Display deployment info
```

---

## Deployment Process

### Automatic Staging Deployment

```bash
# 1. Make changes and commit
git add .
git commit -m "feat: add new feature"

# 2. Push to main (triggers automatic deployment)
git push origin main

# 3. Monitor deployment
gh run list --workflow=deploy.yml --limit 1
gh run watch <RUN_ID>

# 4. Verify deployment
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/health
```

### Manual Production Deployment

```bash
# Option 1: Using GitHub CLI
gh workflow run deploy.yml -f environment=production

# Option 2: Using GitHub Web UI
# 1. Go to Actions tab
# 2. Select "Deploy to Cloud Run"
# 3. Click "Run workflow"
# 4. Select environment: production
# 5. Click "Run workflow"

# Monitor deployment
gh run watch $(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# Verify deployment
curl https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app/health
```

### Using Infrastructure Scripts

The `cloudact-infrastructure-scripts` directory contains automated deployment scripts:

```bash
# Deploy to staging (auto-commits and pushes)
cd cloudact-infrastructure-scripts
./00-auto-deploy-and-test.sh stage

# Deploy to production (manual workflow trigger)
./00-auto-deploy-and-test.sh prod

# Deploy to both (staging first, then production)
./00-auto-deploy-and-test.sh both
```

---

## Infrastructure Setup

### One-Time Setup (Already Completed)

#### 1. GCP Projects Setup
```bash
cd cloudact-infrastructure-scripts

# Staging
./01-setup-gcp-project.sh stage
./02-setup-kms.sh stage
./03-setup-cloud-build.sh stage
./04-setup-cloud-run.sh stage

# Production
./01-setup-gcp-project.sh prod
./02-setup-kms.sh prod
./03-setup-cloud-build.sh prod
./04-setup-cloud-run.sh prod
```

#### 2. GitHub Secrets Configuration
```bash
# Update GitHub repository secrets
./06-update-github-secrets.sh
```

**Required Secrets**:
- `GCP_PROJECT_ID_STAGE`: gac-stage-471220
- `GCP_PROJECT_ID_PROD`: gac-prod-471220
- `GCP_SA_KEY_STAGE`: Service account JSON key for staging
- `GCP_SA_KEY_PROD`: Service account JSON key for production
- `CLOUD_RUN_REGION`: us-central1

---

## Docker Build Process

### Multi-Stage Dockerfile

Location: `convergence-data-pipeline/deployment/Dockerfile`

```dockerfile
# Stage 1: Builder
FROM python:3.11-slim as builder
- Install build dependencies
- Copy requirements.txt
- Install Python packages

# Stage 2: Runtime
FROM python:3.11-slim
- Copy Python dependencies from builder
- Copy application code (src/, configs/)
- Create non-root user
- Set environment variables
- Configure healthcheck
- Run uvicorn server
```

### Build Command (executed by GitHub Actions)
```bash
docker build \
  -t gcr.io/gac-stage-471220/convergence-pipeline-stage:abc123 \
  -t gcr.io/gac-stage-471220/convergence-pipeline-stage:latest \
  -f deployment/Dockerfile \
  .
```

---

## Environment Variables

Set during deployment:

```yaml
GCP_PROJECT_ID:  "gac-stage-471220"  # or gac-prod-471220
BIGQUERY_LOCATION: "US"
ENVIRONMENT: "staging"  # or "production"
DISABLE_AUTH: "true"  # Disable authentication for now
```

---

## Health Checks

### Docker Healthcheck
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

### Deployment Health Check
```bash
# Wait for service to be ready
sleep 10

# Test health endpoint
curl -f https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2025-11-16T05:00:00Z"
}
```

---

## Monitoring Deployments

### View Workflow Runs
```bash
# List recent workflow runs
gh run list --workflow=deploy.yml --limit 5

# View specific run
gh run view <RUN_ID>

# View run logs
gh run view <RUN_ID> --log

# Watch run in real-time
gh run watch <RUN_ID>
```

### Check Deployment Status
```bash
# Staging
gcloud run services describe convergence-pipeline-stage \
  --project=gac-stage-471220 \
  --region=us-central1

# Production
gcloud run services describe convergence-pipeline-prod \
  --project=gac-prod-471220 \
  --region=us-central1
```

### View Logs
```bash
# Staging logs
gcloud run services logs read convergence-pipeline-stage \
  --project=gac-stage-471220 \
  --region=us-central1 \
  --limit=50

# Production logs
gcloud run services logs read convergence-pipeline-prod \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --limit=50
```

---

## Troubleshooting

### Common Issues

#### 1. Deployment Fails with "Image not found"
**Cause**: Docker image wasn't pushed to GCR successfully

**Solution**:
```bash
# Check Cloud Build logs
gcloud builds list --project=gac-stage-471220 --limit=5

# View specific build
gcloud builds log <BUILD_ID> --project=gac-stage-471220
```

#### 2. Health Check Fails
**Cause**: Application not starting correctly or /health endpoint not responding

**Solution**:
```bash
# Check Cloud Run logs
gcloud run services logs read convergence-pipeline-stage \
  --project=gac-stage-471220 \
  --region=us-central1 \
  --limit=100

# Common issues:
# - Missing environment variables
# - Application startup errors
# - Port mismatch (must be 8080)
```

#### 3. "Permission Denied" Errors
**Cause**: Service account lacks required permissions

**Solution**:
```bash
# Check service account permissions
gcloud projects get-iam-policy gac-stage-471220 \
  --flatten="bindings[].members" \
  --filter="bindings.members:convergence-sa-stage@gac-stage-471220.iam.gserviceaccount.com"

# Required roles:
# - roles/run.admin
# - roles/iam.serviceAccountUser
# - roles/cloudbuild.builds.builder
```

#### 4. GitHub Actions Workflow Fails
**Cause**: Missing or invalid GitHub secrets

**Solution**:
```bash
# Verify secrets are set
gh secret list

# Update secrets if needed
cd cloudact-infrastructure-scripts
./06-update-github-secrets.sh
```

### Rollback Process

#### Option 1: Deploy Previous Version
```bash
# Get previous revision
gcloud run revisions list \
  --service=convergence-pipeline-prod \
  --project=gac-prod-471220 \
  --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic convergence-pipeline-prod \
  --to-revisions=<PREVIOUS_REVISION>=100 \
  --project=gac-prod-471220 \
  --region=us-central1
```

#### Option 2: Redeploy Previous Git Commit
```bash
# Find previous working commit
git log --oneline -10

# Checkout previous commit
git checkout <COMMIT_SHA>

# Trigger deployment
git push origin HEAD:main --force

# Or use manual workflow dispatch
gh workflow run deploy.yml -f environment=production
```

---

## Best Practices

### 1. Staging First
Always deploy to staging before production:
```bash
# Test on staging
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/customers/onboard \
  -X POST -H "Content-Type: application/json" \
  -d '{"tenant_id": "test_123", "company_name": "Test", "subscription_tier": "FREE"}'

# If successful, deploy to production
gh workflow run deploy.yml -f environment=production
```

### 2. Monitor Deployments
```bash
# Watch deployment in real-time
gh run watch <RUN_ID>

# Check logs after deployment
gcloud run services logs read convergence-pipeline-prod \
  --project=gac-prod-471220 \
  --region=us-central1 \
  --limit=50
```

### 3. Version Tagging
GitHub Actions automatically tags images with:
- Git commit SHA: `gcr.io/PROJECT/SERVICE:abc123`
- Latest: `gcr.io/PROJECT/SERVICE:latest`

### 4. Keep Secrets Secure
- Never commit service account keys to git
- Rotate keys regularly
- Use GitHub Secrets for sensitive data
- Review secret access permissions

---

## Deployment Checklist

### Pre-Deployment
- [ ] Code reviewed and approved
- [ ] Tests passing locally
- [ ] Update version numbers if needed
- [ ] Review environment variables

### Staging Deployment
- [ ] Push to main branch
- [ ] Monitor GitHub Actions workflow
- [ ] Verify health check passes
- [ ] Test critical endpoints
- [ ] Check logs for errors

### Production Deployment
- [ ] Staging deployment successful
- [ ] Smoke tests passed on staging
- [ ] Notify team about deployment
- [ ] Trigger manual workflow dispatch
- [ ] Monitor deployment progress
- [ ] Verify health check passes
- [ ] Test production endpoints
- [ ] Monitor logs and metrics
- [ ] Confirm with stakeholders

### Post-Deployment
- [ ] Monitor error rates
- [ ] Check application metrics
- [ ] Review logs for warnings
- [ ] Update documentation if needed
- [ ] Communicate deployment completion

---

## Related Documentation

- [API Reference](./API_REFERENCE.md)
- [Infrastructure Scripts README](../cloudact-infrastructure-scripts/README.md)
- [Quick Start Guide](../cloudact-infrastructure-scripts/QUICK_START.md)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
