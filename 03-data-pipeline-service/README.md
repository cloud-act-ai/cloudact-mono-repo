# Data Pipeline Service

Pipeline execution engine for ETL jobs. Port 8001.

**Bootstrap/Onboarding:** Use `api-service` (port 8000) - NOT this service.

---

## What This Service Does

- Run scheduled pipelines (daily GCP billing, OpenAI usage)
- Execute ad-hoc pipeline runs via API
- Process usage data and calculate costs
- Decrypt credentials from BigQuery using KMS

## What This Service Does NOT Do

- Bootstrap (use api-service)
- Organization onboarding (use api-service)
- Integration setup (use api-service)

---

## Quick Start

### Prerequisites

Organization must be onboarded via `api-service` first.

### Environment Variables

```bash
export GCP_PROJECT_ID="your-gcp-project-id"
export CA_ROOT_API_KEY="your-secure-admin-key"
export ENVIRONMENT="development"
export KMS_KEY_NAME="projects/{project}/locations/{loc}/keyRings/{ring}/cryptoKeys/{key}"
```

### Start Server

```bash
cd data-pipeline-service
pip install -r requirements.txt
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001
```

### Run Pipeline

```bash
# Run GCP Billing pipeline
curl -X POST http://localhost:8001/api/v1/pipelines/run/acmecorp/gcp/cost/billing \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-25"}'
```

---

## API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Org API Key | Run pipeline |
| `GET /api/v1/pipelines/runs/{pipeline_logging_id}` | Org API Key | Get pipeline status |
| `GET /api/v1/pipelines/runs` | Org API Key | List pipeline runs |
| `POST /api/v1/scheduler/trigger` | Admin Key | Trigger due pipelines |
| `POST /api/v1/scheduler/process-queue` | Admin Key | Process queue |
| `GET /health` | None | Health check |

---

## Authentication

| Key | Header | Used For |
|-----|--------|----------|
| Org API Key | `X-API-Key` | Pipeline execution |
| Admin Key | `X-CA-Root-Key` | Scheduler operations |

Pipeline execution validates:
1. Org API key is valid and active
2. Subscription status is ACTIVE or TRIAL
3. Provider credentials exist
4. Quotas not exceeded (daily, monthly, concurrent)

---

## Deployment

```bash
./simple_deploy.sh stage|prod
```

| Environment | URL |
|-------------|-----|
| Stage | `https://convergence-pipeline-stage-526075321773.us-central1.run.app` |
| Prod | `https://convergence-pipeline-prod-820784027009.us-central1.run.app` |

---

## Project Structure

```
data-pipeline-service/
├── src/app/
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   │   ├── pipelines.py          # Pipeline execution
│   │   └── scheduler.py          # Scheduled runs
│   └── dependencies/auth.py
├── src/core/processors/          # ETL processors
│   ├── openai/
│   ├── anthropic/
│   ├── gcp/
│   └── integrations/
└── configs/                      # Pipeline configs
    ├── openai/
    ├── anthropic/
    ├── gcp/
    └── system/
```

---

## See Also

- **CLAUDE.md** - Detailed architecture and processor documentation
- **api-service** - Bootstrap, onboarding, integration setup (port 8000)
