# Pipeline Service (Port 8001)

Pipeline execution engine. Runs ETL jobs, processes costs, converts to FOCUS 1.3. Does NOT handle integrations/onboarding (8000).

**Core:** `API Request → configs/ → Processor → BigQuery`

## Production Requirements

1. **NO MOCKS** - Production-ready code only
2. **VERIFY FIRST** - Read files before referencing
3. **ENV FILES** - Use `.env.local` (never `.env`)

## Development

```bash
cd 03-data-pipeline-service
source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8001 --reload
python -m pytest tests/ -v
```

## Pipeline Architecture

```
configs/
├─ genai/               # OpenAI, Anthropic, Gemini, DeepSeek
│  ├─ payg/             # Pay-as-you-go pipelines
│  ├─ commitment/       # AWS Bedrock, Azure PTU, GCP Vertex
│  ├─ infrastructure/   # GCP GPU costs
│  └─ unified/          # Consolidation pipeline
├─ cloud/               # GCP, AWS, Azure, OCI
│  └─ unified/          # Focus conversion
├─ subscription/        # SaaS cost calculation
└─ system/
   ├─ providers.yml     # Provider registry
   └─ procedures/*.sql  # Stored procedures
```

**URL Pattern:** `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}`

## Processors

| Processor | ps_type | Config |
|-----------|---------|--------|
| OpenAI | `genai.payg_usage` | `genai/payg/openai.yml` |
| Anthropic | `genai.payg_usage` | `genai/payg/anthropic.yml` |
| Gemini | `genai.payg_usage` | `genai/payg/gemini.yml` |
| DeepSeek | `genai.payg_usage` | `genai/payg/deepseek.yml` |
| GCP Billing | `cloud.gcp.external_bq_extractor` | `cloud/gcp/cost/billing.yml` |
| AWS CUR | `cloud.aws.cur_extractor` | `cloud/aws/cost/billing.yml` |
| Azure | `cloud.azure.cost_extractor` | `cloud/azure/cost/billing.yml` |
| OCI | `cloud.oci.cost_extractor` | `cloud/oci/cost/billing.yml` |
| Subscription | `generic.procedure_executor` | `subscription/costs/*.yml` |
| Focus Convert | `cloud.focus_converter` | `cloud/unified/focus_convert.yml` |

## x_* Pipeline Lineage Fields

**CRITICAL:** All pipeline tables MUST include:

| Column | Type | Purpose |
|--------|------|---------|
| `x_org_slug` | STRING | Organization identifier (multi-tenant row isolation) |
| `x_pipeline_id` | STRING | Pipeline template name |
| `x_credential_id` | STRING | Credential ID (multi-account isolation) |
| `x_pipeline_run_date` | DATE | Data date (idempotency key) |
| `x_run_id` | STRING | Execution UUID |
| `x_ingested_at` | TIMESTAMP | Write timestamp |
| `x_ingestion_date` | DATE | Partition key |

**Composite key for idempotent writes:** `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)`

**5-field hierarchy model** (cost allocation):
`x_hierarchy_entity_id`, `x_hierarchy_entity_name`, `x_hierarchy_level_code`, `x_hierarchy_path`, `x_hierarchy_path_names`

## Pipeline Validation Flow

```
1. Pipeline request received
2. Call API service: POST /api/v1/validator/validate/{org}
3. API service checks subscription + quota (atomic, with self-healing)
4. If valid → Execute pipeline steps (DAG-based, parallel where possible)
5. On complete → POST /api/v1/validator/complete/{org} (releases quota)
```

## Step-Based Execution

Each pipeline has ordered steps with dependencies:

```yaml
steps:
  - step_id: extract_usage
    ps_type: genai.payg_usage
    timeout_seconds: 300
    retry:
      max_attempts: 3
      backoff_seconds: 30
    depends_on: []
  - step_id: calculate_costs
    ps_type: genai.payg_cost
    depends_on: [extract_usage]
```

Independent steps execute in parallel. Failed steps trigger retry with exponential backoff.

## Key Endpoints

```bash
# GenAI
POST /api/v1/pipelines/run/{org}/genai/payg/openai
POST /api/v1/pipelines/run/{org}/genai/payg/anthropic
POST /api/v1/pipelines/run/{org}/genai/payg/gemini
POST /api/v1/pipelines/run/{org}/genai/payg/deepseek
POST /api/v1/pipelines/run/{org}/genai/unified/consolidate

# Cloud
POST /api/v1/pipelines/run/{org}/cloud/gcp/cost/billing
POST /api/v1/pipelines/run/{org}/cloud/aws/cost/billing
POST /api/v1/pipelines/run/{org}/cloud/azure/cost/billing
POST /api/v1/pipelines/run/{org}/cloud/oci/cost/billing
POST /api/v1/pipelines/run/{org}/cloud/unified/focus_convert

# Subscription
POST /api/v1/pipelines/run/{org}/subscription/costs/subscription_cost

# Procedures
POST /api/v1/procedures/sync
GET  /api/v1/procedures/list

# Run Management
GET  /api/v1/pipelines/{org}/runs
GET  /api/v1/pipelines/{org}/runs/{id}
DELETE /api/v1/pipelines/runs/{id}
```

## Stored Procedures

All in `organizations` dataset, operate on per-org datasets:

| Domain | Procedures |
|--------|------------|
| GenAI | `sp_genai_1_consolidate_usage_daily`, `sp_genai_2_consolidate_costs_daily`, `sp_genai_3_convert_to_focus` |
| Subscription | `sp_subscription_2_calculate_daily_costs`, `sp_subscription_3_convert_to_focus` |
| Cloud | `sp_cloud_gcp_convert_to_focus`, `sp_cloud_aws_convert_to_focus`, `sp_cloud_azure_convert_to_focus`, `sp_cloud_oci_convert_to_focus` |

**Auto-sync:** Procedures sync from `configs/system/procedures/*.sql` on service startup.

## Notification System

```
Pipeline Event → NotificationService → Email/Slack
```

**Split:** API (8000) = Settings CRUD | Pipeline (8001) = Sending

## Project Structure

```
src/
├─ app/routers/      # pipelines, procedures, scheduler, alerts
├─ core/
│  ├─ processors/    # Execution engines (genai, cloud, generic)
│  ├─ pipeline/      # AsyncPipelineExecutor (DAG, parallel steps)
│  ├─ notifications/ # Email/Slack providers
│  └─ engine/        # BigQuery client
└─ configs/
   ├─ {provider}/{domain}/*.yml
   └─ system/procedures/*.sql
```

## Key Files

| File | Purpose |
|------|---------|
| `configs/{provider}/{domain}/*.yml` | Pipeline configs |
| `configs/system/procedures/*.sql` | Stored procedures |
| `src/core/processors/` | Execution engines |
| `src/core/pipeline/executor.py` | AsyncPipelineExecutor |

## Deployment

### Build & Deploy

```bash
cd 04-inra-cicd-automation/CICD

# Deploy pipeline-service only
./cicd.sh pipeline-service prod cloudact-prod

# Or use quick deploy
./quick/deploy-prod.sh pipeline-service
```

### Environment Variables

Set via Cloud Run at deploy time:
- `GCP_PROJECT_ID` - GCP project
- `BIGQUERY_LOCATION` - BigQuery region (US)
- `ENVIRONMENT` - production/staging/test
- `CA_ROOT_API_KEY` - From Secret Manager
- `API_SERVICE_URL` - Auto-discovered

### Cloud Run Config

| Setting | Value |
|---------|-------|
| Port | 8001 |
| CPU | 2 |
| Memory | 8Gi |
| Timeout | 300s |
| Min Instances | 2 (prod) |
| Max Instances | 10 (prod) |

### Version Update

Before creating release tag, update version in `src/app/config.py`:
```python
release_version: str = Field(default="v4.3.0")
release_timestamp: str = Field(default="2026-02-08T00:00:00Z")
```

---
**v4.3.0** | 2026-02-08
