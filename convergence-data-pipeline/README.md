# Convergence Data Pipeline

Multi-organization data pipeline for cloud cost analytics. Built on FastAPI + BigQuery.

**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

**Single Source of Truth:** All configs, schemas, and pipelines live in `configs/`

---

## Authentication

```
┌─────────────────────────────────────────────────────────────────┐
│                    TWO API KEY TYPES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ADMIN API KEY (X-Admin-Key header)                             │
│  ─────────────────────────────────                              │
│  Source: Environment variable ADMIN_API_KEY                     │
│  Purpose: Bootstrap, onboarding, platform operations            │
│                                                                 │
│  ORGANIZATION API KEY (X-API-Key header)                        │
│  ────────────────────────────────────────                       │
│  Source: Generated during onboarding                            │
│  Purpose: Run pipelines for that organization                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    WHO USES WHAT                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PLATFORM ADMIN (You)                                           │
│  Key: ADMIN_API_KEY - Bootstrap, onboard orgs                   │
│  NEVER share with customers!                                    │
│                                                                 │
│  CUSTOMER (e.g., acmecorp)                                      │
│  Key: acmecorp_api_xxxxxxxx - Run pipelines only                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Set Environment Variables

```bash
export GCP_PROJECT_ID="gac-prod-471220"
export ADMIN_API_KEY="your-secure-admin-key"
export ENVIRONMENT="production"
export KMS_KEY_NAME="projects/{project}/locations/{loc}/keyRings/{ring}/cryptoKeys/{key}"
export ENABLE_API_DOCS="true"  # Enable OpenAPI docs (default: true)
```

**API Documentation:**
- When `ENABLE_API_DOCS=true`: Access Swagger UI at `/docs` and ReDoc at `/redoc`
- When `ENABLE_API_DOCS=false`: Documentation endpoints are disabled
- Default: Enabled in all environments (can be disabled for production security)

### 2. Start Server

```bash
cd convergence-data-pipeline
pip install -r requirements.txt
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000
```

### 3. Bootstrap (ONE-TIME)

```bash
curl -X POST $BASE_URL/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force_recreate_dataset": false}'
```

### 4. Dry-Run (RECOMMENDED)

```bash
curl -X POST $BASE_URL/api/v1/organizations/dryrun \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_slug": "acmecorp", "company_name": "Acme Corp", "admin_email": "admin@acme.com"}'
```

### 5. Onboard Organization

```bash
curl -X POST $BASE_URL/api/v1/organizations/onboard \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_slug": "acmecorp", "company_name": "Acme Corp", "admin_email": "admin@acme.com"}'

# Response: { "api_key": "acmecorp_api_xxxxx", ... }  <-- SAVE THIS!
```

### 6. Run Pipeline

```bash
curl -X POST $BASE_URL/api/v1/pipelines/run/acmecorp/gcp/cost/cost_billing \
  -H "X-API-Key: acmecorp_api_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-25"}'
```

---

## API Endpoints

| Endpoint | Auth | Config |
|----------|------|--------|
| `POST /api/v1/admin/bootstrap` | Admin Key | `configs/setup/bootstrap/pipeline.yml` |
| `POST /api/v1/organizations/dryrun` | Admin Key | `configs/setup/organizations/dryrun/pipeline.yml` |
| `POST /api/v1/organizations/onboard` | Admin Key | `configs/setup/organizations/onboarding/pipeline.yml` |
| `POST /api/v1/pipelines/run/{org}/...` | Org API Key | `configs/gcp/cost/cost_billing.yml` |
| `GET /health` | None | - |

---

## Deployment

```bash
./simple_deploy.sh stage|prod
./simple_test.sh stage|prod
```

| Environment | URL |
|-------------|-----|
| Stage | `https://convergence-pipeline-stage-526075321773.us-central1.run.app` |
| Prod | `https://convergence-pipeline-prod-820784027009.us-central1.run.app` |

---

## Project Structure

```
convergence-data-pipeline/
├── src/app/                              # FastAPI application
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   └── dependencies/auth.py
├── src/core/processors/                  # ⭐ PROCESSORS - Heart of the system
│   ├── setup/initial/                    #    Bootstrap processor
│   ├── setup/organizations/              #    Onboarding + dryrun processors
│   ├── gcp/bq_etl.py                     #    BigQuery ETL engine
│   └── notify_systems/                   #    Email notification engine
└── configs/                              # ⭐ SINGLE SOURCE OF TRUTH
    ├── setup/bootstrap/                  #    Pipeline + schemas (11 JSON files)
    ├── setup/organizations/              #    Onboarding + dryrun configs
    ├── gcp/cost/                         #    GCP cost pipelines
    └── gcp/bq_etl/                       #    BQ ETL schema templates
```

---

## Processors (The Core)

| Processor | File | Config | Purpose |
|-----------|------|--------|---------|
| `setup.initial.onetime_bootstrap` | `onetime_bootstrap_processor.py` | `configs/setup/bootstrap/` | Create central dataset + tables |
| `setup.organizations.dryrun` | `dryrun.py` | `configs/setup/organizations/dryrun/` | Validate before onboarding |
| `setup.organizations.onboarding` | `onboarding.py` | `configs/setup/organizations/onboarding/` | Create org dataset + metadata |
| `gcp.bq_etl` | `bq_etl.py` | `configs/gcp/bq_etl/` | BigQuery extract/transform/load |
| `notify_systems.email_notification` | `email_notification.py` | `configs/notify_systems/email_notification/` | Pipeline notifications |

---

## See Also

- **CLAUDE.md** - Detailed architecture, MUST FOLLOW steps, Processors documentation
