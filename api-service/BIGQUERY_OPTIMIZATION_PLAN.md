# BigQuery Table Optimization Plan

**Date:** 2025-12-06
**Dataset:** `organizations` (15 meta tables)
**Strategy:** Clustering for all tables, partitioning for time-based queries
**Migration Script:** `api-service/scripts/add_clustering_partitioning.sh`

---

## Executive Summary

### Current State
- **15 meta tables** in `organizations` dataset
- **Clustering defined** in `config.yml` but NOT applied to BigQuery tables
- **Partitioning defined** in `config.yml` but NOT applied to BigQuery tables
- **No active optimization** = Full table scans on multi-tenant queries

### Proposed Changes
- **5 tables** → Clustering only (zero downtime with ALTER TABLE)
- **10 tables** → Partitioning + Clustering (requires table recreation)
- **All tables** → org_slug as first clustering field (multi-tenant isolation)

### Expected Impact
- **Query cost reduction:** 60-90% for time-range queries
- **Query performance:** 3-10x faster for filtered queries
- **Multi-tenant isolation:** Automatic data co-location per org
- **Partition pruning:** Skip entire date partitions automatically

---

## Table-by-Table Analysis

### Category 1: Clustering Only (Zero Downtime)

#### 1. org_profiles
**Current:** No clustering, no partitioning
**Proposed:** Cluster by `[org_slug, status]`
**Rationale:**
- Lookup pattern: `WHERE org_slug = ? AND status = 'ACTIVE'`
- No time-based queries (profiles are long-lived)
- Small table (~1-10K rows in production)
- Zero downtime with ALTER TABLE

**Migration:**
```sql
ALTER TABLE `project.organizations.org_profiles`
SET OPTIONS (clustering_fields = ['org_slug', 'status']);
```

**Impact:**
- Single-org queries: 100% data pruning
- Status filters: Co-located data (ACTIVE, SUSPENDED, DELETED)

---

#### 2. org_integration_credentials
**Current:** No clustering, no partitioning
**Proposed:** Cluster by `[org_slug, provider, validation_status]`
**Rationale:**
- Lookup pattern: `WHERE org_slug = ? AND provider = 'openai'`
- Integration validation: `WHERE validation_status = 'VALID'`
- No time-based queries (credentials are updated infrequently)
- Small table (~50-500 rows per org)

**Migration:**
```sql
ALTER TABLE `project.organizations.org_integration_credentials`
SET OPTIONS (clustering_fields = ['org_slug', 'provider', 'validation_status']);
```

**Impact:**
- Provider lookups: 90% data pruning
- Validation checks: Co-located valid credentials

---

#### 3. org_pipeline_configs
**Current:** No clustering, no partitioning
**Proposed:** Cluster by `[org_slug, provider, is_active]`
**Rationale:**
- Lookup pattern: `WHERE org_slug = ? AND provider = 'gcp' AND is_active = true`
- Config retrieval: Frequent, low-latency requirement
- No time-based queries (configs are long-lived)

**Migration:**
```sql
ALTER TABLE `project.organizations.org_pipeline_configs`
SET OPTIONS (clustering_fields = ['org_slug', 'provider', 'is_active']);
```

**Impact:**
- Active config lookups: 95% data pruning
- Provider-specific queries: Co-located data

---

#### 4. org_kms_keys
**Current:** No clustering, no partitioning
**Proposed:** Cluster by `[org_slug, key_type, is_active]`
**Rationale:**
- Lookup pattern: `WHERE org_slug = ? AND key_type = 'DEK' AND is_active = true`
- Small table (~5-20 rows per org)
- Infrequent updates (key rotation)

**Migration:**
```sql
ALTER TABLE `project.organizations.org_kms_keys`
SET OPTIONS (clustering_fields = ['org_slug', 'key_type', 'is_active']);
```

**Impact:**
- Key lookups: 100% data pruning
- Minimal storage overhead

---

#### 5. org_idempotency_keys
**Current:** No clustering, no partitioning
**Proposed:** Cluster by `[idempotency_key, org_slug]`
**Rationale:**
- **Unique lookup pattern:** `WHERE idempotency_key = ?` (primary lookup)
- **Secondary filter:** `WHERE org_slug = ?` (rare)
- **High cardinality:** idempotency_key is UUID (perfect for clustering)
- **Time-based cleanup:** Handled by TTL deletion (not query-based)

**Migration:**
```sql
ALTER TABLE `project.organizations.org_idempotency_keys`
SET OPTIONS (clustering_fields = ['idempotency_key', 'org_slug']);
```

**Impact:**
- Idempotency checks: 99% data pruning (UUID clustering)
- Deduplication queries: Extremely fast

**Note:** This is the ONLY table where org_slug is NOT first in clustering order, because the primary access pattern is by idempotency_key.

---

### Category 2: Partitioning + Clustering (Brief Unavailability)

#### 6. org_api_keys
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`created_at`), Cluster by `[org_slug, is_active]`
**Rationale:**
- Audit queries: `WHERE created_at >= '2025-01-01'` (common for compliance)
- Active key lookups: `WHERE org_slug = ? AND is_active = true`
- Medium table growth (~100-1K rows per org over time)

**Migration:**
```sql
CREATE TABLE `project.organizations.org_api_keys_temp`
PARTITION BY DATE(created_at)
CLUSTER BY org_slug, is_active
AS SELECT * FROM `project.organizations.org_api_keys`;
```

**Impact:**
- Date-range queries: Skip entire partitions (60-90% cost reduction)
- Active key lookups: 100% data pruning

---

#### 7. org_subscriptions
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`created_at`), Cluster by `[org_slug, status, plan_name]`
**Rationale:**
- Billing history: `WHERE created_at BETWEEN ? AND ?`
- Active subscriptions: `WHERE org_slug = ? AND status = 'ACTIVE'`
- Plan analytics: `WHERE plan_name = 'enterprise'`

**Migration:**
```sql
CREATE TABLE `project.organizations.org_subscriptions_temp`
PARTITION BY DATE(created_at)
CLUSTER BY org_slug, status, plan_name
AS SELECT * FROM `project.organizations.org_subscriptions`;
```

**Impact:**
- Historical billing: Partition pruning
- Active subscription lookups: 100% data pruning

---

#### 8. org_usage_quotas
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`usage_date`), Cluster by `[org_slug, usage_date]`
**Rationale:**
- **Primary query:** `WHERE org_slug = ? AND usage_date = CURRENT_DATE()` (quota checks)
- **Daily partitioning:** Natural fit for daily quota tracking
- **High query frequency:** Every pipeline run checks quota
- **Clustering on partition field:** Additional pruning within partition

**Migration:**
```sql
CREATE TABLE `project.organizations.org_usage_quotas_temp`
PARTITION BY DATE(usage_date)
CLUSTER BY org_slug, usage_date
AS SELECT * FROM `project.organizations.org_usage_quotas`;
```

**Impact:**
- Daily quota checks: Read single partition + 100% pruning
- Monthly analytics: Skip irrelevant partitions

**Performance Estimate:**
- Before: Scan entire table (1M+ rows)
- After: Scan single day partition (~5K rows) + org_slug pruning (~50 rows)
- **Cost reduction:** 99%+
- **Latency reduction:** 10-50x faster

---

#### 9. org_scheduled_pipeline_runs
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`scheduled_time`), Cluster by `[org_slug, state, config_id]`
**Rationale:**
- Scheduler queries: `WHERE scheduled_time BETWEEN ? AND ? AND state = 'PENDING'`
- Org-specific schedules: `WHERE org_slug = ?`

**Migration:**
```sql
CREATE TABLE `project.organizations.org_scheduled_pipeline_runs_temp`
PARTITION BY DATE(scheduled_time)
CLUSTER BY org_slug, state, config_id
AS SELECT * FROM `project.organizations.org_scheduled_pipeline_runs`;
```

**Impact:**
- Scheduler scans: Partition pruning + state co-location
- 70-85% cost reduction

---

#### 10. org_pipeline_execution_queue
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`scheduled_time`), Cluster by `[state, priority, org_slug]`
**Rationale:**
- **Queue processing:** `WHERE state = 'PENDING' ORDER BY priority DESC` (most common)
- **Different clustering order:** state first (not org_slug) for queue efficiency
- **Priority co-location:** High-priority tasks grouped together

**Migration:**
```sql
CREATE TABLE `project.organizations.org_pipeline_execution_queue_temp`
PARTITION BY DATE(scheduled_time)
CLUSTER BY state, priority, org_slug
AS SELECT * FROM `project.organizations.org_pipeline_execution_queue`;
```

**Impact:**
- Queue scans: State co-location (PENDING, RUNNING, COMPLETED)
- Priority ordering: Faster queue processing

**Note:** This is one of two tables where org_slug is NOT first in clustering order (state-based queue queries dominate).

---

#### 11. org_meta_pipeline_runs
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`start_time`), Cluster by `[org_slug, status]`
**Rationale:**
- **Pipeline history:** `WHERE org_slug = ? AND start_time >= ?` (common dashboard query)
- **Failure analysis:** `WHERE status = 'FAILED' AND start_time >= ?`
- **High write volume:** Every pipeline run creates a record

**Migration:**
```sql
CREATE TABLE `project.organizations.org_meta_pipeline_runs_temp`
PARTITION BY DATE(start_time)
CLUSTER BY org_slug, status
AS SELECT * FROM `project.organizations.org_meta_pipeline_runs`;
```

**Impact:**
- Recent pipeline queries: Skip old partitions
- Status filtering: Co-located failures for debugging
- **Growth management:** Auto-partition old data

---

#### 12. org_meta_step_logs
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`start_time`), Cluster by `[org_slug, pipeline_logging_id]`
**Rationale:**
- **Step drill-down:** `WHERE pipeline_logging_id = ?` (join with pipeline_runs)
- **Org-specific debugging:** `WHERE org_slug = ? AND start_time >= ?`
- **Very high volume:** Multiple steps per pipeline run

**Migration:**
```sql
CREATE TABLE `project.organizations.org_meta_step_logs_temp`
PARTITION BY DATE(start_time)
CLUSTER BY org_slug, pipeline_logging_id
AS SELECT * FROM `project.organizations.org_meta_step_logs`;
```

**Impact:**
- Pipeline debugging: Co-located steps for single run
- Historical analysis: Partition pruning

---

#### 13. org_meta_dq_results
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`ingestion_date`), Cluster by `[org_slug, overall_status]`
**Rationale:**
- Data quality monitoring: `WHERE ingestion_date >= ? AND overall_status = 'FAILED'`
- Org-specific quality reports: `WHERE org_slug = ?`

**Migration:**
```sql
CREATE TABLE `project.organizations.org_meta_dq_results_temp`
PARTITION BY DATE(ingestion_date)
CLUSTER BY org_slug, overall_status
AS SELECT * FROM `project.organizations.org_meta_dq_results`;
```

**Impact:**
- Quality monitoring dashboards: Fast recent-data queries
- Failure analysis: Status co-location

---

#### 14. org_audit_logs
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`created_at`), Cluster by `[org_slug, action, resource_type]`
**Rationale:**
- **Compliance queries:** `WHERE created_at >= ? AND action IN ('DELETE', 'UPDATE')`
- **Audit trail:** `WHERE org_slug = ? AND resource_type = 'CREDENTIAL'`
- **SOC2/HIPAA requirement:** Fast audit trail retrieval
- **High volume:** Every API operation logged

**Migration:**
```sql
CREATE TABLE `project.organizations.org_audit_logs_temp`
PARTITION BY DATE(created_at)
CLUSTER BY org_slug, action, resource_type
AS SELECT * FROM `project.organizations.org_audit_logs`;
```

**Impact:**
- Compliance reports: Massive partition pruning (last 90 days)
- Security investigations: Fast action/resource filtering
- **Cost savings:** 85-95% for typical compliance queries

---

#### 15. org_cost_tracking
**Current:** No partitioning, no clustering
**Proposed:** Partition by DAY(`usage_date`), Cluster by `[org_slug, resource_type, provider]`
**Rationale:**
- **Cost analytics:** `WHERE usage_date BETWEEN ? AND ? AND org_slug = ?`
- **Provider breakdown:** `WHERE provider = 'openai' AND resource_type = 'api_call'`
- **Dashboard queries:** Monthly cost rollups by provider

**Migration:**
```sql
CREATE TABLE `project.organizations.org_cost_tracking_temp`
PARTITION BY DATE(usage_date)
CLUSTER BY org_slug, resource_type, provider
AS SELECT * FROM `project.organizations.org_cost_tracking`;
```

**Impact:**
- Cost dashboards: 80-90% cost reduction
- Monthly rollups: Partition pruning + clustering
- **Billing accuracy:** Fast cost queries for invoicing

---

## Migration Strategy

### Phase 1: Clustering Only (Zero Downtime)
**Duration:** 5-10 minutes
**Impact:** None (ALTER TABLE is online operation)

**Tables:**
1. org_profiles
2. org_integration_credentials
3. org_pipeline_configs
4. org_kms_keys
5. org_idempotency_keys

**Commands:**
```bash
./add_clustering_partitioning.sh --dry-run    # Preview
./add_clustering_partitioning.sh --execute    # Apply
```

**Rollback:** Not needed (clustering is non-destructive)

---

### Phase 2: Partitioning + Clustering (Brief Unavailability)
**Duration:** 15-30 minutes (depends on table size)
**Impact:** 2-5 minutes downtime per table during swap

**Tables (in order of priority):**
1. **org_usage_quotas** (HIGH - quota checks on every pipeline run)
2. **org_meta_pipeline_runs** (HIGH - pipeline history)
3. **org_audit_logs** (HIGH - compliance requirement)
4. **org_cost_tracking** (MEDIUM - billing dashboards)
5. **org_api_keys** (MEDIUM - audit trail)
6. **org_subscriptions** (MEDIUM - billing history)
7. **org_scheduled_pipeline_runs** (MEDIUM - scheduler)
8. **org_pipeline_execution_queue** (MEDIUM - queue processing)
9. **org_meta_step_logs** (LOW - debugging only)
10. **org_meta_dq_results** (LOW - quality monitoring)

**Process:**
1. Create backup (automatic)
2. Create temp partitioned+clustered table (CREATE TABLE AS SELECT)
3. Drop old table
4. Rename temp table

**Rollback:** Restore from backups (automatic)

---

### Execution Plan

#### Pre-Migration Checklist
- [ ] Verify GCP_PROJECT_ID environment variable
- [ ] Authenticate with `gcloud auth login`
- [ ] Verify BigQuery Admin permissions
- [ ] Run `--dry-run` to preview all changes
- [ ] Run `--status` to document current state
- [ ] Schedule maintenance window (optional for partitioning changes)
- [ ] Notify stakeholders of brief unavailability

#### Migration Steps
```bash
# Step 1: Validate environment
export GCP_PROJECT_ID="gac-prod-471220"
./add_clustering_partitioning.sh --status > pre_migration_state.txt

# Step 2: Dry run (review output carefully)
./add_clustering_partitioning.sh --dry-run

# Step 3: Execute migration
./add_clustering_partitioning.sh --execute

# Step 4: Verify post-migration
./add_clustering_partitioning.sh --status > post_migration_state.txt
diff pre_migration_state.txt post_migration_state.txt

# Step 5: Test critical queries
# (Run sample queries from production to verify performance)
```

#### Post-Migration Validation
```bash
# Check table schemas
bq show --format=prettyjson gac-prod-471220:organizations.org_usage_quotas

# Verify clustering
bq show gac-prod-471220:organizations.org_profiles | grep clustering

# Verify partitioning
bq show gac-prod-471220:organizations.org_audit_logs | grep timePartitioning

# Test critical queries (measure latency + bytes processed)
# Example: Quota check
bq query --use_legacy_sql=false --dry_run \
  "SELECT * FROM \`gac-prod-471220.organizations.org_usage_quotas\`
   WHERE org_slug = 'acme-corp' AND usage_date = CURRENT_DATE()"
```

---

### Rollback Procedure

If issues occur during migration:

```bash
# Option 1: Automatic rollback (restores ALL tables from backups)
./add_clustering_partitioning.sh --rollback

# Option 2: Manual rollback (single table)
bq rm -f gac-prod-471220:organizations.org_usage_quotas
bq cp gac-prod-471220:organizations.org_usage_quotas_backup_20251206_143000 \
     gac-prod-471220:organizations.org_usage_quotas

# Option 3: Keep backups for 30 days, then cleanup
# (Backups are NOT auto-deleted)
bq rm gac-prod-471220:organizations.org_usage_quotas_backup_20251206_143000
```

---

## Performance Impact Analysis

### Query Cost Reduction Estimates

| Table | Current (bytes) | Optimized (bytes) | Cost Reduction |
|-------|----------------|-------------------|----------------|
| org_usage_quotas | 10 MB (full scan) | 0.1 MB (single day + org) | **99%** |
| org_audit_logs | 500 MB (full scan) | 50 MB (90-day range) | **90%** |
| org_meta_pipeline_runs | 200 MB (full scan) | 20 MB (7-day range) | **90%** |
| org_cost_tracking | 100 MB (full scan) | 10 MB (30-day range) | **90%** |
| org_profiles | 1 MB (full scan) | 0.01 MB (single org) | **99%** |

**Overall Cost Savings:** 60-90% reduction in BigQuery query costs

---

### Query Performance Improvements

| Query Type | Before | After | Improvement |
|------------|--------|-------|-------------|
| Daily quota check | 2-5 seconds | 0.2-0.5 seconds | **10x faster** |
| Audit trail (90 days) | 10-20 seconds | 1-2 seconds | **10x faster** |
| Pipeline history (7 days) | 5-10 seconds | 0.5-1 second | **10x faster** |
| Single org profile lookup | 1-2 seconds | 0.1-0.2 seconds | **10x faster** |

---

### Storage Impact

- **Clustering:** No storage overhead (reorganizes existing data)
- **Partitioning:** Minimal metadata overhead (~1-5% for partition metadata)
- **Backups:** Temporary storage during migration (deleted after 30 days)

**Net storage change:** +1-2% (negligible)

---

## Success Criteria

### Pre-Migration Baseline
- [ ] Document current query costs (run EXPLAIN on critical queries)
- [ ] Measure current query latency (p50, p95, p99)
- [ ] Capture current table sizes and row counts

### Post-Migration Validation
- [ ] All 15 tables have correct clustering fields
- [ ] 10 tables have correct partitioning strategy
- [ ] No data loss (row count matches backup)
- [ ] Critical queries run successfully
- [ ] Query costs reduced by 60-90%
- [ ] Query latency reduced by 3-10x

### Monitoring (30 days post-migration)
- [ ] BigQuery audit logs show partition pruning
- [ ] Dashboard queries faster and cheaper
- [ ] No increase in query errors or timeouts
- [ ] Backup tables can be safely deleted

---

## Best Practices Applied

### Multi-Tenant Isolation
- **org_slug first** in clustering for 13/15 tables
- **Exceptions:**
  - `org_idempotency_keys` (idempotency_key is primary lookup)
  - `org_pipeline_execution_queue` (state-based queue queries)

### Partition Strategy
- **DAY partitioning** for all time-based tables (most common query pattern)
- **Partition field in clustering** for additional pruning (e.g., usage_date)

### Clustering Order
- **Highest cardinality first** (org_slug for multi-tenant)
- **Most selective filters next** (status, provider, action)
- **Join keys last** (pipeline_logging_id)

### Zero Downtime Where Possible
- **ALTER TABLE** for clustering-only changes
- **CREATE TABLE AS SELECT** for partitioning (brief unavailability acceptable)

---

## Next Steps

1. **Review this plan** with team
2. **Test migration** on staging environment first
3. **Schedule maintenance window** (optional, for partitioning changes)
4. **Run dry-run** to preview all SQL commands
5. **Execute migration** during low-traffic period
6. **Monitor performance** for 7-30 days
7. **Delete backups** after validation period

---

## References

- **Config Source:** `api-service/configs/setup/bootstrap/config.yml`
- **Schema Definitions:** `api-service/configs/setup/bootstrap/schemas/*.json`
- **Migration Script:** `api-service/scripts/add_clustering_partitioning.sh`
- **BigQuery Docs:** https://cloud.google.com/bigquery/docs/clustered-tables
- **Partitioning Guide:** https://cloud.google.com/bigquery/docs/partitioned-tables

---

**Document Version:** 1.0
**Last Updated:** 2025-12-06
**Author:** BigQuery Optimization Analysis
**Status:** Ready for Review
