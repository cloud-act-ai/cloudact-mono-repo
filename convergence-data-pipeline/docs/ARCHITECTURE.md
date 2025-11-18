# Convergence Data Pipeline - Architecture

**Version**: 2.1.0 | **Updated**: 2025-11-18 | **Type**: Multi-tenant Data Pipeline Backend

---

## 1. Core Architecture Principles

### Single Dataset Per Tenant

The system uses a **single BigQuery dataset per tenant** model for simplicity and isolation:

```
Project: gac-prod-471220
├── {tenant_id}                      # Single dataset per tenant (NOT split by type)
│   ├── x_meta_api_keys              # Metadata: API authentication
│   ├── x_meta_pipeline_runs         # Metadata: Pipeline execution history
│   ├── x_meta_step_logs             # Metadata: Step-level execution logs
│   ├── x_meta_dq_results            # Metadata: Data quality results
│   ├── x_meta_cloud_credentials     # Metadata: Encrypted provider credentials
│   ├── x_meta_pipeline_queue        # Metadata: Execution queue
│   ├── x_meta_scheduled_runs        # Metadata: Scheduled execution tracking
│   │
│   ├── billing_cost_daily           # Data: GCP billing (example)
│   ├── aws_cost_cur                 # Data: AWS cost usage (example)
│   └── [other business tables]      # Data: Additional domain-specific tables
└── tenants                          # Central management dataset (shared)
    ├── tenant_profiles
    ├── tenant_subscriptions
    └── ...
```

**Key Benefits**:
- Simple naming: `{tenant_id}` (no `{tenant_id}_{dataset_type}` complexity)
- Metadata tables prefixed with `x_meta_` for discoverability
- All tenant data in single location for easy access control
- Single schema per tenant for consistent isolation

### Dynamic Pipeline ID with Template Substitution

Pipeline IDs use template variables that are dynamically substituted at runtime:

```yaml
# configs/gcp/cost/cost_billing.yml
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract GCP billing costs for tenant {tenant_id} - date {date}"

# At runtime for tenant "acme_corp":
# → pipeline_id becomes: "acme_corp-gcp-cost-billing"
```

**Supported Variables**:
- `{tenant_id}` - Tenant identifier (required)
- `{date}` - Run date (supplied by API or scheduler)
- `{run_date}` - Full timestamp of execution
- Custom variables from step configuration

### Metadata Tables with x_meta_ Prefix

All system metadata tables follow a consistent naming pattern:

```
x_meta_api_keys              # Authentication and API key management
x_meta_cloud_credentials     # Encrypted provider credentials (GCP, AWS, Azure)
x_meta_pipeline_runs         # Pipeline execution history with status tracking
x_meta_step_logs             # Detailed step-by-step execution logs
x_meta_dq_results            # Data quality validation results
x_meta_pipeline_queue        # Active execution queue
x_meta_scheduled_runs        # Scheduled execution history
```

---

## 2. Pipeline Processors (ps_type)

Pipeline processors are the execution engines for each pipeline step. Located in `/src/core/processors/`, they follow a provider-based naming convention: `{provider}.{processor_name}`.

### Available Processors

#### GCP Processors (`src/core/processors/gcp/`)

**gcp.bq_etl** - BigQuery Extract-Transform-Load
```python
# src/core/processors/gcp/bq_etl.py
class BigQueryETLEngine:
    """BigQuery to BigQuery data transfer with schema support"""
```

**Purpose**: Extract data from BigQuery source, optionally transform via SQL, load to destination table

**Capabilities**:
- Execute SQL queries on source BigQuery table
- Variable replacement in queries (`{variable}` syntax)
- Schema template support for table creation
- Write modes: `append` or `overwrite`
- Table partitioning and clustering configuration

**Example Configuration**:
```yaml
- step_id: "extract_billing"
  ps_type: "gcp.bq_etl"

  source:
    bq_project_id: "gac-prod-471220"
    query: |
      SELECT *
      FROM `{source_billing_table}`
      WHERE DATE(usage_start_time) = '{date}'

  destination:
    bq_project_id: "gac-prod-471220"
    dataset_type: "gcp_silver_cost"      # Optional: for documentation
    table: "{destination_table}"         # Table name (supports variables)
    write_mode: "append"                 # or "overwrite"
    schema_template: "billing_cost"      # From ps_templates/gcp/bq_etl/schema_template.json
```

**Schema Template Reference**:
- Location: `ps_templates/gcp/bq_etl/schema_template.json`
- Contains predefined BigQuery schemas (e.g., `billing_cost`)
- Empty schema list `[]` means auto-detect from query results

---

#### Setup Processors (`src/core/processors/setup/`)

**setup.initial.onetime_bootstrap_processor** - System Bootstrap
```python
# src/core/processors/setup/initial/onetime_bootstrap_processor.py
```
**Purpose**: One-time system initialization (rarely used after deployment)

**setup.tenants.onboarding** - Tenant Onboarding
```python
# src/core/processors/setup/tenants/onboarding.py
class TenantOnboardingProcessor:
    """Creates tenant dataset and metadata infrastructure"""
```

**Purpose**: Create new tenant infrastructure during onboarding

**Metadata Tables Created**:
- `x_meta_api_keys` - API authentication tokens
- `x_meta_cloud_credentials` - Encrypted provider credentials
- `x_meta_pipeline_runs` - Execution history
- `x_meta_step_logs` - Step execution logs
- `x_meta_dq_results` - Data quality results
- `x_meta_pipeline_queue` - Execution queue
- `x_meta_scheduled_runs` - Scheduled execution tracking

**Schema Templates**: `ps_templates/setup/tenants/onboarding/schemas/`

**Example Configuration**:
```yaml
- step_id: "create_infrastructure"
  ps_type: "setup.tenants.onboarding"
  config:
    gcp_project_id: "gac-prod-471220"
    dataset_id: "{tenant_id}"
    location: "US"
```

---

#### Notification Processors (`src/core/processors/notify_systems/`)

**notify_systems.email_notification** - Email Alerts
```python
# src/core/processors/notify_systems/email_notification.py
class EmailNotificationEngine:
    """Send email notifications for pipeline events"""
```

**Purpose**: Send email notifications on pipeline events (success, failure, completion)

**Triggers**:
- `on_failure` - Send when pipeline fails
- `on_success` - Send when pipeline succeeds
- `on_completion` - Send on any completion (success or failure)
- `always` - Always send

**Severity Mapping**:
- `on_failure` → ERROR
- `on_warning` → WARNING
- `on_success` → INFO

**Example Configuration**:
```yaml
- step_id: "notify_failure"
  ps_type: "notify_systems.email_notification"
  trigger: "on_failure"
  to_emails:
    - "admin@company.com"
    - "data-ops@company.com"
  subject: "Pipeline {pipeline_id} Failed - Tenant {tenant_id}"
  message: |
    Pipeline execution failed!

    Tenant: {tenant_id}
    Pipeline: {pipeline_id}
    Status: {pipeline_status}
    Error: {error_message}
```

---

### Creating a New Processor

**Step 1: Create Processor File**

```python
# src/core/processors/{provider}/{processor_name}.py
import logging
from typing import Dict, Any

class MyProcessor:
    """Processor description"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute processor logic

        Args:
            step_config: Configuration from pipeline step
            context: Runtime context (tenant_id, pipeline_id, date, etc.)

        Returns:
            Dict with status and execution details
        """
        tenant_id = context.get("tenant_id")
        pipeline_id = context.get("pipeline_id")

        self.logger.info(
            "Processing data",
            extra={
                "tenant_id": tenant_id,
                "pipeline_id": pipeline_id,
                "step_id": context.get("step_id")
            }
        )

        # Your logic here

        return {
            "status": "SUCCESS",  # or "FAILED", "SKIPPED"
            "rows_processed": 100,
            "details": {}
        }

# Factory function (REQUIRED)
def get_engine():
    return MyProcessor()
```

**Step 2: Register in Pipeline Configuration**

```yaml
steps:
  - step_id: "my_step"
    ps_type: "{provider}.{processor_name}"
    config:
      # Processor-specific configuration
```

**Step 3: Optional - Create Schema Template**

```
ps_templates/{provider}/{processor_name}/
├── config.yml           # Default settings
└── schema_template.json # BigQuery schemas
```

---

## 3. Pipeline Configuration (ps_templates)

Pipeline templates define reusable configurations for processors. Located at `/ps_templates/`, organized by provider.

### Directory Structure

```
ps_templates/
├── gcp/
│   └── bq_etl/
│       ├── config.yml
│       └── schema_template.json
├── aws/
│   └── s3_data_loader/
│       ├── config.yml
│       └── schema_template.json
├── setup/
│   ├── initial/
│   │   ├── config.yml
│   │   └── schemas/
│   └── tenants/
│       └── onboarding/
│           ├── config.yml
│           ├── schema.json
│           └── schemas/
│               ├── x_meta_api_keys.json
│               ├── x_meta_pipeline_runs.json
│               ├── x_meta_step_logs.json
│               ├── x_meta_dq_results.json
│               └── ...
└── notify_systems/
    ├── email_notification/
    │   └── config.yml
    └── slack_notification/
        └── config.yml
```

### Schema Template Format

**Location**: `ps_templates/{provider}/{processor}/schema_template.json`

```json
{
  "description": "Schema template for BigQuery tables",
  "schemas": {
    "billing_cost": {
      "description": "GCP billing cost data",
      "fields": [
        {
          "name": "billing_account_id",
          "type": "STRING",
          "mode": "REQUIRED",
          "description": "GCP billing account ID"
        },
        {
          "name": "cost",
          "type": "FLOAT64",
          "mode": "REQUIRED",
          "description": "Total cost in billing currency"
        },
        {
          "name": "ingestion_date",
          "type": "DATE",
          "mode": "REQUIRED",
          "description": "Partition key - partition by day"
        }
      ]
    },
    "default": {
      "description": "Auto-detect schema from data",
      "fields": []
    }
  }
}
```

**Field Types**:
- `STRING`, `INT64`, `FLOAT64`, `BOOLEAN`
- `DATE`, `TIMESTAMP`, `DATETIME`
- `NUMERIC`, `BIGNUMERIC` (for precision)
- `BYTES`, `JSON` (flexible storage)
- `RECORD` (nested structures)

**Field Modes**:
- `REQUIRED` - Field must always have a value
- `NULLABLE` - Field can be null (default)
- `REPEATED` - Array field

### Variable Substitution Hierarchy

Variables are replaced in order of priority (lowest → highest):

1. **Context Variables** (pipeline execution context)
   - `tenant_id`, `pipeline_id`, `run_date`, `date`, etc.

2. **Pipeline-Level Variables** (from `variables:` section)
   ```yaml
   variables:
     source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_v1"
     destination_table: "billing_cost_daily"
   ```

3. **Step-Level Variables** (from step `variables:` section)
   ```yaml
   steps:
     - step_id: "extract"
       variables:
         date: "2025-11-18"  # Overrides pipeline-level
   ```

**Example**:
```yaml
pipeline_id: "{tenant_id}-gcp-cost-billing"
variables:
  source_table: "billing_export"
  date: "2025-01-01"

steps:
  - step_id: "extract"
    source:
      query: "SELECT * FROM `{source_table}` WHERE DATE(created) = '{date}'"
    # At runtime: SELECT * FROM `billing_export` WHERE DATE(created) = '2025-01-01'
```

---

## 4. Pipeline Configuration Files (configs/)

Pipeline configurations are stored in `/configs/` organized by provider and domain.

### Directory Structure

```
configs/
├── setup/
│   ├── bootstrap_system.yml              # One-time system setup
│   └── tenants/
│       └── onboarding.yml                # Tenant onboarding template
├── gcp/
│   ├── cost/
│   │   └── cost_billing.yml              # GCP billing extraction
│   ├── example/
│   │   └── dryrun.yml                    # Example/test pipeline
│   └── [domain]/
├── aws/
│   └── [domain]/
├── metadata/
│   └── schemas/                          # Metadata schema definitions
├── notifications/                        # Notification configurations
├── data_quality/
│   └── expectations/                     # Data quality expectations
└── examples/
    ├── pipeline_with_email_notification.yml
    ├── pipeline_with_slack_notification.yml
    └── pipeline_with_combined_notifications.yml
```

### Pipeline Configuration Structure

**File**: `configs/{provider}/{domain}/{pipeline_name}.yml`

```yaml
# Pipeline metadata
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract GCP billing costs for tenant {tenant_id}"

# Pipeline-level variables (can be overridden via API)
variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_v1"
  destination_dataset_type: "gcp_silver_cost"
  destination_table: "billing_cost_daily"
  admin_email: "admin@example.com"

# Pipeline steps
steps:
  # Step 1: Data extraction and transformation
  - step_id: "extract_billing_costs"
    name: "Extract GCP Billing Costs"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 20

    source:
      bq_project_id: "gac-prod-471220"
      query: |
        SELECT
          billing_account_id,
          service.description AS service_name,
          cost,
          usage_start_time,
          usage_end_time,
          CURRENT_DATE() AS ingestion_date
        FROM `{source_billing_table}`
        WHERE DATE(usage_start_time) = '{date}'

    destination:
      bq_project_id: "gac-prod-471220"
      table: "{destination_table}"
      write_mode: "append"
      schema_template: "billing_cost"
      table_config:
        time_partitioning:
          field: "ingestion_date"
          type: "DAY"
          expiration_days: 730
        clustering_fields:
          - "billing_account_id"
          - "service_name"

  # Step 2: Email notification on failure
  - step_id: "notify_failure"
    name: "Send Failure Alert"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"
    to_emails:
      - "{admin_email}"
    subject: "[ALERT] Cost Pipeline Failed - {tenant_id}"
    message: |
      Pipeline execution failed!

      Details: {error_message}
      Logs: {tenant_id}.x_meta_step_logs
```

---

## 5. Directory Structure

### Root Layout

```
/
├── src/
│   ├── core/
│   │   ├── processors/          # Pipeline step processors
│   │   │   ├── gcp/
│   │   │   │   └── bq_etl.py
│   │   │   ├── aws/
│   │   │   ├── notify_systems/
│   │   │   │   └── email_notification.py
│   │   │   └── setup/
│   │   │       ├── initial/
│   │   │       └── tenants/
│   │   ├── pipeline/            # Pipeline execution engine
│   │   │   ├── executor.py      # Main executor
│   │   │   └── async_executor.py
│   │   ├── engine/              # Core engines
│   │   ├── metadata/            # Metadata logging
│   │   ├── notifications/       # Notification service
│   │   └── ...
│   └── app/
│       └── main.py              # FastAPI application
├── configs/                     # Pipeline configurations
│   ├── setup/
│   ├── gcp/
│   ├── aws/
│   └── examples/
├── ps_templates/                # Pipeline processor templates
│   ├── gcp/
│   │   └── bq_etl/
│   ├── setup/
│   └── notify_systems/
├── docs/                        # Documentation
│   ├── ARCHITECTURE.md          # This file
│   ├── api/
│   ├── guides/
│   ├── reference/
│   └── operations/
├── tests/                       # Test suites
├── deployment/                  # Deployment configuration
├── Dockerfile
└── requirements.txt
```

### Processor Directory Details

```
src/core/processors/
├── __init__.py
├── README.md                    # Processor documentation
├── gcp/
│   ├── __init__.py
│   ├── bq_etl.py               # BigQuery ETL processor
│   └── [other GCP processors]
├── aws/
│   └── [AWS processors]
├── notify_systems/
│   ├── __init__.py
│   └── email_notification.py    # Email notification processor
└── setup/
    ├── initial/
    │   ├── __init__.py
    │   └── onetime_bootstrap_processor.py
    └── tenants/
        ├── __init__.py
        └── onboarding.py        # Tenant onboarding processor
```

### Template Directory Details

```
ps_templates/
├── gcp/
│   └── bq_etl/
│       ├── config.yml           # Default configuration
│       └── schema_template.json # BigQuery schemas (billing_cost, etc.)
├── aws/
│   └── s3_data_loader/
│       ├── config.yml
│       └── schema_template.json
├── setup/
│   ├── initial/
│   │   ├── config.yml
│   │   └── schemas/
│   │       ├── tenant_profiles.json
│   │       ├── tenant_api_keys.json
│   │       └── ...
│   └── tenants/
│       └── onboarding/
│           ├── config.yml
│           ├── schema.json
│           └── schemas/
│               ├── x_meta_api_keys.json
│               ├── x_meta_pipeline_runs.json
│               ├── x_meta_step_logs.json
│               ├── x_meta_dq_results.json
│               ├── x_meta_cloud_credentials.json
│               ├── x_meta_pipeline_queue.json
│               └── x_meta_scheduled_runs.json
└── notify_systems/
    ├── email_notification/
    │   └── config.yml
    └── slack_notification/
        └── config.yml
```

---

## 6. Key Design Decisions

### Why Single Dataset Per Tenant?

**Advantages**:
- **Simplicity** - Single naming convention: `{tenant_id}`
- **Discoverability** - All tenant data in one location
- **Access Control** - Dataset-level IAM permissions align with tenants
- **Query Efficiency** - No cross-dataset joins needed
- **Cost Tracking** - Clear BigQuery billing per tenant

**Alternative (Rejected)**:
```
# NOT used: {tenant_id}_{dataset_type}
- Increases naming complexity
- Requires logic to determine dataset_type
- Makes schema evolution harder
```

### Why Metadata Prefix x_meta_?

**Purpose**:
- **Visibility** - System tables clearly marked with `x_meta_` prefix
- **Convention** - Follows BigQuery best practices
- **Querying** - Easy to list metadata tables: `LIKE 'x_meta_%'`
- **Isolation** - Separates business data from system metadata

**Examples**:
```sql
-- All metadata tables
SELECT table_name FROM `{tenant_id}.__TABLES__`
WHERE table_name LIKE 'x_meta_%'

-- All business data tables
SELECT table_name FROM `{tenant_id}.__TABLES__`
WHERE table_name NOT LIKE 'x_meta_%'
```

### Why Variable Substitution at Runtime?

**Rationale**:
- **Reusability** - Single pipeline config works for multiple tenants
- **Dynamic Dates** - Supports date-based partitioning without config changes
- **Multi-Tenant** - Template variables like `{tenant_id}` enable single config per pipeline type
- **Flexibility** - Override variables via API without modifying YAML

**Example**:
```yaml
# One config supports all tenants
pipeline_id: "{tenant_id}-cost-pipeline"  # → acme_corp-cost-pipeline, other_tenant-cost-pipeline

# Runtime substitution
source_table: "SELECT * FROM {source_table} WHERE date = '{date}'"
```

### Why Processors as Python Modules?

**Design**:
- **Dynamic Loading** - `ps_type` string maps to Python module via `importlib`
- **Scalability** - Easy to add new processors without modifying core
- **Testing** - Each processor can be unit tested independently
- **Isolation** - Processor dependencies don't affect core pipeline

**Module Mapping**:
```python
# ps_type: "gcp.bq_etl"
# → src.core.processors.gcp.bq_etl
# → BigQueryETLEngine class via get_engine()

ps_type = "gcp.bq_etl"
module_path = f"src.core.processors.{ps_type.replace('.', '.')}"
module = importlib.import_module(module_path)
processor = module.get_engine()
result = await processor.execute(step_config, context)
```

---

## 7. Pipeline Execution Flow

### API-Triggered Pipeline

```
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}
Header: X-API-Key: {api_key}
Body: {"date": "2025-11-18", "variables": {"admin_email": "user@example.com"}}

Flow:
1. Load pipeline config: configs/{provider}/{domain}/{template_name}.yml
2. Validate tenant access via API key
3. Check quota and rate limits
4. Merge variables: context + pipeline-level + step-level + request body
5. For each step:
   - Resolve ps_type to Python processor module
   - Replace variables in step_config
   - Execute processor async
   - Log results to x_meta_step_logs
6. On completion:
   - Log to x_meta_pipeline_runs
   - Send notifications (if configured)
   - Return execution results
```

### Variable Resolution Order

```
1. Context variables (tenant_id, pipeline_id, date, run_date)
2. Pipeline-level variables (configs/{provider}/{domain}/{template}.yml)
3. Step-level variables (override pipeline-level)
4. Request body variables (highest priority)

Example: date = "2025-11-18"
If specified in step config: use step value
Else if specified in request: use request value
Else if specified in pipeline: use pipeline value
Else use context date
```

---

## 8. Integration Example

### Complete Pipeline Configuration

```yaml
# configs/gcp/cost/cost_billing.yml
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract GCP billing for {tenant_id} on {date}"

variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_v1"
  destination_table: "billing_cost_daily"
  admin_email: "admin@example.com"

steps:
  # Step 1: Extract and load
  - step_id: "load_billing"
    ps_type: "gcp.bq_etl"
    source:
      bq_project_id: "gac-prod-471220"
      query: |
        SELECT
          billing_account_id,
          service_id,
          cost,
          CURRENT_DATE() as ingestion_date
        FROM `{source_billing_table}`
        WHERE DATE(usage_start_time) = '{date}'

    destination:
      table: "{destination_table}"
      write_mode: "append"
      schema_template: "billing_cost"

  # Step 2: Success notification
  - step_id: "notify_success"
    ps_type: "notify_systems.email_notification"
    trigger: "on_success"
    to_emails:
      - "{admin_email}"
    subject: "Cost pipeline completed - {date}"
    message: "Pipeline {pipeline_id} completed successfully"

  # Step 3: Failure notification
  - step_id: "notify_failure"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"
    to_emails:
      - "{admin_email}"
    subject: "ALERT: Cost pipeline failed"
    message: "Error: {error_message}"
```

### Schema Template

```json
{
  "schemas": {
    "billing_cost": {
      "description": "GCP billing cost data",
      "fields": [
        {"name": "billing_account_id", "type": "STRING", "mode": "REQUIRED"},
        {"name": "service_id", "type": "STRING", "mode": "NULLABLE"},
        {"name": "cost", "type": "FLOAT64", "mode": "REQUIRED"},
        {"name": "ingestion_date", "type": "DATE", "mode": "REQUIRED"}
      ]
    }
  }
}
```

### API Call Example

```bash
curl -X POST \
  http://localhost:8000/api/v1/pipelines/run/acme_corp/gcp/cost/cost_billing \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-18",
    "variables": {
      "admin_email": "user@acme.example.com"
    }
  }'

# Response:
{
  "pipeline_logging_id": "uuid-here",
  "tenant_id": "acme_corp",
  "pipeline_id": "acme_corp-gcp-cost-billing",
  "status": "RUNNING",
  "started_at": "2025-11-18T10:30:00Z"
}
```

---

## 9. Metadata Logging

### Pipeline Execution Metadata

All pipeline executions are logged to `{tenant_id}.x_meta_pipeline_runs`:

```
pipeline_logging_id  | tenant_id   | pipeline_id               | status    | started_at
uuid-12345           | acme_corp   | acme_corp-gcp-cost-billing | SUCCESS  | 2025-11-18T10:30:00Z
```

### Step Execution Logs

Detailed step logs are written to `{tenant_id}.x_meta_step_logs`:

```
pipeline_logging_id  | step_id         | ps_type        | status   | rows_processed
uuid-12345           | load_billing    | gcp.bq_etl     | SUCCESS  | 1000
uuid-12345           | notify_success  | notify_systems.email_notification | SUCCESS | 0
```

### Data Quality Results

Data quality validation results are stored in `{tenant_id}.x_meta_dq_results`:

```
pipeline_logging_id  | table_name     | check_name      | status  | row_count
uuid-12345           | billing_cost_daily | not_null_check  | PASSED  | 1000
```

---

## 10. Best Practices

### Pipeline Configuration

1. **Use descriptive pipeline IDs**
   ```yaml
   pipeline_id: "{tenant_id}-gcp-cost-daily"  # Good
   pipeline_id: "pipeline1"                    # Bad
   ```

2. **Organize configs by provider and domain**
   ```
   configs/gcp/cost/billing.yml        # Good
   configs/pipelines/my_pipeline.yml   # Bad
   ```

3. **Document variables**
   ```yaml
   variables:
     source_billing_table: "gac-prod-471220.cloudact_cost_usage..."  # Source billing table
     admin_email: "admin@example.com"                                # Admin email for alerts
   ```

4. **Use schema templates for consistency**
   ```yaml
   destination:
     schema_template: "billing_cost"  # References ps_templates/.../schema_template.json
   ```

### Processor Development

1. **Always include logging**
   ```python
   self.logger.info(
       "Processing data",
       extra={
           "tenant_id": tenant_id,
           "pipeline_id": pipeline_id,
           "step_id": context.get("step_id")
       }
   )
   ```

2. **Support variable replacement**
   ```python
   query = step_config.get("query", "")
   query = self._replace_variables(query, context)
   ```

3. **Return proper status**
   ```python
   return {
       "status": "SUCCESS",  # or "FAILED", "SKIPPED"
       "rows_processed": count,
       "details": {...}
   }
   ```

---

## 11. Common Workflows

### Adding a New Pipeline

1. Create config file
   ```bash
   touch configs/gcp/billing/new_pipeline.yml
   ```

2. Define pipeline and steps
   ```yaml
   pipeline_id: "{tenant_id}-new-pipeline"
   steps:
     - step_id: "extract"
       ps_type: "gcp.bq_etl"
       # ... configuration ...
   ```

3. Create or reference schema template
   ```bash
   # Reference existing: schema_template: "billing_cost"
   # Or create new: ps_templates/gcp/bq_etl/schema_template.json
   ```

4. Test via API
   ```bash
   curl -X POST \
     http://localhost:8000/api/v1/pipelines/run/{tenant_id}/gcp/billing/new_pipeline \
     -H "X-API-Key: $API_KEY" \
     -d '{"date": "2025-11-18"}'
   ```

### Adding a New Processor

1. Create processor file
   ```bash
   touch src/core/processors/{provider}/{processor_name}.py
   ```

2. Implement execute() and get_engine()
   ```python
   class MyProcessor:
       async def execute(self, step_config, context):
           # Implementation
           return {"status": "SUCCESS", ...}

   def get_engine():
       return MyProcessor()
   ```

3. Use in pipeline
   ```yaml
   steps:
     - step_id: "my_step"
       ps_type: "{provider}.{processor_name}"
   ```

---

## 12. Related Documentation

- **[API Reference](api/API.md)** - REST API endpoints
- **[Deployment Guide](../deployment/README.md)** - Production deployment
- **[Quick Start](guides/QUICK_START.md)** - Get started quickly
- **[Troubleshooting](operations/TROUBLESHOOTING.md)** - Common issues

---

**Last Updated**: 2025-11-18
**Maintainer**: Data Pipeline Team
