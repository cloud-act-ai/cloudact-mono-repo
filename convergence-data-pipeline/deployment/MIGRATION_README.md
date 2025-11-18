# Tenant Usage Quotas Schema Migration

## Problem Statement

The `tenants.tenant_usage_quotas` table had a schema mismatch between:

1. **Schema Definition** (`src/core/database/schemas/tenants_dataset.sql`) - Complete schema with all columns
2. **Deployment Script** (`deployment/setup_bigquery_datasets.py`) - Incomplete schema missing several columns

This caused the following errors in `async_executor.py`:

```
ERROR: Column max_concurrent_reached not found
ERROR: Column last_pipeline_completed_at not found
ERROR: Column last_pipeline_started_at not found
```

## Missing Columns

The deployment script was missing these columns:

| Column Name | Type | Default | Purpose |
|------------|------|---------|---------|
| `pipelines_cancelled_today` | INT64 | 0 | Track cancelled pipeline count |
| `max_concurrent_reached` | INT64 | 0 | Peak concurrent pipelines today |
| `quota_exceeded` | BOOL | FALSE | Quota limit reached flag |
| `quota_warning_sent` | BOOL | FALSE | 80% warning notification sent |
| `quota_exceeded_at` | TIMESTAMP | NULL | When quota was first exceeded |
| `total_api_calls_today` | INT64 | 0 | Daily API call tracking |
| `total_storage_used_gb` | NUMERIC(10,2) | 0 | Storage usage tracking |
| `last_pipeline_started_at` | TIMESTAMP | NULL | Last pipeline start time |
| `last_pipeline_completed_at` | TIMESTAMP | NULL | Last pipeline completion time |

## Solution

### 1. Fixed Deployment Script

Updated `deployment/setup_bigquery_datasets.py` to include all missing columns, ensuring new deployments will have the complete schema.

### 2. Created Migration Script

Created `deployment/migrate_tenant_usage_quotas.py` to add missing columns to existing tables without data loss.

### 3. Updated Scheduler Reset Logic

Updated `src/app/routers/scheduler.py` to reset all new daily counters during the nightly cleanup job.

## Migration Instructions

### For Existing Deployments

If you have an existing `tenants.tenant_usage_quotas` table, run the migration:

```bash
# Navigate to project root
cd /path/to/convergence-data-pipeline

# Run migration
python deployment/migrate_tenant_usage_quotas.py
```

The script will:
- Add all missing columns with proper defaults
- Verify the final schema
- Report success/errors for each column

### For New Deployments

For fresh deployments, simply run the updated setup script:

```bash
python deployment/setup_bigquery_datasets.py
```

The table will be created with the complete schema.

## Verification

After migration, verify the schema:

```sql
SELECT
    column_name,
    data_type,
    is_nullable
FROM `gac-prod-471220.tenants.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'tenant_usage_quotas'
ORDER BY ordinal_position;
```

Required columns should include:
- All original columns
- All 9 new columns listed above

## Files Modified

1. **deployment/setup_bigquery_datasets.py**
   - Added missing columns to CREATE TABLE statement
   - Now matches complete schema definition

2. **deployment/migrate_tenant_usage_quotas.py** (NEW)
   - Python migration script to update existing tables
   - Safe to run multiple times (uses IF NOT EXISTS)

3. **deployment/migrate_tenant_usage_quotas.sql** (NEW)
   - SQL-only migration script for manual execution
   - Alternative to Python script

4. **src/app/routers/scheduler.py**
   - Updated `reset_daily_usage_quotas` to reset new daily counters
   - Ensures clean slate for quota tracking each day

## Code Already Correct

These files were already using the correct column names and didn't need changes:

- **src/core/pipeline/async_executor.py**
  - Already references `max_concurrent_reached`, `last_pipeline_started_at`, `last_pipeline_completed_at`
  - Will work correctly once schema is updated

- **src/core/database/schemas/tenants_dataset.sql**
  - Complete and correct schema definition
  - Source of truth for table structure

## Testing

After migration, test pipeline execution:

```bash
# Test pipeline run
curl -X POST http://localhost:8000/api/v1/tenants/{tenant_id}/pipelines/{pipeline_id}/run \
  -H "Authorization: Bearer {token}"

# Check for errors in logs
tail -f logs/pipeline.log | grep -i "column.*not found"
```

No column errors should appear.

## Rollback

If issues occur, the migration can be partially rolled back:

```sql
-- Remove new columns (NOT RECOMMENDED - will lose data)
ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
DROP COLUMN IF EXISTS pipelines_cancelled_today,
DROP COLUMN IF EXISTS max_concurrent_reached,
DROP COLUMN IF EXISTS quota_exceeded,
DROP COLUMN IF EXISTS quota_warning_sent,
DROP COLUMN IF EXISTS quota_exceeded_at,
DROP COLUMN IF EXISTS total_api_calls_today,
DROP COLUMN IF EXISTS total_storage_used_gb,
DROP COLUMN IF EXISTS last_pipeline_started_at,
DROP COLUMN IF EXISTS last_pipeline_completed_at;
```

However, this will break `async_executor.py`. Better approach: fix application code if needed.

## Prevention

To prevent similar issues in the future:

1. **Single Source of Truth**: Use schema SQL files as source of truth
2. **Schema Validation**: Add unit tests comparing deployment script to schema files
3. **Migration Scripts**: Create migration scripts for all schema changes
4. **Code Reviews**: Require schema review for all table modifications

## Questions?

Contact: DevOps Team or Database Admin
Date: 2025-11-18
