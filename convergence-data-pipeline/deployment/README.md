# Convergence Data Pipeline - Deployment Guide

Complete guide for deploying the Convergence Data Pipeline across all environments using CI/CD pipelines and manual deployment scripts.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Architecture](#architecture)
- [CI/CD Pipelines](#cicd-pipelines)
- [Manual Deployment](#manual-deployment)
- [Configuration](#configuration)
- [Secrets Management](#secrets-management)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Convergence Data Pipeline uses a multi-environment deployment strategy with automated CI/CD pipelines and manual deployment scripts for flexibility.

### Deployment Environments

| Environment | Branch | Auto-Deploy | Approval Required | Purpose |
|------------|--------|-------------|-------------------|---------|
| Development | `feature/*` | Yes | No | Developer testing |
| Staging | `develop` | Yes | No | Pre-production validation |
| Production | `main` | Yes | **Yes** | Live production system |

### Deployment Methods

1. **GitHub Actions** - Automated CI/CD on PR and merge
2. **Cloud Build** - GCP-native build and deploy
3. **Manual Scripts** - Direct deployment using shell scripts

---

## Prerequisites

### Required Tools

```bash
# Google Cloud SDK
gcloud version

# Docker (for local builds)
docker --version

# Git
git --version

# kubectl (optional, for Kubernetes)
kubectl version --client

# GitHub CLI (optional)
gh --version
```

### GCP Setup

1. **Enable Required APIs**

```bash
# Enable APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  bigquery.googleapis.com \
  pubsub.googleapis.com \
  cloudscheduler.googleapis.com
```

2. **Create Artifact Registry**

```bash
# Create repository for Docker images
gcloud artifacts repositories create convergence \
  --repository-format=docker \
  --location=us \
  --description="Convergence Data Pipeline images"
```

3. **Create Service Account**

```bash
# Create service account for Cloud Run
gcloud iam service-accounts create convergence-api \
  --display-name="Convergence API Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:convergence-api@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:convergence-api@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:convergence-api@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### GitHub Setup

1. **Configure GitHub Secrets**

Navigate to `Settings > Secrets and variables > Actions` and add:

| Secret Name | Description | Required For |
|------------|-------------|--------------|
| `GCP_PROJECT_DEV` | Development GCP project ID | Development deployments |
| `GCP_PROJECT_STAGING` | Staging GCP project ID | Staging deployments |
| `GCP_PROJECT_PROD` | Production GCP project ID | Production deployments |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider | All deployments |
| `GCP_SERVICE_ACCOUNT` | Service account email | All deployments |
| `CODECOV_TOKEN` | Codecov upload token | Test coverage |

2. **Setup Workload Identity Federation**

```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github" \
  --project="PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Allow GitHub Actions to impersonate service account
gcloud iam service-accounts add-iam-policy-binding \
  "convergence-api@PROJECT_ID.iam.gserviceaccount.com" \
  --project="PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/YOUR_GITHUB_ORG/convergence-data-pipeline"
```

---

## Architecture

### Deployment Flow

```
┌─────────────┐
│   GitHub    │
│  Repository │
└──────┬──────┘
       │
       │ Push/PR
       ▼
┌─────────────────┐
│ GitHub Actions  │
│    CI Pipeline  │
│  - Test         │
│  - Lint         │
│  - Security     │
└──────┬──────────┘
       │
       │ Merge
       ▼
┌─────────────────┐
│ GitHub Actions  │
│    CD Pipeline  │
│  - Build Image  │
│  - Push to AR   │
│  - Deploy       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   Cloud Run     │
│  - Development  │
│  - Staging      │
│  - Production   │
└─────────────────┘
```

### Resource Structure

```
GCP Project
├── Artifact Registry
│   └── convergence/api:tag
├── Cloud Run
│   ├── convergence-api-dev
│   ├── convergence-api-staging
│   └── convergence-api (prod)
├── BigQuery
│   ├── convergence_dev
│   ├── convergence_staging
│   └── convergence_prod
├── Pub/Sub
│   ├── pipeline-events-dev
│   ├── pipeline-events-staging
│   └── pipeline-events-prod
└── Secret Manager
    ├── dev-convergence-*
    ├── staging-convergence-*
    └── prod-convergence-*
```

---

## CI/CD Pipelines

### GitHub Actions Workflows

#### 1. CI Pipeline (`.github/workflows/ci.yml`)

**Trigger:** Every Pull Request

**Jobs:**
- **Lint** - Code formatting (Black, Ruff)
- **Security** - Vulnerability scanning (Safety, Bandit)
- **Unit Tests** - Run pytest with coverage
- **Integration Tests** - Test API endpoints
- **Docker Build** - Verify Docker image builds

**Usage:**
```bash
# Automatically runs on PR
# To run locally:
pytest tests/unit/ -v --cov=src
black --check src/ tests/
ruff check src/ tests/
```

#### 2. CD Pipeline (`.github/workflows/cd.yml`)

**Trigger:** Merge to `main`, `develop`, or manual dispatch

**Jobs:**
1. **Setup** - Determine environment
2. **Build** - Build and push Docker image
3. **Deploy** - Deploy to Cloud Run (with approval for production)
4. **Health Check** - Verify deployment
5. **Notify** - Send notifications on failure

**Features:**
- Multi-environment support
- Production approval required
- Gradual traffic migration (25% → 50% → 100%)
- Automatic rollback on health check failure

**Manual Trigger:**
```bash
# Using GitHub CLI
gh workflow run cd.yml -f environment=staging

# Or via GitHub UI
# Actions → CD - Build and Deploy → Run workflow
```

#### 3. Release Pipeline (`.github/workflows/release.yml`)

**Trigger:** Git tag push (`v*.*.*`) or manual dispatch

**Jobs:**
- Validate version format
- Generate changelog
- Build release assets
- Run full test suite
- Build and tag Docker image
- Create GitHub release

**Usage:**
```bash
# Create and push a tag
git tag v1.0.0
git push origin v1.0.0

# Or use GitHub CLI
gh release create v1.0.0 --generate-notes
```

#### 4. Dependency Update (`.github/workflows/dependency-update.yml`)

**Trigger:** Weekly schedule (Mondays 9 AM UTC) or manual dispatch

**Jobs:**
- Check for outdated packages
- Security vulnerability scanning
- Create PR with updates
- Update GitHub Actions versions

**Usage:**
```bash
# Manual trigger
gh workflow run dependency-update.yml -f update_type=security
```

### Cloud Build

#### Build and Test (`deployment/cloudbuild-test.yaml`)

**Trigger:** Manual or via Cloud Build trigger

```bash
# Run tests in Cloud Build
gcloud builds submit \
  --config=deployment/cloudbuild-test.yaml \
  --region=us-central1
```

**Features:**
- Runs all tests in GCP environment
- Generates coverage reports
- Security scanning
- Artifacts stored in Cloud Storage

#### Build and Deploy (`deployment/cloudbuild.yaml`)

**Trigger:** Manual or via Cloud Build trigger

```bash
# Deploy to staging
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging \
  --region=us-central1
```

**Features:**
- Multi-environment deployment
- Health checks with retries
- Gradual traffic migration
- Automatic rollback on failure
- Cleanup of old revisions

---

## Manual Deployment

### Deployment Script

#### Deploy to Environment

```bash
# Deploy to development
./deployment/deploy.sh development

# Deploy to staging using Cloud Build
./deployment/deploy.sh staging --cloud-build

# Deploy specific image to production
./deployment/deploy.sh production --skip-build --image-tag v1.2.3

# Dry run (see what would happen)
./deployment/deploy.sh production --dry-run
```

#### Script Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be deployed without deploying |
| `--skip-tests` | Skip running tests before deployment |
| `--skip-build` | Use existing Docker image |
| `--cloud-build` | Use Cloud Build instead of local build |
| `--image-tag TAG` | Specify Docker image tag to deploy |
| `--region REGION` | GCP region (default: us-central1) |

### Rollback Script

#### Rollback to Previous Version

```bash
# Rollback production to previous revision
./deployment/rollback.sh production

# Rollback to specific revision
./deployment/rollback.sh production convergence-api-00042-abc

# List available revisions
./deployment/rollback.sh production --list

# Dry run
./deployment/rollback.sh production --dry-run
```

#### Rollback Features

- Automatic detection of previous revision
- Health check after rollback
- Rollback logging for audit trail
- Production confirmation prompt

### Migration Script

#### Database Migrations

```bash
# Check migration status
./deployment/migrate.sh production status

# Run pending migrations
./deployment/migrate.sh staging upgrade

# Rollback last migration
./deployment/migrate.sh staging downgrade

# Show migration history
./deployment/migrate.sh production history

# Validate schema
./deployment/migrate.sh production validate

# Create backup
./deployment/migrate.sh production backup
```

---

## Configuration

### Environment Variables

Environment-specific configurations are stored in `deployment/environments/`:

```
deployment/environments/
├── development.env       # Development settings
├── staging.env          # Staging settings
└── production.env.template  # Production template (copy and customize)
```

#### Creating Production Config

```bash
# Copy template
cp deployment/environments/production.env.template \
   deployment/environments/production.env

# Edit production values
vim deployment/environments/production.env

# DO NOT commit production.env to git!
```

#### Key Configuration Values

**Development:**
- Debug enabled
- Verbose logging
- Minimal instances (0-5)
- All features enabled for testing

**Staging:**
- Production-like configuration
- Moderate logging
- 1-10 instances
- All features enabled

**Production:**
- Debug disabled
- Warning-level logging
- 2-50 instances (auto-scale)
- Feature flags for gradual rollout
- Enhanced security and monitoring

---

## Secrets Management

### Using Google Secret Manager

#### Create Secrets

```bash
# Create API key secret
echo -n "your-api-key" | gcloud secrets create prod-convergence-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Grant access to service account
gcloud secrets add-iam-policy-binding prod-convergence-api-key \
  --member="serviceAccount:convergence-api@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Access Secrets in Code

```python
from google.cloud import secretmanager

client = secretmanager.SecretManagerServiceClient()
name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
response = client.access_secret_version(request={"name": name})
secret_value = response.payload.data.decode("UTF-8")
```

#### Required Secrets

| Secret Name | Description | Environment |
|------------|-------------|-------------|
| `{env}-convergence-api-key` | API authentication key | All |
| `{env}-convergence-db-password` | Database password (if used) | All |
| `{env}-convergence-slack-webhook` | Slack notification webhook | Staging, Prod |
| `{env}-convergence-email-password` | Email SMTP password | Prod |

---

## Monitoring & Logging

### Cloud Logging

**View Logs:**
```bash
# View service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-api" \
  --limit 50 \
  --format json

# Filter by severity
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit 20
```

**Log Levels by Environment:**
- Development: DEBUG
- Staging: INFO
- Production: WARNING

### Cloud Monitoring

**Create Alerts:**

```bash
# Error rate alert
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=5 \
  --condition-threshold-duration=300s
```

**Key Metrics to Monitor:**
- Request latency (p50, p95, p99)
- Error rate
- Request count
- Instance count
- Memory usage
- CPU usage

### Tracing

```bash
# View traces in Cloud Trace
gcloud trace list --limit=10

# Export traces
gcloud trace export \
  --destination=gs://your-bucket/traces \
  --start-time="2024-01-01T00:00:00Z"
```

---

## Troubleshooting

### Common Issues

#### 1. Deployment Fails

**Symptoms:** GitHub Actions or Cloud Build fails

**Solutions:**
```bash
# Check build logs
gcloud builds log BUILD_ID

# Verify service account permissions
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:convergence-api@*"

# Test Docker build locally
docker build -f deployment/Dockerfile -t test .
```

#### 2. Health Check Fails

**Symptoms:** Deployment succeeds but health check returns non-200

**Solutions:**
```bash
# Check service logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# Test health endpoint directly
curl https://SERVICE_URL/health

# Check environment variables
gcloud run services describe convergence-api \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env)"
```

#### 3. High Latency

**Symptoms:** Requests taking too long

**Solutions:**
```bash
# Check instance count
gcloud run services describe convergence-api \
  --region=us-central1 \
  --format="value(spec.template.spec.containerConcurrency)"

# Increase instances
gcloud run services update convergence-api \
  --min-instances=5 \
  --max-instances=100 \
  --region=us-central1

# Check cold start metrics in Cloud Monitoring
```

#### 4. Secret Access Denied

**Symptoms:** Error accessing secrets from Secret Manager

**Solutions:**
```bash
# Verify service account has access
gcloud secrets get-iam-policy SECRET_NAME

# Grant access
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:convergence-api@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Debug Mode

**Enable Debug Logging:**

```bash
# Temporarily enable debug for a service
gcloud run services update convergence-api-staging \
  --update-env-vars LOG_LEVEL=DEBUG \
  --region=us-central1

# Don't forget to revert!
gcloud run services update convergence-api-staging \
  --update-env-vars LOG_LEVEL=INFO \
  --region=us-central1
```

### Emergency Rollback

**Quick rollback procedure:**

```bash
# 1. List recent revisions
./deployment/rollback.sh production --list

# 2. Rollback to previous
./deployment/rollback.sh production

# 3. Verify health
curl https://SERVICE_URL/health

# 4. Check logs for errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 20
```

---

## Best Practices

### Deployment Checklist

**Before Deploying to Production:**

- [ ] All tests pass in staging
- [ ] Security scan completed
- [ ] Performance tested under load
- [ ] Database migrations tested
- [ ] Rollback plan prepared
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Stakeholders notified

### Security

- Always use Secret Manager for sensitive data
- Enable authentication in staging and production
- Regularly update dependencies
- Review security scan results
- Use least-privilege service accounts
- Enable audit logging

### Performance

- Monitor cold start times
- Use minimum instances in production
- Implement caching where appropriate
- Optimize database queries
- Set appropriate timeouts
- Use connection pooling

### Cost Optimization

- Use minimum instances wisely
- Clean up old revisions
- Monitor usage and billing
- Set budget alerts
- Use appropriate instance sizes

---

## Support

### Getting Help

- **Documentation:** See main [README.md](../README.md)
- **Issues:** GitHub Issues
- **Logs:** Cloud Logging Console
- **Metrics:** Cloud Monitoring Dashboard

### Useful Commands

```bash
# Quick service status
gcloud run services describe convergence-api --region=us-central1

# View recent deployments
gcloud run revisions list --service=convergence-api --region=us-central1

# Stream logs
gcloud logging tail "resource.type=cloud_run_revision"

# Check quotas
gcloud compute project-info describe --project=PROJECT_ID
```

---

## Appendix

### File Structure

```
deployment/
├── README.md                    # This file
├── Dockerfile                   # Multi-stage Docker build
├── cloudbuild.yaml             # Cloud Build deploy config
├── cloudbuild-test.yaml        # Cloud Build test config
├── deploy.sh                   # Manual deployment script
├── rollback.sh                 # Rollback script
├── migrate.sh                  # Database migration script
└── environments/
    ├── development.env         # Dev environment config
    ├── staging.env            # Staging environment config
    └── production.env.template # Production config template
```

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-11-17 | Initial deployment infrastructure |

---

**Last Updated:** 2024-11-17
**Maintained By:** DevOps Team
