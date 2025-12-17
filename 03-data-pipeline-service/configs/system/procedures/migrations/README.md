# Database Migrations

This directory contains one-time migration scripts for updating existing data structures or backfilling data.

## Overview

Migrations are stored procedures that run against customer datasets to update existing data. Unlike regular pipelines, these are typically one-time operations.

## Available Migrations

### `backfill_currency_audit_fields.sql`

**Purpose:** Backfill `source_currency`, `source_price`, and `exchange_rate_used` for existing SaaS subscription plans.

**Why:** These audit fields were added to track currency conversion history. Existing plans need these fields populated.

**Logic:**
- For plans without audit fields:
  - `source_currency` = current `currency` (assume it was the source)
  - `source_price` = current `unit_price`
  - `exchange_rate_used` = 1.0 (if USD) or calculated ratio

**Procedure:** `sp_backfill_currency_audit_fields`

---

## Running Migrations

### Prerequisites

1. **Sync procedure to BigQuery:**
   ```bash
   # Sync all procedures (including migrations)
   curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
     -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"force": true}'
   ```

2. **Verify procedure exists:**
   ```bash
   # List all procedures
   curl -X GET "http://localhost:8001/api/v1/procedures" \
     -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

   # Check specific procedure
   curl -X GET "http://localhost:8001/api/v1/procedures/sp_backfill_currency_audit_fields" \
     -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
   ```

### Step 1: Dry Run (Preview Changes)

**Always run dry run first to preview changes without modifying data.**

```bash
# Using BigQuery Console
CALL `your-project-id.organizations`.sp_backfill_currency_audit_fields(
  'your-project-id',      -- p_project_id
  'org_slug_prod',        -- p_dataset_id (e.g., 'acme_corp_prod')
  TRUE                    -- p_dry_run (TRUE = preview only)
);
```

**Using gcloud CLI:**
```bash
bq query --use_legacy_sql=false \
  "CALL \`your-project-id.organizations\`.sp_backfill_currency_audit_fields(
    'your-project-id',
    'org_slug_prod',
    TRUE
  )"
```

**Expected Output:**
```
+------------------+----------------+--------------------------------------------+
| mode             | rows_to_update | next_step                                  |
+------------------+----------------+--------------------------------------------+
| DRY RUN PREVIEW  | 42             | Set p_dry_run = FALSE to execute migration |
+------------------+----------------+--------------------------------------------+

Followed by a preview table showing current vs. new values for affected rows.
```

### Step 2: Execute Migration

**Only after reviewing dry run results:**

```bash
# Using BigQuery Console
CALL `your-project-id.organizations`.sp_backfill_currency_audit_fields(
  'your-project-id',
  'org_slug_prod',
  FALSE  -- p_dry_run = FALSE to execute
);
```

**Using gcloud CLI:**
```bash
bq query --use_legacy_sql=false \
  "CALL \`your-project-id.organizations\`.sp_backfill_currency_audit_fields(
    'your-project-id',
    'org_slug_prod',
    FALSE
  )"
```

**Expected Output:**
```
+---------------------+----------------+----------------+------------------+---------------+
| status              | project_id     | dataset_id     | rows_identified  | rows_updated  |
+---------------------+----------------+----------------+------------------+---------------+
| MIGRATION COMPLETED | your-project   | org_slug_prod  | 42               | 42            |
+---------------------+----------------+----------------+------------------+---------------+

Followed by sample of 20 recently updated rows.
```

---

## Migration Workflow

### For Each Organization:

1. **Sync procedures** (if not already done)
2. **Run dry run** to preview changes
3. **Review dry run output** carefully
4. **Execute migration** if dry run looks correct
5. **Verify results** by checking sample rows
6. **Document completion** (optional: track in org_audit_logs)

### Example Multi-Org Script:

```bash
#!/bin/bash
# backfill_all_orgs.sh

PROJECT_ID="your-project-id"
ORGS=("acme_corp_prod" "example_org_prod" "another_org_prod")

for ORG_DATASET in "${ORGS[@]}"; do
  echo "Processing $ORG_DATASET..."

  # Dry run first
  echo "Running dry run..."
  bq query --use_legacy_sql=false \
    "CALL \`$PROJECT_ID.organizations\`.sp_backfill_currency_audit_fields(
      '$PROJECT_ID',
      '$ORG_DATASET',
      TRUE
    )"

  # Prompt for confirmation
  read -p "Execute migration for $ORG_DATASET? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Executing migration..."
    bq query --use_legacy_sql=false \
      "CALL \`$PROJECT_ID.organizations\`.sp_backfill_currency_audit_fields(
        '$PROJECT_ID',
        '$ORG_DATASET',
        FALSE
      )"
  else
    echo "Skipped $ORG_DATASET"
  fi

  echo "---"
done

echo "Migration complete for all organizations"
```

---

## Safety Features

### Built-in Safeguards:

1. **Dry Run Mode:**
   - Preview changes without modifying data
   - Shows current vs. new values
   - Counts rows to be updated

2. **Selective Updates:**
   - Only updates rows with NULL audit fields
   - Preserves existing audit data if already populated
   - WHERE clause prevents unnecessary updates

3. **Validation:**
   - Only updates plans with `unit_price > 0`
   - Validates project_id and dataset_id parameters
   - Transaction-based (atomic operation)

4. **Audit Trail:**
   - Updates `updated_at` timestamp on affected rows
   - Returns sample of updated rows for verification
   - Shows before/after comparison in dry run

### Best Practices:

- ✅ **Always run dry run first**
- ✅ **Review row counts and sample data**
- ✅ **Test on dev/staging org before production**
- ✅ **Run during low-traffic periods**
- ✅ **Document which orgs have been migrated**
- ❌ **Never skip dry run in production**
- ❌ **Don't run on multiple orgs in parallel without testing**

---

## Troubleshooting

### "Procedure not found"

```bash
# Sync procedures again
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### "Table not found"

- Verify dataset name: `{org_slug}_prod` (e.g., `acme_corp_prod`)
- Check table exists: `saas_subscription_plans`
- Ensure org has been onboarded

### "No rows updated"

- All rows may already have audit fields populated
- Check dry run output to see affected rows
- Verify `unit_price > 0` for plans

### Migration failed mid-execution

- BigQuery transactions ensure atomicity
- Either all rows updated or none
- Re-run migration (WHERE clause prevents duplicates)

---

## Creating New Migrations

### Template:

```sql
-- Migration: {migration_name}
-- Purpose: {what this migration does}
-- Date: {creation_date}

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_{migration_name}(
  p_project_id STRING,
  p_dataset_id STRING,
  p_dry_run BOOL
)
BEGIN
  -- 1. Validate parameters
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  SET p_dry_run = COALESCE(p_dry_run, FALSE);

  -- 2. Dry run preview
  IF p_dry_run THEN
    -- Show what would be updated
  ELSE
    -- Execute migration
  END IF;

EXCEPTION WHEN ERROR THEN
  SELECT @@error.message AS error_message;
  RAISE USING MESSAGE = CONCAT('Migration Failed: ', @@error.message);
END;
```

### Checklist:

- [ ] Clear purpose and documentation
- [ ] Dry run mode support
- [ ] Parameter validation
- [ ] Selective updates (WHERE clauses)
- [ ] Error handling
- [ ] Audit trail (updated_at)
- [ ] Sample output
- [ ] README documentation

---

**Last Updated:** 2025-12-14
