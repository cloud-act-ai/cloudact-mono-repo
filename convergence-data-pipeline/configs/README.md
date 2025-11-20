# Pipeline Configurations

## Overview

Pipeline configurations define the workflow steps, data sources, transformations, and destinations for each data processing pipeline. Configurations support multi-tenant architecture with template variables for reusability.

---

## 🏗️ Core Architecture Philosophy

### ⚠️ CRITICAL: Configs Are the Heart of the System

**Convergence is a Pipeline-as-Code System** - ALL pipeline logic is defined in YAML configurations, NOT hardcoded in Python.

### Config-Driven Architecture

**Everything is defined in `configs/`**:
- Bootstrap operations (`configs/setup/bootstrap_system.yml`)
- Tenant onboarding (`configs/setup/tenants/onboarding.yml`)
- Provider pipelines (`configs/gcp/cost/`, `configs/aws/cost/`, etc.)
- Custom pipelines (`configs/custom/`)

**How Configs Work**:
```
1. API receives pipeline trigger request
2. System loads YAML config from configs/{provider}/{domain}/{pipeline}.yml
3. Resolves variables ({tenant_id}, {date}, etc.)
4. Passes config to appropriate processor
5. Processor executes steps defined in config
6. Results logged to tenant_pipeline_runs
```

### Core Components Working Together

**1. `configs/` (THIS DIRECTORY)** - Pipeline definitions (YAML)
   - What to execute
   - What data to process
   - Where to store results
   - What variables to use

**2. `ps_templates/`** - Reusable step templates (YAML)
   - Common step patterns
   - Provider-specific templates
   - Shared across multiple pipelines

**3. `src/core/processors/`** - Execution logic (Python)
   - How to execute config steps
   - Provider-specific implementations
   - Business logic for each ps_type

### Development Rules

**When adding new pipelines**:
1. ✅ **DO**: Create YAML config in appropriate `configs/` subdirectory
2. ✅ **DO**: Use template variables for reusability
3. ✅ **DO**: Define all business logic in processor, reference via `ps_type`
4. ✅ **DO**: Test with dry-run before production use
5. ❌ **DON'T**: Hardcode tenant-specific values in shared configs
6. ❌ **DON'T**: Add business logic to configs (belongs in processors)
7. ❌ **DON'T**: Store sensitive data (API keys, passwords) in configs

**Example - Adding New Pipeline**:
```yaml
# 1. Create config: configs/gcp/security/iam_audit.yml
pipeline_id: "{tenant_id}_gcp_iam_audit"
description: "Audit GCP IAM permissions for {tenant_id}"

variables:
  source_project: "gac-prod-471220"
  destination_dataset_type: "tenant_dataset"

steps:
  - step_id: "extract_iam_policy"
    ps_type: "gcp.iam_extractor"  # References processor
    source:
      project_id: "{source_project}"
    destination:
      dataset_type: "{destination_dataset_type}"
      table: "iam_audit_log"

# 2. Processor already exists: src/core/processors/providers/gcp/iam_extractor.py
# 3. Template exists: ps_templates/gcp/security/iam_audit.yml
# 4. Ready to use!
```

### Config Best Practices

**1. Always Use Template Variables**:
```yaml
# ✅ CORRECT - Reusable
pipeline_id: "{tenant_id}_gcp_cost_billing"
query: "SELECT * FROM `{source_table}` WHERE date = '{date}'"

# ❌ WRONG - Hardcoded
pipeline_id: "acme_corp_gcp_cost_billing"
query: "SELECT * FROM table WHERE date = '2025-11-15'"
```

**2. Define Variables Section**:
```yaml
variables:
  source_table: "project.dataset.table"
  destination_dataset: "tenant_dataset"
  admin_email: "admin@example.com"
# All referenced in steps below
```

**3. Use Descriptive IDs**:
```yaml
steps:
  - step_id: "extract_billing_from_gcp_export"  # ✅ Clear
    name: "Extract GCP Billing Data"

  - step_id: "step1"  # ❌ Unclear
    name: "Process"
```

**4. Reference Processors via ps_type**:
```yaml
steps:
  - step_id: "extract_data"
    ps_type: "gcp.bq_etl"  # References: src/core/processors/providers/gcp/bq_etl.py
```

---

## Directory Structure

```
configs/
├── customer/                  # Customer/tenant management
│   └── onboarding.yml
├── gcp/                       # Google Cloud Platform pipelines
│   ├── cost/
│   │   ├── README.md
│   │   └── cost_billing.yml
│   └── example/
│       └── dryrun.yml
├── aws/                       # AWS pipelines (future)
│   └── ...
├── notifications/             # Notification configurations
│   └── README.md
└── {tenant_id}/              # Tenant-specific overrides (optional)
    └── gcp/
        └── cost/
            └── cost_billing.yml
```

## Configuration Hierarchy

The system searches for pipeline configurations in this order:

1. **Tenant-specific:** `configs/{tenant_id}/{provider}/{domain}/{pipeline_id}.yml`
2. **Shared template:** `configs/{provider}/{domain}/{pipeline_id}.yml`

This allows:
- **Default behavior:** All tenants use shared templates
- **Custom overrides:** Specific tenants can override with custom configs

### Example

**Shared Template:**
```yaml
# configs/gcp/cost/cost_billing.yml
pipeline_id: "{tenant_id}-gcp-cost-billing"
variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_*"
```

**Tenant Override:**
```yaml
# configs/acme_corp/gcp/cost/cost_billing.yml
pipeline_id: "{tenant_id}-custom-billing"
variables:
  source_billing_table: "acme-project.acme_billing.export_v2"
  # Overrides shared template
```

## Configuration Format

### Basic Structure

```yaml
pipeline_id: "{tenant_id}-pipeline-name"
description: "Human-readable description with {variables}"

# Optional: Pipeline-level variables
variables:
  var_name: "value"
  filter_date: "{date}"

steps:
  - step_id: "unique_step_id"
    name: "Human-readable step name"
    ps_type: "provider.engine_type"
    timeout_minutes: 30
    trigger: "always"  # or on_failure, on_success

    # Engine-specific configuration
    source:
      # Source configuration
    destination:
      # Destination configuration
    config:
      # Additional engine config
```

### Required Fields

| Field | Level | Description |
|-------|-------|-------------|
| `pipeline_id` | Pipeline | Unique identifier (can use variables) |
| `steps` | Pipeline | Array of step configurations |
| `step_id` | Step | Unique identifier within pipeline |
| `ps_type` | Step | Engine type (e.g., `gcp.bq_etl`) |

### Optional Fields

| Field | Level | Default | Description |
|-------|-------|---------|-------------|
| `description` | Pipeline | "" | Pipeline description |
| `variables` | Pipeline | {} | Custom variables |
| `name` | Step | step_id | Human-readable step name |
| `timeout_minutes` | Step | 30 | Maximum execution time |
| `trigger` | Step | "always" | Execution condition |

## Variable Substitution

### Built-in Variables

Available in all configurations:

| Variable | Source | Example |
|----------|--------|---------|
| `{tenant_id}` | URL path | "acme_corp" |
| `{provider}` | URL path | "gcp" |
| `{domain}` | URL path | "cost" |
| `{template_name}` | URL path | "cost_billing" |
| `{date}` | Request body | "2025-11-15" |
| `{trigger_by}` | Request body | "scheduler" |
| `{pipeline_id}` | Generated | "acme_corp-gcp-cost-billing" |

### Custom Variables

Define in pipeline configuration:

```yaml
variables:
  source_table: "project.dataset.table"
  destination_dataset: "gcp_silver_cost"
  admin_email: "admin@example.com"

steps:
  - step_id: "extract"
    source:
      query: "SELECT * FROM `{source_table}`"  # Uses custom variable
    destination:
      dataset_type: "{destination_dataset}"    # Uses custom variable
```

### Runtime Overrides

Override variables via API request body:

```bash
curl -X POST "/api/v1/pipelines/run/acme_corp/gcp/cost/cost_billing" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-15",
    "parameters": {
      "source_table": "custom-project.dataset.table",  # Override
      "admin_email": "ops@acme.com"                   # Override
    }
  }'
```

## Step Triggers

Control when steps execute based on previous step results:

```yaml
steps:
  - step_id: "extract_data"
    ps_type: "gcp.bq_etl"
    trigger: "always"  # Always runs

  - step_id: "send_success_email"
    ps_type: "notify_systems.email_notification"
    trigger: "on_success"  # Only if previous steps succeeded

  - step_id: "send_failure_alert"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"  # Only if any step failed
```

**Trigger Values:**
- `always` (default): Always execute
- `on_success`: Execute only if all previous steps succeeded
- `on_failure`: Execute only if any previous step failed
- `on_completion`: Execute regardless of success/failure

## Configuration Examples

### GCP Cost Billing Pipeline

```yaml
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract GCP billing costs for tenant {tenant_id} - date {date}"

variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_*"
  destination_dataset_type: "gcp_silver_cost"
  destination_table: "billing_cost_daily"
  admin_email: "admin@example.com"

steps:
  - step_id: "extract_billing_costs"
    name: "Extract GCP Billing Costs"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 20

    source:
      bq_project_id: "gac-prod-471220"
      query: |
        SELECT
          billing_account_id,
          service.id AS service_id,
          cost,
          usage_start_time,
          ingestion_date
        FROM `{source_billing_table}`
        WHERE DATE(usage_start_time) = '{date}'
        LIMIT 1000

    destination:
      bq_project_id: "gac-prod-471220"
      dataset_type: "{destination_dataset_type}"
      table: "{destination_table}"
      write_mode: "append"
      schema_template: "billing_cost"

  - step_id: "notify_on_failure"
    name: "Send Failure Notification"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"
    to_emails:
      - "{admin_email}"
    subject: "[ALERT] Cost Billing Pipeline Failed - {tenant_id}"
    message: |
      The GCP cost billing pipeline has failed.
      Tenant: {tenant_id}
      Date: {date}
```

### Customer Onboarding Pipeline

```yaml
pipeline_id: "{tenant_id}-customer-onboarding"
description: "Onboard new tenant {tenant_id}"

variables:
  gcp_project_id: "gac-prod-471220"
  location: "US"
  admin_email: "admin@example.com"

steps:
  - step_id: "create_infrastructure"
    name: "Create Tenant Dataset and Metadata Tables"
    ps_type: "setup.tenants.onboarding"
    timeout_minutes: 10
    config:
      gcp_project_id: "{gcp_project_id}"
      dataset_id: "{tenant_id}"
      location: "{location}"
      metadata_tables:
        # Note: tenant_pipeline_runs is now in central 'tenants' dataset
        - table_name: "tenant_step_logs"
          schema_file: "tenant_step_logs.json"
        - table_name: "tenant_dq_results"
          schema_file: "tenant_dq_results.json"

  - step_id: "send_welcome_email"
    name: "Send Welcome Email"
    ps_type: "notify_systems.email_notification"
    trigger: "on_success"
    to_emails: ["{admin_email}"]
    subject: "Welcome to Convergence Data Pipeline"
    message: |
      Your tenant has been successfully onboarded.
      Tenant ID: {tenant_id}
      Dataset: {gcp_project_id}.{tenant_id}
```

## Best Practices

### 1. Use Template Variables

**Good:**
```yaml
pipeline_id: "{tenant_id}-gcp-cost-billing"
source:
  query: "SELECT * FROM table WHERE date = '{date}'"
```

**Bad:**
```yaml
pipeline_id: "acme_corp-gcp-cost-billing"  # Hardcoded tenant
source:
  query: "SELECT * FROM table WHERE date = '2025-11-15'"  # Hardcoded date
```

### 2. Set Realistic Timeouts

```yaml
steps:
  - step_id: "quick_validation"
    timeout_minutes: 5      # Short timeout for simple checks

  - step_id: "large_extract"
    timeout_minutes: 60     # Longer timeout for big data
```

### 3. Use Descriptive IDs and Names

```yaml
steps:
  - step_id: "extract_billing_from_export"    # Good: descriptive
    name: "Extract GCP Billing Data"

  - step_id: "step1"                          # Bad: unclear
    name: "Process"
```

### 4. Group Related Steps

```yaml
steps:
  # Data Extraction
  - step_id: "extract_gcp_billing"
    ps_type: "gcp.bq_etl"

  - step_id: "extract_aws_costs"
    ps_type: "aws.s3_data_loader"

  # Data Quality
  - step_id: "validate_data_quality"
    ps_type: "gcp.bq_etl"

  # Notifications
  - step_id: "notify_on_success"
    ps_type: "notify_systems.email_notification"
    trigger: "on_success"
```

### 5. Include Failure Notifications

Always include failure notifications for production pipelines:

```yaml
steps:
  - step_id: "notify_on_failure"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"
    to_emails:
      - "{admin_email}"
      - "data-ops@company.com"
```

## Testing Configurations

### Validate YAML Syntax

```bash
python -c "import yaml; yaml.safe_load(open('configs/gcp/cost/cost_billing.yml'))"
```

### Dry Run

```bash
curl -X POST "http://localhost:8080/api/v1/pipelines/run/test_tenant/gcp/example/dryrun" \
  -H "X-API-Key: test_api_key" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-15", "trigger_by": "test"}'
```

### Test Template Variables

```python
from src.core.pipeline.template_resolver import resolve_template

template_variables = {
    "tenant_id": "test_tenant",
    "date": "2025-11-15",
    "admin_email": "test@example.com"
}

config = resolve_template("configs/gcp/cost/cost_billing.yml", template_variables)
print(config["pipeline_id"])  # Should be: test_tenant-gcp-cost-billing
```

## Security Considerations

### 1. No Sensitive Data in Configs

**Never store:**
- API keys
- Passwords
- Access tokens
- PII data

**Instead:**
- Use environment variables
- Store in Secret Manager
- Reference from encrypted credentials table

### 2. Validate User Input

All variables from request body are subject to:
- SQL injection prevention (parameterized queries)
- Path traversal validation (safe identifier regex)
- Type validation (Pydantic models)

### 3. Tenant Isolation

Configurations cannot reference other tenants' data:
```yaml
# Safe - uses authenticated tenant's dataset
dataset_id: "{tenant_id}"

# Unsafe - would fail tenant isolation check
dataset_id: "other_tenant"  # Rejected by system
```

## Troubleshooting

### Pipeline Not Found

**Error:** `FileNotFoundError: Pipeline file not found`

**Check:**
1. File exists at `configs/{provider}/{domain}/{pipeline_id}.yml`
2. File name matches pipeline_id from URL
3. YAML syntax is valid

### Variable Not Replaced

**Error:** Variables still show as `{variable}` in logs

**Check:**
1. Variable defined in `variables:` section or context
2. Spelling matches exactly (case-sensitive)
3. Using curly braces: `{variable}`, not `$variable`

### Template Conflicts

**Error:** Multiple pipeline files found

**Cause:** Duplicate pipeline IDs across directories

**Solution:** Ensure unique pipeline_id values or use tenant-specific overrides

## Related Documentation

- **Engines**: `src/core/engines/README.md` - Available ps_types
- **Templates**: `templates/README.md` - Schema templates
- **Pipeline Execution**: `src/core/pipeline/README.md` - How configs are executed
- **API Reference**: `docs/reference/API_REFERENCE.md` - API endpoints

## Support

For configuration questions:
1. Review example configs in each subdirectory
2. Check engine documentation for ps_type details
3. Test with dry-run pipeline first
4. Contact: data-ops-team@company.com
