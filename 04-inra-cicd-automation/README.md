# Infrastructure & CI/CD Automation

Scripts and configurations for CloudAct infrastructure management.

## Directory Structure

```
04-inra-cicd-automation/
├── auth-admin/       # Admin key generation
├── backup/           # Backup scripts
├── bigquery-ops/     # BigQuery operations (cleanup, list datasets)
├── CICD/             # CI/CD scripts (build, push, deploy)
│   ├── build/        # Docker build scripts
│   ├── push/         # Artifact Registry push scripts
│   └── deploy/       # Cloud Run deploy scripts
├── cron-jobs/        # Scheduled jobs (billing sync, cleanup)
├── deployment/       # Legacy deployment scripts
├── gcp-setup/        # GCP infrastructure setup
│   ├── 00-gcp-enable-apis.sh
│   ├── 01-setup-cloud-build.sh
│   ├── 02-artifactory-setup.sh
│   ├── 03-secrets-setup.sh
│   ├── 04-iam-setup.sh
│   └── 05-cloud-run-setup.sh
└── testing/          # Test utilities
```

## Quick Reference

### BigQuery Cleanup

```bash
cd bigquery-ops

# List all datasets
python list_datasets.py

# Dry-run cleanup
python cleanup_test_datasets.py

# Delete test datasets
python cleanup_test_datasets.py --delete
```

### Admin Key Generation

```bash
python auth-admin/generate_admin_key.py
```

### GCP Setup (Infrastructure Provisioning)

Run these scripts in order to set up a new GCP project:

```bash
cd gcp-setup

# 1. Enable required APIs
./00-gcp-enable-apis.sh <project-id>

# 2. Setup Cloud Build
./01-setup-cloud-build.sh <project-id>

# 3. Setup Artifact Registry
./02-artifactory-setup.sh <project-id>

# 4. Setup secrets (per environment)
./03-secrets-setup.sh <project-id> <env>  # env: test, stage, prod

# 5. Setup IAM (per environment)
./04-iam-setup.sh <project-id> <env>

# 6. Create Cloud Run services (per environment)
./05-cloud-run-setup.sh <project-id> <env>

# Legacy scripts
python setup_kms_infrastructure.py --project your-project-id
python verify_pipeline_execution.py
```

### CI/CD (Build, Push, Deploy)

```bash
cd CICD

# All-in-one: build → push → deploy
./cicd.sh <service> <env> <project-id> [tag]
./cicd.sh api-service test cloudact-testing-1
./cicd.sh pipeline-service prod cloudact-prod v1.2.3

# Individual steps
./build/build.sh <service> <env> [tag]
./push/push.sh <service> <env> <project-id> [tag]
./deploy/deploy.sh <service> <env> <project-id> [image-tag]

# Services: api-service, pipeline-service, frontend
# Environments: test, stage, prod
```

### Cron Jobs

```bash
cd cron-jobs

# Billing sync retry
./billing-sync-retry.sh

# Billing reconciliation
./billing-reconciliation.sh

# Database cleanup
./run-all-cleanup.sh
```

### Deployment

```bash
cd deployment

# Deploy to staging
./simple_deploy.sh stage

# Deploy to production
./simple_deploy.sh prod
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON |
| `CA_ROOT_API_KEY` | Root API key for admin operations |
| `CLOUDACT_APP_URL` | App URL for cron jobs |
| `CRON_SECRET` | Secret for cron job authentication |

## Safety Notes

- **BigQuery cleanup** protects production datasets (`organizations`, `billing`, etc.)
- **Always dry-run first** before destructive operations
- **KMS scripts** require appropriate IAM permissions
- **Deploy scripts** require gcloud CLI configured
