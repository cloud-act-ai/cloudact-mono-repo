# Pipeline Templates

## Overview

Templates provide reusable configurations for pipeline engines, including schema definitions, default settings, and example configurations. Templates enable consistent data structures across all tenants.

## Directory Structure

```
templates/
├── gcp/                           # Google Cloud Platform templates
│   └── bigquery_to_bigquery/
│       ├── config.yml             # Default engine configuration
│       └── schema_template.json    # BigQuery schema definitions
├── aws/                           # AWS templates
│   └── s3_to_bigquery/
│       ├── config.yml
│       └── schema_template.json
├── customer/                      # Customer/tenant templates
│   └── onboarding/
│       ├── config.yml
│       ├── schema.json
│       └── schemas/               # Metadata table schemas
│           ├── x_meta_api_keys.json
│           ├── x_meta_cloud_credentials.json
│           ├── x_meta_pipeline_runs.json
│           ├── x_meta_step_logs.json
│           └── x_meta_dq_results.json
└── shared/                        # Shared utility templates
    ├── email_notification/
    │   └── config.yml
    └── slack_notification/
        └── config.yml
```

## Template Types

### Schema Templates

Define BigQuery table schemas used by engines for table creation and validation.

**Location:** `templates/{provider}/{engine}/schema_template.json`

**Structure:**
```json
{
  "schemas": {
    "billing_cost": {
      "description": "GCP billing cost data schema",
      "fields": [
        {
          "name": "billing_account_id",
          "type": "STRING",
          "mode": "REQUIRED",
          "description": "GCP billing account identifier"
        },
        {
          "name": "cost",
          "type": "FLOAT64",
          "mode": "REQUIRED",
          "description": "Cost in billing currency"
        },
        {
          "name": "ingestion_date",
          "type": "DATE",
          "mode": "REQUIRED",
          "description": "Partition key for data retention"
        }
      ]
    },
    "default": {
      "description": "Auto-detect schema",
      "fields": []
    }
  }
}
```

**Usage in Pipeline:**
```yaml
destination:
  schema_template: "billing_cost"  # References templates/gcp/bigquery_to_bigquery/schema_template.json
```

### Configuration Templates

Provide default settings for engines.

**Location:** `templates/{provider}/{engine}/config.yml`

**Example:**
```yaml
# templates/gcp/bigquery_to_bigquery/config.yml
default_timeout: 30
max_retries: 3
batch_size: 10000
write_disposition: "WRITE_APPEND"
```

## Creating Schema Templates

### Step 1: Define Schema File

Create `templates/{provider}/{engine}/schema_template.json`:

```json
{
  "schemas": {
    "my_schema_name": {
      "description": "Description of this schema",
      "fields": [
        {
          "name": "field_name",
          "type": "STRING | INTEGER | FLOAT64 | DATE | TIMESTAMP | BOOLEAN",
          "mode": "REQUIRED | NULLABLE | REPEATED",
          "description": "Field description"
        }
      ]
    }
  }
}
```

### Step 2: Reference in Engine

```python
# src/core/engines/{provider}/{engine}.py
class MyEngine:
    def __init__(self):
        self.template_dir = Path(__file__).parent.parent.parent.parent.parent / "templates" / "{provider}" / "{engine}"
        self.schema_templates = self._load_schema_templates()

    def _load_schema_templates(self):
        schema_file = self.template_dir / "schema_template.json"
        if schema_file.exists():
            with open(schema_file, 'r') as f:
                return json.load(f)
        return {"schemas": {}}
```

### Step 3: Use in Pipeline Config

```yaml
steps:
  - step_id: "process"
    ps_type: "{provider}.{engine}"
    destination:
      schema_template: "my_schema_name"
```

## Schema Template Best Practices

### 1. Use Descriptive Names
```json
{
  "schemas": {
    "billing_cost_daily": {  // Good: clear and specific
      "fields": [...]
    },
    "schema1": {  // Bad: unclear purpose
      "fields": [...]
    }
  }
}
```

### 2. Include Field Descriptions
```json
{
  "name": "billing_account_id",
  "type": "STRING",
  "mode": "REQUIRED",
  "description": "GCP billing account ID (format: 01XXXX-XXXXXX-XXXXXX)"  // Good
}
```

### 3. Set Appropriate Modes
- `REQUIRED`: Field must always have a value
- `NULLABLE`: Field can be null (most common)
- `REPEATED`: Array field (use sparingly for performance)

### 4. Use Partitioning Fields
```json
{
  "name": "ingestion_date",
  "type": "DATE",
  "mode": "REQUIRED",
  "description": "Partition key for data retention and query optimization"
}
```

### 5. Include Clustering Fields
```json
// Fields used frequently in WHERE clauses
{
  "name": "tenant_id",
  "type": "STRING",
  "mode": "REQUIRED",
  "description": "Clustering key for multi-tenant queries"
}
```

## BigQuery Schema Field Types

| Type | Description | Example |
|------|-------------|---------|
| `STRING` | Variable-length character data | "acme_corp" |
| `INT64` | 64-bit integer | 12345 |
| `FLOAT64` | Double precision floating point | 99.95 |
| `BOOLEAN` | True/False | true |
| `DATE` | Calendar date | "2025-11-15" |
| `TIMESTAMP` | Absolute point in time | "2025-11-15T10:30:00Z" |
| `DATETIME` | Date and time (no timezone) | "2025-11-15 10:30:00" |
| `NUMERIC` | Exact numeric (38 digits, 9 decimal) | 12345.123456789 |
| `BIGNUMERIC` | Larger exact numeric | Very large precise numbers |
| `BYTES` | Binary data | Base64 encoded |
| `JSON` | JSON document | {"key": "value"} |
| `GEOGRAPHY` | Geographic data | POINT(-122.35 47.62) |
| `RECORD` | Nested structure | {nested fields} |

## Metadata Table Schemas

### x_meta_api_keys

**Purpose:** Store tenant API keys for authentication

**Schema:** `templates/customer/onboarding/schemas/x_meta_api_keys.json`

```json
{
  "fields": [
    {"name": "tenant_id", "type": "STRING", "mode": "REQUIRED"},
    {"name": "api_key_hash", "type": "STRING", "mode": "REQUIRED"},
    {"name": "created_at", "type": "TIMESTAMP", "mode": "REQUIRED"},
    {"name": "expires_at", "type": "TIMESTAMP", "mode": "NULLABLE"},
    {"name": "is_active", "type": "BOOLEAN", "mode": "REQUIRED"},
    {"name": "description", "type": "STRING", "mode": "NULLABLE"}
  ]
}
```

### x_meta_pipeline_runs

**Purpose:** Track pipeline execution history

**Schema:** `templates/customer/onboarding/schemas/x_meta_pipeline_runs.json`

```json
{
  "fields": [
    {"name": "pipeline_logging_id", "type": "STRING", "mode": "REQUIRED"},
    {"name": "tenant_id", "type": "STRING", "mode": "REQUIRED"},
    {"name": "pipeline_id", "type": "STRING", "mode": "REQUIRED"},
    {"name": "start_time", "type": "TIMESTAMP", "mode": "REQUIRED"},
    {"name": "end_time", "type": "TIMESTAMP", "mode": "NULLABLE"},
    {"name": "status", "type": "STRING", "mode": "REQUIRED"},
    {"name": "trigger_by", "type": "STRING", "mode": "NULLABLE"},
    {"name": "run_date", "type": "DATE", "mode": "NULLABLE"},
    {"name": "total_steps", "type": "INT64", "mode": "NULLABLE"},
    {"name": "completed_steps", "type": "INT64", "mode": "NULLABLE"},
    {"name": "failed_steps", "type": "INT64", "mode": "NULLABLE"},
    {"name": "error_message", "type": "STRING", "mode": "NULLABLE"},
    {"name": "metadata", "type": "JSON", "mode": "NULLABLE"}
  ]
}
```

### x_meta_step_logs

**Purpose:** Detailed step execution logs

**Schema:** `templates/customer/onboarding/schemas/x_meta_step_logs.json`

## Template Validation

Before deploying a new template:

1. **Validate JSON Syntax:**
```bash
python -m json.tool templates/gcp/bigquery_to_bigquery/schema_template.json
```

2. **Check Field Names:**
   - Use snake_case (e.g., `billing_account_id`)
   - Avoid reserved words (e.g., `order`, `table`)
   - Keep under 128 characters

3. **Verify Types:**
   - Match source data types
   - Use appropriate precision (FLOAT64 vs NUMERIC)
   - Consider storage costs

4. **Test with Sample Data:**
```python
# Create test table with schema
from google.cloud import bigquery

client = bigquery.Client()
schema = load_schema_from_template("billing_cost")
table = bigquery.Table(f"project.dataset.test_table", schema=schema)
table = client.create_table(table)
```

## Versioning Templates

When updating schemas:

1. **Backward Compatible Changes (Safe):**
   - Adding new NULLABLE fields
   - Changing field descriptions
   - Adding new schemas to template

2. **Breaking Changes (Requires Migration):**
   - Removing fields
   - Changing field types
   - Changing field modes (NULLABLE → REQUIRED)

**Recommendation:** Version templates in file names:
```
schema_template_v1.json
schema_template_v2.json
```

Reference specific version in config:
```yaml
destination:
  schema_template: "billing_cost_v2"
  schema_version: "v2"
```

## Common Schema Patterns

### Time-based Partitioning
```json
{
  "name": "ingestion_date",
  "type": "DATE",
  "mode": "REQUIRED",
  "description": "Partition key - daily partitions with 730-day retention"
}
```

### Multi-tenant Clustering
```json
{
  "name": "tenant_id",
  "type": "STRING",
  "mode": "REQUIRED",
  "description": "Clustering key - improves multi-tenant query performance"
}
```

### JSON Metadata Storage
```json
{
  "name": "metadata",
  "type": "JSON",
  "mode": "NULLABLE",
  "description": "Flexible metadata storage - use JSON_EXTRACT for querying"
}
```

### Audit Timestamps
```json
[
  {
    "name": "created_at",
    "type": "TIMESTAMP",
    "mode": "REQUIRED",
    "description": "Record creation timestamp (immutable)"
  },
  {
    "name": "updated_at",
    "type": "TIMESTAMP",
    "mode": "NULLABLE",
    "description": "Last update timestamp (mutable)"
  }
]
```

## Testing Templates

### Unit Test

```python
import json
import pytest
from pathlib import Path

def test_schema_template_valid():
    schema_file = Path("templates/gcp/bigquery_to_bigquery/schema_template.json")
    with open(schema_file) as f:
        schema = json.load(f)

    assert "schemas" in schema
    assert "billing_cost" in schema["schemas"]

    billing_schema = schema["schemas"]["billing_cost"]
    assert "fields" in billing_schema
    assert len(billing_schema["fields"]) > 0

    # Check required fields
    field_names = [f["name"] for f in billing_schema["fields"]]
    assert "billing_account_id" in field_names
    assert "cost" in field_names
    assert "ingestion_date" in field_names
```

## Related Documentation

- **Engines**: `src/core/engines/README.md` - How engines use templates
- **Pipeline Configuration**: `configs/README.md` - Referencing templates in configs
- **BigQuery Documentation**: https://cloud.google.com/bigquery/docs/schemas

## Support

For questions about templates:
1. Review existing templates for examples
2. Check BigQuery schema documentation
3. Contact: data-ops@company.com
