# Cloud Build Triggers - CI/CD Documentation

## Overview

CloudAct uses Google Cloud Build for automated deployments:
- **Stage**: Auto-deploys on push to `main` branch
- **Prod**: Deploys on version tag (e.g., `v3.0.5`)

## Trigger Configuration

| Trigger | Project | Event | Build Config |
|---------|---------|-------|--------------|
| `cloudact-deploy-stage` | cloudact-prod | Push to `main` | `cloudbuild-stage.yaml` |
| `cloudact-deploy-prod` | cloudact-prod | Tag `v*` | `cloudbuild-prod.yaml` |

> **Note**: Both triggers are hosted in `cloudact-prod` project but deploy to their respective environments.

## Deployment Workflow

### Deploy to Stage (Automatic)

Every push to `main` triggers stage deployment:

```bash
git add .
git commit -m "feat: your changes"
git push origin main
```

Stage deployment includes:
- Build all 3 services (api, pipeline, frontend)
- Push images to `gcr.io/cloudact-stage/`
- Deploy to Cloud Run in cloudact-stage project

### Deploy to Prod (Manual Tag)

Create and push a version tag to deploy to production:

```bash
# Check current version
git tag -l "v*" | tail -5

# Create new version tag
git tag v3.0.6

# Push tag to trigger prod deployment
git push origin v3.0.6
```

## Version Numbering

Follow semantic versioning: `vMAJOR.MINOR.PATCH`

| Change Type | Example | When to Use |
|-------------|---------|-------------|
| MAJOR | v4.0.0 | Breaking changes |
| MINOR | v3.1.0 | New features, backward compatible |
| PATCH | v3.0.6 | Bug fixes, small changes |

## Build Steps

Each deployment follows this order:

```
1. build-api-service      (parallel)
2. build-pipeline-service (parallel)
3. build-frontend         (parallel)
4. push-api-service       (after build)
5. push-pipeline-service  (after build)
6. push-frontend          (after build)
7. deploy-api-service     (after push)
8. deploy-pipeline-service (after push)
9. deploy-frontend        (after api & pipeline deployed)
```

## Monitoring Builds

### Via CLI

```bash
# List recent builds
gcloud builds list --project=cloudact-prod --region=global --limit=5

# Stream logs for a build
gcloud builds log BUILD_ID --project=cloudact-prod --region=global --stream

# Check build status
gcloud builds describe BUILD_ID --project=cloudact-prod --region=global
```

### Via Console

- Stage builds: https://console.cloud.google.com/cloud-build/builds?project=cloudact-prod
- Prod builds: https://console.cloud.google.com/cloud-build/builds?project=cloudact-prod

## Environment Variables

### Stage (`cloudbuild-stage.yaml`)

| Variable | Source | Value |
|----------|--------|-------|
| `_PROJECT_ID` | Substitution | `cloudact-stage` |
| `_ENV` | Substitution | `stage` |
| `_SUPABASE_URL` | Substitution | Test Supabase instance |
| `_STRIPE_*` | Substitution | TEST keys (`pk_test_*`) |
| `CA_ROOT_API_KEY` | Secret Manager | `ca-root-api-key-stage` |
| `STRIPE_SECRET_KEY` | Secret Manager | `stripe-secret-key-stage` |

### Prod (`cloudbuild-prod.yaml`)

| Variable | Source | Value |
|----------|--------|-------|
| `_PROJECT_ID` | Substitution | `cloudact-prod` |
| `_ENV` | Substitution | `prod` |
| `_SUPABASE_URL` | Substitution | Prod Supabase instance |
| `_STRIPE_*` | Substitution | LIVE keys (`pk_live_*`) |
| `CA_ROOT_API_KEY` | Secret Manager | `ca-root-api-key-prod` |
| `STRIPE_SECRET_KEY` | Secret Manager | `stripe-secret-key-prod` |

## Image Tagging Strategy

| Environment | Tags Applied |
|-------------|--------------|
| Stage | `{SHORT_SHA}`, `latest`, `stage-latest` |
| Prod | `{TAG_NAME}`, `latest`, `prod-latest` |

Example:
```
gcr.io/cloudact-prod/cloudact-api-service-prod:v3.0.5
gcr.io/cloudact-prod/cloudact-api-service-prod:latest
gcr.io/cloudact-prod/cloudact-api-service-prod:prod-latest
```

## Rollback Procedure

### Quick Rollback (Redeploy Previous Version)

```bash
# For prod - deploy a previous tag
git tag v3.0.5-rollback  # Point to same commit as v3.0.4
git push origin v3.0.5-rollback

# Or manually deploy previous image
gcloud run deploy cloudact-api-service-prod \
  --image=gcr.io/cloudact-prod/cloudact-api-service-prod:v3.0.4 \
  --project=cloudact-prod \
  --region=us-central1
```

### Full Rollback

```bash
# Revert the commit
git revert HEAD
git push origin main  # Triggers stage auto-deploy

# For prod, create new tag after revert
git tag v3.0.6
git push origin v3.0.6
```

## Troubleshooting

### Build Fails: "supabaseKey is required" or "Neither apiKey nor config.authenticator provided"

**Cause**: Next.js pre-renders API routes at build time. Routes that create Stripe/Supabase clients at module level fail because secrets aren't available during build.

**Fix**: Use lazy initialization for runtime clients:

```typescript
// BAD - client created at module load
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// GOOD - lazy initialization
let stripeInstance: Stripe | null = null
function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, { ... })
  }
  return stripeInstance
}
```

Also add `export const dynamic = 'force-dynamic'` to API routes using secrets.

**Files Fixed**:
- `lib/stripe.ts` - Uses lazy init via proxy
- `app/api/auth/reset-password/route.ts` - Uses `getSupabaseAdmin()`
- `app/api/webhooks/stripe/route.ts` - Has `dynamic = 'force-dynamic'`
- `app/api/cron/billing-sync/route.ts` - Has `dynamic = 'force-dynamic'`

### Build Fails: "Image not found"

**Cause**: Deploy step started before image was pushed.

**Fix**: Ensure `waitFor` in deploy steps references `push-*` steps, not `build-*`.

### Build Fails: "Permission denied"

**Cause**: Service account lacks permissions on target project.

**Fix**: Grant prod service account permissions on stage project:
```bash
gcloud projects add-iam-policy-binding cloudact-stage \
  --member="serviceAccount:cloudact-prod@cloudact-prod.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

### Build Fails: "Secret not found"

**Cause**: Secret doesn't exist in Secret Manager for the environment.

**Fix**: Create the missing secret:
```bash
echo -n "secret-value" | gcloud secrets create SECRET_NAME \
  --project=cloudact-prod \
  --data-file=-
```

### Trigger Not Firing

**Cause**: GitHub webhook not configured or pattern mismatch.

**Check**:
```bash
gcloud builds triggers list --project=cloudact-prod --region=global
```

**Verify**: Tag pattern is `^v.*` (not ` ^v.*` with leading space).

## Required Secrets

| Secret Name | Environment | Required By |
|-------------|-------------|-------------|
| `ca-root-api-key-stage` | Stage | All services |
| `ca-root-api-key-prod` | Prod | All services |
| `stripe-secret-key-stage` | Stage | Frontend |
| `stripe-secret-key-prod` | Prod | Frontend |
| `stripe-webhook-secret-stage` | Stage | Frontend |
| `stripe-webhook-secret-prod` | Prod | Frontend |
| `supabase-service-role-key-stage` | Stage | Frontend |
| `supabase-service-role-key-prod` | Prod | Frontend |

## Service Accounts

| Project | Service Account | Purpose |
|---------|-----------------|---------|
| cloudact-prod | `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` | Runs Cloud Build |
| cloudact-stage | `cloudact-sa-stage@cloudact-stage.iam.gserviceaccount.com` | Cloud Run identity |
| cloudact-prod | `cloudact-sa-prod@cloudact-prod.iam.gserviceaccount.com` | Cloud Run identity |

## Files Reference

| File | Purpose |
|------|---------|
| `cloudbuild-stage.yaml` | Stage deployment config |
| `cloudbuild-prod.yaml` | Prod deployment config |
| `setup-triggers.sh` | Script to create triggers (for reference) |
| `README.md` | This documentation |

---

**Last Updated**: 2026-01-04
