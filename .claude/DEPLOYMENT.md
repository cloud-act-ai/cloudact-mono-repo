# DEPLOYMENT.md - Release & Operations Guide

> Complete guide for deploying CloudAct to Stage and Production.

---

## 🚀 Full Release Workflow

### Order of Operations

```
1. Supabase Migrations  →  BEFORE frontend deploy
2. Deploy Code          →  git push (stage) or git tag (prod)
3. Bootstrap Jobs       →  AFTER API service is up
4. Verify Health        →  Check all services
```

---

## Step 1: Supabase Migrations

**Run BEFORE deploying frontend** (schema must exist for new code).

```bash
cd 01-fronted-system/scripts/supabase_db

# Check status first
./migrate.sh --status --stage    # Stage
./migrate.sh --status --prod     # Production

# Run migrations
./migrate.sh --stage             # Stage
./migrate.sh --prod              # Production (confirms first)
./migrate.sh --yes --prod        # Production (skip confirm)

# Dry run (see what would run)
./migrate.sh --dry-run --prod

# Force re-run specific migration
./migrate.sh --force 37 --prod
```

### Via Cloud Run Job (Alternative)

```bash
cd 05-scheduler-jobs
./scripts/run-job.sh prod migrate
```

### Migration Files

- Location: `01-fronted-system/scripts/supabase_db/[0-9][0-9]_*.sql`
- Tracked in: `schema_migrations` table

---

## Step 2: Deploy Code

### Staging (Auto-deploy on push to main)

```bash
git push origin main
```

Cloud Build triggers `cloudbuild-stage.yaml` → deploys to `cloudact-stage`.

### Production (Auto-deploy on git tag)

```bash
# Create and push tag
git tag v4.3.1
git push origin v4.3.1
```

Cloud Build triggers `cloudbuild-prod.yaml` → deploys to `cloudact-prod`.

### Manual Deploy (Test/Dev Only)

```bash
cd 04-inra-cicd-automation/CICD

# Single service
./cicd.sh api-service stage cloudact-stage
./cicd.sh pipeline-service stage cloudact-stage
./cicd.sh frontend stage cloudact-stage

# All services
./deploy-all.sh stage
```

---

## Step 3: Bootstrap Jobs

**Run AFTER API service is deployed** (jobs call API endpoints).

```bash
cd 05-scheduler-jobs

# Bootstrap (creates dataset + 30 tables if new, syncs columns if exists)
./scripts/run-job.sh stage bootstrap     # Stage
./scripts/run-job.sh prod bootstrap      # Production

# Sync all org datasets (run after bootstrap)
./scripts/run-job.sh stage org-sync-all  # Stage
./scripts/run-job.sh prod org-sync-all   # Production
```

### All Job Shortcuts

| Shortcut | Full Job Name | When to Use |
|----------|---------------|-------------|
| `migrate` | `cloudact-manual-supabase-migrate` | BEFORE frontend deploy |
| `bootstrap` | `cloudact-manual-bootstrap` | AFTER API deploy |
| `org-sync-all` | `cloudact-manual-org-sync-all` | AFTER bootstrap |
| `stale-cleanup` | `cloudact-daily-stale-cleanup` | Fix stuck counters |
| `quota-reset` | `cloudact-daily-quota-reset` | Manual quota reset |
| `alerts` | `cloudact-daily-alerts` | Manual alert processing |

### List Jobs

```bash
./scripts/list-jobs.sh stage
./scripts/list-jobs.sh prod
```

### Create Jobs (First Time Setup)

```bash
./scripts/create-all-jobs.sh stage
./scripts/create-all-jobs.sh prod
```

---

## Step 4: Verify Health

```bash
cd 04-inra-cicd-automation/CICD

# Quick health check
./quick/status.sh stage
./quick/status.sh prod

# Watch logs
./monitor/watch-all.sh stage 50
./monitor/watch-all.sh prod 50
```

---

## 🔐 Credentials & Keys

### GCP Service Account Keys

| Environment | File Location |
|-------------|---------------|
| Test | `~/.gcp/cloudact-testing-1-*.json` |
| Stage | `secrets/cloudact-stage.json` |
| Prod | `secrets/cloudact-prod.json` |

### GCP Secret Manager (Runtime)

| Secret | Description |
|--------|-------------|
| `ca-root-api-key-{env}` | Root API key for admin ops |
| `stripe-secret-key-{env}` | Stripe secret (sk_*) |
| `stripe-webhook-secret-{env}` | Stripe webhook (whsec_*) |
| `supabase-service-role-key-{env}` | Supabase service role JWT |

### Environment Files

| File | Location | Purpose |
|------|----------|---------|
| `.env.local` | `01-fronted-system/` | Local development |
| `.env.stage` | `01-fronted-system/` | Stage overrides |
| `.env.prod` | `01-fronted-system/` | Prod overrides |

### Key Variables

```bash
# Supabase
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # Server-side admin
SUPABASE_ACCESS_TOKEN=sbp_...        # Migrations (Management API)
SUPABASE_DB_PASSWORD=...             # Direct DB access

# Backend
CA_ROOT_API_KEY=...                  # Root admin key

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# GCP
GCP_PROJECT_ID=cloudact-testing-1    # or cloudact-stage, cloudact-prod
```

---

## 🌍 GCP Projects

| Environment | GCP Project | Supabase Project |
|-------------|-------------|------------------|
| test | `cloudact-testing-1` | `kwroaccbrxppfiysqlzs` |
| stage | `cloudact-stage` | `kwroaccbrxppfiysqlzs` |
| **prod** | `cloudact-prod` | `ovfxswhkkshouhsryzaf` |

---

## 📋 Pre-Release Checklist

```bash
# ═══════════════════════════════════════════════════════════════
# 1. RUN TESTS
# ═══════════════════════════════════════════════════════════════
cd 01-fronted-system && npm run test
cd 02-api-service && pytest
cd 03-data-pipeline-service && pytest

# ═══════════════════════════════════════════════════════════════
# 2. VALIDATE SECRETS
# ═══════════════════════════════════════════════════════════════
cd 04-inra-cicd-automation/CICD
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod

# ═══════════════════════════════════════════════════════════════
# 3. SUPABASE MIGRATIONS (BEFORE deploy)
# ═══════════════════════════════════════════════════════════════
cd 01-fronted-system/scripts/supabase_db
./migrate.sh --status --prod
./migrate.sh --prod

# ═══════════════════════════════════════════════════════════════
# 4. DEPLOY (git tag for prod)
# ═══════════════════════════════════════════════════════════════
git tag v4.3.x && git push origin v4.3.x

# ═══════════════════════════════════════════════════════════════
# 5. BOOTSTRAP JOBS (AFTER API is up)
# ═══════════════════════════════════════════════════════════════
cd 05-scheduler-jobs
./scripts/run-job.sh prod bootstrap
./scripts/run-job.sh prod org-sync-all

# ═══════════════════════════════════════════════════════════════
# 6. VERIFY HEALTH
# ═══════════════════════════════════════════════════════════════
cd 04-inra-cicd-automation/CICD
./quick/status.sh prod
```

---

## 🆘 Troubleshooting

### Migration Fails

```bash
# Check Supabase access token
echo $SUPABASE_ACCESS_TOKEN

# Get new token: https://supabase.com/dashboard/account/tokens

# Check migration status
./migrate.sh --status --prod
```

### Bootstrap Job Fails

```bash
# Check API service is running
curl https://api.cloudact.ai/health

# Check job logs
cd 05-scheduler-jobs
./scripts/list-jobs.sh prod  # Shows recent executions

# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_job" --project=cloudact-prod --limit=50
```

### Service Not Healthy

```bash
# Check all services
cd 04-inra-cicd-automation/CICD
./quick/status.sh prod

# Check specific service logs
./monitor/watch-service.sh prod api-service 50
./monitor/watch-service.sh prod pipeline-service 50
./monitor/watch-service.sh prod frontend 50
```

---

**Last Updated:** 2026-02-04 | **Version:** v4.3.0
