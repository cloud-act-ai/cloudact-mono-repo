# GCP Cost Billing Pipeline

## Overview

The Cost Billing Pipeline extracts billing data from GCP's billing export, transforms it into an optimized schema for cost analysis, validates data quality, and sends notifications on failures.

## Architecture

```
┌─────────────────────────────────────┐
│  GCP Billing Export (BigQuery)      │
│  cloudact_cost_usage.               │
│  gcp_billing_export_resource_v1_*   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Step 1: Extract & Transform        │
│  Engine: gcp.bq_etl                 │
│  - Flatten nested fields            │
│  - Convert labels to JSON           │
│  - Aggregate credits                │
│  - Add ingestion_date partition     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Destination: Silver Cost Dataset   │
│  {tenant_id}_gcp_silver_cost.       │
│  billing_cost_daily                 │
│  - Partitioned by ingestion_date    │
│  - Clustered by billing_account_id, │
│    service_id, project_id, region   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Step 2: Data Quality Validation    │
│  Engine: gcp.bq_etl                 │
│  - 25 validation checks             │
│  - Critical + Warning + Info levels │
│  - Results stored in x_meta_dq_     │
│    results                          │
└─────────────────┬───────────────────┘
                  │
                  ▼ (on_failure)
┌─────────────────────────────────────┐
│  Step 3: Email Notification         │
│  Engine: notify_systems.email_      │
│          notification               │
│  - Sends failure alerts             │
│  - Includes error details           │
│  - Links to BigQuery console        │
└─────────────────────────────────────┘
```

## Pipeline Configuration

### File Location
```
configs/gcp/cost/cost_billing_pipeline.yml
```

### Key Components

#### 1. Source Configuration
- **Table**: `gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_*`
- **Query**: Extracts 29 key cost fields from billing export
- **Filtering**: Filters by `usage_start_time` date (configurable)

#### 2. Destination Configuration
- **Dataset**: `{tenant_id}_gcp_silver_cost`
- **Table**: `billing_cost_daily`
- **Schema**: Uses template `billing_cost` from engine
- **Write Mode**: `append` (can be changed to `overwrite`)
- **Partitioning**: Daily partition by `ingestion_date` (2-year retention)
- **Clustering**: `billing_account_id`, `service_id`, `project_id`, `location_region`

#### 3. Data Quality Validation
- **Suite**: `billing_cost_suite` (25 expectations)
- **Mode**: Latest partition validation
- **Failure Threshold**: Max 5 failed non-critical expectations
- **Critical Checks**:
  - `billing_account_id` NOT NULL
  - `cost` NOT NULL
  - `usage_start_time` NOT NULL
  - `cost` in reasonable range

#### 4. Notifications
- **Trigger**: `on_failure`
- **Recipients**: Configurable email list
- **Content**: Pipeline details, error message, BigQuery console link

## Schema

### Source Fields (GCP Billing Export)
The pipeline extracts 29 key fields from the standard GCP billing export schema:
- Billing account, service, SKU
- Usage timestamps
- Project details
- Location (region, zone)
- Resource identification
- Cost metrics and currency
- Usage metrics
- Credits
- Labels (user and system)

### Destination Schema
See `ps_templates/gcp/bq_etl/schema_template.json` for the complete `billing_cost` schema definition.

Key fields:
| Field | Type | Mode | Description |
|-------|------|------|-------------|
| `billing_account_id` | STRING | REQUIRED | Tenant mapping key |
| `cost` | FLOAT64 | REQUIRED | Primary cost metric |
| `usage_start_time` | TIMESTAMP | REQUIRED | Start of usage period |
| `usage_end_time` | TIMESTAMP | REQUIRED | End of usage period |
| `service_id` | STRING | NULLABLE | GCP service identifier |
| `project_id` | STRING | NULLABLE | GCP project |
| `location_region` | STRING | NULLABLE | Geographic region |
| `ingestion_date` | DATE | REQUIRED | Partition key |
| `labels_json` | STRING | NULLABLE | User labels as JSON |

## Usage

### 1. Run Pipeline via API

```bash
curl -X POST "http://localhost:8080/api/v1/pipelines/run/{tenant_id}/gcp/cost/cost_billing_pipeline" \
  -H "X-API-Key: {api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-15",
    "trigger_by": "scheduler",
    "parameters": {
      "filter_date": "2025-11-15"
    }
  }'
```

### 2. Override Variables

You can override pipeline variables at runtime:

```json
{
  "date": "2025-11-15",
  "trigger_by": "manual",
  "parameters": {
    "source_billing_table": "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_*",
    "destination_dataset_type": "gcp_silver_cost",
    "destination_table": "billing_cost_daily",
    "filter_date": "2025-11-15"
  }
}
```

### 3. Query Destination Data

```sql
-- Daily cost summary by service
SELECT
  DATE(usage_start_time) AS cost_date,
  service_description,
  SUM(cost) AS total_cost,
  SUM(credits_total) AS total_credits,
  SUM(cost - IFNULL(credits_total, 0)) AS net_cost,
  COUNT(*) AS resource_count
FROM `gac-prod-471220.{tenant_id}_gcp_silver_cost.billing_cost_daily`
WHERE ingestion_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY cost_date, service_description
ORDER BY cost_date DESC, total_cost DESC;
```

```sql
-- Cost by project and region
SELECT
  project_id,
  location_region,
  SUM(cost) AS total_cost,
  COUNT(DISTINCT service_id) AS service_count
FROM `gac-prod-471220.{tenant_id}_gcp_silver_cost.billing_cost_daily`
WHERE ingestion_date = CURRENT_DATE()
GROUP BY project_id, location_region
ORDER BY total_cost DESC;
```

## Data Quality Expectations

The pipeline includes 25 data quality expectations organized by severity:

### Critical (Pipeline Fails)
- Table has rows (1 to 10M)
- All required columns present
- Required fields NOT NULL: `billing_account_id`, `cost`, timestamps, `ingestion_date`
- Timestamps are parseable
- End time >= start time

### Warning (Logged but Pipeline Continues)
- Cost in reasonable range (-$1M to +$1M)
- Valid currency codes
- Billing account ID format matches GCP standard
- Service ID format matches `*.googleapis.com`
- Usage amounts are positive

### Info (Monitoring Only)
- Cost type in known set
- 95%+ of costs are positive
- Statistical checks (mean, median, quantiles)
- Distribution analysis

See `configs/data_quality/expectations/billing_cost_suite.json` for complete expectation definitions.

## Performance Optimization

### Query Optimization
- **Partition Pruning**: Always filter by `ingestion_date`
- **Clustering**: Use `billing_account_id`, `service_id`, `project_id`, or `location_region` in WHERE clause
- **Label Queries**: Use `JSON_EXTRACT` on `labels_json` field

```sql
-- Optimized query using partition and clustering
SELECT *
FROM `{tenant_id}_gcp_silver_cost.billing_cost_daily`
WHERE
  ingestion_date = '2025-11-15'  -- Partition filter
  AND billing_account_id = '01ECB7-6EE0BA-7357F1'  -- Clustering filter
  AND service_id = 'compute.googleapis.com';  -- Clustering filter
```

### Cost Optimization
- **Partition Expiration**: 730 days (2 years) automatic cleanup
- **Clustering**: Reduces data scanned by 60-90% for common queries
- **JSON Labels**: More storage-efficient than REPEATED RECORD
- **Aggregated Credits**: Single field vs. array iteration

## Troubleshooting

### Pipeline Failures

1. **No Data Extracted**
   - Check `filter_date` parameter matches data in billing export
   - Verify billing export table name is correct
   - Check permissions on source table

2. **Data Quality Failures**
   - Review DQ results: `SELECT * FROM {tenant_id}.x_meta_dq_results WHERE dq_config_id = 'billing_cost_suite' ORDER BY executed_at DESC LIMIT 1`
   - Check `failed_expectations` JSON for specific issues
   - Adjust expectations if billing export schema changed

3. **Schema Errors**
   - Verify schema template: `ps_templates/gcp/bq_etl/schema_template.json`
   - Check for BigQuery schema changes in billing export
   - Validate field type compatibility

4. **Notification Failures**
   - Check notification service configuration
   - Verify email addresses in pipeline config
   - Review logs: `SELECT * FROM tenants.x_meta_pipeline_runs WHERE tenant_id = '{tenant_id}' AND pipeline_id = 'cost_billing_pipeline' ORDER BY start_time DESC`

### Common Issues

**Issue**: Currency conversion rate is NULL
- **Cause**: Billing in native USD
- **Solution**: Expected behavior when currency = 'USD'

**Issue**: High credit amounts
- **Cause**: Promotions, committed use discounts
- **Solution**: Normal - use `cost - credits_total` for net cost

**Issue**: Negative costs
- **Cause**: Refunds, corrections
- **Solution**: Expected - filter with `WHERE cost > 0` if needed

## Monitoring

### Pipeline Health Checks

```sql
-- Recent pipeline runs
SELECT
  pipeline_logging_id,
  start_time,
  end_time,
  status,
  TIMESTAMP_DIFF(end_time, start_time, SECOND) AS duration_seconds
FROM `tenants.x_meta_pipeline_runs`
WHERE tenant_id = '{tenant_id}'
  AND pipeline_id = 'cost_billing_pipeline'
ORDER BY start_time DESC
LIMIT 10;
```

```sql
-- Data Quality trends
SELECT
  DATE(executed_at) AS check_date,
  expectations_passed,
  expectations_failed,
  overall_status
FROM `{tenant_id}.x_meta_dq_results`
WHERE dq_config_id = 'billing_cost_suite'
ORDER BY executed_at DESC
LIMIT 30;
```

### Cost Anomaly Detection

```sql
-- Daily cost compared to 7-day average
WITH daily_cost AS (
  SELECT
    DATE(usage_start_time) AS cost_date,
    SUM(cost) AS total_cost
  FROM `{tenant_id}_gcp_silver_cost.billing_cost_daily`
  WHERE ingestion_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY cost_date
)
SELECT
  cost_date,
  total_cost,
  AVG(total_cost) OVER (
    ORDER BY cost_date
    ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
  ) AS avg_last_7_days,
  total_cost / NULLIF(AVG(total_cost) OVER (
    ORDER BY cost_date
    ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
  ), 0) AS cost_ratio
FROM daily_cost
WHERE cost_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
ORDER BY cost_date DESC;
```

## Scheduling

### Recommended Schedule
- **Frequency**: Daily
- **Time**: 6:00 AM UTC (after billing export completes)
- **Lookback**: Process previous day's data

### Cloud Scheduler Example

```bash
gcloud scheduler jobs create http cost-billing-pipeline-daily \
  --schedule="0 6 * * *" \
  --time-zone="UTC" \
  --uri="https://api.example.com/api/v1/pipelines/run/{tenant_id}/gcp/cost/cost_billing_pipeline" \
  --http-method=POST \
  --headers="X-API-Key={api_key},Content-Type=application/json" \
  --message-body='{"date":"$(date -d yesterday +%Y-%m-%d)","trigger_by":"scheduler"}'
```

## Related Files

- **Pipeline Config**: `configs/gcp/cost/cost_billing.yml`
- **Schema Template**: `ps_templates/gcp/bq_etl/schema_template.json`
- **DQ Suite**: `configs/data_quality/expectations/billing_cost_suite.json`
- **BQ Engine**: `src/core/engine/gcp/bq_etl.py`
- **Notification Processor**: `src/core/processors/notify_systems/email_notification.py`

## Support

For issues or questions:
1. Check pipeline logs: `tenants.x_meta_pipeline_runs` (filter by tenant_id) and `{tenant_id}.x_meta_step_logs`
2. Review DQ results: `{tenant_id}.x_meta_dq_results`
3. Contact: data-ops@company.com
