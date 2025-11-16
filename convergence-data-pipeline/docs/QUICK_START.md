# Quick Start Guide

Get the Convergence Data Pipeline running locally in 5 minutes.

## Prerequisites

- **Python 3.11+** (`python3 --version`)
- **GCP Project** with BigQuery enabled
- **Service Account JSON** with BigQuery Admin permissions (`~/.gcp/gac-prod-471220-e34944040b62.json`)

## Setup (5 minutes)

### 1. Install Dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your GCP_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS path
```

Key settings:
- `GCP_PROJECT_ID=gac-prod-471220`
- `GOOGLE_APPLICATION_CREDENTIALS=~/.gcp/gac-prod-471220-e34944040b62.json`
- `DISABLE_AUTH=true` (for local development)
- `DEFAULT_TENANT_ID=acme1281`

### 3. Start the Server

```bash
uvicorn src.app.main:app --reload --port 8080
```

Visit http://localhost:8080/docs for interactive API documentation.

## Onboard Your First Customer

```bash
curl -X POST http://localhost:8080/api/v1/customers/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme1281",
    "force_recreate_dataset": false,
    "force_recreate_tables": false
  }'
```

Response includes:
- `tenant_id`: acme1281
- `api_key`: Your new API key (save this!)
- `dataset_created`: true/false
- `tables_created`: List of initialized tables

## Run Your First Pipeline

1. **List available pipelines** for a tenant:
```bash
curl http://localhost:8080/api/v1/pipelines \
  -H "X-API-Key: your-api-key"
```

2. **Trigger a pipeline** (example):
```bash
curl -X POST http://localhost:8080/api/v1/pipelines/run/p_openai_billing \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_by": "api_user",
    "date": "2025-11-14"
  }'
```

Response:
```json
{
  "pipeline_logging_id": "uuid-here",
  "pipeline_id": "p_openai_billing",
  "tenant_id": "acme1281",
  "status": "running",
  "message": "Pipeline queued for execution"
}
```

3. **Check pipeline status**:
```bash
curl http://localhost:8080/api/v1/pipelines/runs/uuid-here \
  -H "X-API-Key: your-api-key"
```

## Verify Results in BigQuery

```bash
# Check pipeline run history
bq query --use_legacy_sql=false \
  "SELECT * FROM acme1281.pipeline_runs ORDER BY start_time DESC LIMIT 5"

# View loaded data (example)
bq query --use_legacy_sql=false \
  "SELECT * FROM acme1281.gcp_billing_export LIMIT 10"

# Check data quality results
bq query --use_legacy_sql=false \
  "SELECT * FROM acme1281.dq_results ORDER BY run_date DESC LIMIT 10"
```

## Next Steps

1. **Configure Pipelines**: See [`docs/pipeline-configuration.md`](pipeline-configuration.md)
2. **Onboarding Guide**: See [`docs/ONBOARDING.md`](ONBOARDING.md)
3. **Environment Variables**: See [`docs/ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md)
4. **Deployment**: See [`docs/DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md)
5. **Metadata Schema**: See [`docs/metadata-schema.md`](metadata-schema.md)

## Troubleshooting

**API returns 401 Unauthorized**
- Check `X-API-Key` header is set
- Verify tenant exists: `SELECT * FROM metadata.api_keys`

**Pipeline fails with "Dataset not found"**
- Ensure tenant was onboarded: `POST /customers/onboard`
- Check BigQuery permissions on service account

**Cannot connect to BigQuery**
- Verify `GOOGLE_APPLICATION_CREDENTIALS` path is correct
- Check service account has BigQuery Admin role in GCP

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/customers/onboard` | Create new tenant and dataset |
| GET | `/api/v1/pipelines` | List available pipelines |
| POST | `/api/v1/pipelines/run/{pipeline_id}` | Trigger pipeline |
| GET | `/api/v1/pipelines/runs/{run_id}` | Get pipeline run status |
| GET | `/api/v1/pipelines/runs` | List pipeline runs (filter by tenant) |
| POST | `/api/v1/pipelines/runs/{run_id}/cancel` | Cancel running pipeline |
| GET | `/health` | Health check |
| GET | `/docs` | Interactive API docs (Swagger UI) |

## Architecture

```
┌─────────────────────┐
│    FastAPI Server   │ (Cloud Run / Local)
│  ┌───────────────┐  │
│  │ API Routers   │  │
│  │ - pipelines   │  │
│  │ - customers   │  │
│  │ - admin       │  │
│  └───────────────┘  │
└──────────┬──────────┘
           │
      (HTTP/REST)
           │
    ┌──────▼───────┐
    │  BigQuery    │
    │ (Multi-Region)
    │ - metadata   │
    │ - raw data   │
    │ - silver     │
    └──────────────┘
```

See [`README.md`](../README.md) for full technical documentation.
