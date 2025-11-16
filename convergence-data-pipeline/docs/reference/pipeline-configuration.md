# Pipeline Configuration Guide

## Overview

The Convergence Data Pipeline uses a **pipeline-as-code** approach where pipelines are defined through configuration files rather than hardcoded logic. This allows for flexible, maintainable pipeline definitions that can be discovered and executed by the system automatically.

Each pipeline is self-contained within its own configuration directory, containing all necessary definitions for execution, validation, and schema management.

## Directory Structure

Pipelines follow a hierarchical directory structure that organizes configurations by tenant, cloud provider, domain, and pipeline name:

```
configs/
├── {tenant_id}/
│   ├── {cloud_provider}/
│   │   ├── {domain}/
│   │   │   ├── {pipeline_name}/
│   │   │   │   ├── {pipeline_name}.yml
│   │   │   │   ├── {pipeline_name}_dq.yml
│   │   │   │   ├── {pipeline_name}_output_schema.json
│   │   │   │   └── (additional schema files as needed)
│   │   │   ├── {another_pipeline}/
│   │   │   │   └── ...
```

### Example Structure

```
configs/
├── acme-corp/
│   ├── gcp/
│   │   ├── cost/
│   │   │   ├── gcp_billing_export/
│   │   │   │   ├── gcp_billing_export.yml
│   │   │   │   ├── gcp_billing_export_dq.yml
│   │   │   │   └── gcp_billing_export_output_schema.json
│   │   │   └── gcp_pricing_calculation/
│   │   │       ├── gcp_pricing_calculation.yml
│   │   │       ├── gcp_pricing_calculation_dq.yml
│   │   │       └── gcp_pricing_calculation_output_schema.json
│   │   └── usage/
│   │       └── ...
│   └── aws/
│       └── ...
```

## Required Files Per Pipeline

Each pipeline directory must contain the following files:

### 1. `{pipeline_name}.yml` - Main Pipeline Configuration

The primary configuration file that defines the pipeline structure, parameters, and execution steps.

**Example:** `gcp_billing_export.yml`

### 2. `{pipeline_name}_dq.yml` - Data Quality Rules

Defines data quality validation rules that are applied to pipeline outputs.

**Example:** `gcp_billing_export_dq.yml`

### 3. `{pipeline_name}_output_schema.json` - Output Table Schema

Defines the BigQuery schema for the output table(s) produced by the pipeline. Multiple schema files are supported when a pipeline produces multiple output tables.

**Naming Convention for Multiple Outputs:**
- `{pipeline_name}_output_schema.json` (primary/default output)
- `{pipeline_name}_output_schema_{table_name}.json` (additional outputs)

**Example:** `gcp_billing_export_output_schema.json`

## Pipeline YAML Structure

The main pipeline YAML file defines the complete execution configuration. Here's the structure with all key sections:

```yaml
pipeline_id: gcp_billing_export
description: "Exports GCP billing data from Cloud Billing API and loads into BigQuery"
version: "1.0.0"

parameters:
  - name: project_id
    description: "GCP project ID to extract billing data from"
    type: string
    required: true
  - name: billing_account_id
    description: "GCP billing account ID"
    type: string
    required: true
  - name: destination_dataset
    description: "BigQuery dataset for output table"
    type: string
    required: false
    default: "billing_data"
  - name: run_date
    description: "Date for which to extract billing data (YYYY-MM-DD)"
    type: string
    required: false
    default: "{{ execution_date }}"

steps:
  - step_id: "extract_billing"
    description: "Extract billing data from Cloud Billing API"
    type: "api_to_bigquery"
    source:
      type: "gcp_billing_api"
      project_id: "{{ parameters.project_id }}"
      billing_account_id: "{{ parameters.billing_account_id }}"
      date_range:
        start: "{{ parameters.run_date }}"
        end: "{{ parameters.run_date }}"
    destination:
      type: "bigquery"
      project_id: "{{ parameters.project_id }}"
      dataset_id: "{{ parameters.destination_dataset }}"
      table_id: "billing_export_raw"
    timeout_minutes: 30

  - step_id: "transform_billing"
    description: "Transform and enrich billing data"
    type: "bigquery_to_bigquery"
    query: |
      SELECT
        billing_account_id,
        project_id,
        service_id,
        service_description,
        sku_id,
        sku_description,
        usage_amount,
        usage_unit,
        cost,
        currency,
        CURRENT_TIMESTAMP() as processed_at
      FROM `{{ parameters.project_id }}.{{ parameters.destination_dataset }}.billing_export_raw`
      WHERE DATE(usage_date) = '{{ parameters.run_date }}'
    destination:
      project_id: "{{ parameters.project_id }}"
      dataset_id: "{{ parameters.destination_dataset }}"
      table_id: "billing_export"
      write_disposition: "WRITE_APPEND"
    timeout_minutes: 15

  - step_id: "data_quality_check"
    description: "Run data quality validations"
    type: "data_quality"
    target:
      project_id: "{{ parameters.project_id }}"
      dataset_id: "{{ parameters.destination_dataset }}"
      table_id: "billing_export"
    rules_file: "gcp_billing_export_dq.yml"
    on_failure: "warn"  # or "fail" to stop pipeline on DQ failure
```

### Key Sections Explained

**pipeline_id**: Unique identifier for the pipeline. Must match the folder name and base filename.

**description**: Human-readable description of what the pipeline does.

**version**: Semantic versioning for the pipeline configuration. Increment when making changes.

**parameters**: List of input parameters with:
- `name`: Parameter identifier
- `description`: What the parameter is used for
- `type`: Data type (string, integer, boolean, etc.)
- `required`: Whether parameter must be provided
- `default`: Default value (supports template variables like `{{ execution_date }}`)

**steps**: Array of execution steps, each with:
- `step_id`: Unique identifier within the pipeline
- `description`: What the step does
- `type`: Step type (api_to_bigquery, bigquery_to_bigquery, data_quality, etc.)
- `source/destination`: Configuration specific to step type
- `timeout_minutes`: Maximum execution time for the step

### Template Variables

Variables available in YAML configuration:

- `{{ parameters.param_name }}` - Access pipeline parameters
- `{{ execution_date }}` - Current execution date (YYYY-MM-DD)
- `{{ execution_timestamp }}` - Current execution timestamp
- `{{ pipeline_id }}` - Current pipeline ID
- `{{ run_id }}` - Unique run identifier

## Schema Files

BigQuery output tables require schema definitions in JSON format. Schemas define the structure of the destination table including column names, types, and constraints.

### Schema File Format

Schema files follow the BigQuery schema JSON format:

```json
[
  {
    "name": "billing_account_id",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "Unique billing account identifier"
  },
  {
    "name": "project_id",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "GCP project ID"
  },
  {
    "name": "service_id",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "GCP service identifier (e.g., 6F81-5844-456A)"
  },
  {
    "name": "service_description",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Human-readable service name"
  },
  {
    "name": "sku_id",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "SKU identifier"
  },
  {
    "name": "sku_description",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "SKU description"
  },
  {
    "name": "usage_amount",
    "type": "NUMERIC",
    "mode": "NULLABLE",
    "description": "Amount of resource used"
  },
  {
    "name": "usage_unit",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Unit of measurement (GB, hours, etc.)"
  },
  {
    "name": "cost",
    "type": "NUMERIC",
    "mode": "NULLABLE",
    "description": "Cost in billing currency"
  },
  {
    "name": "currency",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "ISO 4217 currency code"
  },
  {
    "name": "processed_at",
    "type": "TIMESTAMP",
    "mode": "REQUIRED",
    "description": "Timestamp when record was processed"
  }
]
```

### Schema Field Properties

- **name**: Column name (must be unique within table)
- **type**: BigQuery data type (STRING, INTEGER, FLOAT, NUMERIC, BOOLEAN, TIMESTAMP, DATE, TIME, STRUCT, ARRAY, GEOGRAPHY)
- **mode**: NULLABLE (optional), REQUIRED (must have value), or REPEATED (array field)
- **description**: Documentation for the column
- **fields**: For STRUCT types, nested field definitions

### Multiple Output Tables

If a pipeline produces multiple output tables, create separate schema files:

```
configs/tenant/provider/domain/pipeline_name/
├── {pipeline_name}.yml
├── {pipeline_name}_dq.yml
├── {pipeline_name}_output_schema.json           # primary output
├── {pipeline_name}_output_schema_summary.json   # secondary output
└── {pipeline_name}_output_schema_errors.json    # error log output
```

Reference them in the YAML steps using the `schema_file` parameter.

## Data Quality Configuration

Data quality rules are defined in a separate YAML file and validate pipeline outputs. Rules can check for:

- Null/missing values
- Value ranges
- Pattern matching
- Uniqueness constraints
- Row count thresholds
- Statistical anomalies

### Data Quality YAML Structure

```yaml
version: "1.0.0"
description: "Data quality rules for GCP billing export"

rules:
  - rule_id: "required_fields"
    name: "Required Fields Check"
    type: "null_check"
    description: "Ensure required columns have no null values"
    target_columns:
      - "billing_account_id"
      - "project_id"
      - "cost"
    threshold: 0  # Allow 0 nulls

  - rule_id: "cost_positive"
    name: "Cost Values Positive"
    type: "range_check"
    description: "Ensure cost values are non-negative"
    target_column: "cost"
    min_value: 0
    max_value: null  # No upper limit
    threshold_percent: 100  # 100% of rows must pass

  - rule_id: "valid_currency"
    name: "Valid Currency Codes"
    type: "pattern_check"
    description: "Ensure currency codes are valid ISO 4217 codes"
    target_column: "currency"
    pattern: "^[A-Z]{3}$"
    threshold_percent: 100

  - rule_id: "unique_account_project"
    name: "Unique Account-Project Combinations"
    type: "uniqueness_check"
    description: "Check for duplicate account-project combinations"
    target_columns:
      - "billing_account_id"
      - "project_id"
    allow_duplicates: true  # For billing, duplicates are expected
    threshold_percent: 95

  - rule_id: "row_count_threshold"
    name: "Minimum Row Count"
    type: "row_count_check"
    description: "Ensure at least 100 rows were processed"
    min_rows: 100
    max_rows: null

  - rule_id: "recent_processed_timestamp"
    name: "Recent Processing Timestamp"
    type: "freshness_check"
    description: "Ensure data was processed within last 24 hours"
    target_column: "processed_at"
    max_age_hours: 24
    threshold_percent: 95
```

### Rule Types

- **null_check**: Verify columns have no null values
- **range_check**: Verify numeric values fall within min/max bounds
- **pattern_check**: Verify string values match regex pattern
- **uniqueness_check**: Check for duplicate values or combinations
- **row_count_check**: Verify table has minimum/maximum rows
- **freshness_check**: Verify timestamp values are recent
- **statistical_check**: Detect anomalies in numeric distributions

### Rule Properties

- **rule_id**: Unique identifier for the rule
- **name**: Human-readable rule name
- **type**: Type of validation rule
- **description**: What the rule validates
- **target_column(s)**: Which columns to validate
- **threshold/threshold_percent**: Tolerance level (exact count or percentage)
- **on_failure**: Action when rule fails (warn, fail, quarantine)

## Adding a New Pipeline

Follow these steps to create and integrate a new pipeline:

### Step 1: Create Pipeline Directory

Create the directory structure following the naming convention:

```bash
mkdir -p configs/{tenant_id}/{cloud_provider}/{domain}/{pipeline_name}
```

Example:
```bash
mkdir -p configs/acme-corp/aws/cost/aws_billing_consolidation
```

### Step 2: Create Main Pipeline Configuration

Create `{pipeline_name}.yml` with the pipeline definition:

```yaml
pipeline_id: aws_billing_consolidation
description: "Consolidates billing data from multiple AWS accounts"
version: "1.0.0"

parameters:
  - name: source_dataset
    type: string
    required: true
    description: "Source BigQuery dataset with billing data"
  - name: output_table
    type: string
    required: false
    default: "consolidated_billing"

steps:
  - step_id: "consolidate"
    type: "bigquery_to_bigquery"
    query: |
      SELECT
        account_id,
        SUM(cost) as total_cost,
        COUNT(*) as item_count,
        CURRENT_TIMESTAMP() as consolidation_time
      FROM `{{ parameters.source_dataset }}.billing_records`
      GROUP BY account_id
    destination:
      dataset_id: "{{ parameters.source_dataset }}"
      table_id: "{{ parameters.output_table }}"
      write_disposition: "WRITE_TRUNCATE"
```

### Step 3: Create Data Quality Configuration

Create `{pipeline_name}_dq.yml` with validation rules:

```yaml
version: "1.0.0"
description: "Data quality checks for consolidated billing"

rules:
  - rule_id: "account_id_required"
    name: "Account ID Required"
    type: "null_check"
    target_columns: ["account_id"]
    threshold: 0

  - rule_id: "cost_non_negative"
    name: "Costs Must Be Non-Negative"
    type: "range_check"
    target_column: "total_cost"
    min_value: 0
    threshold_percent: 100

  - rule_id: "minimum_records"
    name: "Minimum Consolidated Records"
    type: "row_count_check"
    min_rows: 1
```

### Step 4: Create Output Schema Files

Create `{pipeline_name}_output_schema.json` with the BigQuery table schema:

```json
[
  {
    "name": "account_id",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "AWS account ID"
  },
  {
    "name": "total_cost",
    "type": "NUMERIC",
    "mode": "NULLABLE",
    "description": "Total cost for the account"
  },
  {
    "name": "item_count",
    "type": "INTEGER",
    "mode": "NULLABLE",
    "description": "Number of items in consolidation"
  },
  {
    "name": "consolidation_time",
    "type": "TIMESTAMP",
    "mode": "REQUIRED",
    "description": "When consolidation was performed"
  }
]
```

### Step 5: Verify Configuration

Ensure your pipeline directory contains all required files:

```
configs/acme-corp/aws/cost/aws_billing_consolidation/
├── aws_billing_consolidation.yml
├── aws_billing_consolidation_dq.yml
└── aws_billing_consolidation_output_schema.json
```

### Step 6: System Auto-Discovery

Once files are in place, the system will:
1. Automatically discover the pipeline on startup
2. Register it in the pipeline registry
3. Make it available for execution via API or scheduler
4. Apply schema validations before execution
5. Execute data quality checks after completion

No code changes or deployments are required. The pipeline is ready to use immediately.

## Best Practices

1. **Naming Consistency**: Keep pipeline folder name, `pipeline_id`, and filename prefix identical (e.g., `gcp_billing_export`)

2. **Parameter Defaults**: Provide sensible defaults for optional parameters to reduce runtime configuration

3. **Timeout Configuration**: Set realistic `timeout_minutes` values based on expected data volume

4. **Version Control**: Increment `version` when making configuration changes

5. **Documentation**: Use descriptive `description` and `name` fields for clarity

6. **Template Variables**: Use `{{ parameters.* }}` syntax to make pipelines reusable across environments

7. **Data Quality**: Always include data quality rules, even if minimal, to validate outputs

8. **Schema Validation**: Keep output schemas synchronized with step queries

9. **Step Ordering**: Order steps logically (extract → transform → validate)

10. **Error Handling**: Set appropriate `on_failure` modes (warn vs fail) based on criticality
