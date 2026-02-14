# Pre-Deploy Checklist

Run these checks BEFORE creating a git tag.

## 1. Version Bump

```bash
# Check current version
cd 04-inra-cicd-automation/CICD
./releases.sh next

# Bump version in all config files BEFORE tagging
# Version is baked into Docker images at build time
```

Files to update:
- `02-api-service/src/app/config.py` → `APP_VERSION`
- `03-data-pipeline-service/src/app/config.py` → `APP_VERSION`
- `07-org-chat-backend/src/app/config.py` → `APP_VERSION`

## 2. Secrets Validation

```bash
cd 04-inra-cicd-automation/CICD

# Validate all secrets exist in GCP Secret Manager
./secrets/validate-env.sh prod frontend
./secrets/validate-env.sh prod api-service
./secrets/validate-env.sh prod pipeline-service
./secrets/validate-env.sh prod chat-backend
./secrets/verify-secrets.sh prod
```

**Required secrets per environment:**

| Secret | Service | Stage | Prod |
|--------|---------|-------|------|
| `ca-root-api-key-{env}` | All | `sk_test_*` | Unique |
| `stripe-secret-key-{env}` | Frontend | `sk_test_*` | `sk_live_*` |
| `stripe-webhook-secret-{env}` | Frontend | `whsec_*` | `whsec_*` |
| `supabase-service-role-key-{env}` | Frontend | JWT | JWT |

## 3. Supabase Migrations

```bash
cd 01-fronted-system/scripts/supabase_db

# Check pending migrations
./migrate.sh --status --prod

# Run migrations (requires SUPABASE_ACCESS_TOKEN)
./migrate.sh --prod
# Or skip confirmation:
./migrate.sh --yes --prod
```

## 4. GCP Credentials

```bash
# Activate prod service account (ABSOLUTE PATHS!)
gcloud auth activate-service-account \
  --key-file=/Users/openclaw/.gcp/cloudact-prod.json

# Verify
gcloud config get-value project  # should show cloudact-prod
```

## 5. Cloud Run Jobs (Migrations + Bootstrap)

```bash
cd 05-scheduler-jobs/scripts

# Run migrations via Cloud Run Job
echo "yes" | ./run-job.sh prod migrate

# Run bootstrap (creates/syncs meta tables)
echo "yes" | ./run-job.sh prod bootstrap

# Sync all org datasets
echo "yes" | ./run-job.sh prod org-sync-all
```

## 6. Stripe Verification

| Check | Stage | Prod |
|-------|-------|------|
| API Key prefix | `sk_test_*` | `sk_live_*` |
| Webhook secret | `whsec_*` | `whsec_*` |
| Starter price | `price_1R...` (test) | `price_1SWJMf...` |
| Professional price | `price_1R...` (test) | `price_1SWJOYDox...` |
| Scale price | `price_1R...` (test) | `price_1SWJP8Dox...` |

## 7. Current Health Check

```bash
# Verify current state before deploying
cd 04-inra-cicd-automation/CICD
./quick/status.sh prod
```

## 8. Stage Verification

- [ ] All changes pushed to main
- [ ] Stage deployed automatically (Cloud Build)
- [ ] Stage health checks pass
- [ ] Stage smoke tests pass
- [ ] No errors in stage logs (last 30 min)

## Gate: Ready to Deploy?

All items above must be checked. If any fail, fix before proceeding to [deploy.md](deploy.md).
