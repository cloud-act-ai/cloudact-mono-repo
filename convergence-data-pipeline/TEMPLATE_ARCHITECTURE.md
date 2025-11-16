# Convergence Data Pipeline - Template Architecture

## Overview

Convergence Data Pipeline uses a **template-based architecture** to support 10,000+ tenants with complete data isolation. One template configuration serves multiple tenants through variable replacement.

## Architecture Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. ONBOARDING (ONE-TIME PER TENANT)                              │
│ POST /api/v1/customers/onboard                                   │
│ Body: {"tenant_id": "acmeinc_23xv2", "admin_email": "..."}      │
│                                                                   │
│ Calls Template: configs/customer/onboarding.yml                  │
│ Creates: Dataset + Metadata Tables + API Key                     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. PIPELINE EXECUTION (RECURRING)                                │
│ POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{tmpl}│
│ Header: X-API-Key: {tenant_id}_api_xxxxx                        │
│ Body: {"date": "2025-11-15", "trigger_by": "user123"}           │
│                                                                   │
│ Calls Template: configs/{provider}/{domain}/{template_name}.yml  │
│ Processes Data → Writes to Tenant Dataset                        │
└──────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
convergence-data-pipeline/
├── configs/                              # Pipeline templates
│   ├── customer/
│   │   └── onboarding.yml                # Tenant onboarding template
│   ├── gcp/
│   │   ├── cost/
│   │   │   ├── cost_billing.yml          # GCP billing pipeline
│   │   │   └── cost_usage.yml
│   │   └── compute/
│   │       └── vm_usage.yml
│   └── aws/
│       └── cost/
│           └── cost_explorer.yml
│
├── templates/                            # Schema templates
│   ├── customer/
│   │   └── onboarding/
│   │       └── schemas/
│   │           ├── x_meta_api_keys.json
│   │           ├── x_meta_pipeline_runs.json
│   │           └── ...
│   └── gcp/
│       └── bigquery_to_bigquery/
│           └── schema_template.json      # Table schemas (billing_cost, etc.)
│
└── src/
    └── core/
        └── engines/                      # Processing engines (ps_types)
            ├── customer/
            │   └── onboarding.py         # ps_type: "customer.onboarding"
            ├── gcp/
            │   └── bigquery_to_bigquery.py  # ps_type: "gcp.bigquery_to_bigquery"
            └── shared/
                └── email_notification.py    # ps_type: "shared.email_notification"
```

## Variable Replacement System

### Built-in Variables (Auto-injected)

| Variable | Source | Example Value |
|----------|--------|---------------|
| `{tenant_id}` | URL path | `acmeinc_23xv2` |
| `{provider}` | URL path | `gcp` |
| `{domain}` | URL path | `cost` |
| `{template_name}` | URL path | `cost_billing` |
| `{pipeline_id}` | Auto-generated | `acmeinc_23xv2-gcp-cost-billing` |
| `{date}` | Request body | `2025-11-15` |
| `{trigger_by}` | Request body | `finance_team` |
| `{run_date}` | Current date | `2025-11-16` |

### Template-defined Variables

Templates can define their own variables in the `variables:` section:

```yaml
variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing..."
  destination_dataset_type: "gcp_silver_cost"
  destination_table: "billing_cost_daily"
  admin_email: "guru.kallam@gmail.com"
```

These can be overridden via API request body:

```bash
curl -X POST "http://localhost:8080/api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/cost_billing" \
  -H "X-API-Key: acmeinc_23xv2_api_xxxxx" \
  -d '{
    "date": "2025-11-15",
    "admin_email": "custom-admin@acmeinc.com"
  }'
```

## 1. Customer Onboarding Template

**Location:** `configs/customer/onboarding.yml`

### Purpose
Creates tenant infrastructure (dataset + metadata tables + API key)

### Template Structure

```yaml
pipeline_id: "{tenant_id}-customer-onboarding"
description: "Onboard new tenant {tenant_id} - create dataset and metadata infrastructure"

variables:
  gcp_project_id: "gac-prod-471220"
  location: "US"
  dataset_id: "{tenant_id}"
  admin_email: "guru.kallam@gmail.com"

steps:
  - step_id: "create_infrastructure"
    name: "Create Tenant Dataset and Metadata Tables"
    ps_type: "customer.onboarding"
    config:
      gcp_project_id: "{gcp_project_id}"
      dataset_id: "{dataset_id}"
      metadata_tables:
        - table_name: "x_meta_api_keys"
          schema_file: "x_meta_api_keys.json"
        # ... more tables ...

  - step_id: "send_welcome_email"
    ps_type: "shared.email_notification"
    trigger: "on_success"
    to_emails: ["{admin_email}"]
    subject: "Welcome to Convergence Data Pipeline - Tenant {tenant_id} Onboarded"
    message: |
      Your tenant {tenant_id} has been successfully onboarded!
      Dataset: {gcp_project_id}.{dataset_id}
```

### Usage Example

```bash
# Onboard Tenant 1: acmeinc_23xv2
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acmeinc_23xv2",
    "admin_email": "admin@acmeinc.com"
  }'

# Response:
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_Kx9mPqR7sT2nV8wZ",  # SAVE THIS!
  "dataset_created": true,
  "tables_created": ["x_meta_api_keys", "x_meta_cloud_credentials", ...]
}

# Onboard Tenant 2: techcorp_99zx4
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "techcorp_99zx4",
    "admin_email": "admin@techcorp.com"
  }'

# Creates separate isolated infrastructure for techcorp_99zx4
```

### Infrastructure Created Per Tenant

```
BigQuery Project: gac-prod-471220
├── acmeinc_23xv2/                    # Tenant 1 dataset
│   ├── x_meta_api_keys               # API keys
│   ├── x_meta_cloud_credentials      # Cloud credentials
│   ├── x_meta_pipeline_runs          # Pipeline execution history
│   ├── x_meta_step_logs              # Step-by-step logs
│   └── x_meta_dq_results             # Data quality results
│
└── techcorp_99zx4/                   # Tenant 2 dataset (isolated)
    ├── x_meta_api_keys
    └── ... (same structure)
```

## 2. GCP Cost Billing Pipeline Template

**Location:** `configs/gcp/cost/cost_billing.yml`

### Purpose
Extract GCP billing costs for a tenant on a specific date

### Template Structure

```yaml
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract GCP billing costs for tenant {tenant_id} - date {date}"

variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing..."
  destination_dataset_type: "gcp_silver_cost"
  destination_table: "billing_cost_daily"
  admin_email: "guru.kallam@gmail.com"

steps:
  - step_id: "extract_billing_costs"
    ps_type: "gcp.bigquery_to_bigquery"

    source:
      query: |
        SELECT * FROM `{source_billing_table}`
        WHERE DATE(usage_start_time) = '{date}'

    destination:
      dataset_type: "{destination_dataset_type}"
      table: "{destination_table}"
      schema_template: "billing_cost"

  - step_id: "notify_on_failure"
    ps_type: "shared.email_notification"
    trigger: "on_failure"
    to_emails:
      - "{admin_email}"
      - "guru.kallam@gmail.com"
    subject: "[ALERT] Cost Billing Pipeline Failed - {tenant_id}"
    message: |
      ALERT: Cost billing failed for {tenant_id}
      Date: {date}
      Pipeline: {pipeline_id}
```

### Usage Examples

```bash
# Tenant 1: Run billing for 2025-11-15
curl -X POST "http://localhost:8080/api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/cost_billing" \
  -H "X-API-Key: acmeinc_23xv2_api_Kx9mPqR7sT2nV8wZ" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-15",
    "trigger_by": "finance_team"
  }'

# Creates: gac-prod-471220.acmeinc_23xv2_gcp_silver_cost.billing_cost_daily

# Tenant 2: Same template, different tenant
curl -X POST "http://localhost:8080/api/v1/pipelines/run/techcorp_99zx4/gcp/cost/cost_billing" \
  -H "X-API-Key: techcorp_99zx4_api_Lm3nWxY4pQ9rS6vT" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-15",
    "trigger_by": "cfo_dashboard"
  }'

# Creates: gac-prod-471220.techcorp_99zx4_gcp_silver_cost.billing_cost_daily
```

### Variable Resolution Example

**Before Resolution (Template):**
```yaml
pipeline_id: "{tenant_id}-gcp-cost-billing"
query: "SELECT * FROM `{source_billing_table}` WHERE DATE(usage_start_time) = '{date}'"
dataset_type: "{destination_dataset_type}"
to_emails: ["{admin_email}"]
```

**After Resolution (for acmeinc_23xv2):**
```yaml
pipeline_id: "acmeinc_23xv2-gcp-cost-billing"
query: "SELECT * FROM `gac-prod-471220.cloudact_cost_usage.gcp_billing...` WHERE DATE(usage_start_time) = '2025-11-15'"
dataset_type: "gcp_silver_cost"
to_emails: ["guru.kallam@gmail.com"]
```

## 3. Processing Engines (ps_types)

Templates call **engines** to execute specific processing logic.

### Available Engines

| ps_type | Engine | Purpose |
|---------|--------|---------|
| `customer.onboarding` | `src/core/engines/customer/onboarding.py` | Create tenant infrastructure |
| `gcp.bigquery_to_bigquery` | `src/core/engines/gcp/bigquery_to_bigquery.py` | BigQuery data extraction/loading |
| `shared.email_notification` | `src/core/engines/shared/email_notification.py` | Send email notifications |

### Engine Example in Template

```yaml
steps:
  - step_id: "extract_data"
    ps_type: "gcp.bigquery_to_bigquery"  # Calls BigQueryToBigQueryEngine
    source:
      query: "SELECT * FROM ..."
    destination:
      table: "output_table"
```

## 4. Multi-Tenant Isolation

### Same Template → Isolated Data

```
Template: configs/gcp/cost/cost_billing.yml
  ↓
Tenant 1 (acmeinc_23xv2):
  → Dataset: acmeinc_23xv2_gcp_silver_cost
  → Table: billing_cost_daily
  → Data: Acme Inc. costs only

Tenant 2 (techcorp_99zx4):
  → Dataset: techcorp_99zx4_gcp_silver_cost
  → Table: billing_cost_daily
  → Data: TechCorp costs only
```

### Dataset Naming Convention

```
{tenant_id}_{dataset_type}

Examples:
- acmeinc_23xv2_gcp_silver_cost
- acmeinc_23xv2_aws_bronze_usage
- techcorp_99zx4_gcp_silver_cost
```

## 5. Complete Example: From Onboarding to Pipeline

### Step 1: Onboard Tenant

```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acmeinc_23xv2",
    "admin_email": "admin@acmeinc.com"
  }'

# Save API Key: acmeinc_23xv2_api_Kx9mPqR7sT2nV8wZ
```

**Infrastructure Created:**
- Dataset: `acmeinc_23xv2`
- Tables: `x_meta_api_keys`, `x_meta_pipeline_runs`, etc.
- API Key generated and encrypted

### Step 2: Run Cost Billing Pipeline

```bash
curl -X POST "http://localhost:8080/api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/cost_billing" \
  -H "X-API-Key: acmeinc_23xv2_api_Kx9mPqR7sT2nV8wZ" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-15",
    "trigger_by": "finance_team",
    "admin_email": "finance@acmeinc.com"
  }'
```

**Variables Resolved:**
- `{tenant_id}` → `acmeinc_23xv2` (from URL)
- `{date}` → `2025-11-15` (from request body)
- `{admin_email}` → `finance@acmeinc.com` (from request body - overrides template default)
- `{pipeline_id}` → `acmeinc_23xv2-gcp-cost-billing` (auto-generated)

**Data Flow:**
1. Query GCP billing export for 2025-11-15
2. Filter costs for Acme Inc.
3. Write to `acmeinc_23xv2_gcp_silver_cost.billing_cost_daily`
4. If failed → Email `finance@acmeinc.com` and `guru.kallam@gmail.com`

### Step 3: Check Pipeline Status

```bash
curl -X GET "http://localhost:8080/api/v1/pipelines/status/acmeinc_23xv2/{pipeline_logging_id}" \
  -H "X-API-Key: acmeinc_23xv2_api_Kx9mPqR7sT2nV8wZ"
```

## 6. Creating New Pipeline Templates

### Template Checklist

1. **Create template file**: `configs/{provider}/{domain}/{template_name}.yml`
2. **Use variable placeholders**: `{tenant_id}`, `{date}`, etc.
3. **Define pipeline-level variables**: Default values that can be overridden
4. **Specify ps_types**: Which engines to use
5. **Add failure notifications**: Email admins on errors
6. **Document usage**: Add comments with curl example

### Template Template

```yaml
# {Provider} {Domain} Pipeline
# Description of what this pipeline does
# Usage: POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}

pipeline_id: "{tenant_id}-{provider}-{domain}-{template_name}"
description: "Process {domain} data for tenant {tenant_id} on {date}"

variables:
  # Define defaults (can be overridden via API request body)
  source_table: "project.dataset.table"
  destination_dataset_type: "{provider}_silver_{domain}"
  destination_table: "output_table"
  admin_email: "guru.kallam@gmail.com"

steps:
  - step_id: "process_data"
    name: "Process Data"
    ps_type: "{provider}.processor_engine"
    source:
      query: "SELECT * FROM `{source_table}` WHERE date = '{date}'"
    destination:
      dataset_type: "{destination_dataset_type}"
      table: "{destination_table}"

  - step_id: "notify_on_failure"
    ps_type: "shared.email_notification"
    trigger: "on_failure"
    to_emails: ["{admin_email}"]
    subject: "[ALERT] Pipeline Failed - {tenant_id}"
    message: |
      Pipeline {pipeline_id} failed for {tenant_id}
      Date: {date}
```

## 7. Best Practices

### Variable Naming

- **Use descriptive names**: `admin_email` not `email1`
- **Consistent casing**: `snake_case` for variables
- **Prefix tenant-specific**: `{tenant_id}_dataset_type`

### Email Notifications

- **Always include {tenant_id}** in subject
- **Always include {pipeline_id}** in message
- **Always include {date}** or {run_date}
- **Include troubleshooting hints**: Link to logs

### Template Organization

```
configs/
  {provider}/              # gcp, aws, azure
    {domain}/              # cost, usage, security, compute
      {template_name}.yml  # billing, explorer, firewall
```

## 8. Troubleshooting

### Variable Not Replaced

Check that:
1. Variable is defined in `variables:` section OR is a built-in variable
2. Variable name matches exactly (case-sensitive)
3. Using correct syntax: `{variable_name}` not `{{variable_name}}`

### Template Not Found

Check that:
1. File exists at: `configs/{provider}/{domain}/{template_name}.yml`
2. URL path matches exactly (case-sensitive)
3. File extension is `.yml` not `.yaml`

### Email Not Sent

Check that:
1. Email in `to_emails:` list
2. Using variable syntax: `"{admin_email}"` with quotes
3. `trigger:` is set correctly (`on_success`, `on_failure`, or always)

## 9. Security

- **API Keys**: SHA256 hashed, KMS encrypted
- **Tenant Isolation**: Dataset-level separation
- **Rate Limiting**: 50 req/min per tenant for pipelines
- **Authentication**: API key must match tenant_id in URL

## 10. Scalability

- **10k+ tenants supported**: Dataset-per-tenant architecture
- **Async execution**: Non-blocking pipeline processing
- **Pub/Sub distribution**: Batch pipeline publishing for 10k tenants
- **Rate limiting**: Multi-layer protection (per-tenant, global, endpoint)

## Summary

1. **One template → Many tenants**: Complete data isolation
2. **Variables replace automatically**: From URL, body, and template
3. **Onboarding uses template**: `configs/customer/onboarding.yml`
4. **Pipelines use templates**: `configs/{provider}/{domain}/{template}.yml`
5. **Engines (ps_types) process data**: Pluggable architecture
6. **Email notifications**: Customizable per tenant with variables

---

**Documentation Version:** 1.0
**Last Updated:** 2025-11-16
**Author:** Guru Kallam
