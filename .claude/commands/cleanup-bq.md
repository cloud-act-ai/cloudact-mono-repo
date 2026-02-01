# /cleanup-bq - BigQuery Dataset Cleanup

Delete org and customer datasets from a BigQuery environment for fresh bootstrap.

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

## Protected Datasets (NEVER DELETE)

> **CRITICAL:** These datasets are managed by GCP Billing Export and must NEVER be deleted:

| Dataset | Purpose |
|---------|---------|
| `gcp_billing_cud_dataset` | GCP Committed Use Discounts billing export |
| `gcp_cloud_billing_dataset` | GCP Cloud Billing export |

These are created and populated by GCP automatically. Deleting them would break billing data pipelines.

## Datasets to Delete

| Pattern | Description |
|---------|-------------|
| `organizations` | CloudAct meta tables (21 bootstrap tables) |
| `*_prod` | Customer org datasets (e.g., `acme_inc_prod`) |

## Examples

```
/cleanup-bq test    # Clean org + customer datasets in cloudact-testing-1
/cleanup-bq stage   # Clean org + customer datasets in cloudact-stage
/cleanup-bq prod    # Clean org + customer datasets in cloudact-prod (requires confirmation)
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

### Step 5: Delete org and customer datasets (SKIP protected datasets)

**IMPORTANT:** Skip these protected GCP billing datasets:
- `gcp_billing_cud_dataset`
- `gcp_cloud_billing_dataset`

For each dataset (except protected):
```bash
bq rm -r -f "$PROJECT:$DATASET_ID"
```

Use a bash script approach:
```bash
# Protected datasets - NEVER DELETE
PROTECTED="gcp_billing_cud_dataset gcp_cloud_billing_dataset"

# Save datasets to file (excluding protected)
bq ls 2>/dev/null | awk 'NR>2 {print $1}' > /tmp/bq_cleanup_datasets.txt

# Delete each dataset (skip protected)
while IFS= read -r ds; do
  if [ -n "$ds" ]; then
    # Check if protected
    if echo "$PROTECTED" | grep -qw "$ds"; then
      echo "SKIPPING (protected): $ds"
    else
      echo "Deleting: $ds" && bq rm -r -f "$PROJECT:$ds"
    fi
  fi
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
2. **Protected datasets preserved** - GCP billing datasets are NEVER deleted:
   - `gcp_billing_cud_dataset` - CUD billing export
   - `gcp_cloud_billing_dataset` - Cloud Billing export
3. **Datasets deleted** - Only `organizations` and customer `*_prod` datasets
4. **Requires bootstrap** - After cleanup, run bootstrap to recreate meta tables
5. **Service account auth** - Uses environment-specific service accounts
