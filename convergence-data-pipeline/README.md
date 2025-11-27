# Convergence Data Pipeline

Multi-organization data pipeline for cloud cost analytics. Built on FastAPI + BigQuery.

**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

**Single Source of Truth:** All configs, schemas, and pipelines live in `configs/`

---

## Authentication

### API Key Architecture

| Key | Header | Used For |
|-----|--------|----------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, Org Onboarding |
| Org API Key | `X-API-Key` | Integrations, Pipelines, Data |

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. BOOTSTRAP (One-time system setup)                           │
│  POST /api/v1/admin/bootstrap                                   │
│  Header: X-CA-Root-Key: {CA_ROOT_API_KEY}                       │
│                                                                 │
│  Creates centralized "organizations" dataset with meta tables:  │
│  └── org_api_keys, org_profiles, org_subscriptions, etc.        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. ONBOARD ORGANIZATION                                        │
│  POST /api/v1/organizations/onboard                             │
│  Header: X-CA-Root-Key: {CA_ROOT_API_KEY}                       │
│                                                                 │
│  Creates:                                                       │
│  ├── org_api_keys row (SHA256 hash + KMS encrypted key)        │
│  ├── org_profiles row (company info)                            │
│  ├── org_subscriptions row (plan limits)                        │
│  ├── org_usage_quotas row (initialized to 0)                    │
│  └── Dataset: {org_slug} (per-org data isolation)               │
│                                                                 │
│  Returns: api_key (shown ONCE, stored in frontend user metadata)│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. SETUP INTEGRATIONS                                          │
│  POST /api/v1/integrations/{org}/{provider}/setup               │
│  Header: X-API-Key: {org_api_key}                               │
│                                                                 │
│  Stores credentials (KMS encrypted) per org:                    │
│  ├── GCP Service Account JSON                                   │
│  ├── OpenAI API Key                                             │
│  ├── Anthropic API Key                                          │
│  └── DeepSeek API Key                                           │
│                                                                 │
│  Isolation: WHERE org_slug = @org_slug                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. RUN PIPELINES                                               │
│  POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}│
│  Header: X-API-Key: {org_api_key}                               │
│                                                                 │
│  Execution:                                                     │
│  1. Validate org API key → get org_slug                         │
│  2. Check quota: WHERE org_slug = @org_slug                     │
│  3. Get credentials: WHERE org_slug = @org_slug AND provider=X  │
│  4. KMS decrypt org's credentials                               │
│  5. Create BigQuery client with org's credentials               │
│  6. Execute pipeline                                            │
│  7. Write results to {project}.{org_slug}.{table}               │
│  8. Log execution: INSERT ... (org_slug, pipeline_id, ...)      │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Tenant Isolation

**Single KMS Key for All Orgs** - Isolation is at DATA layer:

```sql
-- Credentials encrypted with shared KMS key
-- Isolation via org_slug filter in every query
SELECT encrypted_credential
FROM organizations.org_integration_credentials
WHERE org_slug = @org_slug  -- ← THIS provides isolation
  AND provider = 'GCP_SA'
```

**Concurrent Pipeline Execution (Org A + Org B):**
- Each request authenticated by unique org API key
- org_slug extracted from API key lookup
- Credentials fetched: WHERE org_slug = @org_slug
- Separate BigQuery client per execution
- Data writes to separate datasets: {org_slug}.*
- NO shared state between executions

---

## Quick Start

### 1. Set Environment Variables

```bash
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="your-secure-admin-key"
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
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force_recreate_dataset": false}'
```

### 4. Dry-Run (RECOMMENDED)

```bash
curl -X POST $BASE_URL/api/v1/organizations/dryrun \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_slug": "acmecorp", "company_name": "Acme Corp", "admin_email": "admin@acme.com"}'
```

### 5. Onboard Organization

```bash
curl -X POST $BASE_URL/api/v1/organizations/onboard \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
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
