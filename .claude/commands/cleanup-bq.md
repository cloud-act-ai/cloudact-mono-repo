# /cleanup-bq - BigQuery Dataset Cleanup

Delete all datasets from a BigQuery environment for fresh bootstrap.

## Usage

```
/cleanup-bq <environment>
```

## Environments

| Environment | GCP Project | Service Account |
|-------------|-------------|-----------------|
| `test` | cloudact-testing-1 | cloudact-testing-1@cloudact-testing-1.iam.gserviceaccount.com |
| `stage` | cloudact-stage | cloudact-stage@cloudact-stage.iam.gserviceaccount.com |
| `prod` | cloudact-prod | cloudact-prod@cloudact-prod.iam.gserviceaccount.com |

## Examples

```
/cleanup-bq test    # Clean all datasets in cloudact-testing-1
/cleanup-bq stage   # Clean all datasets in cloudact-stage
/cleanup-bq prod    # Clean all datasets in cloudact-prod (requires confirmation)
```

---

## Instructions

When user runs `/cleanup-bq <env>`, execute the following:

### Step 1: Parse and Validate Environment

```bash
ENV=$1  # First argument: test, stage, or prod

case $ENV in
  test)
    PROJECT=cloudact-testing-1
    SERVICE_ACCOUNT=cloudact-testing-1@cloudact-testing-1.iam.gserviceaccount.com
    ;;
  stage)
    PROJECT=cloudact-stage
    SERVICE_ACCOUNT=cloudact-stage@cloudact-stage.iam.gserviceaccount.com
    ;;
  prod)
    PROJECT=cloudact-prod
    SERVICE_ACCOUNT=cloudact-prod@cloudact-prod.iam.gserviceaccount.com
    # REQUIRE EXPLICIT CONFIRMATION FOR PROD
    ;;
  *)
    echo "ERROR: Invalid environment. Use: test, stage, or prod"
    exit 1
    ;;
esac
```

### Step 2: If prod, ask for explicit confirmation

**CRITICAL:** For prod environment, use AskUserQuestion to confirm:
- "Are you sure you want to delete ALL datasets from PRODUCTION (cloudact-prod)? This is irreversible!"
- Options: "Yes, delete prod" / "No, cancel"

If user cancels, abort immediately.

### Step 3: Switch to correct service account

```bash
gcloud config set account $SERVICE_ACCOUNT
gcloud config set project $PROJECT
```

### Step 4: List all datasets

```bash
bq ls --project_id=$PROJECT
```

Display count to user: "Found X datasets to delete"

### Step 5: Delete all datasets

For each dataset:
```bash
bq rm -r -f "$PROJECT:$DATASET_ID"
```

Use a bash script approach:
```bash
# Save datasets to file
bq ls 2>/dev/null | awk 'NR>2 {print $1}' > /tmp/bq_cleanup_datasets.txt

# Delete each dataset
while IFS= read -r ds; do
  [ -n "$ds" ] && echo "Deleting: $ds" && bq rm -r -f "$PROJECT:$ds"
done < /tmp/bq_cleanup_datasets.txt

# Cleanup
rm -f /tmp/bq_cleanup_datasets.txt
```

### Step 6: Verify and Report

```bash
echo "Remaining datasets:"
bq ls --project_id=$PROJECT
```

Report summary:
- Datasets deleted: X
- Environment: $ENV ($PROJECT)
- Status: Clean / Has remaining datasets

---

## Safety Notes

1. **Prod requires confirmation** - Never auto-delete prod without explicit user approval
2. **All datasets deleted** - This includes `organizations` meta tables
3. **Requires bootstrap** - After cleanup, run bootstrap to recreate meta tables
4. **Service account auth** - Uses environment-specific service accounts
