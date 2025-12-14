# Migration Quick Start Guide

## Currency Audit Fields Backfill

This guide shows how to quickly backfill `source_currency`, `source_price`, and `exchange_rate_used` for existing subscription plans.

---

## Method 1: API Endpoint (Recommended)

### Step 1: Sync Procedures

```bash
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### Step 2: Dry Run (Preview)

```bash
curl -X POST "http://localhost:8001/api/v1/migrations/backfill_currency_audit_fields/execute" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_dataset": "acme_corp_prod",
    "dry_run": true
  }' | python3 -m json.tool
```

**Expected Response:**
```json
{
  "success": true,
  "migration_name": "backfill_currency_audit_fields",
  "org_dataset": "acme_corp_prod",
  "dry_run": true,
  "query_results": [
    {
      "mode": "DRY RUN PREVIEW",
      "rows_to_update": 42,
      "next_step": "Set p_dry_run = FALSE to execute migration"
    }
  ],
  "message": "Migration dry run preview completed successfully. Review dry run output before executing."
}
```

### Step 3: Execute Migration

**Only after reviewing dry run results:**

```bash
curl -X POST "http://localhost:8001/api/v1/migrations/backfill_currency_audit_fields/execute" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_dataset": "acme_corp_prod",
    "dry_run": false
  }' | python3 -m json.tool
```

**Expected Response:**
```json
{
  "success": true,
  "migration_name": "backfill_currency_audit_fields",
  "org_dataset": "acme_corp_prod",
  "dry_run": false,
  "query_results": [
    {
      "status": "MIGRATION COMPLETED",
      "project_id": "your-project-id",
      "dataset_id": "acme_corp_prod",
      "rows_identified": 42,
      "rows_updated": 42,
      "completed_at": "2025-12-14T10:30:00Z"
    }
  ],
  "message": "Migration execution completed successfully."
}
```

---

## Method 2: Helper Script

### Prerequisites

```bash
export CA_ROOT_API_KEY="your-root-api-key"
export GCP_PROJECT_ID="your-project-id"
```

### Dry Run

```bash
cd /path/to/03-data-pipeline-service/configs/system/procedures/migrations
./run_migration.sh backfill_currency_audit_fields acme_corp_prod
```

### Execute

```bash
./run_migration.sh backfill_currency_audit_fields acme_corp_prod --execute
```

---

## Method 3: BigQuery Console

### Dry Run

```sql
CALL `your-project-id.organizations`.sp_backfill_currency_audit_fields(
  'your-project-id',
  'acme_corp_prod',
  TRUE  -- dry run
);
```

### Execute

```sql
CALL `your-project-id.organizations`.sp_backfill_currency_audit_fields(
  'your-project-id',
  'acme_corp_prod',
  FALSE  -- execute
);
```

---

## Method 4: gcloud CLI

### Dry Run

```bash
bq query --use_legacy_sql=false \
  "CALL \`your-project-id.organizations\`.sp_backfill_currency_audit_fields(
    'your-project-id',
    'acme_corp_prod',
    TRUE
  )"
```

### Execute

```bash
bq query --use_legacy_sql=false \
  "CALL \`your-project-id.organizations\`.sp_backfill_currency_audit_fields(
    'your-project-id',
    'acme_corp_prod',
    FALSE
  )"
```

---

## Multi-Organization Script

```bash
#!/bin/bash
# backfill_all.sh

ORGS=("acme_corp_prod" "example_org_prod" "another_org_prod")

for ORG in "${ORGS[@]}"; do
  echo "=== Processing: $ORG ==="

  # Dry run
  echo "Dry run..."
  curl -X POST "http://localhost:8001/api/v1/migrations/backfill_currency_audit_fields/execute" \
    -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"org_dataset\": \"$ORG\", \"dry_run\": true}" \
    | python3 -m json.tool

  # Confirm
  read -p "Execute migration for $ORG? (yes/no): " CONFIRM
  if [ "$CONFIRM" = "yes" ]; then
    echo "Executing..."
    curl -X POST "http://localhost:8001/api/v1/migrations/backfill_currency_audit_fields/execute" \
      -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"org_dataset\": \"$ORG\", \"dry_run\": false}" \
      | python3 -m json.tool
  else
    echo "Skipped $ORG"
  fi
  echo ""
done
```

---

## Troubleshooting

### "Migration procedure not found"

**Solution:** Sync procedures first:
```bash
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### "Table not found: saas_subscription_plans"

**Solution:** Verify dataset name and ensure org is onboarded:
```bash
# Check if dataset exists
bq ls -d your-project-id:acme_corp_prod

# Check if table exists
bq ls your-project-id:acme_corp_prod
```

### "0 rows updated"

**Solution:** All rows may already have audit fields populated. Check dry run output.

---

## Safety Checklist

- ✅ Run dry run first
- ✅ Review row counts
- ✅ Verify sample data looks correct
- ✅ Test on dev/staging org first
- ✅ Run during low-traffic period
- ❌ Never skip dry run in production
- ❌ Don't run on all orgs without testing one first

---

## What This Migration Does

For each subscription plan without audit fields:

| Field | Old Value | New Value |
|-------|-----------|-----------|
| `source_currency` | NULL | Current `currency` (e.g., "USD") |
| `source_price` | NULL | Current `unit_price_usd` |
| `exchange_rate_used` | NULL | 1.0 (if USD) or calculated ratio |

**Example:**

```
Before:
  currency: "USD"
  unit_price_usd: 20.0
  source_currency: NULL
  source_price: NULL
  exchange_rate_used: NULL

After:
  currency: "USD"
  unit_price_usd: 20.0
  source_currency: "USD"
  source_price: 20.0
  exchange_rate_used: 1.0
```

---

**Last Updated:** 2025-12-14
