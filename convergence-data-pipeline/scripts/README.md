# Scripts Directory

This directory contains utility scripts for managing the Convergence Data Pipeline.

## Available Scripts

### create_cost_tables.py

Creates cost-related tables in BigQuery for a tenant dataset.

### verify_cost_tables.py

Verifies that cost tables exist and are correctly configured.

#### Purpose (verify_cost_tables.py)
This script verifies the `billing_cost_daily` table configuration in BigQuery. It checks:
- Table existence
- Schema fields (required fields and types)
- Partitioning configuration (field, type, expiration)
- Clustering configuration (fields and order)

#### Usage (verify_cost_tables.py)

```bash
# Basic usage - verify table in guru_232342 dataset
python scripts/verify_cost_tables.py --tenant-id guru_232342

# With custom project ID
python scripts/verify_cost_tables.py --tenant-id guru_232342 --project-id gac-prod-471220

# Verify custom table name
python scripts/verify_cost_tables.py --tenant-id guru_232342 --table-name custom_billing_table
```

#### Example Output (verify_cost_tables.py)

```
================================================================================
Verifying Cost Tables in BigQuery
================================================================================
Project ID: gac-prod-471220
Tenant ID (Dataset): guru_232342
Table Name: billing_cost_daily
================================================================================

1. Checking table existence...
✓ Table exists: gac-prod-471220.guru_232342.billing_cost_daily
  - Created: 2025-11-18 09:48:53.268000+00:00
  - Last Modified: 2025-11-18 09:48:53.314000+00:00
  - Rows: 0
  - Size: 0 bytes
  - Schema Fields: 29

2. Verifying schema fields...
✓ All required fields present and correctly typed

3. Verifying partitioning configuration...
✓ Partitioning configured correctly: DAY on ingestion_date

4. Verifying clustering configuration...
✓ Clustering configured correctly: billing_account_id, service_id, project_id, location_region

================================================================================
Verification Summary
================================================================================
Table Exists: ✓
Schema Valid: ✓
Partitioning Valid: ✓
Clustering Valid: ✓
================================================================================

✓ ALL CHECKS PASSED - Table is correctly configured!
```

---

### create_cost_tables.py (detailed documentation)

#### Purpose (create_cost_tables.py)
This script creates the `billing_cost_daily` table in the specified tenant dataset using the schema template defined in `ps_templates/gcp/bq_etl/schema_template.json`. The table is configured with:
- **Time Partitioning**: Daily partitioning on `ingestion_date` field with 730-day retention (2 years)
- **Clustering**: Optimized clustering on `billing_account_id`, `service_id`, `project_id`, and `location_region`
- **Schema**: 29 fields capturing comprehensive GCP billing cost data

#### Usage

```bash
# Basic usage - create table in guru_232342 dataset
python scripts/create_cost_tables.py --tenant-id guru_232342

# With custom project ID
python scripts/create_cost_tables.py --tenant-id guru_232342 --project-id gac-prod-471220

# With verification after creation
python scripts/create_cost_tables.py --tenant-id guru_232342 --verify

# Create with custom table name
python scripts/create_cost_tables.py --tenant-id guru_232342 --table-name custom_billing_table
```

#### Arguments

- `--tenant-id` (required): Tenant ID which serves as the dataset name (e.g., `guru_232342`)
- `--project-id` (optional): GCP project ID (defaults to `settings.gcp_project_id`)
- `--table-name` (optional): Table name (default: `billing_cost_daily`)
- `--verify`: Verify table after creation and display table metadata

#### Schema Overview

The `billing_cost_daily` table includes the following key fields:

**Billing Information:**
- `billing_account_id` (REQUIRED): GCP billing account identifier
- `cost` (REQUIRED): Total cost in billing currency
- `cost_at_list`: Cost at list price before discounts
- `credits_total`: Total credits applied
- `currency`: Billing currency code (USD, EUR, etc.)
- `currency_conversion_rate`: Conversion rate to USD

**Service & Resource Information:**
- `service_id`, `service_description`: GCP service details
- `sku_id`, `sku_description`: SKU (Stock Keeping Unit) details
- `resource_name`, `resource_global_name`: Resource identifiers

**Project Information:**
- `project_id`: GCP project identifier
- `project_name`: Human-readable project name
- `project_number`: GCP project number

**Location Information:**
- `location_location`: Resource location (e.g., us-central1)
- `location_region`: Geographic region
- `location_zone`: Availability zone

**Usage Information:**
- `usage_start_time`, `usage_end_time` (REQUIRED): Usage time range
- `usage_amount`: Usage quantity
- `usage_unit`: Unit of measurement
- `usage_amount_in_pricing_units`: Usage in pricing units
- `usage_pricing_unit`: Pricing unit

**Metadata:**
- `ingestion_date` (REQUIRED): Date when record was ingested (partition key)
- `invoice_month`: Invoice month (YYYYMM format)
- `cost_type`: Type of cost (regular, tax, adjustment, etc.)
- `labels_json`: User-applied resource labels as JSON
- `system_labels_json`: System-applied labels as JSON

#### Architecture Notes

**Single-Dataset-Per-Tenant Architecture:**
The pipeline uses a single dataset per tenant (e.g., `guru_232342`). The `destination_dataset_type` configuration value (like `gcp_silver_cost`) is used for organizational and categorization purposes but does not create separate datasets.

All tables (data tables, metadata tables, cost tables) are stored in the same tenant dataset:
- `guru_232342.billing_cost_daily` - Cost data
- `guru_232342.x_meta_pipeline_runs` - Pipeline execution metadata
- `guru_232342.x_meta_step_logs` - Step execution logs
- And other tenant-specific tables

#### Example Output

```
================================================================================
Creating Cost Tables in BigQuery
================================================================================
Project ID: gac-prod-471220
Tenant ID (Dataset): guru_232342
Table Name: billing_cost_daily
================================================================================
Creating table: gac-prod-471220.guru_232342.billing_cost_daily
Dataset guru_232342 exists
Loaded schema with 29 fields
Successfully created/verified table: gac-prod-471220.guru_232342.billing_cost_daily
  - Partitioned by: ingestion_date (DAY, 730 days retention)
  - Clustered by: billing_account_id, service_id, project_id, location_region
  - Schema fields: 29

Table verification for gac-prod-471220.guru_232342.billing_cost_daily:
  - Created: 2025-11-18 09:48:53.268000+00:00
  - Schema fields: 29
  - Partitioning: TimePartitioning(expiration_ms=63072000000,field='ingestion_date',type_='DAY')
  - Clustering: ['billing_account_id', 'service_id', 'project_id', 'location_region']
  - Total rows: 0
  - Size: 0 bytes
================================================================================
SUCCESS: Cost tables created successfully!
================================================================================
```

#### Verification

After running the script, you can verify the table exists using the BigQuery CLI:

```bash
# Show table schema
bq show --schema --format=prettyjson gac-prod-471220:guru_232342.billing_cost_daily

# List all tables in the dataset
bq ls --format=pretty gac-prod-471220:guru_232342

# Show table details including partitioning and clustering
bq show gac-prod-471220:guru_232342.billing_cost_daily
```

#### Related Pipelines

This table is populated by the cost billing pipeline:
- **Pipeline**: `configs/gcp/cost/cost_billing.yml`
- **Pipeline ID**: `{tenant_id}_gcp_cost_billing`
- **API Endpoint**: `POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/cost_billing`

The pipeline extracts billing data from the GCP billing export table and loads it into this table on a daily basis.
