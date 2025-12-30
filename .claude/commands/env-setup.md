# /env-setup - Environment Setup & Secrets

Activate GCP environments, validate secrets, and configure credentials.

## Usage

```
/env-setup <action> [environment]
```

## Actions

### Activate Environment
```
/env-setup activate test                 # Activate test GCP project
/env-setup activate stage                # Activate stage GCP project
/env-setup activate prod                 # Activate prod GCP project
```

### Validate Secrets
```
/env-setup validate test                 # Validate all secrets exist in test
/env-setup validate stage                # Validate all secrets exist in stage
/env-setup validate prod                 # Validate all secrets exist in prod
```

### Setup Secrets
```
/env-setup secrets test                  # Create secrets from env files
/env-setup secrets stage                 # Create secrets from env files
/env-setup secrets prod                  # Create secrets from env files
```

### List Configuration
```
/env-setup list test                     # List all secrets in test
/env-setup list prod                     # List all secrets in prod
```

---

## Instructions

### Activate Environment Action

Switches GCP context to the specified environment.

```bash
ENV={env}
case $ENV in
  test)
    PROJECT=cloudact-testing-1
    KEY_FILE=~/.gcp/cloudact-testing-1-e44da390bf82.json
    SERVICE_ACCOUNT="cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com"
    ;;
  stage)
    PROJECT=cloudact-stage
    KEY_FILE=~/.gcp/cloudact-stage.json
    SERVICE_ACCOUNT="cloudact-stage@cloudact-stage.iam.gserviceaccount.com"
    ;;
  prod)
    PROJECT=cloudact-prod
    KEY_FILE=~/.gcp/cloudact-prod.json
    SERVICE_ACCOUNT="cloudact-prod@cloudact-prod.iam.gserviceaccount.com"
    ;;
esac

# Activate service account
gcloud auth activate-service-account --key-file=$KEY_FILE

# Set project
gcloud config set project $PROJECT

# Verify
echo "Active project: $(gcloud config get-value project)"
echo "Service account: $SERVICE_ACCOUNT"
```

---

### Validate Secrets Action

Verifies all required secrets exist in the environment.

```bash
ENV={env}
case $ENV in
  test)  PROJECT=cloudact-testing-1 ;;
  stage) PROJECT=cloudact-stage ;;
  prod)  PROJECT=cloudact-prod ;;
esac

REQUIRED_SECRETS=(
  "ca-root-api-key-${ENV}"
  "stripe-secret-key-${ENV}"
  "stripe-webhook-secret-${ENV}"
  "supabase-service-role-key-${ENV}"
)

echo "Validating secrets in $PROJECT..."
echo ""

ALL_OK=true
for secret in "${REQUIRED_SECRETS[@]}"; do
  if gcloud secrets describe $secret --project=$PROJECT &>/dev/null; then
    echo "  ✓ $secret"
  else
    echo "  ✗ $secret (MISSING)"
    ALL_OK=false
  fi
done

echo ""
if [ "$ALL_OK" = true ]; then
  echo "All secrets validated successfully."
else
  echo "ERROR: Some secrets are missing!"
  exit 1
fi
```

---

### Setup Secrets Action

Creates secrets from environment files.

**IMPORTANT:** Uses existing CICD scripts.

```bash
cd $REPO_ROOT/04-inra-cicd-automation/CICD/secrets
./setup-secrets.sh {env}
```

**What it does:**
1. Reads values from service `.env.{env}` files
2. Creates secrets in Google Secret Manager
3. Grants service account access to secrets

---

### List Secrets Action

Lists all secrets in the environment.

```bash
ENV={env}
case $ENV in
  test)  PROJECT=cloudact-testing-1 ;;
  stage) PROJECT=cloudact-stage ;;
  prod)  PROJECT=cloudact-prod ;;
esac

gcloud secrets list --project=$PROJECT --format="table(name,createTime,replication.automatic)"
```

---

## Environment Configuration Matrix

### GCP Projects
| Environment | Project ID | Key File |
|-------------|------------|----------|
| test | `cloudact-testing-1` | `~/.gcp/cloudact-testing-1-e44da390bf82.json` |
| stage | `cloudact-stage` | `~/.gcp/cloudact-stage.json` |
| prod | `cloudact-prod` | `~/.gcp/cloudact-prod.json` |

### Service Accounts
| Environment | Service Account |
|-------------|-----------------|
| test | `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` |
| stage | `cloudact-stage@cloudact-stage.iam.gserviceaccount.com` |
| prod | `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` |

> **Note:** Stage/prod service accounts use `cloudact-{env}@` NOT `cloudact-sa-{env}@`

### Required Secrets
| Secret Name | Required By | Description |
|-------------|-------------|-------------|
| `ca-root-api-key-{env}` | All services | System root API key (min 32 chars) |
| `stripe-secret-key-{env}` | Frontend | Stripe secret key (sk_test_* or sk_live_*) |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing secret (whsec_*) |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role JWT |

### Supabase Configuration
| Environment | Project ID | URL |
|-------------|------------|-----|
| local/test/stage | `kwroaccbrxppfiysqlzs` | https://kwroaccbrxppfiysqlzs.supabase.co |
| prod | `ovfxswhkkshouhsryzaf` | https://ovfxswhkkshouhsryzaf.supabase.co |

### Stripe Configuration
| Environment | Key Type | Example |
|-------------|----------|---------|
| local/test/stage | TEST | `pk_test_*`, `sk_test_*` |
| prod | LIVE | `pk_live_*`, `sk_live_*` |

---

## Environment Files Location

| Service | Local | Stage | Prod |
|---------|-------|-------|------|
| API Service | `02-api-service/.env.local` | `02-api-service/.env.stage` | `02-api-service/.env.prod` |
| Pipeline Service | `03-data-pipeline-service/.env.local` | `03-data-pipeline-service/.env.stage` | `03-data-pipeline-service/.env.prod` |
| Frontend | `01-fronted-system/.env.local` | N/A (Vercel) | `01-fronted-system/.env.prod` |

---

## Quick Reference Commands

```bash
# Check current GCP project
gcloud config get-value project

# List service accounts
gcloud iam service-accounts list --project={project}

# Get secret value
gcloud secrets versions access latest --secret={secret-name} --project={project}

# Create a new secret
echo -n "secret-value" | gcloud secrets create {secret-name} --project={project} --data-file=-

# Grant access to service account
gcloud secrets add-iam-policy-binding {secret-name} \
  --project={project} \
  --member="serviceAccount:{service-account}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Troubleshooting

### Permission denied on secrets
```bash
# Grant service account access
gcloud secrets add-iam-policy-binding ca-root-api-key-{env} \
  --project={project} \
  --member="serviceAccount:{service-account}" \
  --role="roles/secretmanager.secretAccessor"
```

### Service account key file not found
```bash
# Check key file exists
ls -la ~/.gcp/

# Download new key if needed (from GCP Console)
```

### Wrong project activated
```bash
# Re-activate correct environment
/env-setup activate {env}

# Verify
gcloud config get-value project
```

## Quick Commands

```bash
# Activate production
/env-setup activate prod

# Validate all prod secrets
/env-setup validate prod

# List secrets
/env-setup list prod
```

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
- `$CICD_DIR` = `$REPO_ROOT/04-inra-cicd-automation/CICD`
