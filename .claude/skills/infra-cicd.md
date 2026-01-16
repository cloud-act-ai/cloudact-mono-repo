# /infra-cicd - Infrastructure & CI/CD Operations

## Purpose
Manage GCP infrastructure, Cloud Run deployments, CI/CD pipelines, and environment configuration for CloudAct.

## Quick Reference

```bash
# Deploy to stage (automatic on push to main)
git push origin main

# Deploy to prod (manual via tag)
git tag v4.1.2 && git push origin v4.1.2

# Manual deploy single service
./04-inra-cicd-automation/CICD/deploy/deploy.sh api-service stage cloudact-stage

# Deploy all services
./04-inra-cicd-automation/CICD/deploy-all.sh stage cloudact-stage
```

## Cloud Run Service Configuration

| Service | Port | CPU | RAM | Max | Timeout |
|---------|------|-----|-----|-----|---------|
| api-service | 8000 | 2 | 8Gi | 10 | 300s |
| pipeline-service | 8001 | 2 | 8Gi | 10 | 300s |
| frontend | 3000 | 2 | 8Gi | 20 | 60s |

### Min Instances by Environment
| Environment | Min Instances | Purpose |
|-------------|---------------|---------|
| test | 0 | Cost savings, cold start acceptable |
| stage | 1 | Minimal warm instance for testing |
| prod | 2 | Ramp up, no cold starts |

## Environments

| Environment | GCP Project | Trigger | URLs |
|-------------|-------------|---------|------|
| test | cloudact-testing-1 | Manual | Cloud Run default |
| stage | cloudact-stage | Push to `main` | Cloud Run default |
| prod | cloudact-prod | Tag `v*` | cloudact.ai, api.cloudact.ai, pipeline.cloudact.ai |

## Directory Structure

```
04-inra-cicd-automation/
├── CICD/
│   ├── triggers/           # Cloud Build trigger configs
│   │   ├── cloudbuild-stage.yaml
│   │   ├── cloudbuild-prod.yaml
│   │   └── setup-triggers.sh
│   ├── deploy/
│   │   ├── deploy.sh       # Deploy single service
│   │   └── deploy-all.sh   # Deploy all services
│   ├── build/
│   │   └── build.sh        # Build Docker images
│   ├── secrets/
│   │   ├── setup-secrets.sh
│   │   └── verify-secrets.sh
│   ├── bootstrap/
│   │   └── bootstrap.sh    # Run bootstrap after api-service deploy
│   ├── quick/
│   │   ├── deploy-test.sh
│   │   ├── deploy-stage.sh
│   │   └── deploy-prod.sh
│   └── monitor/
│       ├── watch-logs.sh
│       └── watch-all.sh
├── gcp-setup/              # One-time GCP setup scripts
│   ├── 00-gcp-enable-apis.sh
│   ├── 01-setup-cloud-build.sh
│   ├── 02-artifactory-setup.sh
│   ├── 03-kms-setup.sh
│   ├── 04-secrets-setup.sh
│   ├── 05-iam-setup.sh
│   └── 06-cloud-run-setup.sh
└── environments.conf       # Environment configuration
```

## Commands

### Deploy Commands
```bash
# Deploy single service
/infra-cicd deploy <service> <env>
# Example: /infra-cicd deploy api-service stage

# Deploy all services
/infra-cicd deploy-all <env>
# Example: /infra-cicd deploy-all prod

# Quick deploy (uses pre-configured project IDs)
/infra-cicd quick <env>
# Example: /infra-cicd quick stage
```

### Build Commands
```bash
# Build single service
/infra-cicd build <service> <env> [--local]

# Build all services
/infra-cicd build-all <env>
```

### Status Commands
```bash
# Check Cloud Run service status
/infra-cicd status <env>

# View service logs
/infra-cicd logs <service> <env>

# Watch all service logs
/infra-cicd watch <env>
```

### Setup Commands
```bash
# Initial GCP setup (run once per project)
/infra-cicd setup <env>

# Setup secrets
/infra-cicd secrets <env>

# Verify secrets
/infra-cicd verify-secrets <env>
```

## Deployment Flow

### Stage (Automatic)
```
Push to main
    ↓
Cloud Build trigger fires
    ↓
Build 3 services in parallel
    ↓
Push to gcr.io/cloudact-stage/
    ↓
Deploy api-service → Deploy pipeline-service → Deploy frontend
    ↓
Health checks pass
```

### Production (Manual Tag)
```
git tag v4.1.2 && git push origin v4.1.2
    ↓
Cloud Build trigger fires (v* pattern)
    ↓
Build with TAG_NAME version
    ↓
Push to gcr.io/cloudact-prod/
    ↓
Deploy to production Cloud Run
    ↓
Custom domains: cloudact.ai, api.cloudact.ai, pipeline.cloudact.ai
```

## Secrets Management

| Secret | Services | Description |
|--------|----------|-------------|
| `ca-root-api-key-{env}` | All | Root API key for bootstrap/admin |
| `stripe-secret-key-{env}` | Frontend | Stripe API secret |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing secret |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role key |

```bash
# Create secrets
./04-inra-cicd-automation/CICD/secrets/setup-secrets.sh <env>

# Verify secrets
./04-inra-cicd-automation/CICD/secrets/verify-secrets.sh <env>
```

## KMS Configuration

| Setting | Value |
|---------|-------|
| Keyring | `cloudact-keyring` |
| Key | `api-key-encryption` |
| Location | `us-central1` |

Used for encrypting API keys stored in BigQuery.

## Service Account Naming

```
cloudact-sa-{env}@{project-id}.iam.gserviceaccount.com

Examples:
- cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com
- cloudact-sa-stage@cloudact-stage.iam.gserviceaccount.com
- cloudact-sa-prod@cloudact-prod.iam.gserviceaccount.com
```

## Image Naming Convention

```
gcr.io/{project}/cloudact-{service}-{env}:{tag}

Tags:
- {version} (e.g., v4.1.2 or SHORT_SHA)
- latest
- {env}-latest

Examples:
- gcr.io/cloudact-prod/cloudact-api-service-prod:v4.1.2
- gcr.io/cloudact-stage/cloudact-frontend-stage:abc1234
```

## Troubleshooting

### Build Failures
```bash
# View Cloud Build logs
gcloud builds list --project=<project-id> --limit=5

# View specific build
gcloud builds describe <build-id> --project=<project-id>
```

### Deployment Failures
```bash
# Check Cloud Run logs
gcloud run services logs read cloudact-<service>-<env> \
  --project=<project-id> \
  --region=us-central1

# Check service status
gcloud run services describe cloudact-<service>-<env> \
  --project=<project-id> \
  --region=us-central1
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 503 errors | Cold start | Check min-instances (should be 2) |
| OOM errors | Insufficient memory | Increase to 8Gi |
| Timeout errors | Slow startup | Increase timeout or optimize startup |
| Secret not found | Missing secret | Run `setup-secrets.sh` |
| Permission denied | IAM issue | Run `05-iam-setup.sh` |
| `storage.objects.get` denied | Cloud Build IAM | Run `fix-cloudbuild-permissions.sh` |

### Fix Cloud Build Permissions

If you see `storage.objects.get access denied` during builds:

```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe <project-id> --format="value(projectNumber)")

# Grant storage admin to compute service account
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.admin"

# Grant storage admin to Cloud Build service account
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/storage.admin"

# Grant Cloud Run admin to Cloud Build
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

# Grant service account user to Cloud Build
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Or run the script:
```bash
./04-inra-cicd-automation/gcp-setup/fix-cloudbuild-permissions.sh <project-id>
```

### Health Check URLs
```bash
# API Service
curl https://api.cloudact.ai/health

# Pipeline Service
curl https://pipeline.cloudact.ai/health

# Frontend
curl https://cloudact.ai/api/health
```

## Rollback

```bash
# List available images
gcloud container images list-tags gcr.io/<project>/cloudact-<service>-<env>

# Rollback to previous version
gcloud run deploy cloudact-<service>-<env> \
  --project=<project-id> \
  --region=us-central1 \
  --image=gcr.io/<project>/cloudact-<service>-<env>:<previous-tag>
```

## Key Files

| File | Purpose |
|------|---------|
| `04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml` | Stage build/deploy config |
| `04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml` | Prod build/deploy config |
| `04-inra-cicd-automation/CICD/deploy/deploy.sh` | Manual deploy script |
| `04-inra-cicd-automation/environments.conf` | Environment configuration |
| `02-api-service/Dockerfile` | API service container |
| `03-data-pipeline-service/Dockerfile` | Pipeline service container |
| `01-fronted-system/Dockerfile` | Frontend container |

## gcloud Quick Commands

```bash
# Set project
gcloud config set project cloudact-prod

# List Cloud Run services
gcloud run services list --region=us-central1

# Describe service
gcloud run services describe cloudact-api-service-prod --region=us-central1

# View logs
gcloud run services logs read cloudact-api-service-prod --region=us-central1 --limit=100

# Update service config
gcloud run services update cloudact-api-service-prod \
  --region=us-central1 \
  --memory=8Gi \
  --cpu=2 \
  --min-instances=2
```

## Related Skills
- `/env-setup` - Development environment setup
- `/health-check` - Service health monitoring
- `/docker-local` - Local Docker development
