---
name: infra-cicd
description: |
  Infrastructure and CI/CD operations for CloudAct. Handles versioned releases, deployment to test/stage/prod,
  backups, rollbacks, health checks, and infrastructure management.
  Use when: creating releases, deploying services, managing environments, taking backups, checking health,
  or performing any infrastructure operations.
---

# Infrastructure & CI/CD Operations

## Release Workflow (Production Deployments)

### Recommended Production Flow
```
1. ./releases.sh next                           # Check current version
2. ./release.sh v1.0.0 --deploy --env stage     # Deploy to stage first
3. Test & verify stage
4. ./release.sh v1.0.0 --deploy --env prod      # Promote to production
5. Monitor for 15 minutes
6. If issues: ./release.sh v0.9.0 --deploy --env prod  # Rollback
```

### Create a New Release
```bash
cd 04-inra-cicd-automation/CICD

# Check current version and suggest next
./releases.sh next

# Create release (git tag + build + push images)
./release.sh v1.0.0

# Create and deploy to production
./release.sh v1.0.0 --deploy

# Create and deploy to stage first (recommended)
./release.sh v1.0.0 --deploy --env stage
```

### Release Commands
```bash
./releases.sh list       # List all git version tags
./releases.sh deployed   # Show deployed versions per environment
./releases.sh images     # List Docker images in GCR
./releases.sh next       # Suggest next version number
```

### Version Format
- `vMAJOR.MINOR.PATCH` (e.g., v1.0.0, v1.2.3)
- `vMAJOR.MINOR.PATCH-suffix` (e.g., v1.0.0-beta, v2.0.0-rc1)

**When to increment:**
- **PATCH** (v1.0.1) - Bug fixes, no new features
- **MINOR** (v1.1.0) - New features, backwards compatible
- **MAJOR** (v2.0.0) - Breaking changes

### Image Tagging Convention
```
Git Tag: v1.0.0
Docker Images:
  gcr.io/cloudact-prod/cloudact-api-service-prod:v1.0.0
  gcr.io/cloudact-prod/cloudact-pipeline-service-prod:v1.0.0
  gcr.io/cloudact-prod/cloudact-frontend-prod:v1.0.0

Also tagged as :latest for convenience
```

## Quick Reference

### Environment Configuration
| Environment | GCP Project | Service Account | Auth Mode |
|-------------|-------------|-----------------|-----------|
| `test` | `cloudact-testing-1` | `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` | Public (app auth) |
| `stage` | `cloudact-stage` | `cloudact-stage@cloudact-stage.iam.gserviceaccount.com` | Public (app auth) |
| `prod` | `cloudact-prod` | `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` | Public (app auth) |

> **Note:** All environments allow unauthenticated Cloud Run access. App handles auth via `X-CA-Root-Key` and `X-API-Key` headers.
> **Important:** Stage/prod service accounts use `cloudact-{env}@` NOT `cloudact-sa-{env}@`.

### Credentials Location
```
~/.gcp/cloudact-testing-1-e44da390bf82.json  # Test
~/.gcp/cloudact-stage.json                    # Stage
~/.gcp/cloudact-prod.json                     # Prod
```

### Service URLs

**Cloud Run Pattern:** `cloudact-{service}-{env}-{hash}.us-central1.run.app`

| Env | API Service | Pipeline Service | Frontend |
|-----|-------------|------------------|----------|
| Test | `cloudact-api-service-test-{hash}` | `cloudact-pipeline-service-test-{hash}` | `cloudact-frontend-test-{hash}` |
| Stage | `cloudact-api-service-stage-{hash}` | `cloudact-pipeline-service-stage-{hash}` | `cloudact-frontend-stage-{hash}` |
| Prod | `cloudact-api-service-prod-{hash}` | `cloudact-pipeline-service-prod-{hash}` | Vercel |

**Custom Domains (Prod only):**
- `https://api.cloudact.ai` → API Service
- `https://pipeline.cloudact.ai` → Pipeline Service
- `https://cloudact.ai` → Frontend (Vercel)

> **Note:** Get actual Cloud Run URLs via: `gcloud run services describe <service> --region=us-central1 --format="value(status.url)"`

## Commands

### Deploy All Services (Development/Testing)
```bash
cd 04-inra-cicd-automation/CICD

# Deploy to specific environment (uses timestamps)
./deploy-all.sh test
./deploy-all.sh stage
./deploy-all.sh prod

# Options
./deploy-all.sh stage --skip-build    # Use existing images
./deploy-all.sh stage --parallel      # Build in parallel
```

### Deploy Single Service
```bash
# Full pipeline: Build -> Push -> Deploy
./cicd.sh <service> <environment> <project-id> [tag]

# Examples
./cicd.sh api-service test cloudact-testing-1
./cicd.sh pipeline-service stage cloudact-stage
./cicd.sh frontend prod cloudact-prod v1.2.3
```

### Quick Environment Deploys
```bash
./quick/deploy-test.sh              # All services to test
./quick/deploy-stage.sh             # All services to stage
./quick/deploy-prod.sh              # All services to prod (confirmation required)

./quick/deploy-test.sh api-service  # Single service
```

### Individual Steps
```bash
# Build locally
./build/build.sh api-service stage

# Push to GCR
./push/push.sh api-service stage cloudact-stage

# Deploy to Cloud Run
./deploy/deploy.sh api-service stage cloudact-stage latest
```

## Health Checks

### Check All Services
```bash
./quick/status.sh              # All environments
./quick/status.sh stage        # Specific environment
```

### Manual Health Check
```bash
# Get service URL first
API_URL=$(gcloud run services describe cloudact-api-service-${ENV} --region=us-central1 --format="value(status.url)")
PIPELINE_URL=$(gcloud run services describe cloudact-pipeline-service-${ENV} --region=us-central1 --format="value(status.url)")

# Health checks (all environments are public - app handles its own auth)
curl -s ${API_URL}/health
curl -s ${PIPELINE_URL}/health

# Production via custom domains
curl -s https://api.cloudact.ai/health
curl -s https://pipeline.cloudact.ai/health
```

## Monitoring & Logs

### Watch Logs
```bash
cd 04-inra-cicd-automation/CICD/monitor

# All services
./watch-all.sh test 50              # Last 50 logs
./watch-all.sh stage 100            # Last 100 logs

# Single service
./watch-api-logs.sh test api        # api-service logs
./watch-api-logs.sh stage pipeline  # pipeline-service logs
./watch-api-logs.sh prod frontend   # frontend logs
```

### Live Streaming
```bash
gcloud alpha logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=cloudact-api-service-stage" \
  --project=cloudact-stage
```

## Backup Operations

### Create Backup Before Deployment
```bash
BACKUP_TS=$(date +%Y%m%d-%H%M%S)

# Tag current images for rollback
for service in api-service pipeline-service frontend; do
  gcloud container images add-tag \
    gcr.io/cloudact-prod/cloudact-${service}-prod:latest \
    gcr.io/cloudact-prod/cloudact-${service}-prod:backup-${BACKUP_TS} \
    --quiet
done
```

### BigQuery Dataset Backup
```bash
# Export dataset to GCS
bq extract --destination_format=AVRO \
  'cloudact-prod:organizations.*' \
  gs://cloudact-backups-prod/bq-backup/organizations/
```

## Rollback Operations

### Rollback Using Version Tag
```bash
# Redeploy a previous version
./release.sh v0.9.0 --deploy --env prod
```

### Rollback to Previous Revision
```bash
# List revisions
gcloud run revisions list \
  --service=cloudact-api-service-prod \
  --project=cloudact-prod \
  --region=us-central1

# Rollback to specific revision
gcloud run services update-traffic cloudact-api-service-prod \
  --project=cloudact-prod \
  --region=us-central1 \
  --to-revisions=cloudact-api-service-prod-00001-abc=100
```

## Infrastructure Management

### Activate Environment
```bash
# Stage
gcloud auth activate-service-account --key-file=~/.gcp/cloudact-stage.json
gcloud config set project cloudact-stage

# Prod
gcloud auth activate-service-account --key-file=~/.gcp/cloudact-prod.json
gcloud config set project cloudact-prod
```

### Update Environment Variables
```bash
gcloud run services update cloudact-api-service-stage \
  --project=cloudact-stage \
  --region=us-central1 \
  --set-env-vars="KEY1=value1,KEY2=value2"
```

### Scale Service
```bash
# Scale up for high traffic
gcloud run services update cloudact-api-service-prod \
  --project=cloudact-prod \
  --region=us-central1 \
  --max-instances=20 \
  --min-instances=2

# Scale down (cost saving)
gcloud run services update cloudact-api-service-stage \
  --project=cloudact-stage \
  --region=us-central1 \
  --max-instances=5 \
  --min-instances=0
```

## Secrets Management (CRITICAL)

### Required Secrets per Environment

Each environment requires these secrets in Google Secret Manager:

| Secret Name | Required By | Description |
|-------------|-------------|-------------|
| `ca-root-api-key-{env}` | All services | System root API key |
| `stripe-secret-key-{env}` | Frontend | Stripe secret key (sk_test_* or sk_live_*) |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing secret (whsec_*) |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role JWT |

### Secrets Validation Scripts

```bash
cd 04-inra-cicd-automation/CICD/secrets

# Setup secrets from env file
./setup-secrets.sh test|stage|prod

# Verify all secrets exist
./verify-secrets.sh [test|stage|prod]

# Full validation (env vars + secrets) before deployment
./validate-env.sh prod frontend
./validate-env.sh test api-service
```

### Validate Before Every Production Deployment
```bash
# CRITICAL: Always validate before prod deployment
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
```

### List Secrets
```bash
gcloud secrets list --project=cloudact-stage
gcloud secrets list --project=cloudact-prod
```

### Create/Update Secret
```bash
# Create new secret
echo -n "secret-value" | gcloud secrets create my-secret-{env} \
  --project=cloudact-{env} \
  --data-file=- \
  --replication-policy="automatic"

# Add new version
echo -n "new-value" | gcloud secrets versions add my-secret-{env} \
  --project=cloudact-{env} \
  --data-file=-

# Grant service account access
gcloud secrets add-iam-policy-binding my-secret-{env} \
  --project=cloudact-{env} \
  --member="serviceAccount:cloudact-sa-{env}@cloudact-{env}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
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

## Environment Configuration Matrix

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

### Production URLs
| Service | URL |
|---------|-----|
| Frontend | https://cloudact.ai |
| API Service | https://api.cloudact.ai |
| Pipeline Service | https://pipeline.cloudact.ai |

## Graceful Production Deployment Checklist

### Pre-Deployment
- [ ] Run `./secrets/validate-env.sh prod frontend`
- [ ] Run `./secrets/verify-secrets.sh prod`
- [ ] Run `./releases.sh next` to check version
- [ ] Ensure all tests pass locally
- [ ] Check current health: `./quick/status.sh prod`
- [ ] Verify Stripe LIVE keys (pk_live_*, sk_live_*)
- [ ] Verify Supabase prod project (ovfxswhkkshouhsryzaf)

### Deployment (Recommended)
1. **Create release:** `./release.sh vX.Y.Z`
2. **Deploy to stage:** `./release.sh vX.Y.Z --deploy --env stage`
3. **Test stage:** `./quick/status.sh stage` + manual testing
4. **Deploy to prod:** `./release.sh vX.Y.Z --deploy --env prod`
5. **Verify prod:** `./quick/status.sh prod`

### Post-Deployment
- [ ] Verify health endpoints
- [ ] Check logs for errors: `./monitor/watch-all.sh prod 50`
- [ ] Test critical user flows (signup, Stripe checkout)
- [ ] Monitor for 15 minutes
- [ ] Tag release in GitHub if not auto-pushed

### Rollback Triggers
- Health check fails after 5 minutes
- Error rate > 5%
- Response time > 3x normal
- Critical functionality broken

**Rollback command:** `./release.sh <previous-version> --deploy --env prod`

## Critical Learnings

### 1. Version is Hardcoded in config.py (CRITICAL)
**Problem:** Release version shown in health endpoint (`/health`) is hardcoded in source code, not passed as build arg.

**Location:**
- `02-api-service/src/app/config.py` - `release_version` and `release_timestamp` fields
- `03-data-pipeline-service/src/app/config.py` - same fields

**Solution:** Before creating a new release:
1. Update `release_version` and `release_timestamp` in BOTH config.py files
2. Commit the changes
3. Create git tag: `git tag vX.Y.Z`
4. Build images (version will be baked in)
5. Push and deploy

### 2. Service Account Naming Convention
**Problem:** Service account names differ from expected `cloudact-sa-{env}@` pattern.

**Actual Names:**
- test: `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` (has `-sa-`)
- stage: `cloudact-stage@cloudact-stage.iam.gserviceaccount.com` (NO `-sa-`)
- prod: `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` (NO `-sa-`)

**Note:** This is configured in `environments.conf`.

### 3. Credentials Handling
**Problem:** Local `.env.local` files contain machine-specific paths that don't exist in containers.

**Solution:**
- `.dockerignore` excludes `.env.local`
- `config.py` checks if credential file exists before setting `GOOGLE_APPLICATION_CREDENTIALS`
- Cloud Run uses service account identity automatically

### 4. Service-to-Service Communication
Cloud Run services cannot use `localhost`. Configure URLs via env vars:
- `PIPELINE_SERVICE_URL` - for api-service to call pipeline-service
- `API_SERVICE_URL` - for pipeline-service to call api-service

The deploy.sh script auto-fetches and configures these.

### 5. Environment Files
```
{service}/
├── .env.local    # Local only (excluded from Docker)
├── .env.stage    # Staging config
└── .env.prod     # Production config
```
Use `TARGET_ENV` build arg to select environment.

### 6. Image Tag Convention
**Push script creates:**
- `gcr.io/{project}/cloudact-{service}-{env}:{env}-{timestamp}` (e.g., `prod-20251230-123456`)
- `gcr.io/{project}/cloudact-{service}-{env}:latest`

**Deploy script expects:**
- Default: `{env}-latest` (e.g., `prod-latest`)
- Or specific version tag: `prod-vX.Y.Z`

**Manual tag addition (if needed):**
```bash
for service in api-service pipeline-service frontend; do
  DIGEST=$(gcloud container images describe gcr.io/cloudact-prod/cloudact-${service}-prod --format="value(image_summary.digest)")
  gcloud container images add-tag \
    "gcr.io/cloudact-prod/cloudact-${service}-prod@${DIGEST}" \
    "gcr.io/cloudact-prod/cloudact-${service}-prod:prod-latest" \
    --quiet
done
```

### 7. Service Resource Configuration
| Service | CPU | Memory | Timeout | Max Instances |
|---------|-----|--------|---------|---------------|
| api-service | 2 | 2Gi | 300s | 10 |
| pipeline-service | 2 | 2Gi | 300s | 10 |
| frontend | 1 | 1Gi | 60s | 20 |

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Signup fails with 400 | Email confirmation enabled | Disable in Supabase or update flow |
| Stripe checkout fails | Missing STRIPE_SECRET_KEY | Run `./secrets/setup-secrets.sh prod` |
| Plans not loading | Wrong Stripe price IDs | Verify LIVE price IDs in env |
| `File not found` for credentials | `.env.local` in Docker | Add to `.dockerignore` |
| `Connection refused localhost:8001` | Wrong service URL | Set `PIPELINE_SERVICE_URL` env |
| `Cannot connect to validation` | Wrong API URL | Set `API_SERVICE_URL` env |
| Pipeline 404 | Provider case mismatch | Use lowercase: `gcp` not `GCP` |
| 403 Forbidden on Cloud Run | IAM not configured | Run `./quick/fix-auth.sh <env>` |
| Image push fails | Wrong account | Activate correct service account |
| Tag already exists | Git tag conflict | Use `--force` or new version |

### Common Production Issues

**1. Signup 400 Error from Supabase**
- **Cause:** Email confirmation was enabled in Supabase production
- **Symptom:** User signup succeeds but immediate login fails with 400
- **Fix:** Disable email confirmation in Supabase dashboard → Authentication → Email Auth

**2. Missing Stripe Secret Key**
- **Cause:** STRIPE_SECRET_KEY not in Cloud Run environment
- **Symptom:** Checkout session creation fails
- **Fix:** `./secrets/setup-secrets.sh prod` then redeploy

**3. Frontend Environment Variables Not Updated**
- **Cause:** NEXT_PUBLIC_* vars baked at build time
- **Fix:** Must rebuild Docker image, cannot change at runtime

## File Locations

```
04-inra-cicd-automation/CICD/
├── release.sh              # Versioned release workflow
├── releases.sh             # List/manage releases
├── build/build.sh          # Docker build
├── push/push.sh            # Push to GCR
├── deploy/deploy.sh        # Deploy to Cloud Run (with secrets)
├── deploy-all.sh           # Deploy all services
├── cicd.sh                 # Full pipeline (build+push+deploy)
├── environments.conf       # Environment config
├── quick/
│   ├── deploy-test.sh      # Quick test deploy
│   ├── deploy-stage.sh     # Quick stage deploy
│   ├── deploy-prod.sh      # Quick prod deploy
│   ├── status.sh           # Service status checker
│   └── fix-auth.sh         # Fix Cloud Run IAM (enable public access)
├── secrets/
│   ├── setup-secrets.sh    # Create secrets from env files
│   ├── verify-secrets.sh   # Verify secrets exist
│   ├── validate-env.sh     # Full validation before deploy
│   └── env-vars.conf       # Public env vars per environment
├── monitor/
│   ├── watch-all.sh        # All service logs
│   └── watch-api-logs.sh   # Single service logs
└── README.md               # Full documentation
```

---
**Last Updated:** 2025-12-30
