# Schema Fix Summary: tenant_usage_quotas Table

## Issue Description

The `async_executor.py` was attempting to update columns in `tenants.tenant_usage_quotas` that didn't exist in the deployed table, causing pipeline execution failures with errors like:

```
ERROR: Column 'max_concurrent_reached' not found in table
ERROR: Column 'last_pipeline_completed_at' not found in table
ERROR: Column 'last_pipeline_started_at' not found in table
```

## Root Cause

**Schema Mismatch**: The deployment script (`setup_bigquery_datasets.py`) had an incomplete schema compared to the authoritative schema definition (`tenants_dataset.sql`).

### What Was Missing

The deployment script was missing 9 columns that were defined in the schema files:

1. `pipelines_cancelled_today` - Track cancelled pipeline count
2. `max_concurrent_reached` - Peak concurrent pipelines reached
3. `quota_exceeded` - Flag for quota limit reached
4. `quota_warning_sent` - Flag for 80% warning sent
5. `quota_exceeded_at` - Timestamp of quota exceeded
6. `total_api_calls_today` - Daily API call counter
7. `total_storage_used_gb` - Storage usage tracking
8. `last_pipeline_started_at` - Last pipeline start timestamp
9. `last_pipeline_completed_at` - Last pipeline completion timestamp

## Files Changed

### 1. deployment/setup_bigquery_datasets.py
**Status**: UPDATED
**Changes**: Added all 9 missing columns to CREATE TABLE statement

```diff
CREATE TABLE IF NOT EXISTS tenant_usage_quotas (
    usage_id STRING NOT NULL,
    tenant_id STRING NOT NULL,
    usage_date DATE NOT NULL,
    pipelines_run_today INT64 NOT NULL DEFAULT 0,
    pipelines_succeeded_today INT64 NOT NULL DEFAULT 0,
    pipelines_failed_today INT64 NOT NULL DEFAULT 0,
+   pipelines_cancelled_today INT64 DEFAULT 0,
    pipelines_run_month INT64 NOT NULL DEFAULT 0,
    concurrent_pipelines_running INT64 NOT NULL DEFAULT 0,
+   max_concurrent_reached INT64 DEFAULT 0,
    daily_limit INT64 NOT NULL,
    monthly_limit INT64,
-   concurrent_limit INT64,
+   concurrent_limit INT64 DEFAULT 3,
+   quota_exceeded BOOL DEFAULT FALSE,
+   quota_warning_sent BOOL DEFAULT FALSE,
+   quota_exceeded_at TIMESTAMP,
+   total_api_calls_today INT64 DEFAULT 0,
+   total_storage_used_gb NUMERIC(10, 2) DEFAULT 0,
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
+   last_pipeline_started_at TIMESTAMP,
+   last_pipeline_completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
```

### 2. deployment/migrate_tenant_usage_quotas.py
**Status**: NEW FILE
**Purpose**: Python script to migrate existing tables by adding missing columns

**Features**:
- Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS)
- Validates schema after migration
- Reports detailed success/error status
- Checks for all required columns

**Usage**:
```bash
python deployment/migrate_tenant_usage_quotas.py
```

### 3. deployment/migrate_tenant_usage_quotas.sql
**Status**: NEW FILE
**Purpose**: SQL-only migration script for manual execution

**Usage**:
```bash
bq query < deployment/migrate_tenant_usage_quotas.sql
```

### 4. src/app/routers/scheduler.py
**Status**: UPDATED
**Changes**: Updated daily quota reset to include new columns

```diff
UPDATE tenant_usage_quotas
SET
    pipelines_run_today = 0,
    pipelines_succeeded_today = 0,
    pipelines_failed_today = 0,
+   pipelines_cancelled_today = 0,
    concurrent_pipelines_running = 0,
+   max_concurrent_reached = 0,
+   total_api_calls_today = 0,
+   quota_exceeded = FALSE,
+   quota_warning_sent = FALSE,
+   quota_exceeded_at = NULL,
    last_updated = CURRENT_TIMESTAMP()
WHERE usage_date < CURRENT_DATE()
```

### 5. deployment/MIGRATION_README.md
**Status**: NEW FILE
**Purpose**: Comprehensive documentation of the migration process

## Files NOT Changed (Already Correct)

These files were already using the correct schema and didn't need updates:

- **src/core/pipeline/async_executor.py** - Already references correct columns
- **src/core/database/schemas/tenants_dataset.sql** - Source of truth, already complete
- **src/core/database/schemas/tenants_auth_dataset.sql** - Already has complete schema
- **src/app/routers/tenants.py** - INSERT uses explicit columns, works with both schemas
- **src/app/routers/pipelines.py** - SELECT queries only use existing columns

## Migration Path

### For Existing Deployments (REQUIRED)

1. **Run the migration script**:
   ```bash
   cd /path/to/convergence-data-pipeline
   python deployment/migrate_tenant_usage_quotas.py
   ```

2. **Verify success**:
   - Check that all 9 columns were added
   - Review any warnings or errors
   - Confirm schema matches expected structure

3. **Deploy updated code**:
   - Deploy the updated `scheduler.py` with enhanced reset logic
   - No changes needed to `async_executor.py` (already correct)

### For New Deployments

1. **Run setup script**:
   ```bash
   python deployment/setup_bigquery_datasets.py
   ```

   Table will be created with complete schema automatically.

## Testing Checklist

After migration, verify:

- [ ] Migration script completed without errors
- [ ] All 9 new columns exist in table schema
- [ ] Pipeline execution no longer throws "column not found" errors
- [ ] Concurrent pipeline tracking works correctly
- [ ] Daily quota reset includes new columns
- [ ] Prometheus metrics update correctly

### Test Commands

```bash
# 1. Check schema
bq query "SELECT column_name FROM gac-prod-471220.tenants.INFORMATION_SCHEMA.COLUMNS
          WHERE table_name = 'tenant_usage_quotas' ORDER BY ordinal_position"

# 2. Test pipeline run
curl -X POST http://localhost:8000/api/v1/tenants/{tenant_id}/pipelines/{pipeline_id}/run \
  -H "Authorization: Bearer {token}"

# 3. Check for column errors in logs
tail -f logs/pipeline.log | grep -i "column.*not found"

# 4. Verify concurrent tracking
bq query "SELECT tenant_id, concurrent_pipelines_running, max_concurrent_reached
          FROM gac-prod-471220.tenants.tenant_usage_quotas
          WHERE usage_date = CURRENT_DATE()"
```

## Impact Assessment

### Severity: HIGH
- Blocks all pipeline executions
- Affects all tenants
- No data loss (migration is additive only)

### Affected Components:
- Pipeline execution (`async_executor.py`)
- Concurrent pipeline tracking
- Daily quota resets (`scheduler.py`)
- Usage monitoring and metrics

### Deployment Risk: LOW
- Migration is non-breaking (ADD COLUMN IF NOT EXISTS)
- Rollback not needed (only adds columns with defaults)
- Safe to run multiple times
- No downtime required

## Timeline

- **Identified**: 2025-11-18
- **Fix Developed**: 2025-11-18
- **Migration Required**: Before next pipeline run
- **Deployment**: Immediately

## Prevention

To prevent similar issues:

1. **Automated Schema Validation**: Add CI/CD checks comparing deployment scripts to schema files
2. **Integration Tests**: Test actual table creation against expected schema
3. **Schema Version Control**: Track schema changes with migration numbers
4. **Code Review Process**: Require schema review for all BigQuery table modifications

## References

- Schema Definition: `/src/core/database/schemas/tenants_dataset.sql` (lines 235-278)
- Deployment Script: `/deployment/setup_bigquery_datasets.py` (lines 95-119)
- Executor Code: `/src/core/pipeline/async_executor.py` (lines 324-456)
- Migration Script: `/deployment/migrate_tenant_usage_quotas.py`
- Full Documentation: `/deployment/MIGRATION_README.md`

## Additional Issues Found (Not Fixed in This PR)

During the investigation, we found that some files still reference the old table name `customer_usage_quotas` instead of `tenant_usage_quotas`:

- `src/app/dependencies/auth.py` (lines 519, 538, 655, 666)
- `src/app/routers/tenant_management.py` (lines 1285, 1392, 1394, 1396)

These references should be updated in a separate PR to maintain consistency with the table rename from `customers.*` to `tenants.*`.

**Impact**: These queries will fail if `customers.customer_usage_quotas` doesn't exist. However, this is a separate issue from the column schema mismatch.

**Recommendation**: Create a follow-up PR to:
1. Update all references from `customer_usage_quotas` to `tenant_usage_quotas`
2. Update all references from `customer_*` tables to `tenant_*` tables
3. Verify the `customers` dataset still exists or migrate completely to `tenants` dataset

## Questions?

Contact: Database Team / DevOps
Date: 2025-11-18
