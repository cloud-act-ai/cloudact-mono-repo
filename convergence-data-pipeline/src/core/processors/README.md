# Pipeline Processors

## Overview

Processors are the execution units that process individual pipeline steps. Each processor implements specific business logic for data processing, transformation, notification, or validation tasks.

---

## 🏗️ Core Architecture Philosophy

### ⚠️ CRITICAL: Processors Execute Pipeline Logic

**Convergence is a Pipeline-as-Code System** - Processors implement the business logic defined in YAML configs.

### Processor-Driven Execution

**How Processors Work**:
```
1. Config loaded from configs/ (defines WHAT to do)
2. Config specifies ps_type (e.g., "gcp.bq_etl")
3. System maps ps_type to processor class
4. Processor executes step (defines HOW to do it)
5. Results logged to tenant_pipeline_runs
```

**Processor Mapping**:
| ps_type | Processor Path | Purpose |
|---------|---------------|---------|
| `gcp.bq_etl` | `processors/providers/gcp/bq_etl.py` | BigQuery data extraction/transformation |
| `setup.bootstrap` | `processors/setup/initial/onetime_bootstrap_processor.py` | System bootstrap |
| `setup.tenants.onboarding` | `processors/setup/tenants/onboarding.py` | Tenant onboarding |
| `aws.s3_loader` | `processors/providers/aws/s3_loader.py` | AWS S3 data loading |
| `notify.email` | `processors/notifications/email_notification.py` | Email notifications |

### Core Components Working Together

**1. `configs/`** - Pipeline definitions (YAML)
   - Defines WHAT to execute
   - Specifies ps_type for each step
   - Provides variables and parameters

**2. `ps_templates/`** - Reusable step templates (YAML)
   - Common step patterns
   - Provider-specific templates

**3. `src/core/processors/` (THIS DIRECTORY)** - Execution logic (Python)
   - Implements HOW to execute steps
   - Provider-specific business logic
   - Referenced via ps_type in configs

### Development Rules

**When adding new processors**:
1. ✅ **DO**: Create processor class in appropriate subdirectory
2. ✅ **DO**: Inherit from `BaseProcessor` or appropriate parent class
3. ✅ **DO**: Implement `execute()` method with clear business logic
4. ✅ **DO**: Register ps_type mapping in processor registry
5. ✅ **DO**: Add comprehensive error handling and logging
6. ✅ **DO**: Write unit tests for processor logic
7. ❌ **DON'T**: Hardcode configuration values in processors
8. ❌ **DON'T**: Add business logic to API routers (belongs here)
9. ❌ **DON'T**: Skip input validation and error handling

**Example - Adding New Processor**:
```python
# File: src/core/processors/providers/gcp/iam_extractor.py

from src.core.processors.base_processor import BaseProcessor

class IAMExtractorProcessor(BaseProcessor):
    """
    Processor for extracting GCP IAM policies.
    ps_type: gcp.iam_extractor
    """

    def execute(self, config: dict) -> dict:
        """
        Execute IAM policy extraction.

        Args:
            config: Step configuration from YAML
                {
                    "source": {"project_id": "..."},
                    "destination": {"dataset_type": "...", "table": "..."}
                }

        Returns:
            {"status": "SUCCESS", "rows_processed": 100}
        """
        # 1. Validate config
        self.validate_config(config)

        # 2. Extract IAM policy
        project_id = config["source"]["project_id"]
        iam_data = self.extract_iam_policy(project_id)

        # 3. Load to BigQuery
        dataset = self.resolve_dataset(config["destination"]["dataset_type"])
        table = config["destination"]["table"]
        self.load_to_bigquery(dataset, table, iam_data)

        # 4. Return result
        return {
            "status": "SUCCESS",
            "rows_processed": len(iam_data)
        }

# Register in processor_registry.py:
PROCESSOR_REGISTRY = {
    "gcp.iam_extractor": "src.core.processors.providers.gcp.iam_extractor.IAMExtractorProcessor",
    # ... other processors
}
```

### Processor Best Practices

**1. Always Validate Config**:
```python
def execute(self, config: dict) -> dict:
    # ✅ CORRECT - Validate first
    required_fields = ["source", "destination"]
    for field in required_fields:
        if field not in config:
            raise ValueError(f"Missing required field: {field}")

    # Process config...
```

**2. Use Helper Methods**:
```python
class MyProcessor(BaseProcessor):
    def execute(self, config: dict) -> dict:
        data = self._extract_data(config["source"])
        transformed = self._transform_data(data)
        result = self._load_data(config["destination"], transformed)
        return result

    def _extract_data(self, source_config):
        # Focused helper method
        pass
```

**3. Comprehensive Error Handling**:
```python
def execute(self, config: dict) -> dict:
    try:
        result = self.process_data(config)
        return {"status": "SUCCESS", **result}
    except BigQueryError as e:
        self.logger.error(f"BigQuery error: {e}")
        return {"status": "FAILED", "error": str(e)}
    except Exception as e:
        self.logger.exception("Unexpected error")
        return {"status": "FAILED", "error": "Internal error"}
```

**4. Log Important Events**:
```python
def execute(self, config: dict) -> dict:
    self.logger.info(f"Starting extraction from {source_project}")
    rows = self.extract_data()
    self.logger.info(f"Extracted {len(rows)} rows")
    self.logger.info(f"Loading to {destination_table}")
    # ... continue
```

---

## Architecture

```
src/core/engines/
├── gcp/                    # Google Cloud Platform engines
│   └── bigquery_to_bigquery.py
├── aws/                    # AWS engines
│   └── s3_to_bigquery.py
├── customer/               # Customer management engines
│   └── onboarding.py
└── shared/                 # Shared utility engines
    ├── email_notification.py
    └── slack_notification.py
```

## Engine Types

### GCP Engines (`ps_type: gcp.*`)

#### `gcp.bigquery_to_bigquery`
- **Purpose**: Transfer data between BigQuery datasets with schema validation
- **Features**:
  - Schema template support from `templates/gcp/bigquery_to_bigquery/`
  - Variable replacement in SQL queries
  - Automatic table creation with partitioning/clustering
  - Support for append and overwrite modes
- **Use Cases**: Cost billing extraction, data transformations

**Example Configuration:**
```yaml
ps_type: "gcp.bigquery_to_bigquery"
source:
  bq_project_id: "source-project"
  query: "SELECT * FROM `table` WHERE date = '{date}'"
destination:
  bq_project_id: "dest-project"
  dataset_type: "gcp_silver_cost"
  table: "billing_cost_daily"
  schema_template: "billing_cost"
```

### AWS Engines (`ps_type: aws.*`)

#### `aws.s3_to_bigquery`
- **Purpose**: Load data from S3 into BigQuery
- **Features**:
  - Multi-file pattern support
  - Automatic schema detection
  - Compression support (gzip, bzip2)
  - Format detection (CSV, JSON, Parquet, Avro)

### Customer Engines (`ps_type: customer.*`)

#### `customer.onboarding`
- **Purpose**: Tenant onboarding and infrastructure validation
- **Features**:
  - Creates tenant dataset
  - Initializes per-tenant metadata tables (x_meta_*)
  - Validates BigQuery permissions
  - Generates API keys (stored in central tenants.tenant_api_keys)
- **Per-Tenant Metadata Tables Created**:
  - `tenant_pipeline_runs` - Execution tracking
  - `tenant_step_logs` - Detailed logs
  - `tenant_dq_results` - Data quality results
- **Note**: API keys and cloud credentials are stored in the central `tenants` dataset:
  - `tenants.tenant_api_keys` - Authentication
  - `tenants.tenant_cloud_credentials` - Encrypted credentials

### Shared Engines (`ps_type: shared.*`)

#### `shared.email_notification`
- **Purpose**: Send email notifications for pipeline events
- **Triggers**: `on_failure`, `on_success`, `on_completion`, `always`
- **Integration**: Uses notification service from `src/core/notifications/`

#### `shared.slack_notification`
- **Purpose**: Send Slack messages for pipeline events
- **Features**: Webhook support, rich formatting, thread replies

## Creating a New Engine

### Step 1: Create Engine File

```python
# src/core/engines/{provider}/{engine_name}.py
import logging
from typing import Dict, Any

class MyNewEngine:
    """Engine description"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        # Initialize resources

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute engine logic

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context (tenant_id, pipeline_id, etc.)

        Returns:
            Execution result with status and metrics
        """
        tenant_id = context.get("tenant_id")
        pipeline_id = context.get("pipeline_id")

        # Your logic here

        return {
            "status": "SUCCESS",
            "rows_processed": 100,
            "details": {}
        }

# Factory function (required)
def get_engine():
    return MyNewEngine()
```

### Step 2: Create Template (Optional)

```
templates/{provider}/{engine_name}/
├── config.yml              # Default configuration
└── schema_template.json    # BigQuery schema definitions
```

### Step 3: Use in Pipeline

```yaml
steps:
  - step_id: "my_step"
    name: "Process Data"
    ps_type: "{provider}.{engine_name}"
    config:
      # Engine-specific configuration
```

## Engine Interface

All engines must implement:

### Required Method: `execute()`
```python
async def execute(
    self,
    step_config: Dict[str, Any],
    context: Dict[str, Any]
) -> Dict[str, Any]:
```

**Parameters:**
- `step_config`: Configuration from pipeline YAML step
- `context`: Runtime context with keys:
  - `tenant_id` (str): Tenant identifier
  - `pipeline_id` (str): Pipeline identifier
  - `pipeline_logging_id` (str): Execution tracking ID
  - `step_id` (str): Current step identifier
  - `run_date` (str): Pipeline run date
  - `pipeline_status` (str): Current pipeline status
  - Variables from pipeline config

**Returns:** Dict with:
- `status` (str): `SUCCESS`, `FAILED`, or `SKIPPED`
- `rows_processed` (int, optional): Number of records processed
- Additional engine-specific fields

### Required Function: `get_engine()`
```python
def get_engine():
    """Factory function to instantiate engine"""
    return MyNewEngine()
```

## Engine Loading

Engines are loaded dynamically via `ps_type`:

```python
# Pipeline executor resolves ps_type to module path
ps_type = "gcp.bigquery_to_bigquery"
module_path = f"src.core.engines.{ps_type.replace('.', '.')}"
# → src.core.engines.gcp.bigquery_to_bigquery

# Import and instantiate
engine_module = importlib.import_module(module_path)
engine = engine_module.get_engine()
result = await engine.execute(step_config, context)
```

## Best Practices

### Logging
- Use structured logging with `logger.info()`, not `print()`
- Include context: `tenant_id`, `pipeline_id`, `step_id`
- Log important metrics: row counts, execution time

```python
self.logger.info(
    "Processing data",
    extra={
        "tenant_id": tenant_id,
        "pipeline_id": pipeline_id,
        "rows_count": len(rows)
    }
)
```

### Error Handling
- Raise descriptive exceptions
- Log errors with `exc_info=True`
- Return `{"status": "FAILED"}` on recoverable errors

```python
try:
    result = process_data()
except Exception as e:
    self.logger.error(f"Processing failed: {e}", exc_info=True)
    return {"status": "FAILED", "error": str(e)}
```

### Variable Replacement
- Support `{variable}` placeholders in configuration
- Replace variables from context dictionary

```python
query = step_config.get("query", "")
query = self._replace_variables(query, context)
```

### Schema Templates
- Define schemas in `templates/{provider}/{engine}/schema_template.json`
- Load at initialization, not per-execution
- Support multiple named schemas per template

## Testing

Create unit tests in `tests/unit/test_engines/`:

```python
import pytest
from src.core.engines.gcp.bigquery_to_bigquery import BigQueryToBigQueryEngine

@pytest.mark.asyncio
async def test_engine_execute():
    engine = BigQueryToBigQueryEngine()

    step_config = {...}
    context = {
        "tenant_id": "test_tenant",
        "pipeline_id": "test_pipeline"
    }

    result = await engine.execute(step_config, context)

    assert result["status"] == "SUCCESS"
    assert "rows_processed" in result
```

## Related Documentation

- **Pipeline Execution**: `src/core/pipeline/README.md`
- **Template System**: `templates/README.md`
- **Configuration**: `configs/README.md`
- **Notifications**: `src/core/notifications/` (service.py, providers/)

## Support

For questions or issues with engines:
1. Check engine source code comments
2. Review template examples in `templates/`
3. See existing pipeline configs in `configs/`
4. Contact: data-ops@company.com
