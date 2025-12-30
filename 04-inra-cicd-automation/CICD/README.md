# CloudAct CI/CD Scripts

Production-ready build, push, and deploy scripts for CloudAct services on Google Cloud Run.

## Quick Reference

### Production URLs
| Service | URL |
|---------|-----|
| Frontend | https://cloudact.ai |
| API Service | https://api.cloudact.ai |
| Pipeline Service | https://pipeline.cloudact.ai |

### Environment Matrix
| Environment | GCP Project | Supabase | Stripe |
|-------------|-------------|----------|--------|
| `local` | `cloudact-testing-1` | Test (kwroaccbrxppfiysqlzs) | TEST keys (pk_test_*) |
| `test` | `cloudact-testing-1` | Test (kwroaccbrxppfiysqlzs) | TEST keys (pk_test_*) |
| `stage` | `cloudact-stage` | Test (kwroaccbrxppfiysqlzs) | TEST keys (pk_test_*) |
| `prod` | `cloudact-prod` | Prod (ovfxswhkkshouhsryzaf) | LIVE keys (pk_live_*) |

## Release Workflow (Production)

### Recommended Production Flow
```bash
# 1. Check current version
./releases.sh next

# 2. Validate environment before deployment
./secrets/validate-env.sh prod frontend

# 3. Deploy to staging first
./release.sh v1.0.0 --deploy --env stage

# 4. Test staging, then deploy to production
./release.sh v1.0.0 --deploy --env prod

# 5. Monitor for 15 minutes
./monitor/watch-all.sh prod 50

# 6. Rollback if issues
./release.sh v0.9.0 --deploy --env prod
```

### Create a Versioned Release
```bash
# Check current version and get suggestion
./releases.sh next

# Create release v1.0.0 (git tag + docker images)
./release.sh v1.0.0

# Create and deploy to staging first
./release.sh v1.0.0 --deploy --env stage

# Create and deploy to production
./release.sh v1.0.0 --deploy --env prod

# Rollback to previous version
./release.sh v0.9.0 --deploy --env prod
```

### Manage Releases
```bash
./releases.sh list       # List all git version tags
./releases.sh deployed   # Show deployed versions per environment
./releases.sh images     # List Docker images in GCR
./releases.sh next       # Suggest next version number
```

### Version Format
- `vMAJOR.MINOR.PATCH` (e.g., v1.0.0, v1.2.3)
- Increment: PATCH for fixes, MINOR for features, MAJOR for breaking changes

## Secrets Management

### Secret Manager Setup

Each environment requires these secrets in Google Secret Manager:

| Secret Name | Required By | Description |
|-------------|-------------|-------------|
| `ca-root-api-key-{env}` | All services | System root API key |
| `stripe-secret-key-{env}` | Frontend | Stripe secret key (sk_test_* or sk_live_*) |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing secret (whsec_*) |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role JWT |

### Secrets Scripts
```bash
# Setup secrets from env file
./secrets/setup-secrets.sh test|stage|prod

# Verify all secrets exist
./secrets/verify-secrets.sh [test|stage|prod]

# Validate env vars + secrets before deployment
./secrets/validate-env.sh prod frontend
./secrets/validate-env.sh test api-service
```

### Current Secrets Status
```
TEST (cloudact-testing-1):
  ✓ ca-root-api-key-test
  ✓ stripe-secret-key-test
  ✓ stripe-webhook-secret-test
  ✓ supabase-service-role-key-test

PROD (cloudact-prod):
  ✓ ca-root-api-key-prod
  ✓ stripe-secret-key-prod
  ✓ stripe-webhook-secret-prod
  ✓ supabase-service-role-key-prod
```

## Environment Configuration

### GCP Projects
| Environment | GCP Project | Credentials |
|------------|-------------|-------------|
| `test` | `cloudact-testing-1` | `~/.gcp/cloudact-testing-1-e44da390bf82.json` |
| `stage` | `cloudact-stage` | `~/.gcp/cloudact-stage.json` |
| `prod` | `cloudact-prod` | `~/.gcp/cloudact-prod.json` |

### Supabase Configuration
| Environment | Project ID | URL |
|-------------|------------|-----|
| local/test/stage | `kwroaccbrxppfiysqlzs` | https://kwroaccbrxppfiysqlzs.supabase.co |
| prod | `ovfxswhkkshouhsryzaf` | https://ovfxswhkkshouhsryzaf.supabase.co |

**Important Supabase Settings for Production:**
- Email confirmation: **Disabled** (for immediate sign-in after signup)
- Or update signup flow to handle email confirmation

### Stripe Configuration
| Environment | Key Type | Price IDs |
|-------------|----------|-----------|
| local/test/stage | TEST (`pk_test_*`, `sk_test_*`) | `price_1SWBiD*` (test) |
| prod | LIVE (`pk_live_*`, `sk_live_*`) | `price_1SWJMf*`, `price_1SWJOY*`, `price_1SWJP8*` |

**Production Stripe Products:**
| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

### Environment Files
```
Frontend (01-fronted-system/):
├── .env.local        # Local development
├── .env.test         # Test environment (Cloud Run test)
├── .env.production   # Production (used by Dockerfile for prod builds)
└── .env.prod         # Production reference

Backend services use environment variables set at runtime via Cloud Run.
```

## Frontend Environment Variables

### Build-time Variables (NEXT_PUBLIC_*)
These are baked into the Docker image during build:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://ovfxswhkkshouhsryzaf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_1SWJMf...
NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID=price_1SWJOY...
NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=price_1SWJP8...
NEXT_PUBLIC_APP_URL=https://cloudact.ai
NEXT_PUBLIC_API_SERVICE_URL=https://api.cloudact.ai
NEXT_PUBLIC_PIPELINE_SERVICE_URL=https://pipeline.cloudact.ai
NEXT_PUBLIC_DEFAULT_TRIAL_DAYS=14
```

### Runtime Variables (Server-side)
These are set via Cloud Run environment variables and secrets:
```bash
# From Secret Manager
STRIPE_SECRET_KEY=stripe-secret-key-{env}:latest
STRIPE_WEBHOOK_SECRET=stripe-webhook-secret-{env}:latest
SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key-{env}:latest
CA_ROOT_API_KEY=ca-root-api-key-{env}:latest

# From env-vars.conf (set by deploy.sh)
GCP_PROJECT_ID=cloudact-prod
BIGQUERY_LOCATION=US
ENVIRONMENT=production
NODE_ENV=production
```

## Deploy Scripts

### Deploy All Services to an Environment
```bash
./deploy-all.sh test     # Deploy all to test
./deploy-all.sh stage    # Deploy all to stage
./deploy-all.sh prod     # Deploy all to prod (requires confirmation)
```

### Deploy Single Service
```bash
# Full CI/CD pipeline: Build → Push → Deploy
./cicd.sh <service> <environment> <project-id> [tag]

# Examples:
./cicd.sh api-service test cloudact-testing-1
./cicd.sh pipeline-service stage cloudact-stage
./cicd.sh frontend prod cloudact-prod latest
```

### Individual Steps
```bash
# 1. Build locally
./build/build.sh frontend prod

# 2. Push to Container Registry
./push/push.sh frontend prod cloudact-prod

# 3. Deploy to Cloud Run (with secrets)
./deploy/deploy.sh frontend prod cloudact-prod latest
```

### Quick Deploy Scripts
```bash
./quick/deploy-test.sh              # All services to test
./quick/deploy-stage.sh             # All services to stage
./quick/deploy-prod.sh              # All services to prod
./quick/deploy-test.sh api-service  # Single service to test
```

## Services

| Service | Port | Source | Purpose |
|---------|------|--------|---------|
| `api-service` | 8000 | `02-api-service` | REST API, bootstrap, integrations |
| `pipeline-service` | 8001 | `03-data-pipeline-service` | ETL pipelines, scheduling |
| `frontend` | 3000 | `01-fronted-system` | Next.js dashboard |

### Cloud Run Service Naming
```
cloudact-{service}-{env}

Examples:
- cloudact-api-service-test
- cloudact-pipeline-service-stage
- cloudact-frontend-prod
```

### Container Image Naming
```
gcr.io/{project}/cloudact-{service}-{env}:{tag}

Examples:
- gcr.io/cloudact-testing-1/cloudact-api-service-test:latest
- gcr.io/cloudact-stage/cloudact-pipeline-service-stage:latest
- gcr.io/cloudact-prod/cloudact-frontend-prod:v1.2.3
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CloudAct Architecture                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │   API Service   │     │Pipeline Service │
│    (Port 3000)  │────▶│   (Port 8000)   │────▶│   (Port 8001)   │
│    Next.js      │     │    FastAPI      │     │    FastAPI      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────────────────────────────┐
         │              │              BigQuery                   │
         │              │  ┌─────────────────────────────────┐    │
         └─────────────▶│  │ organizations (meta tables)     │    │
                        │  │ {org_slug}_prod (org datasets)  │    │
                        │  └─────────────────────────────────┘    │
                        └─────────────────────────────────────────┘

External Services:
┌─────────────────┐     ┌─────────────────┐
│    Supabase     │     │     Stripe      │
│  (Auth + DB)    │     │   (Payments)    │
└─────────────────┘     └─────────────────┘
```

## Critical Learnings

### 1. Version is Hardcoded in config.py (CRITICAL)

**Problem:** Release version shown in health endpoint (`/health`) is hardcoded in source code, not passed as build arg.

**Location:**
- `02-api-service/src/app/config.py` - `release_version` and `release_timestamp` fields
- `03-data-pipeline-service/src/app/config.py` - same fields

**Solution:** Before creating a new release, update version in BOTH config.py files:
```python
release_version: str = Field(
    default="v1.0.4",  # Update this!
    description="Git release tag version (e.g., v1.0.0)"
)
release_timestamp: str = Field(
    default="2025-12-30T20:45:00Z",  # Update this!
    description="Release build timestamp in ISO 8601 format"
)
```

**Workflow:**
1. Update version in both `config.py` files
2. Commit the changes
3. Create git tag: `git tag vX.Y.Z`
4. Build images (version will be baked in)
5. Push and deploy

### 2. Service Account Naming Convention (CRITICAL)

**Problem:** Service account names differ from expected pattern.

**Actual Service Accounts:**
| Environment | Service Account | Credentials File |
|-------------|-----------------|------------------|
| `test` | `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` | `~/.gcp/cloudact-testing-1-e44da390bf82.json` |
| `stage` | `cloudact-stage@cloudact-stage.iam.gserviceaccount.com` | `~/.gcp/cloudact-stage.json` |
| `prod` | `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` | `~/.gcp/cloudact-prod.json` |

**Note:** Stage and prod use `cloudact-{env}@` NOT `cloudact-sa-{env}@`. This is configured in `environments.conf`.

### 3. Image Tag Convention

**Push script creates:**
- `gcr.io/{project}/cloudact-{service}-{env}:{env}-{timestamp}` (e.g., `prod-20251230-123456`)
- `gcr.io/{project}/cloudact-{service}-{env}:latest`

**Deploy script expects:**
- Default: `{env}-latest` (e.g., `prod-latest`)
- Or specific tag: `prod-vX.Y.Z`

**Manual tag addition (if needed):**
```bash
# Add prod-latest tag to latest image
for service in api-service pipeline-service frontend; do
  DIGEST=$(gcloud container images describe gcr.io/cloudact-prod/cloudact-${service}-prod --format="value(image_summary.digest)")
  gcloud container images add-tag \
    "gcr.io/cloudact-prod/cloudact-${service}-prod@${DIGEST}" \
    "gcr.io/cloudact-prod/cloudact-${service}-prod:prod-latest" \
    --quiet
done
```

### 4. Frontend Secrets Configuration (CRITICAL)

**Problem:** Signup was failing because Stripe secret key wasn't available at runtime.

**Solution:** Frontend requires 4 secrets from Secret Manager:
```bash
# deploy.sh automatically sets these for frontend
--set-secrets=CA_ROOT_API_KEY=ca-root-api-key-{env}:latest,\
STRIPE_SECRET_KEY=stripe-secret-key-{env}:latest,\
STRIPE_WEBHOOK_SECRET=stripe-webhook-secret-{env}:latest,\
SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key-{env}:latest
```

### 2. Build-time vs Runtime Environment Variables

**NEXT_PUBLIC_* variables** are baked into the Docker image at build time from `.env.production`:
- Cannot be changed after build
- Must rebuild to update

**Server-side variables** (STRIPE_SECRET_KEY, etc.) are set at Cloud Run runtime:
- Can be updated via `gcloud run services update`
- Secrets come from Secret Manager

### 3. Supabase Email Confirmation

**Problem:** Users couldn't sign in immediately after signup.

**Cause:** Supabase had email confirmation enabled for production.

**Solution:** Disable email confirmation in Supabase dashboard, OR update signup flow to handle confirmation.

### 4. Credentials Handling

**Problem:** Local `.env.local` files contain machine-specific credential paths.

**Solution:**
- `.dockerignore` excludes `.env.local` from builds
- Cloud Run uses service account identity automatically
- `config.py` checks if credential file exists before using

### 5. Service-to-Service Communication

Cloud Run services cannot use `localhost`. URLs are auto-configured by deploy.sh:
```bash
# api-service needs pipeline URL
PIPELINE_SERVICE_URL=https://cloudact-pipeline-service-{env}-{hash}.us-central1.run.app

# pipeline-service needs api URL
API_SERVICE_URL=https://cloudact-api-service-{env}-{hash}.us-central1.run.app
```

## Monitoring

### Health Checks
```bash
# Production health
curl -s https://cloudact.ai/api/health | jq
curl -s https://api.cloudact.ai/health | jq
curl -s https://pipeline.cloudact.ai/health | jq

# Status check script
./quick/status.sh prod
```

### Watch Logs
```bash
# Watch all services in an environment
./monitor/watch-all.sh test 50          # Last 50 logs
./monitor/watch-all.sh prod 100         # Last 100 logs

# Watch single service
./monitor/watch-api-logs.sh prod api
./monitor/watch-api-logs.sh prod pipeline
./monitor/watch-api-logs.sh prod frontend
```

### Live Log Streaming
```bash
gcloud alpha logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=cloudact-frontend-prod" \
  --project=cloudact-prod
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Signup fails with 400 | Email confirmation enabled | Disable in Supabase or update flow |
| Stripe checkout fails | Missing STRIPE_SECRET_KEY | Run `./secrets/setup-secrets.sh prod` |
| Plans not loading | Wrong Stripe price IDs | Verify LIVE price IDs in env |
| Service 403 | IAM not configured | Run `./quick/fix-auth.sh {env}` |
| `File not found` for credentials | `.env.local` in image | Check `.dockerignore` |
| `Connection refused localhost` | Wrong service URL | Check PIPELINE_SERVICE_URL |

### Validation Before Deploy
```bash
# Always validate before production deployment
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
```

### Updating Environment Variables
```bash
# Update single env var
gcloud run services update cloudact-frontend-prod \
  --project=cloudact-prod \
  --region=us-central1 \
  --set-env-vars="KEY=value"

# Update secrets
gcloud run services update cloudact-frontend-prod \
  --project=cloudact-prod \
  --region=us-central1 \
  --set-secrets="STRIPE_SECRET_KEY=stripe-secret-key-prod:latest"
```

## Resource Configuration

| Service | CPU | Memory | Timeout | Max Instances |
|---------|-----|--------|---------|---------------|
| api-service | 2 | 2Gi | 300s | 10 |
| pipeline-service | 2 | 2Gi | 300s | 10 |
| frontend | 1 | 1Gi | 60s | 20 |

## File Structure

```
04-inra-cicd-automation/CICD/
├── release.sh              # Versioned release workflow
├── releases.sh             # List/manage releases
├── deploy-all.sh           # Deploy all services
├── cicd.sh                 # Full CI/CD pipeline
├── environments.conf       # Environment configuration
│
├── build/
│   └── build.sh            # Docker build
│
├── push/
│   └── push.sh             # Push to GCR
│
├── deploy/
│   └── deploy.sh           # Deploy to Cloud Run (with secrets)
│
├── quick/
│   ├── deploy-test.sh      # Quick test deploy
│   ├── deploy-stage.sh     # Quick stage deploy
│   ├── deploy-prod.sh      # Quick prod deploy
│   ├── status.sh           # Health check all services
│   └── fix-auth.sh         # Fix Cloud Run IAM
│
├── secrets/
│   ├── setup-secrets.sh    # Create secrets from env files
│   ├── verify-secrets.sh   # Verify secrets exist
│   ├── validate-env.sh     # Full validation before deploy
│   └── env-vars.conf       # Public env vars per environment
│
└── monitor/
    ├── watch-all.sh        # All service logs
    └── watch-api-logs.sh   # Single service logs
```

## Production Checklist

Before deploying to production:

- [ ] Run `./secrets/validate-env.sh prod frontend`
- [ ] Verify Stripe LIVE keys (pk_live_*, sk_live_*)
- [ ] Verify Supabase prod project (ovfxswhkkshouhsryzaf)
- [ ] Verify all secrets exist: `./secrets/verify-secrets.sh prod`
- [ ] Deploy to stage first and test
- [ ] Check health after deploy: `./quick/status.sh prod`
- [ ] Monitor logs for 15 minutes: `./monitor/watch-all.sh prod 50`

---
**Last Updated:** 2025-12-30
