# Complete Pipeline Execution Guide

## 🔑 Core Concept: ps_type Maps to Processors

**ps_type** is the KEY that connects pipeline YAML configurations to actual processor code.

```
Pipeline YAML                    →    Processor Code
ps_type: "gcp.bq_etl"           →    src/core/processors/gcp/bq_etl.py
ps_type: "notify_systems.email" →    src/core/processors/notify_systems/email_notification.py
```

---

## 📁 Real Example: cost_billing.yml Breakdown

Let's walk through the actual `configs/gcp/cost/cost_billing.yml` file:

### File Location & Invocation
```
File: configs/gcp/cost/cost_billing.yml
                ↑     ↑       ↑
           provider domain template

API Call: POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/cost_billing
                                                  ↑     ↑       ↑
                                        Maps to: configs/gcp/cost/cost_billing.yml
```

### Complete Pipeline Structure

```yaml
# 1. PIPELINE METADATA
pipeline_id: "{tenant_id}_gcp_cost_billing"  # Dynamic ID with tenant
description: "Extract GCP billing costs for tenant {tenant_id} - date {date}"

# 2. PIPELINE VARIABLES (can be overridden in API request)
variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export"
  destination_dataset_type: "gcp_silver_cost"
  destination_table: "billing_cost_daily"
  admin_email: "admin@example.com"

# 3. PIPELINE STEPS (array of processors to execute)
steps:
  # STEP 1: Extract and Load Data
  - step_id: "extract_billing_costs"
    name: "Extract GCP Billing Costs"
    ps_type: "gcp.bq_etl"              # ← MAPS TO: src/core/processors/gcp/bq_etl.py
    timeout_minutes: 20

    # Configuration specific to bq_etl processor
    source:
      bq_project_id: "gac-prod-471220"
      query: |
        SELECT * FROM `{source_billing_table}`
        WHERE DATE(usage_start_time) = '{date}'

    destination:
      bq_project_id: "gac-prod-471220"
      dataset_type: "{destination_dataset_type}"
      table: "{destination_table}"
      write_mode: "append"
      schema_template: "billing_cost"

  # STEP 2: Send Notification on Failure
  - step_id: "notify_on_failure"
    name: "Send Failure Notification"
    ps_type: "notify_systems.email_notification"  # ← MAPS TO: src/core/processors/notify_systems/email_notification.py
    trigger: "on_failure"               # Only runs if previous step fails
    to_emails: ["{admin_email}"]
    subject: "[ALERT] Pipeline Failed - {tenant_id}"
    message: "Pipeline failed for {tenant_id} on {date}"
```

---

## 🔄 Complete Execution Flow

### Step 1: API Request
```bash
POST /api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing
Body: {
  "date": "2024-11-01",
  "trigger_by": "manual"
}
```

### Step 2: Load Configuration
```python
# System loads: configs/gcp/cost/cost_billing.yml
config = load_yaml("configs/gcp/cost/cost_billing.yml")
```

### Step 3: Variable Substitution
```python
# Replace all {variables} with actual values:
{tenant_id} → "guru_232342"
{date} → "2024-11-01"
{trigger_by} → "manual"
{source_billing_table} → "gac-prod-471220.cloudact_cost_usage.gcp_billing_export"
{admin_email} → "admin@example.com"
```

### Step 4: Execute Steps Sequentially

#### Step 4.1: Execute "extract_billing_costs"
```python
# ps_type: "gcp.bq_etl" maps to processor
processor = load_processor("gcp.bq_etl")  # Loads src/core/processors/gcp/bq_etl.py

# Pass step configuration to processor
processor.execute({
    "source": {
        "bq_project_id": "gac-prod-471220",
        "query": "SELECT * FROM billing WHERE date='2024-11-01'"
    },
    "destination": {
        "dataset_type": "gcp_silver_cost",
        "table": "billing_cost_daily"
    }
})
```

#### Step 4.2: Execute "notify_on_failure" (if step 1 fails)
```python
# ps_type: "notify_systems.email_notification" maps to processor
if previous_step_failed:
    processor = load_processor("notify_systems.email_notification")
    processor.execute({
        "to_emails": ["admin@example.com"],
        "subject": "[ALERT] Pipeline Failed - guru_232342",
        "message": "Pipeline failed for guru_232342 on 2024-11-01"
    })
```

---

## 📦 Available Processors (ps_type values)

### Data Processing Processors

| ps_type | Processor Location | Purpose |
|---------|-------------------|---------|
| `gcp.bq_etl` | `src/core/processors/gcp/bq_etl.py` | BigQuery extract, transform, load |
| `aws.s3_etl` | `src/core/processors/aws/s3_etl.py` | S3 data processing (if exists) |
| `azure.blob_etl` | `src/core/processors/azure/blob_etl.py` | Azure blob processing (if exists) |

### Setup Processors

| ps_type | Processor Location | Purpose |
|---------|-------------------|---------|
| `setup.initial.onetime_bootstrap_processor` | `src/core/processors/setup/initial/onetime_bootstrap_processor.py` | System bootstrap |
| `setup.tenants.onboarding` | `src/core/processors/setup/tenants/onboarding.py` | Tenant onboarding |

### Notification Processors

| ps_type | Processor Location | Purpose |
|---------|-------------------|---------|
| `notify_systems.email_notification` | `src/core/processors/notify_systems/email_notification.py` | Email alerts |
| `notify_systems.slack_notification` | `src/core/processors/notify_systems/slack_notification.py` | Slack alerts (if exists) |

---

## 🎯 How ps_type Works

### 1. Naming Convention
```
ps_type: "{provider}.{processor_name}"
         ↓
Maps to: src/core/processors/{provider}/{processor_name}.py
```

### 2. Dynamic Loading
```python
# In pipeline executor:
def load_processor(ps_type: str):
    # ps_type = "gcp.bq_etl"
    provider, processor = ps_type.split(".")

    # Build module path
    module_path = f"src.core.processors.{provider}.{processor}"
    # Result: "src.core.processors.gcp.bq_etl"

    # Dynamically import the module
    module = importlib.import_module(module_path)

    # Get the processor class/function
    return module.execute  # or module.Processor()
```

### 3. Processor Interface
Every processor must implement:
```python
# src/core/processors/gcp/bq_etl.py
def execute(context: dict, config: dict) -> dict:
    """
    context: Runtime variables (tenant_id, date, etc.)
    config: Step configuration from YAML
    returns: Execution result
    """
    # Processor logic here
    return {"status": "success", "rows_processed": 1000}
```

---

## 📝 Creating a New Pipeline

### Step 1: Create YAML Configuration
```yaml
# configs/aws/cost/daily_report.yml
pipeline_id: "{tenant_id}_aws_daily_cost"
steps:
  - step_id: "extract_costs"
    ps_type: "aws.cost_explorer"  # Your processor
    config:
      date_range: "{date}"
```

### Step 2: Create Processor (if needed)
```python
# src/core/processors/aws/cost_explorer.py
def execute(context: dict, config: dict) -> dict:
    # Your processor logic
    return {"status": "success"}
```

### Step 3: Call API
```bash
POST /api/v1/pipelines/run/{tenant_id}/aws/cost/daily_report
```

---

## 🔍 Complete Example: guru_232342 Cost Pipeline

### 1. API Call
```bash
curl -X POST http://localhost:8080/api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing \
  -H "Content-Type: application/json" \
  -H "X-API-Key: guru_232342_key_xyz" \
  -d '{"date": "2024-11-01", "trigger_by": "manual"}'
```

### 2. System Flow
```
1. Load: configs/gcp/cost/cost_billing.yml
2. Substitute: {tenant_id} → guru_232342, {date} → 2024-11-01
3. Execute Step 1:
   - ps_type: "gcp.bq_etl"
   - Load: src/core/processors/gcp/bq_etl.py
   - Run: BigQueryETLEngine.execute()
   - Extract from: billing_export table
   - Load to: guru_232342.billing_cost_daily
4. If Step 1 Fails:
   - ps_type: "notify_systems.email_notification"
   - Load: src/core/processors/notify_systems/email_notification.py
   - Send email to admin@example.com
5. Log to: tenants.tenant_pipeline_runs
6. Return: {"pipeline_logging_id": "abc-123", "status": "SUCCESS"}
```

---

## ❓ Why This Architecture?

### Benefits of ps_type Approach:

1. **Separation of Concerns**
   - Configuration (YAML) separate from logic (Python)
   - Easy to add new pipelines without code changes

2. **Reusability**
   - One processor can be used by many pipelines
   - Example: `gcp.bq_etl` used for cost, compliance, usage pipelines

3. **Flexibility**
   - Each step can use different processors
   - Mix and match: ETL → Transform → Notify → Archive

4. **Discoverability**
   - ps_type clearly shows which processor is used
   - Easy to trace: YAML → ps_type → processor file

5. **Testing**
   - Test processors independently
   - Test pipeline configs with mock processors

---

## 🚀 Quick Reference

### Find a Processor from ps_type
```bash
# If ps_type = "gcp.bq_etl"
ls src/core/processors/gcp/bq_etl.py
```

### List All Available Processors
```bash
find src/core/processors -name "*.py" | grep -v __
```

### Test a Pipeline
```bash
# Dry run
POST /api/v1/pipelines/dry-run/{tenant_id}/gcp/cost/cost_billing

# Actual run
POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/cost_billing
```

---

**This is how ps_type connects YAML configurations to actual processor code!**