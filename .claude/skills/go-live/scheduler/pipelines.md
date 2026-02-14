# Data Pipeline Jobs

Per-org data pipelines that run after integrations are configured. These are triggered by users or scheduled per-org.

## Three Cost Types

| Type | Providers | Pipeline Path | Target Table |
|------|-----------|---------------|-------------|
| Cloud | GCP, AWS, Azure, OCI | `cloud/{provider}/cost/billing` | `cost_data_standard_1_3` |
| GenAI | OpenAI, Anthropic, Gemini, DeepSeek, Azure OpenAI, Bedrock, Vertex | `genai/payg/{provider}` | `genai_usage_daily` |
| SaaS | Canva, Slack, ChatGPT Plus | `subscription/costs/subscription_cost` | `subscription_costs_daily` |

All three types convert to FOCUS 1.3 unified format in `cost_data_standard_1_3`.

## Cloud Billing Pipelines

```bash
# Run via Pipeline Service API
curl -X POST "https://pipeline.cloudact.ai/api/v1/pipelines/run/{org}/gcp/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY"

curl -X POST "https://pipeline.cloudact.ai/api/v1/pipelines/run/{org}/aws/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY"

curl -X POST "https://pipeline.cloudact.ai/api/v1/pipelines/run/{org}/azure/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY"

curl -X POST "https://pipeline.cloudact.ai/api/v1/pipelines/run/{org}/oci/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY"
```

## GenAI Usage Pipelines

```bash
# Individual provider
curl -X POST "https://pipeline.cloudact.ai/api/v1/pipelines/run/{org}/genai/payg/openai" \
  -H "X-API-Key: $ORG_API_KEY"

curl -X POST "https://pipeline.cloudact.ai/api/v1/pipelines/run/{org}/genai/payg/anthropic" \
  -H "X-API-Key: $ORG_API_KEY"

# Same pattern for: gemini, azure_openai, bedrock, vertex
```

## Subscription Cost Pipeline

```bash
curl -X POST "https://pipeline.cloudact.ai/api/v1/pipelines/run/{org}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY"
```

## FOCUS Conversion Procedures

After raw data is ingested, stored procedures convert to FOCUS 1.3:

| Procedure | Trigger | Input | Output |
|-----------|---------|-------|--------|
| `sp_cloud_1_convert_to_focus` | After cloud billing | Cloud raw tables | `cost_data_standard_1_3` |
| `sp_genai_1_consolidate_usage_daily` | After GenAI payg | `genai_usage_daily` | `genai_costs_daily` |
| `sp_genai_3_convert_to_focus` | After consolidation | `genai_costs_daily` | `cost_data_standard_1_3` |
| `sp_subscription_3_convert_to_focus` | After subscription | `subscription_costs_daily` | `cost_data_standard_1_3` |

## Sync Jobs (System-Wide)

| Job | Type | Trigger | Source | Target |
|-----|------|---------|--------|--------|
| Bootstrap meta tables | DDL | Deploy | `schemas/*.json` | `organizations.*` |
| Stored procedures | DDL | Startup | `procedures/*.sql` | BigQuery |
| Pricing tables | Data | Manual | `genai_pricing.yml` | `genai_model_pricing` |
| Provider registry | Config | Startup | `providers.yml` | Memory |
| Stripe products | Sync | Webhook | Stripe | `org_subscriptions` |

## Pipeline x_* Fields

All pipeline outputs MUST include lineage fields:

| Field | Purpose |
|-------|---------|
| `x_org_slug` | Org identifier (multi-tenant isolation) |
| `x_pipeline_id` | Pipeline template |
| `x_credential_id` | Credential used |
| `x_pipeline_run_date` | Data date |
| `x_run_id` | Execution UUID |
| `x_ingested_at` | Write timestamp |
| `x_ingestion_date` | Partition key |

**Rule:** API Service (8000) = NO x_* fields. Pipeline Service (8001) = MUST have x_* fields.

## Verification After Go-Live

```bash
# Check if org has data
# Query BigQuery for recent pipeline runs
bq query --use_legacy_sql=false --project_id=cloudact-prod \
  "SELECT x_pipeline_id, COUNT(*) as rows, MAX(x_ingested_at) as last_run
   FROM \`cloudact-prod.{org_slug}_prod.cost_data_standard_1_3\`
   GROUP BY x_pipeline_id
   ORDER BY last_run DESC"
```
