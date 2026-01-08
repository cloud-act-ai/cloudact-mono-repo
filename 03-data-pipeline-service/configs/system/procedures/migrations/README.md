# Database Migrations

This directory contains one-time migration scripts for updating existing data structures or backfilling data.

## Overview

Migrations are stored procedures that run against customer datasets to update existing data. Unlike regular pipelines, these are typically one-time operations.

## Available Migrations

**No migrations currently defined.**

The previous `sp_migration_1_backfill_currency_audit` procedure was removed because:
- Clean bootstrap means no existing data to backfill
- Currency audit fields (`source_currency`, `source_price`, `exchange_rate_used`) are optional user inputs
- No auto-population logic exists in the codebase
- Migration was unnecessary dead weight

## Creating New Migrations

### When to Create a Migration

Create a migration procedure when you need to:
- Backfill new fields for existing data
- Transform data format (e.g., changing enum values)
- Migrate data between tables
- Fix data inconsistencies

### Naming Convention

```
sp_migration_{step}_{description}.sql
```

Examples:
- `sp_migration_1_backfill_new_field.sql`
- `sp_migration_2_transform_enum_values.sql`
- `sp_migration_3_fix_data_inconsistency.sql`

### Migration Template

```sql
-- ================================================================================
-- MIGRATION: sp_migration_{step}_{description}
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: {What this migration does and why}
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset ID (e.g., 'acme_corp_prod')
--   p_dry_run:    If TRUE, only show what would be updated (default: FALSE)
--
-- USAGE:
--   -- Dry run (preview changes)
--   CALL `your-project-id.organizations`.sp_migration_{step}_{description}(
--     'your-project-id',
--     'acme_corp_prod',
--     TRUE
--   );
--
--   -- Execute migration
--   CALL `your-project-id.organizations`.sp_migration_{step}_{description}(
--     'your-project-id',
--     'acme_corp_prod',
--     FALSE
--   );
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_migration_{step}_{description}(
  p_project_id STRING,
  p_dataset_id STRING,
  p_dry_run BOOL
)
BEGIN
  DECLARE v_rows_to_update INT64;
  DECLARE v_rows_updated INT64 DEFAULT 0;

  -- 1. Parameter Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  SET p_dry_run = COALESCE(p_dry_run, FALSE);

  -- 2. Count rows that need updating
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*)
    FROM `%s.%s.{table_name}`
    WHERE {conditions}
  """, p_project_id, p_dataset_id)
  INTO v_rows_to_update;

  -- 3. Dry run preview
  IF p_dry_run THEN
    EXECUTE IMMEDIATE FORMAT("""
      SELECT
        -- Preview what will be updated
      FROM `%s.%s.{table_name}`
      WHERE {conditions}
    """, p_project_id, p_dataset_id);

    SELECT
      'DRY RUN PREVIEW' AS mode,
      v_rows_to_update AS rows_to_update,
      'Set p_dry_run = FALSE to execute migration' AS next_step;

  ELSE
    -- 4. Execute migration
    EXECUTE IMMEDIATE FORMAT("""
      UPDATE `%s.%s.{table_name}`
      SET
        {update_statements},
        updated_at = CURRENT_TIMESTAMP()
      WHERE {conditions}
    """, p_project_id, p_dataset_id);

    SET v_rows_updated = @@row_count;

    -- 5. Verify results
    SELECT
      'MIGRATION COMPLETED' AS status,
      p_project_id AS project_id,
      p_dataset_id AS dataset_id,
      v_rows_to_update AS rows_identified,
      v_rows_updated AS rows_updated,
      CURRENT_TIMESTAMP() AS completed_at;
  END IF;

EXCEPTION WHEN ERROR THEN
  SELECT
    'MIGRATION FAILED' AS status,
    @@error.message AS error_message,
    p_project_id AS project_id,
    p_dataset_id AS dataset_id;
  RAISE USING MESSAGE = CONCAT('Migration Failed: ', @@error.message);
END;
```

### Migration Workflow

1. **Create SQL file** following naming convention
2. **Sync procedure** to BigQuery
   ```bash
   curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
     -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"force": true}'
   ```
3. **Test dry run** on dev/staging org
4. **Review preview** output carefully
5. **Execute** migration if dry run looks correct
6. **Verify** results
7. **Document** completion

### Safety Features

- **Dry Run Mode**: Preview changes without modifying data
- **Selective Updates**: Only updates rows matching WHERE clause
- **Validation**: Parameter checks and assertions
- **Atomic**: Transaction-based operations
- **Audit Trail**: Updates `updated_at` timestamp

### Best Practices

- ✅ **Always run dry run first**
- ✅ **Test on dev/staging before production**
- ✅ **Run during low-traffic periods**
- ✅ **Document which orgs have been migrated**
- ❌ **Never skip dry run in production**
- ❌ **Don't modify existing migration files** (create new ones)

---

**Last Updated:** 2026-01-08
