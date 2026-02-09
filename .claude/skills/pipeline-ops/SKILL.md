---
name: pipeline-ops
description: |
  Pipeline lifecycle management for CloudAct. Create, validate, run, and monitor pipelines.
  Use when: creating new pipelines, validating pipeline configs, running pipelines, checking pipeline status,
  debugging pipeline failures, or working with pipeline configurations in configs/{provider}/{domain}/*.yml.
---

# Pipeline Operations

## Overview

CloudAct's core principle: **Everything is a pipeline**. This skill manages the complete pipeline lifecycle.

## Three Cost Types → FOCUS 1.3

| Type | Providers | Pipeline Path | FOCUS Converter |
|------|-----------|---------------|-----------------|
| **Cloud** | GCP, AWS, Azure, OCI | `cloud/{provider}/cost/billing` | `sp_cloud_{provider}_convert_to_focus` |
| **GenAI** | OpenAI, Anthropic, Gemini, DeepSeek, Azure OpenAI, AWS Bedrock, GCP Vertex | `genai/payg/*` | `sp_genai_3_convert_to_focus` |
| **SaaS** | Canva, Slack, ChatGPT Plus | `subscription/costs/subscription_cost` | `sp_subscription_3_convert_to_focus` |

All cost data flows to: `cost_data_standard_1_3` (FOCUS 1.3 unified format)

## Environments

| Environment | Pipeline Service URL | Root API Key Location |
|-------------|---------------------|----------------------|
| Local | `http://localhost:8001` | `.env.local` |
| Test/Stage | Cloud Run URL | GCP Secret Manager |
| Prod | `https://pipeline.cloudact.ai` | GCP Secret Manager |

## Key Locations

| Type | Path |
|------|------|
| Pipeline Configs | `03-data-pipeline-service/configs/{provider}/{domain}/*.yml` |
| Schemas | `03-data-pipeline-service/configs/{provider}/{domain}/schemas/*.json` |
| Provider Registry | `03-data-pipeline-service/configs/system/providers.yml` |
| Stored Procedures | `03-data-pipeline-service/configs/system/procedures/{domain}/*.sql` |
| Processors | `03-data-pipeline-service/src/core/processors/` |
| Pipeline Router | `03-data-pipeline-service/src/app/routers/pipelines.py` |

## Stored Procedures (CRITICAL)

### Procedure Sync

**After modifying any stored procedure, you MUST sync to BigQuery:**

```bash
# Sync all procedures (skips unchanged)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: {root_key}" \
  -H "Content-Type: application/json" \
  -d '{}'

# Force sync all procedures (recreates all)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: {root_key}" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### Procedure List

| Procedure | Domain | Purpose |
|-----------|--------|---------|
| `sp_subscription_1_validate_data` | Subscription | Validate subscription plan data |
| `sp_subscription_2_calculate_daily_costs` | Subscription | Calculate daily amortized costs |
| `sp_subscription_3_convert_to_focus` | Subscription | Convert to FOCUS 1.3 |
| `sp_subscription_4_run_pipeline` | Subscription | Orchestrate all subscription steps |
| `sp_cloud_1_convert_to_focus` | Cloud | Convert GCP/AWS/Azure/OCI to FOCUS 1.3 |
| `sp_genai_1_consolidate_usage_daily` | GenAI | Consolidate usage metrics |
| `sp_genai_2_consolidate_costs_daily` | GenAI | Consolidate cost data |
| `sp_genai_3_convert_to_focus` | GenAI | Convert to FOCUS 1.3 |

### FOCUS 1.3 Key Fields

| FOCUS Field | Description | Cloud Source |
|-------------|-------------|--------------|
| `BilledCost` | Gross cost before credits | GCP: `cost`, AWS: `unblended_cost`, Azure: `cost_in_billing_currency`, OCI: `cost` |
| `EffectiveCost` | Net cost after credits | GCP: `cost + credits_total`, AWS: `net_unblended_cost`, Azure: `cost - azure_credit_applied` |
| `ListCost` | Full retail price | GCP: `list_cost`, AWS: `public_on_demand_cost`, Azure: `usage_quantity * payg_price` |
| `ChargeCategory` | Usage, Credit, Tax, Purchase | Mapped from provider-specific fields |
| `ChargeClass` | NULL or 'Correction' | For refunds/adjustments |

## Pipeline Structure Template

```yaml
# Header
pipeline_id: "{org_slug}-{provider}-{domain}"
name: "Human Readable Name"
description: "What this pipeline does"
provider: "aws"  # lowercase
domain: "cost"
version: "18.0.0"

# Schedule (optional)
schedule: "0 5 * * *"  # cron format: daily at 5 AM UTC

# Variables (template substitution)
variables:
  org_slug: "{org_slug}"
  dataset: "{org_slug}_{environment}"
  default_date_offset: "-1"  # Yesterday

# Steps (executed in order)
steps:
  - step_id: "decrypt_credentials"
    name: "Decrypt Integration Credentials"
    ps_type: "generic.credential_decryptor"
    config:
      provider: "{provider}"

  - step_id: "delete_existing_data"
    name: "Delete Existing Data (Idempotent)"
    ps_type: "generic.bq_delete"
    description: "Remove existing data for date range before insert"
    config:
      table: "cloud_{provider}_billing_raw_daily"
      delete_condition: "usage_date BETWEEN @start_date AND @end_date AND org_slug = @org_slug"

  - step_id: "extract_billing"
    name: "Extract Billing Data"
    ps_type: "{provider}.billing_extractor"
    timeout_minutes: 30
    config:
      destination_table: "cloud_{provider}_billing_raw_daily"

  - step_id: "convert_to_focus"
    name: "Convert to FOCUS 1.3"
    ps_type: "generic.bq_procedure"
    config:
      procedure: "sp_cloud_1_convert_to_focus"
      parameters:
        - name: "p_provider"
          value: "{provider}"

# Auth & metadata
requires_auth: true
auth_type: "org_api_key"
tags: [cloud, {provider}, cost, billing]
category: "cloud_cost"
```

## Available Processor Types (ps_type)

| Provider | ps_type | Purpose |
|----------|---------|---------|
| Generic | `generic.bq_procedure` | Execute stored procedures |
| Generic | `generic.bq_delete` | Delete data (idempotent) |
| Generic | `generic.credential_decryptor` | Decrypt KMS credentials |
| Generic | `generic.api_extractor` | REST API extraction |
| OpenAI | `openai.usage` | Extract usage data |
| Anthropic | `anthropic.usage` | Extract usage data |
| GCP | `gcp.bq_etl` | BigQuery ETL operations |
| AWS | `aws.cur_extractor` | Cost & Usage Report extraction |
| Azure | `azure.cost_management_extractor` | Cost Management API |
| OCI | `oci.cost_analysis_extractor` | Cost Analysis API |

## x_* Pipeline Lineage Fields (REQUIRED)

All pipeline tables MUST include:

| Field | Purpose | Example |
|-------|---------|---------|
| `x_pipeline_id` | Pipeline template name | `genai_payg_openai` |
| `x_credential_id` | Credential used | `cred_openai_001` |
| `x_pipeline_run_date` | Data date | `2026-01-23` |
| `x_run_id` | Execution UUID | `run_abc123` |
| `x_ingested_at` | Write timestamp | `2026-01-23T10:00:00Z` |

## Getting API Keys

### From .env.local (Local Development)
```bash
# Pipeline service root key
grep CA_ROOT_API_KEY 03-data-pipeline-service/.env.local
```

### From Supabase (Org API Key)
```sql
SELECT api_key FROM org_api_keys_secure WHERE org_slug = 'your_org_slug';
```

## Common Operations

### 1. Run Pipeline

```bash
# GenAI
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/genai/payg/openai" \
  -H "X-API-Key: {org_api_key}"

# Cloud
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/gcp/cost/billing" \
  -H "X-API-Key: {org_api_key}"

# Subscription
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/subscription/costs/subscription_cost" \
  -H "X-API-Key: {org_api_key}"

# With date range
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/gcp/cost/billing?start_date=2026-01-01&end_date=2026-01-22" \
  -H "X-API-Key: {org_api_key}"
```

### 2. Sync Stored Procedures

```bash
# Normal sync (skips unchanged)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: {root_key}" \
  -d '{}'

# Force sync (recreates all)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: {root_key}" \
  -d '{"force": true}'
```

### 3. Check Pipeline Status

```bash
# Get recent runs
curl "http://localhost:8000/api/v1/pipeline-logs/{org}?limit=10" \
  -H "X-API-Key: {org_api_key}"
```

### 4. Check Logs

```bash
# Pipeline service logs
tail -100 logs/pipeline.log | grep -iE "(error|failed)"

# Specific pipeline run
grep "pipeline_logging_id.*{run_id}" logs/pipeline.log
```

## Debugging Pipeline Failures

### Step-by-Step Debug Process

1. **Check logs for error:**
   ```bash
   tail -100 logs/pipeline.log | grep -iE "error|exception|failed"
   ```

2. **Identify the failing step:**
   Look for `"msg": "Step {step_id} failed"` in logs

3. **Common error patterns:**

   | Error | Cause | Solution |
   |-------|-------|----------|
   | `Column X not present in table` | Schema mismatch | Update stored procedure to match table schema |
   | `Invalid root API key` | Wrong key | Check `.env.local` for correct `CA_ROOT_API_KEY` |
   | `Processor not found` | Missing processor | Check ps_type exists in processors directory |
   | `BigQuery API error` | Query syntax | Check stored procedure SQL syntax |
   | `Quota exceeded` | Rate limit | Wait and retry, or check org quota |

4. **Fix and sync:**
   ```bash
   # After fixing stored procedure
   curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
     -H "X-CA-Root-Key: {root_key}" -d '{"force": true}'
   ```

### Schema Mismatch Debugging

When you see `Column X is not present in table Y`:

1. **Find the stored procedure:**
   ```bash
   grep -r "table_name" configs/system/procedures/
   ```

2. **Find the table schema:**
   ```bash
   ls configs/setup/bootstrap/schemas/ | grep {table_name}
   ```

3. **Compare columns:**
   - Procedure INSERT columns vs Schema fields
   - Watch for renamed columns (e.g., `table_name` → `target_table`)

4. **Fix procedure and sync:**
   ```bash
   curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
     -H "X-CA-Root-Key: {root_key}" -d '{"force": true}'
   ```

## Validation Checklist

- [ ] `pipeline_id` follows `{org_slug}-{provider}-{domain}` pattern
- [ ] `ps_type` exists in processor registry
- [ ] All required config fields present
- [ ] `timeout_minutes` reasonable (5-60 for most)
- [ ] Schema JSON is valid
- [ ] Stored procedure columns match table schema
- [ ] Procedures synced to BigQuery after changes

## Schema Conventions

### Bootstrap Tables (API Service)
Location: `02-api-service/configs/setup/bootstrap/schemas/`

Important tables:
- `org_meta_dq_results.json` - Data quality results
- `org_meta_pipeline_runs.json` - Pipeline execution logs
- `org_subscriptions.json` - Subscription limits
- `org_usage_quotas.json` - Usage tracking

### Org Tables (Pipeline Service)
Location: `03-data-pipeline-service/configs/{provider}/{domain}/schemas/`

All schemas must include x_* lineage fields.

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| 404 on pipeline run | Provider must be lowercase (`gcp` not `GCP`) |
| Processor not found | Add to `src/core/processors/{provider}/` and register |
| Schema mismatch | Verify BigQuery table schema matches stored procedure |
| Auth failure | Check `X-API-Key` header and org credentials |
| Procedure not updated | Run force sync: `{"force": true}` |
| Column not found | Compare procedure INSERT columns with table schema |

## Related Skills

- `subscription-costs` - SaaS subscription cost pipeline
- `config-validator` - Validate pipeline YAML
- `bigquery-ops` - BigQuery table operations
- `integration-setup` - Setup provider credentials
- `hierarchy` - Hierarchy for cost allocation
