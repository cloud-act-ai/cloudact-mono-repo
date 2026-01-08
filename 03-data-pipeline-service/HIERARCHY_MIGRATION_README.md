# 10-Level Hierarchy Migration Guide

This guide walks you through migrating an existing CloudAct organization from the old 5-field hierarchy design to the new 10-level ID+Name pairs design.

## Prerequisites

1. **GCP Service Account** with BigQuery Admin permissions
2. **Root API Key** for CloudAct API service
3. **Python 3.8+** with dependencies:
   ```bash
   pip install google-cloud-bigquery requests
   ```

## Migration Steps

### 1. Dry Run (Recommended First Step)

Check what the migration would do without making changes:

```bash
export GCP_PROJECT_ID="cloudact-testing-1"
export CA_ROOT_API_KEY="your-root-api-key"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"

python3 migrate_to_10_level_hierarchy.py \
  --org acme_inc_01062026 \
  --dry-run
```

**Output:**
- Lists all target tables
- Shows which columns are missing
- Shows current backfill status
- Does NOT make any changes

### 2. Validate Current State

Check schema and data status without making changes:

```bash
python3 migrate_to_10_level_hierarchy.py \
  --org acme_inc_01062026 \
  --validate-only
```

**Output:**
- ✅ Tables with all 20 hierarchy columns
- ⚠️ Tables missing hierarchy columns
- ❌ Tables not populated with hierarchy data
- Percentage of rows with hierarchy data filled

### 3. Execute Full Migration

Run the complete migration (schema sync + backfill):

```bash
python3 migrate_to_10_level_hierarchy.py \
  --org acme_inc_01062026
```

**What it does:**
1. **Schema Sync:** Calls API endpoint to add missing hierarchy columns to all tables
2. **Wait:** 10 seconds for schema propagation
3. **Backfill:** Updates all GenAI and subscription tables with hierarchy data from `org_hierarchy`
4. **Validate:** Checks final status and reports results

### 4. Manual Steps (Optional)

If you prefer to run steps individually:

```bash
# Step 1: Schema sync only
python3 migrate_to_10_level_hierarchy.py \
  --org acme_inc_01062026 \
  --skip-backfill

# Step 2: Backfill only (after schema sync)
python3 migrate_to_10_level_hierarchy.py \
  --org acme_inc_01062026 \
  --skip-sync
```

## What Gets Migrated

### Tables Updated

All 11 tables in `{org_slug}_prod` dataset:

| Table | Schema Update | Data Backfill | Notes |
|-------|---------------|---------------|-------|
| `genai_payg_usage_raw` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `genai_commitment_usage_raw` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `genai_infrastructure_usage_raw` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `genai_payg_costs_daily` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `genai_commitment_costs_daily` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `genai_infrastructure_costs_daily` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `genai_costs_daily_unified` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `genai_usage_daily_unified` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `subscription_plan_costs_daily` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `subscription_plans` | ✅ 20 columns | ✅ From org_hierarchy | Matched by entity_id |
| `cost_data_standard_1_3` | ✅ 20 columns | ⚠️ Tag-based | Enriched by FOCUS conversion |

**Note:** `cost_data_standard_1_3` (cloud costs) uses tag-based enrichment during FOCUS conversion, not direct backfill.

### Columns Added

Each table gets 20 new columns (+ 1 validation timestamp):

```sql
x_hierarchy_level_1_id STRING NULLABLE,
x_hierarchy_level_1_name STRING NULLABLE,
x_hierarchy_level_2_id STRING NULLABLE,
x_hierarchy_level_2_name STRING NULLABLE,
x_hierarchy_level_3_id STRING NULLABLE,
x_hierarchy_level_3_name STRING NULLABLE,
x_hierarchy_level_4_id STRING NULLABLE,
x_hierarchy_level_4_name STRING NULLABLE,
x_hierarchy_level_5_id STRING NULLABLE,
x_hierarchy_level_5_name STRING NULLABLE,
x_hierarchy_level_6_id STRING NULLABLE,
x_hierarchy_level_6_name STRING NULLABLE,
x_hierarchy_level_7_id STRING NULLABLE,
x_hierarchy_level_7_name STRING NULLABLE,
x_hierarchy_level_8_id STRING NULLABLE,
x_hierarchy_level_8_name STRING NULLABLE,
x_hierarchy_level_9_id STRING NULLABLE,
x_hierarchy_level_9_name STRING NULLABLE,
x_hierarchy_level_10_id STRING NULLABLE,
x_hierarchy_level_10_name STRING NULLABLE,
x_hierarchy_validated_at TIMESTAMP NULLABLE
```

## Backfill Logic

The script uses a CTE to expand `path_ids` and `path_names` arrays from `org_hierarchy`:

```sql
WITH hierarchy_expanded AS (
  SELECT
    entity_id,
    -- Extract IDs from path_ids array
    path_ids[OFFSET(0)] AS level_1_id,
    path_ids[OFFSET(1)] AS level_2_id,
    ...
    path_ids[OFFSET(9)] AS level_10_id,
    -- Extract names from path_names array
    path_names[OFFSET(0)] AS level_1_name,
    path_names[OFFSET(1)] AS level_2_name,
    ...
    path_names[OFFSET(9)] AS level_10_name
  FROM `organizations.org_hierarchy`
  WHERE org_slug = @org_slug AND end_date IS NULL
)
UPDATE target_table
SET
  hierarchy_level_1_id = h.level_1_id,
  hierarchy_level_1_name = h.level_1_name,
  ...
FROM hierarchy_expanded h
WHERE target_table.entity_id = h.entity_id
  AND target_table.hierarchy_level_1_id IS NULL
```

**Key Points:**
- Only updates rows where `hierarchy_level_1_id IS NULL` (idempotent)
- Matches on `entity_id` field
- Expands full hierarchy path automatically
- Works for any depth (2-10 levels)

## Validation Queries

After migration, verify completion:

```sql
-- Check schema
SELECT column_name
FROM `{project}.{dataset}.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'genai_payg_usage_raw'
  AND column_name LIKE 'x_hierarchy_level%'
ORDER BY column_name;

-- Check backfill status
SELECT
  COUNT(*) as total_rows,
  COUNT(x_hierarchy_level_1_id) as rows_with_hierarchy,
  ROUND(COUNT(x_hierarchy_level_1_id) * 100.0 / COUNT(*), 2) as pct_filled
FROM `{project}.{dataset}.genai_payg_usage_raw`;

-- Sample hierarchy data
SELECT
  entity_id,
  x_hierarchy_level_1_id,
  x_hierarchy_level_1_name,
  x_hierarchy_level_2_id,
  x_hierarchy_level_2_name,
  x_hierarchy_level_3_id,
  x_hierarchy_level_3_name
FROM `{project}.{dataset}.genai_payg_usage_raw`
WHERE x_hierarchy_level_1_id IS NOT NULL
LIMIT 10;
```

## Troubleshooting

### Error: "Table not found"

**Cause:** Org dataset doesn't exist or table is missing.

**Solution:**
1. Verify org slug is correct
2. Check dataset exists: `{org_slug}_prod`
3. Run onboarding if needed

### Error: "Column already exists"

**Cause:** Schema sync attempted on already-updated table.

**Solution:** Skip schema sync step:
```bash
python3 migrate_to_10_level_hierarchy.py --org {org} --skip-sync
```

### Warning: "0% filled after backfill"

**Possible causes:**
1. **No matching hierarchy entities:** Check `org_hierarchy` table has data for this org
2. **entity_id mismatch:** Verify `entity_id` values match between tables
3. **Already populated:** Rows with existing hierarchy data are skipped

**Debug:**
```sql
-- Check org_hierarchy has data
SELECT COUNT(*) FROM `organizations.org_hierarchy`
WHERE org_slug = 'acme_inc_01062026' AND end_date IS NULL;

-- Check entity_id values
SELECT DISTINCT entity_id
FROM `{org_slug}_prod.genai_payg_usage_raw`
WHERE entity_id IS NOT NULL
LIMIT 10;
```

### Error: "Timeout waiting for query"

**Cause:** Large tables take time to update.

**Solution:** Increase timeout or run backfill for one table at a time:
```sql
-- Manual backfill for single table
UPDATE `{project}.{dataset}.genai_payg_usage_raw` AS target
SET ...
```

## Rollback

**Schema changes are backward compatible** - old queries continue to work because:
- New columns are nullable
- Old columns are NOT dropped
- Queries using old fields (e.g., `x_hierarchy_entity_id`) still work during transition

**No rollback needed** unless you want to drop the new columns:

```sql
-- WARNING: This deletes data permanently
ALTER TABLE `{project}.{dataset}.genai_payg_usage_raw`
DROP COLUMN x_hierarchy_level_1_id,
DROP COLUMN x_hierarchy_level_1_name,
-- ... drop all 20 columns
```

## Production Deployment

### Pre-Migration Checklist

- [ ] Test migration on staging org first
- [ ] Verify `org_hierarchy` table has complete data
- [ ] Backup critical tables (optional - BigQuery has time travel)
- [ ] Notify users of maintenance window (schema changes are fast, backfill can take minutes)

### Staging Test

```bash
python3 migrate_to_10_level_hierarchy.py \
  --org {staging_org} \
  --project cloudact-stage \
  --api-url https://api-stage.cloudact.ai
```

### Production Migration

```bash
python3 migrate_to_10_level_hierarchy.py \
  --org {prod_org} \
  --project cloudact-prod \
  --api-url https://api.cloudact.ai
```

### Post-Migration

1. **Validate:** Run validation queries on all tables
2. **Monitor:** Check API service logs for query errors
3. **Update pipelines:** Ensure future pipeline runs use new columns
4. **Update frontend:** Deploy frontend changes that use new filter fields

## Cost Estimates

**BigQuery Costs:**
- Schema updates: Free (metadata operation)
- Backfill queries: ~$5 per TB scanned (depends on table size)
- Time travel retention: 7 days default (no extra cost)

**Example:**
- 1 million rows across 11 tables
- ~100 MB per table = 1.1 GB total
- Backfill cost: ~$0.01

## Support

For issues or questions:
1. Check `HIERARCHY_10_LEVEL_MIGRATION_SUMMARY.md` for implementation details
2. Review logs from migration script
3. Contact CloudAct platform team

---

**Migration Script:** `migrate_to_10_level_hierarchy.py`
**Version:** v15.0 (10-level hierarchy)
**Date:** 2026-01-08
