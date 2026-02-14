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

**GCP Secret Manager (8 secrets in prod):**

| Secret | Used By | Prefix/Type | Verified |
|--------|---------|-------------|----------|
| `ca-root-api-key-prod` | Frontend, API, Pipeline, Chat | Unique string | v1 |
| `stripe-secret-key-prod` | Frontend | `sk_live_*` | v1 |
| `stripe-webhook-secret-prod` | Frontend | `whsec_*` | v1 |
| `stripe-publishable-key-prod` | Frontend (hardcoded) | `pk_live_*` | v1 |
| `supabase-service-role-key-prod` | Frontend, API, Chat | JWT (`eyJ...`) | v1 |
| `supabase-anon-key-prod` | Frontend (hardcoded) | JWT (`eyJ...`) | v1 |
| `supabase-access-token-prod` | Migrations only | `sbp_*` | v1 |
| `smtp-password-prod` | Frontend, Pipeline | Gmail app password | v1 |

**KMS (credential encryption):**

| Resource | Value |
|----------|-------|
| Keyring | `cloudact-keyring` (us-central1) |
| Key | `api-key-encryption` (ENCRYPT_DECRYPT) |
| Used by | API Service, Pipeline Service, Chat Backend |

## 3. Cloud Run Environment Variables (All 4 Services)

### Frontend (cloudact-frontend-prod) - 26 vars

| Var | Source | Value |
|-----|--------|-------|
| `GCP_PROJECT_ID` | Plain | `cloudact-prod` |
| `ENVIRONMENT` | Plain | `production` |
| `NODE_ENV` | Plain | `production` |
| `NEXT_PUBLIC_API_SERVICE_URL` | Plain | `https://api.cloudact.ai` |
| `API_SERVICE_URL` | Plain | `https://api.cloudact.ai` |
| `NEXT_PUBLIC_PIPELINE_SERVICE_URL` | Plain | `https://pipeline.cloudact.ai` |
| `PIPELINE_SERVICE_URL` | Plain | `https://pipeline.cloudact.ai` |
| `NEXT_PUBLIC_APP_URL` | Plain | `https://cloudact.ai` |
| `CHAT_BACKEND_URL` | Plain | `https://cloudact-chat-backend-prod-zfq7lndpda-uc.a.run.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Plain | `https://ovfxswhkkshouhsryzaf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Plain | JWT (hardcoded) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Plain | `pk_live_*` (hardcoded) |
| `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID` | Plain | `price_1SWJMfDoxINmrJKY7tOoJUIs` |
| `NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID` | Plain | `price_1SWJOYDoxINmrJKY8jEZwVuU` |
| `NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID` | Plain | `price_1SWJP8DoxINmrJKYfg0jmeLv` |
| `NEXT_PUBLIC_DEFAULT_TRIAL_DAYS` | Plain | `14` |
| `SMTP_HOST` | Plain | `smtp.gmail.com` |
| `SMTP_PORT` | Plain | `587` |
| `SMTP_USERNAME` | Plain | `support@cloudact.ai` |
| `FROM_EMAIL` | Plain | `support@cloudact.ai` |
| `FROM_NAME` | Plain | `CloudAct.ai Support` |
| `CA_ROOT_API_KEY` | Secret | `ca-root-api-key-prod:latest` |
| `STRIPE_SECRET_KEY` | Secret | `stripe-secret-key-prod:latest` |
| `STRIPE_WEBHOOK_SECRET` | Secret | `stripe-webhook-secret-prod:latest` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `supabase-service-role-key-prod:latest` |
| `SMTP_PASSWORD` | Secret | `smtp-password-prod:latest` |

### API Service (cloudact-api-service-prod) - 11 vars

| Var | Source | Value |
|-----|--------|-------|
| `GCP_PROJECT_ID` | Plain | `cloudact-prod` |
| `BIGQUERY_LOCATION` | Plain | `US` |
| `ENVIRONMENT` | Plain | `production` |
| `PIPELINE_SERVICE_URL` | Plain | `https://pipeline.cloudact.ai` |
| `KMS_PROJECT_ID` | Plain | `cloudact-prod` |
| `KMS_LOCATION` | Plain | `us-central1` |
| `KMS_KEYRING` | Plain | `cloudact-keyring` |
| `KMS_KEY` | Plain | `api-key-encryption` |
| `SUPABASE_URL` | Plain | `https://ovfxswhkkshouhsryzaf.supabase.co` |
| `CA_ROOT_API_KEY` | Secret | `ca-root-api-key-prod:latest` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `supabase-service-role-key-prod:latest` |

### Pipeline Service (cloudact-pipeline-service-prod) - 15 vars

| Var | Source | Value |
|-----|--------|-------|
| `GCP_PROJECT_ID` | Plain | `cloudact-prod` |
| `BIGQUERY_LOCATION` | Plain | `US` |
| `ENVIRONMENT` | Plain | `production` |
| `API_SERVICE_URL` | Plain | `https://api.cloudact.ai` |
| `KMS_PROJECT_ID` | Plain | `cloudact-prod` |
| `KMS_LOCATION` | Plain | `us-central1` |
| `KMS_KEYRING` | Plain | `cloudact-keyring` |
| `KMS_KEY` | Plain | `api-key-encryption` |
| `SMTP_HOST` | Plain | `smtp.gmail.com` |
| `SMTP_PORT` | Plain | `587` |
| `SMTP_USERNAME` | Plain | `support@cloudact.ai` |
| `FROM_EMAIL` | Plain | `alerts@cloudact.ai` |
| `FROM_NAME` | Plain | `CloudAct.AI` |
| `CA_ROOT_API_KEY` | Secret | `ca-root-api-key-prod:latest` |
| `SMTP_PASSWORD` | Secret | `smtp-password-prod:latest` |

### Chat Backend (cloudact-chat-backend-prod) - 12 vars

| Var | Source | Value |
|-----|--------|-------|
| `GCP_PROJECT_ID` | Plain | `cloudact-prod` |
| `BIGQUERY_LOCATION` | Plain | `US` |
| `ENVIRONMENT` | Plain | `production` |
| `ORGANIZATIONS_DATASET` | Plain | `organizations` |
| `KMS_PROJECT_ID` | Plain | `cloudact-prod` |
| `KMS_LOCATION` | Plain | `us-central1` |
| `KMS_KEYRING` | Plain | `cloudact-keyring` |
| `KMS_KEY` | Plain | `api-key-encryption` |
| `CORS_ORIGINS` | Plain | `https://cloudact.ai` |
| `SUPABASE_URL` | Plain | `https://ovfxswhkkshouhsryzaf.supabase.co` |
| `CA_ROOT_API_KEY` | Secret | `ca-root-api-key-prod:latest` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `supabase-service-role-key-prod:latest` |

### Quick Verify Command

```bash
# Switch to prod first
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json

# Check all secrets have active versions
for s in ca-root-api-key-prod smtp-password-prod stripe-secret-key-prod \
  stripe-webhook-secret-prod supabase-service-role-key-prod supabase-anon-key-prod \
  supabase-access-token-prod stripe-publishable-key-prod; do
  ver=$(gcloud secrets versions list $s --project=cloudact-prod \
    --filter="state=ENABLED" --format="value(name)" --limit=1)
  echo "$s: v$ver"
done

# Check KMS key exists
gcloud kms keys list --keyring=cloudact-keyring --location=us-central1 \
  --project=cloudact-prod --format="table(name,purpose)"
```

## 4. Supabase Migrations

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
