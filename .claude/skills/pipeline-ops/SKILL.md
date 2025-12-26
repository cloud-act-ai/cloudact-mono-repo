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

## Key Locations
- **Pipeline Configs:** `03-data-pipeline-service/configs/{provider}/{domain}/*.yml`
- **Provider Registry:** `03-data-pipeline-service/configs/system/providers.yml`
- **Processors:** `03-data-pipeline-service/src/core/processors/`
- **Pipeline Router:** `03-data-pipeline-service/src/app/routers/pipelines.py`

## Pipeline Structure Template
```yaml
pipeline_id: "{org_slug}-{provider}-{domain}"
name: "Human Readable Name"
description: "What this pipeline does"
version: "1.0.0"
timeout_minutes: 30
schedule:
  type: monthly|daily|hourly
  day_of_month: 1  # for monthly
  time: "03:00"
variables:
  org_slug: "{org_slug}"
  dataset: "{org_slug}_prod"
steps:
  - step_id: "step_name"
    ps_type: "provider.processor_type"
    timeout_minutes: 5
    config:
      destination_table: "table_name"
      # processor-specific config
requires_auth: true
tags: [provider, domain, schedule_type]
category: "cost|usage|subscription|etl"
```

## Available Processor Types (ps_type)
| Provider | ps_type | Purpose |
|----------|---------|---------|
| OpenAI | `openai.usage` | Extract usage data |
| OpenAI | `openai.cost` | Calculate costs |
| OpenAI | `openai.subscriptions` | Sync subscriptions |
| Anthropic | `anthropic.usage` | Extract usage data |
| Anthropic | `anthropic.cost` | Calculate costs |
| GCP | `gcp.bq_etl` | BigQuery ETL operations |
| GCP | `gcp.api_extractor` | GCP API data extraction |
| Generic | `generic.api_extractor` | Generic REST API extraction |
| Generic | `generic.procedure_executor` | Execute stored procedures |

## Instructions

### 1. Create New Pipeline
1. Identify provider and domain from `configs/system/providers.yml`
2. Create YAML in `configs/{provider}/{domain}/`
3. Follow naming convention: `{pipeline_type}.yml`
4. Ensure processor exists in `src/core/processors/{provider}/`
5. Validate with config-validator skill

### 2. Validate Pipeline Config
```bash
# Check YAML syntax
python -c "import yaml; yaml.safe_load(open('configs/{provider}/{domain}/{file}.yml'))"

# Validate against provider registry
grep -q "^  {provider}:" configs/system/providers.yml
```

### 3. Run Pipeline
```bash
# Via API (Port 8001)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json"
```

### 4. Check Pipeline Status
```bash
# Get recent runs
curl -s "http://localhost:8000/api/v1/pipeline-logs/{org_slug}?limit=10" \
  -H "X-API-Key: {org_api_key}"
```

### 5. Debug Failed Pipeline
1. Check pipeline logs via API
2. Verify credentials in `organizations.integration_credentials`
3. Check BigQuery table exists in org dataset
4. Review processor logs in Cloud Logging

## Validation Checklist
- [ ] `pipeline_id` follows `{org_slug}-{provider}-{domain}` pattern
- [ ] `ps_type` exists in processor registry
- [ ] All required config fields present
- [ ] `timeout_minutes` reasonable (5-60 for most)
- [ ] `schedule` matches expected frequency
- [ ] `tags` include provider and domain
- [ ] Destination table schema exists

## Common Issues
| Issue | Solution |
|-------|----------|
| 404 on pipeline run | Provider must be lowercase (`gcp` not `GCP`) |
| Processor not found | Add to `src/core/processors/{provider}/` and register |
| Schema mismatch | Verify BigQuery table schema matches config |
| Auth failure | Check `X-API-Key` header and org credentials |

## Example Prompts

```
# Creating
"Create a new pipeline for OpenAI usage extraction"
"Add a daily cost calculation pipeline for Anthropic"
"I need a monthly subscription sync pipeline for DeepSeek"

# Running
"Run the GCP cost pipeline for acme_corp"
"Execute the usage extraction pipeline"
"Trigger the subscription sync for all orgs"

# Debugging
"Pipeline failed with 'processor not found' error"
"Why is my pipeline timing out?"
"The pipeline run shows status 'failed' - help me debug"

# Validating
"Check if my pipeline YAML is correct"
"What processors are available for OpenAI?"
```

## Related Skills
- `config-validator` - Validate pipeline YAML
- `bigquery-ops` - BigQuery table operations
- `integration-setup` - Setup provider credentials
