# Cost Tables Setup Summary

## Overview
This document summarizes the cost-related tables created in BigQuery for the `guru_232342` tenant dataset.

## Created Tables

### 1. billing_cost_daily

**Full Table ID**: `gac-prod-471220.guru_232342.billing_cost_daily`

**Purpose**: Stores daily GCP billing cost data with usage metrics and pricing information.

**Schema**: 29 fields capturing comprehensive billing information
- Created: 2025-11-18 09:48:53 UTC
- Current Status: Empty (0 rows, ready for data ingestion)

**Configuration**:
- **Time Partitioning**:
  - Type: DAY
  - Field: `ingestion_date`
  - Retention: 730 days (2 years / 63072000000 ms)

- **Clustering Fields** (optimized for query performance):
  1. `billing_account_id`
  2. `service_id`
  3. `project_id`
  4. `location_region`

**Key Schema Fields**:

| Field | Type | Mode | Description |
|-------|------|------|-------------|
| billing_account_id | STRING | REQUIRED | GCP billing account identifier |
| service_id | STRING | NULLABLE | GCP service identifier |
| service_description | STRING | NULLABLE | Human-readable service name |
| sku_id | STRING | NULLABLE | SKU identifier |
| sku_description | STRING | NULLABLE | SKU description |
| usage_start_time | TIMESTAMP | REQUIRED | Usage start time |
| usage_end_time | TIMESTAMP | REQUIRED | Usage end time |
| project_id | STRING | NULLABLE | GCP project identifier |
| project_name | STRING | NULLABLE | Project name |
| project_number | STRING | NULLABLE | Project number |
| location_location | STRING | NULLABLE | Resource location |
| location_region | STRING | NULLABLE | Geographic region |
| location_zone | STRING | NULLABLE | Availability zone |
| resource_name | STRING | NULLABLE | Resource name |
| resource_global_name | STRING | NULLABLE | Fully qualified resource name |
| cost | FLOAT64 | REQUIRED | Total cost in billing currency |
| currency | STRING | NULLABLE | Billing currency code |
| currency_conversion_rate | FLOAT64 | NULLABLE | Conversion rate to USD |
| usage_amount | FLOAT64 | NULLABLE | Usage quantity |
| usage_unit | STRING | NULLABLE | Unit of measurement |
| usage_amount_in_pricing_units | FLOAT64 | NULLABLE | Usage in pricing units |
| usage_pricing_unit | STRING | NULLABLE | Pricing unit |
| cost_type | STRING | NULLABLE | Type of cost |
| credits_total | FLOAT64 | NULLABLE | Total credits applied |
| cost_at_list | FLOAT64 | NULLABLE | Cost at list price |
| invoice_month | STRING | NULLABLE | Invoice month (YYYYMM) |
| ingestion_date | DATE | REQUIRED | Ingestion date (partition key) |
| labels_json | STRING | NULLABLE | User-applied labels as JSON |
| system_labels_json | STRING | NULLABLE | System-applied labels as JSON |

## Dataset Architecture

**Dataset**: `guru_232342` (single-dataset-per-tenant architecture)

All tenant data is stored in a single dataset:
- Cost tables: `billing_cost_daily`
- Metadata tables: `x_meta_pipeline_runs`, `x_meta_step_logs`, etc.
- Data tables: Various data processing tables

The `destination_dataset_type: "gcp_silver_cost"` configuration value is used for organizational purposes but does not create separate datasets.

## Related Pipeline

**Pipeline Configuration**: `/Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline/configs/gcp/cost/cost_billing.yml`

**Pipeline ID**: `{tenant_id}_gcp_cost_billing`

**API Endpoint**: `POST /api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing`

**Source Data**:
- Table: `gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_01ECB7_6EE0BA_7357F1`
- Type: GCP Billing Export

**Processing**:
1. Extracts daily billing data from GCP billing export
2. Transforms and enriches with usage metrics
3. Loads into `guru_232342.billing_cost_daily`
4. Sends failure notifications if needed

## Verification Commands

### Check Table Exists
```bash
bq show gac-prod-471220:guru_232342.billing_cost_daily
```

### List All Tables in Dataset
```bash
bq ls --format=pretty gac-prod-471220:guru_232342
```

### View Table Schema
```bash
bq show --schema --format=prettyjson gac-prod-471220:guru_232342.billing_cost_daily
```

### Query Table (test)
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as row_count FROM \`gac-prod-471220.guru_232342.billing_cost_daily\`"
```

### Sample Data Query (after data is loaded)
```bash
bq query --use_legacy_sql=false \
  "SELECT
    billing_account_id,
    service_description,
    SUM(cost) as total_cost,
    currency,
    COUNT(*) as line_items
  FROM \`gac-prod-471220.guru_232342.billing_cost_daily\`
  WHERE ingestion_date = CURRENT_DATE()
  GROUP BY billing_account_id, service_description, currency
  ORDER BY total_cost DESC
  LIMIT 10"
```

## Maintenance

### Data Retention
- Partitions older than 730 days (2 years) are automatically deleted
- This is configured via `expiration_days: 730` in the table partitioning settings

### Query Optimization
- Use the clustering fields in WHERE clauses for best performance:
  - `billing_account_id`
  - `service_id`
  - `project_id`
  - `location_region`

- Use partition pruning by filtering on `ingestion_date`:
  ```sql
  WHERE ingestion_date >= '2025-01-01'
  ```

## Script Used

**Script**: `/Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline/scripts/create_cost_tables.py`

**Execution Command**:
```bash
python scripts/create_cost_tables.py --tenant-id guru_232342 --verify
```

## Status

- [x] Dataset `guru_232342` exists
- [x] Table `billing_cost_daily` created with correct schema
- [x] Time partitioning configured (730-day retention)
- [x] Clustering configured for query optimization
- [x] Table verified and queryable
- [ ] Pipeline tested with data ingestion (pending - requires running the cost_billing pipeline)

## Next Steps

1. **Test Pipeline**: Run the cost billing pipeline to populate the table with data
   ```bash
   curl -X POST http://localhost:8080/api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing \
     -H "Content-Type: application/json" \
     -d '{
       "date": "2025-11-17",
       "admin_email": "admin@example.com"
     }'
   ```

2. **Monitor Ingestion**: Check pipeline execution logs
   ```sql
   SELECT * FROM `gac-prod-471220.tenants.x_meta_pipeline_runs`
   WHERE tenant_id = 'guru_232342'
     AND pipeline_id = 'guru_232342_gcp_cost_billing'
   ORDER BY start_time DESC
   LIMIT 10
   ```

3. **Verify Data**: Query the table after pipeline runs
   ```sql
   SELECT
     ingestion_date,
     COUNT(*) as records,
     SUM(cost) as total_cost
   FROM `gac-prod-471220.guru_232342.billing_cost_daily`
   GROUP BY ingestion_date
   ORDER BY ingestion_date DESC
   ```

## Documentation References

- **Pipeline Configuration**: `/Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline/configs/gcp/cost/README.md`
- **Schema Template**: `/Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline/ps_templates/gcp/bq_etl/schema_template.json`
- **BigQuery ETL Processor**: `/Users/gurukallam/projects/cloudact-meta-data-store/cloudact-backend-systems/convergence-data-pipeline/src/core/processors/gcp/bq_etl.py`
