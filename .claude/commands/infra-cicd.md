# /infra-cicd - Infrastructure & CI/CD Operations

Deploy services to test/stage/prod, manage versioned releases, backups, rollbacks, and all infrastructure operations.

## Usage

```
/infra-cicd <action> [options]
```

## Actions

### Automatic Deployments (Cloud Build Triggers) - RECOMMENDED
```
# Deploy to Stage (automatic on push to main)
git push origin main

# Deploy to Prod (create and push version tag)
git tag v3.0.8
git push origin v3.0.8

# Monitor builds
gcloud builds list --project=cloudact-prod --region=global --limit=5
```

> **Note:** Cloud Build triggers are hosted in `cloudact-prod` project. Stage trigger deploys to `cloudact-stage`.
> See: `04-inra-cicd-automation/CICD/triggers/README.md` for full trigger documentation.

### Quick Release (ONE COMMAND - Recommended)
```
/infra-cicd quick v1.0.11                     # Full release: update version + test + build + deploy + verify
/infra-cicd quick v1.0.11 --skip-tests        # Skip tests for faster release
```

### Release (Production Workflow)
```
/infra-cicd release v1.0.0                    # Create release (tag + build + push)
/infra-cicd release v1.0.0 --deploy           # Create and deploy to prod
/infra-cicd release v1.0.0 --deploy --stage   # Deploy to stage first (recommended)
/infra-cicd releases                          # List all releases
/infra-cicd releases deployed                 # Show deployed versions
/infra-cicd releases next                     # Suggest next version
```

### Update Version Only
```
/infra-cicd update-version v1.0.11            # Update version in all config files (no deploy)
```

### Deploy (Development/Testing)
```
/infra-cicd deploy test                       # Deploy all to test (timestamps)
/infra-cicd deploy stage                      # Deploy all to stage
/infra-cicd deploy prod                       # Deploy all to prod (confirmation)
/infra-cicd deploy stage api-service          # Deploy single service
```

### Status & Health
```
/infra-cicd status                            # All environments
/infra-cicd status stage                      # Specific environment
/infra-cicd health stage                      # Health check stage services
/infra-cicd health prod                       # Health check prod services
```

### Logs
```
/infra-cicd logs stage                        # Watch stage logs
/infra-cicd logs prod api                     # Watch specific service logs
```

### Backup & Rollback
```
/infra-cicd backup prod                       # Backup before deployment
/infra-cicd rollback prod                     # Rollback to previous revision
/infra-cicd rollback prod v0.9.0              # Rollback to specific version
```

### Bootstrap (Required for new environments)
```
/infra-cicd bootstrap test                    # Initialize test BigQuery datasets
/infra-cicd bootstrap stage                   # Initialize stage BigQuery datasets
/infra-cicd bootstrap prod                    # Initialize prod BigQuery datasets
```

### Fix Auth (403 Forbidden)
```
/infra-cicd fix-auth test                     # Enable public access on test
/infra-cicd fix-auth stage                    # Enable public access on stage
/infra-cicd fix-auth prod                     # Enable public access on prod
```

### Secrets Validation (CRITICAL before prod deploy)
```
/infra-cicd validate prod frontend            # Validate env + secrets for frontend
/infra-cicd validate prod api-service         # Validate env + secrets for API
/infra-cicd secrets verify prod               # Verify all secrets exist
/infra-cicd secrets setup prod                # Create secrets from env file
```

## Instructions

### Quick Release Action (ONE COMMAND - Recommended)
When user requests a quick release:

```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD

# Full release with tests
./quick-release.sh v1.0.11

# Skip tests for faster release
./quick-release.sh v1.0.11 --skip-tests
```

This single command will:
1. Update version in all service config files
2. Commit the version change
3. Run tests (unless --skip-tests)
4. Validate production secrets
5. Build, tag, push all Docker images
6. Deploy all services to production
7. Verify health of all services

### Update Version Action
When user just wants to update version (no deploy):

```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD
./update-version.sh v1.0.11
```

### Release Action (Manual Control)
When user requests a release:

1. **Check current version:**
   ```bash
   cd $REPO_ROOT/04-inra-cicd-automation/CICD
   ./releases.sh next
   ```

2. **Create release:**
   ```bash
   # Just build and tag (no deploy)
   ./release.sh v1.0.0

   # Build, tag, and deploy to stage (recommended first)
   ./release.sh v1.0.0 --deploy --env stage

   # Build, tag, and deploy to prod (with confirmation)
   ./release.sh v1.0.0 --deploy --env prod
   ```

3. **List releases:**
   ```bash
   ./releases.sh list      # Git tags
   ./releases.sh deployed  # What's running where
   ./releases.sh images    # Docker images in GCR
   ```

### Deploy Action
When user requests deploy (development/testing):

1. **Activate environment:**
   ```bash
   gcloud auth activate-service-account --key-file=~/.gcp/cloudact-{env}.json
   gcloud config set project cloudact-{env}
   ```

2. **For production, ALWAYS ask for confirmation first**

3. **Deploy using scripts:**
   ```bash
   cd $REPO_ROOT/04-inra-cicd-automation/CICD

   # All services
   ./deploy-all.sh {env}

   # Single service
   ./cicd.sh {service} {env} cloudact-{env}
   ```

4. **Verify health after deployment:**
   ```bash
   ./quick/status.sh {env}
   ```

### Status Action
```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD
./quick/status.sh {env}
```

### Health Action
```bash
# Get service URLs dynamically
API_URL=$(gcloud run services describe cloudact-api-service-${ENV} --region=us-central1 --format="value(status.url)")
PIPELINE_URL=$(gcloud run services describe cloudact-pipeline-service-${ENV} --region=us-central1 --format="value(status.url)")

# Health checks (all environments are public - app handles its own auth)
curl -s ${API_URL}/health
curl -s ${PIPELINE_URL}/health

# Production via custom domains
curl -s https://api.cloudact.ai/health
curl -s https://pipeline.cloudact.ai/health
```

### Logs Action
```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD/monitor
./watch-all.sh {env} 50
# or for specific service:
./watch-api-logs.sh {env} {service}
```

### Backup Action
```bash
BACKUP_TS=$(date +%Y%m%d-%H%M%S)
ENV={env}
PROJECT=cloudact-{env}

# Tag current images for rollback
for service in api-service pipeline-service frontend; do
  gcloud container images add-tag \
    gcr.io/${PROJECT}/cloudact-${service}-${ENV}:latest \
    gcr.io/${PROJECT}/cloudact-${service}-${ENV}:backup-${BACKUP_TS} \
    --quiet
done
```

### Rollback Action
```bash
# Option 1: Rollback using version tag (recommended)
./release.sh v0.9.0 --deploy --env {env}

# Option 2: Rollback to previous revision
gcloud run services update-traffic cloudact-{service}-{env} \
  --project=cloudact-{env} \
  --region=us-central1 \
  --to-revisions=<previous-revision>=100
```

### Bootstrap Action (CRITICAL for new environments)
Bootstrap creates BigQuery datasets and meta tables. **MUST run after api-service is deployed, before first user signup**.
```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD/bootstrap
./bootstrap.sh {env}
```

### Fix Auth Action
When services return 403 Forbidden, run:
```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD
./quick/fix-auth.sh {env}
```
This adds `allUsers` with `roles/run.invoker` to all Cloud Run services.

### Validate Action (CRITICAL before prod)
```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD/secrets

# Full validation (env vars + secrets)
./validate-env.sh {env} {service}

# Examples:
./validate-env.sh prod frontend
./validate-env.sh test api-service
```

### Secrets Action
```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD/secrets

# Verify all secrets exist
./verify-secrets.sh {env}

# Setup secrets from env file
./setup-secrets.sh {env}
```

## Environment Details

| Env | Project | Service Account | Auth Mode |
|-----|---------|-----------------|-----------|
| test | cloudact-testing-1 | `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` | Public (app auth) |
| stage | cloudact-stage | `cloudact-stage@cloudact-stage.iam.gserviceaccount.com` | Public (app auth) |
| prod | cloudact-prod | `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` | Public (app auth) |

> **Note:** All environments allow unauthenticated Cloud Run access. App handles auth via `X-CA-Root-Key` and `X-API-Key` headers.
> **Important:** Stage/prod service accounts use `cloudact-{env}@` NOT `cloudact-sa-{env}@`.

### Service URLs
- **Cloud Run Pattern:** `cloudact-{service}-{env}-{hash}.us-central1.run.app`
- **Custom Domains (Prod only):** `api.cloudact.ai`, `pipeline.cloudact.ai`

### Credentials Location
```
~/.gcp/cloudact-testing-1-e44da390bf82.json  # Test
~/.gcp/cloudact-stage.json                    # Stage
~/.gcp/cloudact-prod.json                     # Prod
```

## Services
- `api-service` (port 8000) - Backend API
- `pipeline-service` (port 8001) - ETL pipelines
- `frontend` (port 3000) - Next.js dashboard

## Version Format
- `vMAJOR.MINOR.PATCH` (e.g., v1.0.0, v1.2.3)
- **PATCH** - Bug fixes
- **MINOR** - New features
- **MAJOR** - Breaking changes

## Environment Configuration

### Supabase
| Environment | Project ID | URL |
|-------------|------------|-----|
| local/test/stage | `kwroaccbrxppfiysqlzs` | https://kwroaccbrxppfiysqlzs.supabase.co |
| prod | `ovfxswhkkshouhsryzaf` | https://ovfxswhkkshouhsryzaf.supabase.co |

### Stripe
| Environment | Key Type | Price IDs |
|-------------|----------|-----------|
| local/test/stage | TEST (`pk_test_*`) | `price_1SWBiD*` |
| prod | LIVE (`pk_live_*`) | Starter: `price_1SWJMf*`, Pro: `price_1SWJOY*`, Scale: `price_1SWJP8*` |

### Required Secrets per Environment
| Secret Name | Required By |
|-------------|-------------|
| `ca-root-api-key-{env}` | All services |
| `stripe-secret-key-{env}` | Frontend |
| `stripe-webhook-secret-{env}` | Frontend |
| `supabase-service-role-key-{env}` | Frontend |

## Critical Rules

1. **Production deploys via Cloud Build** - Push git tag `v*` to auto-deploy (NOT manual scripts)
2. **Stage deploys via Cloud Build** - Push to `main` branch to auto-deploy
3. **ALWAYS validate before prod** - `./secrets/validate-env.sh prod frontend`
4. **Deploy to stage first** - Push to main, verify, then create version tag
5. **Monitor logs for 15 minutes after prod deploy**
6. **Rollback if health check fails after 5 minutes**
7. **Update version in config.py BEFORE building** - Version is hardcoded in:
   - `02-api-service/src/app/config.py` (`release_version`, `release_timestamp`)
   - `03-data-pipeline-service/src/app/config.py` (same fields)
8. **Manual deploy scripts are for test/dev ONLY** - Never use deploy-prod.sh

## Recommended Production Workflow (Cloud Build)

> **IMPORTANT:** Production deploys via Cloud Build triggers. Commit → Push → Auto-deploy.

```bash
# 1. Pre-deployment validation
cd 04-inra-cicd-automation/CICD
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
./releases.sh next                              # Check current version

# 2. Push to main (auto-deploys to stage)
git add . && git commit -m "Release v4.2.0"
git push origin main

# 3. Verify stage
./quick/status.sh stage
# [Manual testing on stage]

# 4. Create version tag (auto-deploys to prod)
git tag v4.2.0
git push origin v4.2.0

# 5. Monitor build and verify prod
gcloud builds list --project=cloudact-prod --limit=5
./quick/status.sh prod
./monitor/watch-all.sh prod 50
```

> **Note:** Bootstrap only needs to run once per environment. It's idempotent - safe to re-run.

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
- `$CICD_DIR` = `$REPO_ROOT/04-inra-cicd-automation/CICD`

## Full Documentation

See: `$REPO_ROOT/.claude/skills/infra-cicd/SKILL.md`
