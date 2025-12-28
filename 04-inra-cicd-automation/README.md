# Infrastructure & CI/CD Automation

Scripts and configurations for CloudAct infrastructure management.

## Directory Structure

```
04-inra-cicd-automation/
├── auth-admin/       # Admin key generation
├── backup/           # Backup scripts
├── bigquery-ops/     # BigQuery operations (cleanup, list datasets)
├── cron-jobs/        # Scheduled jobs (billing sync, cleanup)
├── deployment/       # Cloud Run deployment
├── gcp-setup/        # GCP infrastructure (APIs, KMS, pipeline verification)
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

### GCP Setup

```bash
cd gcp-setup

# Setup GCP APIs
python setup_gcp_api.py

# Setup KMS infrastructure
python setup_kms_infrastructure.py --project your-project-id

# Verify pipeline execution
python verify_pipeline_execution.py
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
