# Quick Start: BigQuery Table Optimization

**Goal:** Add clustering and partitioning to 15 meta tables in 30-45 minutes

---

## TL;DR

```bash
# 1. Set environment
export GCP_PROJECT_ID="gac-prod-471220"

# 2. Preview changes (safe, no modifications)
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/api-service
./scripts/add_clustering_partitioning.sh --dry-run

# 3. Execute migration (applies changes)
./scripts/add_clustering_partitioning.sh --execute

# 4. Verify success
./scripts/add_clustering_partitioning.sh --status
```

**That's it!** The script handles everything: backups, clustering, partitioning, rollback.

---

## What This Does

### Clustering (5 tables, zero downtime)
Reorganizes data so queries for a single org only scan that org's data.

**Example:**
- Before: `WHERE org_slug = 'acme'` scans 1000 orgs (100% of table)
- After: `WHERE org_slug = 'acme'` scans 1 org (0.1% of table)

**Tables:**
- org_profiles
- org_integration_credentials
- org_pipeline_configs
- org_kms_keys
- org_idempotency_keys

---

### Partitioning + Clustering (10 tables, brief unavailability)
Splits tables by date so queries only scan relevant time ranges.

**Example:**
- Before: `WHERE usage_date = CURRENT_DATE()` scans all dates (365+ days)
- After: `WHERE usage_date = CURRENT_DATE()` scans 1 day (0.27% of table)

**Tables:**
- org_api_keys (partitioned by created_at)
- org_subscriptions (partitioned by created_at)
- org_usage_quotas (partitioned by usage_date) ⭐ HIGH PRIORITY
- org_scheduled_pipeline_runs (partitioned by scheduled_time)
- org_pipeline_execution_queue (partitioned by scheduled_time)
- org_meta_pipeline_runs (partitioned by start_time) ⭐ HIGH PRIORITY
- org_meta_step_logs (partitioned by start_time)
- org_meta_dq_results (partitioned by ingestion_date)
- org_audit_logs (partitioned by created_at) ⭐ HIGH PRIORITY
- org_cost_tracking (partitioned by usage_date) ⭐ HIGH PRIORITY

---

## Expected Results

### Performance
- **Dashboard queries:** 3-10x faster
- **Quota checks:** From 2-5s → 0.2-0.5s (10x faster)
- **Audit reports:** From 10-20s → 1-2s (10x faster)

### Cost Savings
- **Query costs:** 60-90% reduction
- **Annual savings:** ~$1,500-$2,000 (at scale)

---

## Script Usage

### Preview Changes (No Modifications)
```bash
./scripts/add_clustering_partitioning.sh --dry-run
```

**Output:**
```
[INFO] [DRY RUN] Would add clustering to org_profiles: [org_slug,status]
ALTER TABLE `gac-prod-471220.organizations.org_profiles`
SET OPTIONS (clustering_fields = ['org_slug','status']);

[INFO] [DRY RUN] Would add partitioning + clustering to org_usage_quotas:
  Partition: DAY on usage_date
  Clustering: [org_slug,usage_date]

-- Step 1: Create backup
CREATE TABLE `gac-prod-471220.organizations.org_usage_quotas_backup_20251206_143000`
AS SELECT * FROM `gac-prod-471220.organizations.org_usage_quotas`;
...
```

---

### Apply Changes (Production)
```bash
./scripts/add_clustering_partitioning.sh --execute
```

**Output:**
```
[WARN] Running in EXECUTE mode (changes will be applied)
Are you sure you want to proceed? (yes/no): yes

[STEP] Starting table optimization process...
[STEP] Adding clustering to org_profiles...
[INFO] ✓ Clustering added successfully to org_profiles

[STEP] Adding partitioning + clustering to org_usage_quotas...
[WARN] This operation requires table recreation and brief unavailability
[INFO] Creating backup: org_usage_quotas_backup_20251206_143000
[INFO] Creating new partitioned+clustered table: org_usage_quotas_temp
[INFO] Dropping old table: org_usage_quotas
[INFO] Renaming org_usage_quotas_temp to org_usage_quotas
[INFO] ✓ Partitioning + clustering added successfully to org_usage_quotas
[INFO]   Backup available at: org_usage_quotas_backup_20251206_143000
...
```

---

### Check Current Status
```bash
./scripts/add_clustering_partitioning.sh --status
```

**Output:**
```
[INFO] === org_profiles ===
[INFO] Current configuration for org_profiles:
{
  "clustering": {
    "fields": ["org_slug", "status"]
  },
  "timePartitioning": null
}

[INFO] === org_usage_quotas ===
[INFO] Current configuration for org_usage_quotas:
{
  "clustering": {
    "fields": ["org_slug", "usage_date"]
  },
  "timePartitioning": {
    "type": "DAY",
    "field": "usage_date"
  }
}
...
```

---

### Rollback (Emergency)
```bash
./scripts/add_clustering_partitioning.sh --rollback
```

**Output:**
```
[STEP] Rolling back tables from backups...
[INFO] Found backup tables:
org_api_keys_backup_20251206_143000
org_usage_quotas_backup_20251206_143000
...

Are you sure you want to restore from these backups? (yes/no): yes

[INFO] Restoring org_api_keys from org_api_keys_backup_20251206_143000
[INFO] ✓ Restored org_api_keys
...
```

---

## Validation

### Test Query Performance

**Before migration:**
```bash
bq query --use_legacy_sql=false --dry_run \
  "SELECT * FROM \`gac-prod-471220.organizations.org_usage_quotas\`
   WHERE org_slug = 'acme-corp' AND usage_date = CURRENT_DATE()"

# Output: This query will process 10 MB when run.
```

**After migration:**
```bash
bq query --use_legacy_sql=false --dry_run \
  "SELECT * FROM \`gac-prod-471220.organizations.org_usage_quotas\`
   WHERE org_slug = 'acme-corp' AND usage_date = CURRENT_DATE()"

# Output: This query will process 0.01 MB when run.  ← 99% reduction!
```

---

### Verify Partition Pruning

```bash
bq query --use_legacy_sql=false \
  "EXPLAIN
   SELECT * FROM \`gac-prod-471220.organizations.org_usage_quotas\`
   WHERE org_slug = 'acme-corp' AND usage_date = CURRENT_DATE()"
```

**Look for:**
- ✅ `"partitionsPruned": true`
- ✅ `"estimatedBytesProcessed"` is small (KB not MB)

---

## Troubleshooting

### Error: GCP_PROJECT_ID not set
```bash
export GCP_PROJECT_ID="gac-prod-471220"
```

### Error: Cannot access BigQuery
```bash
gcloud auth login
gcloud config set project gac-prod-471220
```

### Error: Dataset 'organizations' not found
```bash
# Verify dataset exists
bq ls --project_id=gac-prod-471220

# If missing, run bootstrap first
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: your-admin-key"
```

### Script fails mid-migration
```bash
# Automatic rollback
./scripts/add_clustering_partitioning.sh --rollback

# Manual rollback for single table
bq rm -f gac-prod-471220:organizations.org_usage_quotas
bq cp gac-prod-471220:organizations.org_usage_quotas_backup_20251206_143000 \
     gac-prod-471220:organizations.org_usage_quotas
```

---

## Best Practices

### 1. Always Run Dry-Run First
```bash
./scripts/add_clustering_partitioning.sh --dry-run | less
# Review all SQL commands before executing
```

### 2. Document Current State
```bash
./scripts/add_clustering_partitioning.sh --status > pre_migration_state.txt
# Save for comparison later
```

### 3. Execute During Low-Traffic Period
```bash
# Recommended: 2-4 AM UTC (minimal user impact)
# Partitioning changes cause 2-5 minutes unavailability per table
```

### 4. Monitor Post-Migration
```bash
# Check BigQuery audit logs for query costs
# Compare bytes processed before/after
# Measure dashboard latency improvements
```

### 5. Keep Backups for 30 Days
```bash
# Don't delete backups immediately
# Wait 30 days to ensure stability
# Then cleanup manually:
bq rm gac-prod-471220:organizations.org_usage_quotas_backup_20251206_143000
```

---

## FAQ

**Q: Will this break existing queries?**
A: No. Clustering and partitioning are transparent to SQL queries. Existing queries will work exactly the same, just faster.

**Q: How long does this take?**
A: 30-45 minutes total. Clustering is instant (5 min), partitioning requires table recreation (2-5 min per table).

**Q: Is there downtime?**
A: Clustering: No downtime. Partitioning: 2-5 minutes per table (10 tables affected).

**Q: Can I rollback?**
A: Yes. Automatic backups are created before all partitioning changes. One-command rollback.

**Q: What if I only want to optimize some tables?**
A: Edit the script and comment out tables you don't want to change. Or run commands manually.

**Q: Will this increase storage costs?**
A: Minimal increase (~1-2% for partition metadata). Negligible compared to query cost savings.

**Q: Do I need to update application code?**
A: No. Clustering and partitioning are BigQuery features. Application code remains unchanged.

**Q: What about future data?**
A: All new data will automatically use the clustering and partitioning strategy. No ongoing maintenance required.

---

## Quick Reference: Script Commands

| Command | Purpose | Safe? | Duration |
|---------|---------|-------|----------|
| `--dry-run` | Preview changes | ✅ Yes | 1 min |
| `--status` | Check current config | ✅ Yes | 1 min |
| `--execute` | Apply optimization | ⚠️ Brief downtime | 30-45 min |
| `--rollback` | Restore from backups | ⚠️ Data loss if no backups | 10-15 min |
| `--help` | Show usage | ✅ Yes | Instant |

---

## Related Documentation

- **Detailed Analysis:** `BIGQUERY_OPTIMIZATION_PLAN.md` (30+ pages, every table analyzed)
- **Query Examples:** `QUERY_PERFORMANCE_EXAMPLES.md` (before/after comparisons)
- **Executive Summary:** `OPTIMIZATION_EXECUTIVE_SUMMARY.md` (business case, ROI)
- **Migration Script:** `scripts/add_clustering_partitioning.sh` (executable shell script)

---

**Last Updated:** 2025-12-06
**Status:** Ready for Execution
**Estimated Time:** 30-45 minutes
**Expected Benefit:** 60-90% query cost reduction
