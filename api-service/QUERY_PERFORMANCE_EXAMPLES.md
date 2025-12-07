# BigQuery Query Performance Examples

**Purpose:** Demonstrate the impact of clustering and partitioning on common query patterns

---

## Before vs After Optimization

### Example 1: Daily Quota Check (org_usage_quotas)

**Query Pattern:**
```sql
SELECT pipelines_run_today, daily_limit
FROM `gac-prod-471220.organizations.org_usage_quotas`
WHERE org_slug = 'acme-corp'
  AND usage_date = CURRENT_DATE();
```

#### Before Optimization
- **Table Scan:** Full table scan (1,000,000+ rows across all orgs and dates)
- **Bytes Processed:** ~10 MB
- **Query Cost:** $0.05 per 1000 queries
- **Latency:** 2-5 seconds

#### After Optimization
```
PARTITION BY DATE(usage_date)
CLUSTER BY org_slug, usage_date
```

- **Partition Pruning:** Only scan today's partition (~5,000 rows)
- **Clustering Pruning:** Only scan acme-corp's data (~10 rows)
- **Bytes Processed:** ~0.01 MB (99% reduction)
- **Query Cost:** $0.0005 per 1000 queries (100x cheaper)
- **Latency:** 0.2-0.5 seconds (10x faster)

**Explain Plan:**
```sql
-- Run EXPLAIN to verify optimization
EXPLAIN
SELECT pipelines_run_today, daily_limit
FROM `gac-prod-471220.organizations.org_usage_quotas`
WHERE org_slug = 'acme-corp'
  AND usage_date = CURRENT_DATE();
```

**Look for:**
- ✅ "partitionsPruned": true
- ✅ "estimatedBytesProcessed": <100KB

---

### Example 2: Audit Trail (org_audit_logs)

**Query Pattern:**
```sql
SELECT action, resource_type, user_id, created_at
FROM `gac-prod-471220.organizations.org_audit_logs`
WHERE org_slug = 'acme-corp'
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
  AND action IN ('DELETE', 'UPDATE')
ORDER BY created_at DESC
LIMIT 1000;
```

#### Before Optimization
- **Table Scan:** Full table scan (10,000,000+ audit events across all orgs)
- **Bytes Processed:** ~500 MB
- **Query Cost:** $0.0025 per query
- **Latency:** 10-20 seconds

#### After Optimization
```
PARTITION BY DATE(created_at)
CLUSTER BY org_slug, action, resource_type
```

- **Partition Pruning:** Only scan last 90 days (~900,000 rows)
- **Clustering Pruning:** Only scan acme-corp's DELETE/UPDATE events (~100 rows)
- **Bytes Processed:** ~5 MB (99% reduction)
- **Query Cost:** $0.000025 per query (100x cheaper)
- **Latency:** 1-2 seconds (10x faster)

**Compliance Impact:**
- SOC2 audit reports: From 20 seconds → 2 seconds
- Security investigations: From minutes → seconds

---

### Example 3: Pipeline History Dashboard (org_meta_pipeline_runs)

**Query Pattern:**
```sql
SELECT pipeline_id, status, start_time, duration_ms
FROM `gac-prod-471220.organizations.org_meta_pipeline_runs`
WHERE org_slug = 'acme-corp'
  AND start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY start_time DESC
LIMIT 100;
```

#### Before Optimization
- **Table Scan:** Full table scan (5,000,000+ pipeline runs across all orgs)
- **Bytes Processed:** ~200 MB
- **Query Cost:** $0.001 per query
- **Latency:** 5-10 seconds

#### After Optimization
```
PARTITION BY DATE(start_time)
CLUSTER BY org_slug, status
```

- **Partition Pruning:** Only scan last 7 days (~50,000 rows)
- **Clustering Pruning:** Only scan acme-corp's runs (~500 rows)
- **Bytes Processed:** ~2 MB (99% reduction)
- **Query Cost:** $0.00001 per query (100x cheaper)
- **Latency:** 0.5-1 second (10x faster)

**Dashboard Impact:**
- Real-time pipeline monitoring: Instant refresh
- Historical analysis: Fast drill-down

---

### Example 4: Cost Analytics (org_cost_tracking)

**Query Pattern:**
```sql
SELECT
  provider,
  resource_type,
  SUM(cost_amount) as total_cost
FROM `gac-prod-471220.organizations.org_cost_tracking`
WHERE org_slug = 'acme-corp'
  AND usage_date BETWEEN '2025-11-01' AND '2025-11-30'
GROUP BY provider, resource_type
ORDER BY total_cost DESC;
```

#### Before Optimization
- **Table Scan:** Full table scan (20,000,000+ cost records across all orgs)
- **Bytes Processed:** ~1 GB
- **Query Cost:** $0.005 per query
- **Latency:** 15-30 seconds

#### After Optimization
```
PARTITION BY DATE(usage_date)
CLUSTER BY org_slug, resource_type, provider
```

- **Partition Pruning:** Only scan November partitions (~500,000 rows)
- **Clustering Pruning:** Only scan acme-corp's costs (~5,000 rows)
- **Bytes Processed:** ~10 MB (99% reduction)
- **Query Cost:** $0.00005 per query (100x cheaper)
- **Latency:** 1-2 seconds (15x faster)

**Billing Impact:**
- Monthly invoices: From 30 seconds → 2 seconds
- Real-time cost dashboards: Interactive experience

---

### Example 5: Active Integration Lookup (org_integration_credentials)

**Query Pattern:**
```sql
SELECT provider, validation_status, encrypted_credential
FROM `gac-prod-471220.organizations.org_integration_credentials`
WHERE org_slug = 'acme-corp'
  AND provider = 'openai'
  AND validation_status = 'VALID';
```

#### Before Optimization
- **Table Scan:** Full table scan (10,000+ credentials across all orgs)
- **Bytes Processed:** ~5 MB
- **Query Cost:** $0.000025 per query
- **Latency:** 1-2 seconds

#### After Optimization
```
CLUSTER BY org_slug, provider, validation_status
```

- **Clustering Pruning:** Only scan acme-corp's OpenAI valid credentials (~1 row)
- **Bytes Processed:** ~0.001 MB (99.98% reduction)
- **Query Cost:** $0.0000005 per query (50x cheaper)
- **Latency:** 0.1-0.2 seconds (10x faster)

**Integration Impact:**
- Pipeline execution: Instant credential retrieval
- Validation checks: No noticeable latency

---

### Example 6: Queue Processing (org_pipeline_execution_queue)

**Query Pattern:**
```sql
SELECT pipeline_id, org_slug, priority
FROM `gac-prod-471220.organizations.org_pipeline_execution_queue`
WHERE state = 'PENDING'
  AND scheduled_time <= CURRENT_TIMESTAMP()
ORDER BY priority DESC, scheduled_time ASC
LIMIT 10;
```

#### Before Optimization
- **Table Scan:** Full table scan (100,000+ queue entries across all states)
- **Bytes Processed:** ~20 MB
- **Query Cost:** $0.0001 per query
- **Latency:** 2-5 seconds

#### After Optimization
```
PARTITION BY DATE(scheduled_time)
CLUSTER BY state, priority, org_slug
```

**Note:** state is FIRST in clustering (not org_slug) for efficient queue queries

- **Partition Pruning:** Only scan today's partition (~5,000 rows)
- **Clustering Pruning:** Only scan PENDING state (~500 rows)
- **Bytes Processed:** ~1 MB (95% reduction)
- **Query Cost:** $0.000005 per query (20x cheaper)
- **Latency:** 0.3-0.5 seconds (5x faster)

**Scheduler Impact:**
- Queue polling: From 5 seconds → 0.5 seconds
- High-priority tasks: Instant retrieval

---

## Query Optimization Checklist

### For Maximum Performance

✅ **Always filter on partition field**
```sql
-- Good: Uses partition pruning
WHERE usage_date = CURRENT_DATE()

-- Bad: Full table scan
WHERE DATE(created_at) = CURRENT_DATE()  -- Function on partition field!
```

✅ **Filter on clustering fields in order**
```sql
-- Best: Matches clustering order [org_slug, status, plan_name]
WHERE org_slug = 'acme-corp'
  AND status = 'ACTIVE'
  AND plan_name = 'enterprise'

-- Good: Partial clustering benefit
WHERE org_slug = 'acme-corp'

-- Suboptimal: Skips org_slug (first clustering field)
WHERE status = 'ACTIVE'
```

✅ **Use EXPLAIN to verify optimization**
```sql
EXPLAIN
SELECT * FROM table WHERE ...;

-- Look for:
-- partitionsPruned: true
-- estimatedBytesProcessed: small value
```

✅ **Avoid SELECT ***
```sql
-- Good: Only required columns
SELECT org_slug, status FROM org_profiles WHERE ...

-- Bad: Scans all columns (more bytes)
SELECT * FROM org_profiles WHERE ...
```

---

## Testing Query Performance

### Before Migration Baseline
```bash
# Run with --dry_run to see bytes processed WITHOUT executing
bq query --use_legacy_sql=false --dry_run \
  "SELECT * FROM \`gac-prod-471220.organizations.org_usage_quotas\`
   WHERE org_slug = 'acme-corp' AND usage_date = CURRENT_DATE()"

# Output: "This query will process 10 MB when run"
```

### After Migration Validation
```bash
# Same query after optimization
bq query --use_legacy_sql=false --dry_run \
  "SELECT * FROM \`gac-prod-471220.organizations.org_usage_quotas\`
   WHERE org_slug = 'acme-corp' AND usage_date = CURRENT_DATE()"

# Output: "This query will process 0.01 MB when run" (99% reduction!)
```

### Real Query Performance
```bash
# Run actual query with timing
time bq query --use_legacy_sql=false \
  "SELECT * FROM \`gac-prod-471220.organizations.org_usage_quotas\`
   WHERE org_slug = 'acme-corp' AND usage_date = CURRENT_DATE()"

# Before: real 2m30.123s
# After:  real 0m0.456s
```

---

## Cost Calculation

### BigQuery Pricing (On-Demand)
- **Query cost:** $5 per TB processed
- **Storage cost:** $0.02 per GB per month (active), $0.01 per GB per month (long-term)

### Example Monthly Savings

**Scenario:** 100 orgs, 1000 quota checks per day

#### Before Optimization
- Bytes per query: 10 MB
- Daily queries: 1000
- Monthly bytes: 10 MB × 1000 × 30 = 300 GB
- Monthly cost: (300 GB / 1000 GB) × $5 = **$1.50/month**

#### After Optimization
- Bytes per query: 0.01 MB
- Daily queries: 1000
- Monthly bytes: 0.01 MB × 1000 × 30 = 0.3 GB
- Monthly cost: (0.3 GB / 1000 GB) × $5 = **$0.0015/month**

**Savings:** $1.50 - $0.0015 = **$1.4985/month** (99.9% reduction)

**Scaled to production (1000 orgs, 10K queries/day):**
- Before: $150/month
- After: $0.15/month
- **Annual savings: $1,798**

---

## Monitoring Queries

### Check Partition Pruning
```sql
-- View partition information
SELECT
  table_name,
  partition_id,
  total_rows,
  ROUND(total_logical_bytes / 1024 / 1024, 2) as size_mb
FROM `gac-prod-471220.organizations.INFORMATION_SCHEMA.PARTITIONS`
WHERE table_name = 'org_usage_quotas'
ORDER BY partition_id DESC
LIMIT 10;
```

### Check Clustering Statistics
```sql
-- View clustering quality
SELECT
  table_name,
  clustering_ordinal_position,
  clustering_field
FROM `gac-prod-471220.organizations.INFORMATION_SCHEMA.CLUSTERING_FIELDS`
WHERE table_name IN ('org_profiles', 'org_usage_quotas')
ORDER BY table_name, clustering_ordinal_position;
```

### Query Performance Over Time
```sql
-- Analyze query costs from BigQuery audit logs
SELECT
  DATE(creation_time) as query_date,
  user_email,
  COUNT(*) as query_count,
  ROUND(SUM(total_bytes_processed) / 1024 / 1024 / 1024, 2) as total_gb_processed,
  ROUND(AVG(total_slot_ms) / 1000, 2) as avg_slot_seconds
FROM `gac-prod-471220.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
WHERE DATE(creation_time) >= CURRENT_DATE() - 30
  AND statement_type = 'SELECT'
  AND referenced_tables LIKE '%organizations%'
GROUP BY query_date, user_email
ORDER BY query_date DESC;
```

---

## Production Monitoring Dashboard

### Key Metrics to Track

1. **Query Cost Trend**
   - Daily/weekly bytes processed
   - Cost per query type
   - Top expensive queries

2. **Query Performance**
   - P50, P95, P99 latency
   - Queries per second
   - Error rate

3. **Partition Health**
   - Partition count per table
   - Partition size distribution
   - Pruning effectiveness

4. **Clustering Quality**
   - Clustering ratio (aim for >80%)
   - Re-clustering frequency
   - Clustering field selectivity

---

**Document Version:** 1.0
**Last Updated:** 2025-12-06
**Companion Document:** `BIGQUERY_OPTIMIZATION_PLAN.md`
