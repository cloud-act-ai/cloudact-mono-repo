# Quick Start Guide

Get your infrastructure and deployment pipeline running in minutes.

## Prerequisites

- **GCP Account** with billing enabled
- **Projects Created**:
  - `gac-stage-471220` (staging)
  - `gac-prod-471220` (production)
- **Service Accounts** (already exist):
  - Stage: `convergence-sa-stage@gac-stage-471220.iam.gserviceaccount.com`
  - Prod: `convergence-sa-prod@gac-prod-471220.iam.gserviceaccount.com`
- **Tools Installed**:
  - `gcloud` CLI (authenticated)
  - `gh` CLI (for GitHub secrets)
  - `curl` and `jq`

## One-Time Setup (10 minutes)

### 1. Setup Staging Environment

```bash
# Run scripts in order
./01-setup-gcp-project.sh stage
./02-setup-kms.sh stage
./03-setup-cloud-build.sh stage
./04-setup-cloud-run.sh stage
```

### 2. Setup Production Environment

```bash
./01-setup-gcp-project.sh prod
./02-setup-kms.sh prod
./03-setup-cloud-build.sh prod
./04-setup-cloud-run.sh prod
```

### 3. Configure GitHub Actions

```bash
# Download service account keys from GCP Console
# Place them in ./secrets/ folder:
#   - stage-sa-key.json
#   - prod-sa-key.json

# Update GitHub secrets
./06-update-github-secrets.sh

# IMPORTANT: Delete the keys after upload
rm -rf secrets/
```

**Note**: You need to update `REPO_OWNER` and `REPO_NAME` in `06-update-github-secrets.sh` first.

## Deploy

### Manual Deployment

```bash
# Deploy to staging
./05-deploy.sh stage

# Deploy to production
./05-deploy.sh prod
```

### Automatic Deployment (GitHub Actions)

```bash
# Push to main branch → auto-deploys to staging
git add .
git commit -m "Your changes"
git push origin main

# Manual deploy to prod (via GitHub Actions UI)
# 1. Go to GitHub Actions
# 2. Select "Deploy to Cloud Run" workflow
# 3. Click "Run workflow"
# 4. Select "prod" environment
```

## Verify Deployment

### Check Service Health

```bash
# Staging
curl https://convergence-pipeline-stage-XXXX-uc.a.run.app/health

# Production
curl https://convergence-pipeline-prod-XXXX-uc.a.run.app/health
```

### Test Onboarding

```bash
# Get service URL
SERVICE_URL="https://convergence-pipeline-stage-XXXX-uc.a.run.app"

# Test onboarding
curl -X POST "$SERVICE_URL/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test_customer",
    "company_name": "Test Company",
    "subscription_tier": "FREE"
  }'
```

## Architecture Overview

```
GitHub Repository
    ↓
    ↓ (push to main)
    ↓
GitHub Actions
    ↓
    ├─ Authenticates with GCP
    ├─ Builds Docker image (Cloud Build)
    └─ Deploys to Cloud Run
    ↓
Cloud Run Service
    ├─ Uses Service Account
    ├─ Accesses BigQuery
    └─ Uses KMS for encryption
```

## Environment Comparison

| Feature | Stage | Production |
|---------|-------|------------|
| Project ID | gac-stage-471220 | gac-prod-471220 |
| Service Name | convergence-pipeline-stage | convergence-pipeline-prod |
| Log Level | DEBUG | INFO |
| Min Instances | 0 | 1 |
| Auto Deploy | Yes (on push) | Manual only |

## Troubleshooting

### Issue: Cloud Build Fails

```bash
# Check Cloud Build logs
gcloud builds list --project=gac-stage-471220

# View specific build
gcloud builds log BUILD_ID --project=gac-stage-471220
```

### Issue: Service Won't Start

```bash
# Check Cloud Run logs
gcloud run services logs read convergence-pipeline-stage \
  --project=gac-stage-471220 \
  --region=us-central1

# Check service details
gcloud run services describe convergence-pipeline-stage \
  --project=gac-stage-471220 \
  --region=us-central1
```

### Issue: Permission Denied

```bash
# Check service account permissions
gcloud projects get-iam-policy gac-stage-471220 \
  --flatten="bindings[].members" \
  --filter="bindings.members:convergence-sa-stage@gac-stage-471220.iam.gserviceaccount.com"
```

## Next Steps

1. **Test the API** - Use the curl examples in docs/ONBOARDING.md
2. **Set up monitoring** - Configure Cloud Monitoring alerts
3. **Configure CI/CD** - Push code and watch it auto-deploy
4. **Scale as needed** - Adjust max instances in deploy script

## Support

For detailed documentation:
- **Infrastructure**: `README.md` (this folder)
- **Application**: `../convergence-data-pipeline/README.md`
- **Onboarding**: `../convergence-data-pipeline/docs/ONBOARDING.md`

---

**Pro Tip**: Keep service account keys secure! Never commit them to git. The `.gitignore` file is configured to prevent this.
