---
name: deploy-check
description: |
  Deployment automation and checks. Pre-deployment validation, health checks, rollback.
  Use when: deploying services, verifying deployments, debugging deployment issues.
---

# Deployment Checks

## Environments

| Environment | GCP Project | URLs |
|-------------|-------------|------|
| **test** | `cloudact-testing-1` | Cloud Run auto-generated URLs |
| **stage** | `cloudact-testing-1` | Cloud Run URLs |
| **prod** | `cloudact-prod` | `api.cloudact.ai`, `pipeline.cloudact.ai`, `cloudact.ai` |

**Credentials:** `~/.gcp/cloudact-{project}.json`

## Files
- CICD Scripts: `04-inra-cicd-automation/CICD/`
- Dockerfiles: `{service}/Dockerfile`
- Environments: `04-inra-cicd-automation/CICD/environments.conf`
- Cloud Build: `cloudbuild-stage.yaml`, `cloudbuild-prod.yaml`

## Deployment Workflow (Cloud Build - AUTOMATED)

> **IMPORTANT:** Deployments are AUTOMATIC via Cloud Build triggers.

### 1. Validate (Pre-deployment)
```bash
cd 04-inra-cicd-automation/CICD
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
```

### 2. Deploy via Git (Cloud Build Auto-Triggers)
```bash
# Stage: Push to main branch
git push origin main

# Production: Create and push version tag
git tag v4.4.0
git push origin v4.4.0

# Monitor build
gcloud builds list --project=cloudact-prod --region=global --limit=5
```

### 3. Verify
```bash
# Health checks
curl -s https://api.cloudact.ai/health
curl -s https://pipeline.cloudact.ai/health

# Monitor logs (15 minutes)
./monitor/watch-all.sh prod 50
```

### 4. Rollback (if needed)
```bash
# Create a new tag pointing to previous working version
git tag v4.4.1  # Patch release with rollback
git push origin v4.4.1
```

## Manual Deploy (Development/Testing ONLY)

> **WARNING:** Only for local dev and test environments. NOT for production.

```bash
cd 04-inra-cicd-automation/CICD/quick

# Test environment only
./deploy-test.sh
```

## CICD Scripts

| Script | Purpose |
|--------|---------|
| `release.sh` | Versioned release workflow (recommended) |
| `releases.sh` | List/manage releases |
| `deploy/deploy.sh` | Deploy single service |
| `deploy-all.sh` | Deploy all services |
| `quick/deploy-{env}.sh` | Quick environment deploy |
| `quick/status.sh` | Service status checker |
| `monitor/watch-all.sh` | Monitor logs |
| `secrets/validate-env.sh` | Validate environment config |

## Required Secrets (Google Secret Manager)

| Secret | Environment | Description |
|--------|-------------|-------------|
| `ca-root-api-key-{env}` | All | System root API key |
| `stripe-secret-key-{env}` | Frontend | Stripe secret (sk_live_*) |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role JWT |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check Dockerfile and dependencies |
| Health check timeout | Increase startup time in Cloud Run settings |
| 403 Forbidden | Run `./quick/fix-auth.sh <env>` |
| Secret not found | Run `./secrets/setup-secrets.sh <env>` |
| Connection refused | Set inter-service URL env vars |
| Wrong Stripe keys | Verify LIVE keys (pk_live_*, sk_live_*) in prod |
| CORS errors on chat backend | `CORS_ORIGINS` env var set as plain string but pydantic-settings v2 expects JSON array for `List[str]` types. Fix: use `str` type in config and parse manually. See infra-cicd SKILL.md learning #8. |
| Cloud Build status unknown | Both triggers are in `cloudact-prod` project. Use `gcloud builds list --project=cloudact-prod --region=global` to check both stage and prod builds. |
