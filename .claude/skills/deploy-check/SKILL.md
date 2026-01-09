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
| **stage** | `cloudact-stage` | `cloudact-stage.vercel.app` (frontend) |
| **prod** | `cloudact-prod` | `api.cloudact.ai`, `pipeline.cloudact.ai`, `cloudact.ai` |

**Credentials:** `~/.gcp/cloudact-{project}.json`

## Files
- CICD Scripts: `04-inra-cicd-automation/CICD/`
- Dockerfiles: `{service}/Dockerfile`
- Environments: `04-inra-cicd-automation/CICD/environments.conf`

## Deployment Workflow

### 1. Validate (Pre-deployment)
```bash
cd 04-inra-cicd-automation/CICD

# Validate environment secrets
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
```

### 2. Deploy with Releases
```bash
# Check current version
./releases.sh next

# Deploy to staging first
./release.sh v1.0.0 --deploy --env stage

# Test staging, then deploy to production
./release.sh v1.0.0 --deploy --env prod
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
./release.sh v0.9.0 --deploy --env prod
```

## Quick Deploy (Testing)

```bash
cd 04-inra-cicd-automation/CICD/quick

# Test
./deploy-test.sh

# Stage
./deploy-stage.sh

# Prod (careful!)
./deploy-prod.sh
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
