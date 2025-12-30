# /infra-cicd - Infrastructure & CI/CD Operations

Deploy services to test/stage/prod, manage versioned releases, backups, rollbacks, and all infrastructure operations.

## Usage

```
/infra-cicd <action> [options]
```

## Actions

### Release (Production Workflow - Recommended)
```
/infra-cicd release v1.0.0                    # Create release (tag + build + push)
/infra-cicd release v1.0.0 --deploy           # Create and deploy to prod
/infra-cicd release v1.0.0 --deploy --stage   # Deploy to stage first (recommended)
/infra-cicd releases                          # List all releases
/infra-cicd releases deployed                 # Show deployed versions
/infra-cicd releases next                     # Suggest next version
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

### Release Action (Recommended for Production)
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

1. **ALWAYS validate before prod** - `./secrets/validate-env.sh prod frontend`
2. **Use releases for production** - `./release.sh` with version tags
3. **Deploy to stage first** - `./release.sh vX.Y.Z --deploy --env stage`
4. **ALWAYS confirm before prod deployment**
5. **Deploy order: api-service -> pipeline-service -> frontend**
6. **Monitor logs for 15 minutes after prod deploy**
7. **Rollback if health check fails after 5 minutes**
8. **Update version in config.py BEFORE building** - Version is hardcoded in:
   - `02-api-service/src/app/config.py` (`release_version`, `release_timestamp`)
   - `03-data-pipeline-service/src/app/config.py` (same fields)

## Recommended Production Workflow

```
1. ./secrets/validate-env.sh prod frontend      # CRITICAL: Validate first!
2. ./secrets/verify-secrets.sh prod             # Verify secrets exist
3. ./releases.sh next                           # Check version
4. ./release.sh v1.0.0 --deploy --env stage     # Deploy to stage
5. ./bootstrap/bootstrap.sh stage               # Initialize BigQuery (if new env)
6. ./quick/status.sh stage                      # Verify stage
7. [Manual testing on stage]
8. ./release.sh v1.0.0 --deploy --env prod      # Promote to prod
9. ./bootstrap/bootstrap.sh prod                # Initialize BigQuery (if new env)
10. ./quick/status.sh prod                      # Verify prod
11. ./monitor/watch-all.sh prod 50              # Monitor logs
```

> **Note:** Bootstrap only needs to run once per environment. It's idempotent - safe to re-run.

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
- `$CICD_DIR` = `$REPO_ROOT/04-inra-cicd-automation/CICD`

## Full Documentation

See: `$REPO_ROOT/.claude/skills/infra-cicd/SKILL.md`
