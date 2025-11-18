# CI/CD Quick Start Guide

Fast setup guide for the Convergence Data Pipeline CI/CD infrastructure.

## Prerequisites Checklist

- [ ] Google Cloud SDK installed (`gcloud version`)
- [ ] Docker installed (`docker --version`)
- [ ] GitHub CLI installed (optional: `gh --version`)
- [ ] Access to GCP projects (dev, staging, prod)
- [ ] Repository admin access for GitHub secrets

---

## 5-Minute Setup

### Step 1: Enable GCP APIs (2 min)

```bash
# Set your project ID
export PROJECT_ID="your-project-id"

# Enable all required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  bigquery.googleapis.com \
  pubsub.googleapis.com \
  --project=$PROJECT_ID
```

### Step 2: Create Service Account (1 min)

```bash
# Create service account
gcloud iam service-accounts create convergence-api \
  --display-name="Convergence API" \
  --project=$PROJECT_ID

# Grant permissions (one command)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:convergence-api@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

### Step 3: Setup Artifact Registry (1 min)

```bash
# Create Docker repository
gcloud artifacts repositories create convergence \
  --repository-format=docker \
  --location=us \
  --project=$PROJECT_ID
```

### Step 4: Configure GitHub Secrets (1 min)

Go to: **Repository → Settings → Secrets → Actions → New repository secret**

Add these secrets:
```
GCP_PROJECT_DEV=your-dev-project-id
GCP_PROJECT_STAGING=your-staging-project-id
GCP_PROJECT_PROD=your-prod-project-id
```

---

## Quick Commands

### Deploy

```bash
# Development
./deployment/deploy.sh development

# Staging
./deployment/deploy.sh staging

# Production (requires confirmation)
./deployment/deploy.sh production
```

### Rollback

```bash
# Instant rollback to previous version
./deployment/rollback.sh production

# List available versions
./deployment/rollback.sh production --list
```

### Test

```bash
# Run tests locally
pytest tests/ -v

# Run in Cloud Build
gcloud builds submit --config=deployment/cloudbuild-test.yaml
```

---

## GitHub Workflows

### Trigger Manually

```bash
# Deploy to staging
gh workflow run cd.yml -f environment=staging

# Create release
gh workflow run release.yml -f version=v1.0.0

# Update dependencies
gh workflow run dependency-update.yml
```

### Check Status

```bash
# List recent workflow runs
gh run list

# View specific run
gh run view RUN_ID

# Watch live
gh run watch
```

---

## Common Tasks

### Deploy New Feature

```bash
# 1. Create branch
git checkout -b feature/my-feature

# 2. Make changes and commit
git add .
git commit -m "feat: Add new feature"

# 3. Push and create PR
git push origin feature/my-feature
gh pr create

# 4. CI runs automatically
# 5. Merge PR → auto-deploys to staging
```

### Emergency Rollback

```bash
# One command - instant rollback
./deployment/rollback.sh production

# Health check runs automatically
```

### Check Deployment Status

```bash
# Service status
gcloud run services describe convergence-api --region=us-central1

# Recent logs
gcloud logging read "resource.type=cloud_run_revision" --limit=20

# Health check
curl https://YOUR_SERVICE_URL/health
```

---

## Environment Variables

### Quick Setup

```bash
# Copy production template
cp deployment/environments/production.env.template \
   deployment/environments/production.env

# Edit values
nano deployment/environments/production.env

# DO NOT commit production.env!
```

---

## Troubleshooting

### Deployment Fails

```bash
# Check logs
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR"

# Check service
gcloud run services describe convergence-api --region=us-central1

# Rollback
./deployment/rollback.sh production
```

### CI Tests Fail

```bash
# Run locally
pytest tests/ -v --tb=short

# Check workflow logs
gh run view --log-failed
```

### Can't Push to Artifact Registry

```bash
# Authenticate Docker
gcloud auth configure-docker us-docker.pkg.dev

# Test access
gcloud artifacts repositories describe convergence --location=us
```

---

## File Locations

```
.github/workflows/       # GitHub Actions
  ├── ci.yml            # Tests on PR
  ├── cd.yml            # Deploy on merge
  ├── release.yml       # Create releases
  └── dependency-update.yml

deployment/             # Deployment files
  ├── deploy.sh        # Deploy script
  ├── rollback.sh      # Rollback script
  ├── migrate.sh       # Migrations
  ├── cloudbuild.yaml  # Cloud Build config
  └── environments/    # Environment configs
```

---

## Next Steps

1. ✅ Complete 5-minute setup above
2. 📖 Read full guide: `deployment/README.md`
3. 🚀 Test deployment: `./deployment/deploy.sh development --dry-run`
4. 🔒 Setup secrets in Secret Manager
5. 📊 Configure monitoring dashboards

---

## Help

- **Full Documentation:** `deployment/README.md`
- **Implementation Details:** `CICD_IMPLEMENTATION_SUMMARY.md`
- **GitHub Actions Logs:** Repository → Actions tab
- **Cloud Build Logs:** GCP Console → Cloud Build

---

**Quick Reference Card**

| Task | Command |
|------|---------|
| Deploy dev | `./deployment/deploy.sh development` |
| Deploy staging | `./deployment/deploy.sh staging` |
| Deploy prod | `./deployment/deploy.sh production` |
| Rollback | `./deployment/rollback.sh production` |
| Run tests | `pytest tests/ -v` |
| View logs | `gcloud logging tail "resource.type=cloud_run_revision"` |
| Check status | `gcloud run services list` |
| Health check | `curl SERVICE_URL/health` |

---

**Last Updated:** 2024-11-17
