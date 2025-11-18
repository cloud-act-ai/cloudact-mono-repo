# Quick Fix Guide: tenant_usage_quotas Schema Issue

## Problem
Pipeline execution fails with:
```
ERROR: Column 'max_concurrent_reached' not found
ERROR: Column 'last_pipeline_completed_at' not found
ERROR: Column 'last_pipeline_started_at' not found
```

## Solution (3 Steps)

### Step 1: Run Migration (5 minutes)
```bash
cd /path/to/convergence-data-pipeline
python deployment/migrate_tenant_usage_quotas.py
```

**Expected Output**:
```
[1/10] Add pipelines_cancelled_today column
    ✓ SUCCESS
...
✓ All required columns are present!
Migration completed successfully.
```

### Step 2: Verify Schema
```bash
python deployment/verify_tenant_usage_quotas_schema.py
```

**Expected Output**:
```
✓ SUCCESS: All required columns present with correct types!
✓ No missing columns
✓ All types match
Schema verification PASSED
```

### Step 3: Test Pipeline
```bash
# Test a simple pipeline run
curl -X POST http://localhost:8000/api/v1/tenants/{tenant_id}/pipelines/{pipeline_id}/run \
  -H "Authorization: Bearer {token}"
```

**Expected**: Pipeline runs without column errors.

## What Was Fixed

✅ Updated `deployment/setup_bigquery_datasets.py` (for new deployments)
✅ Created migration script to add 9 missing columns (for existing deployments)
✅ Updated `scheduler.py` to reset new daily counters
✅ No changes needed to `async_executor.py` (already correct)

## Files Added

1. `deployment/migrate_tenant_usage_quotas.py` - Migration script
2. `deployment/migrate_tenant_usage_quotas.sql` - SQL migration
3. `deployment/verify_tenant_usage_quotas_schema.py` - Verification script
4. `deployment/MIGRATION_README.md` - Full documentation
5. `SCHEMA_FIX_SUMMARY.md` - Complete change summary

## Rollback (If Needed)

Migration is safe and additive (only adds columns). If issues occur:

1. Check logs for actual error
2. Run verification script to confirm schema
3. Review `SCHEMA_FIX_SUMMARY.md` for details

No rollback needed - the fix is non-breaking.

## Questions?

- Full details: See `SCHEMA_FIX_SUMMARY.md`
- Migration guide: See `deployment/MIGRATION_README.md`
- Contact: Database Team / DevOps
