# BigQuery Operations Scripts

Scripts for managing BigQuery datasets and resources.

## Scripts

### cleanup_test_datasets.py

Safely removes test datasets while protecting production data.

**Protected patterns** (NEVER deleted):
- `organizations` - Central metadata
- `billing`, `usage`, `cost` - Critical data
- `cloudact`, `committed` - System datasets

**Test patterns** (candidates for deletion):
- `*_local` - Local dev environment
- `test_*`, `*_test` - Test datasets
- `e2e_*` - E2E test datasets

**Usage:**
```bash
# Dry-run (default) - list what would be deleted
python cleanup_test_datasets.py --project your-project-id

# Actually delete test datasets
python cleanup_test_datasets.py --project your-project-id --delete

# Use specific service account
python cleanup_test_datasets.py --project your-project-id --sa-file /path/to/sa.json

# Include unknown datasets in deletion
python cleanup_test_datasets.py --project your-project-id --delete --include-unknown
```

**Environment variables:**
- `GCP_PROJECT_ID` - Default project ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Default service account file

### list_datasets.py

List all BigQuery datasets with categorization.

**Usage:**
```bash
python list_datasets.py --project your-project-id
```

## Safety

- **Always run dry-run first** to see what would be deleted
- **Protected datasets cannot be deleted** even with `--delete`
- **Confirmation required** before actual deletion
- Use `--include-unknown` only when you're sure about unlisted datasets

## Common Operations

```bash
# Quick check of all datasets (use GCP_PROJECT_ID env var or --project)
python list_datasets.py

# Clean up after E2E tests
python cleanup_test_datasets.py --delete

# Full cleanup including unknown
python cleanup_test_datasets.py --delete --include-unknown
```
