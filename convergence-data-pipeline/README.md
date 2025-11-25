# Convergence Data Pipeline

Multi-organization data pipeline for cloud cost analytics. Built on FastAPI + BigQuery.

## Quick Start

```bash
# 1. Generate admin key
python3 scripts/generate_admin_key.py
export ADMIN_API_KEY='admin_<generated>'

# 2. Start server
cd convergence-data-pipeline
pip install -r requirements.txt
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000

# 3. Bootstrap (one-time)
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false}'

# 4. Onboard organization
curl -X POST http://localhost:8000/api/v1/organizations/onboard \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"org_slug": "acmecorp", "company_name": "Acme Corp", "admin_email": "admin@acme.com"}'
```

## Deployment

```bash
./simple_deploy.sh stage   # Deploy to staging
./simple_deploy.sh prod    # Deploy to production
./simple_test.sh stage     # Test staging
./simple_test.sh prod      # Test production
```

## Architecture

```
Central Dataset: organizations
├── org_profiles, org_api_keys, org_subscriptions
├── org_usage_quotas, org_cloud_credentials, org_pipeline_configs
├── org_scheduled_pipeline_runs, org_pipeline_execution_queue
└── org_meta_pipeline_runs, org_meta_step_logs, org_meta_dq_results

Per-Organization: {org_slug}_{env}
└── gcp_cost_billing, aws_cost_*, azure_cost_*
```

## API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/v1/admin/bootstrap` | Admin | Initialize system |
| `POST /api/v1/organizations/onboard` | Admin | Create org + API key |
| `POST /api/v1/pipelines/run/{org}/...` | Org API Key | Run pipeline |
| `GET /health` | None | Health check |

## Environment URLs

- **Staging**: `https://convergence-pipeline-stage-526075321773.us-central1.run.app`
- **Production**: `https://convergence-pipeline-prod-820784027009.us-central1.run.app`

## Project Structure

```
convergence-data-pipeline/
├── src/app/main.py              # FastAPI entry
├── src/app/routers/             # API endpoints
├── src/core/processors/         # Pipeline logic
├── configs/                     # Pipeline YAML configs
└── ps_templates/                # Step templates
```
