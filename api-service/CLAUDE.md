# CloudAct API Service

## Gist

Frontend-facing API for org management, auth, and integrations. Port 8000. Handles bootstrap, onboarding, integration setup, and LLM data CRUD. Does NOT run pipelines or ETL jobs.

**Full Platform Architecture:** `../requirements-docs/00-ARCHITECTURE.md`

## Service Flow

```
Frontend (Next.js)
    │
    ├─ POST /api/v1/admin/bootstrap (X-CA-Root-Key)
    │   └─ One-time: Create central dataset + 14 meta tables
    │
    ├─ POST /api/v1/organizations/onboard (X-CA-Root-Key)
    │   └─ Create org + dataset + API key + subscription
    │
    ├─ POST /api/v1/integrations/{org}/{provider}/setup (X-API-Key)
    │   └─ Validate → KMS encrypt → Store credentials
    │
    └─ GET/POST/PUT/DELETE /api/v1/integrations/{org}/... (X-API-Key)
        └─ Manage pricing, subscriptions, integrations
```

## DO's and DON'Ts

### DO
- Handle bootstrap and org onboarding
- Manage organization profiles and subscriptions
- Setup and validate integrations (OpenAI, Anthropic, GCP)
- Store credentials encrypted via KMS
- Provide CRUD endpoints for LLM pricing and subscriptions
- Validate all inputs (org_slug, email, credentials)
- Rate limit sensitive operations
- Return integration status to frontend

### DON'T
- Never run pipelines or execute ETL jobs (use pipeline service)
- Never process usage data or cost calculations (use pipeline service)
- Never skip authentication (X-CA-Root-Key or X-API-Key required)
- Never return actual credentials (only status and metadata)
- Never create schemas directly (use configs/)
- Never allow org onboarding without subscription plan
- Never start in production without DISABLE_AUTH=false

## Overview

This service is the **API layer** extracted from the data-pipeline-service. It handles:
- System bootstrap (creating central BigQuery tables)
- Organization onboarding (creating org profiles, API keys, datasets)
- Integration management (setting up OpenAI, Anthropic, GCP credentials)
- LLM data management (pricing, subscriptions CRUD)

**Pipeline execution and ETL processing** remain in `data-pipeline-service` (port 8001).

## API Endpoints

### Admin Endpoints (X-CA-Root-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/admin/bootstrap` | Create central dataset + 14 meta tables |
| POST | `/api/v1/organizations/onboard` | Create organization + API key + dataset |
| POST | `/api/v1/organizations/dryrun` | Validate org before onboarding |
| PUT | `/api/v1/organizations/{org}/subscription` | Update subscription limits |

### Organization Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/integrations/{org}/{provider}/setup` | Setup integration (OpenAI, Anthropic, GCP) |
| POST | `/api/v1/integrations/{org}/{provider}/validate` | Validate integration credentials |
| GET | `/api/v1/integrations/{org}` | Get all integration statuses |
| GET | `/api/v1/integrations/{org}/{provider}` | Get specific integration status |
| DELETE | `/api/v1/integrations/{org}/{provider}` | Remove integration |
| GET | `/api/v1/integrations/{org}/{provider}/pricing` | List pricing models |
| POST | `/api/v1/integrations/{org}/{provider}/pricing` | Add pricing model |
| GET | `/api/v1/integrations/{org}/{provider}/subscriptions` | List subscriptions |
| POST | `/api/v1/integrations/{org}/{provider}/subscriptions` | Add subscription |

## Project Structure

```
api-service/
├── src/
│   ├── app/
│   │   ├── main.py                    # FastAPI entry point
│   │   ├── config.py                  # Settings (env vars)
│   │   ├── routers/
│   │   │   ├── admin.py               # Bootstrap endpoint
│   │   │   ├── organizations.py       # Onboarding + subscription management
│   │   │   ├── integrations.py        # Integration CRUD
│   │   │   ├── llm_data.py            # LLM pricing/subscriptions management
│   │   │   └── openai_data.py         # OpenAI-specific data endpoints
│   │   ├── models/
│   │   │   └── org_models.py          # Pydantic models
│   │   ├── middleware/
│   │   │   └── validation.py          # Request validation
│   │   └── dependencies/
│   │       ├── auth.py                # Authentication
│   │       └── rate_limit_decorator.py # Rate limiting
│   └── core/
│       ├── engine/
│       │   └── bq_client.py           # BigQuery client
│       ├── security/
│       │   └── kms_encryption.py      # KMS encryption
│       ├── providers/
│       │   ├── registry.py            # Provider configuration
│       │   └── validator.py           # Credential validation
│       ├── processors/
│       │   ├── setup/                 # Bootstrap + onboarding processors
│       │   ├── integrations/          # Integration processors
│       │   ├── openai/                # OpenAI authenticator
│       │   ├── anthropic/             # Anthropic authenticator
│       │   └── gcp/                   # GCP authenticator
│       ├── utils/
│       │   ├── logging.py             # Logging configuration
│       │   └── rate_limiter.py        # Rate limiting utilities
│       ├── observability/
│       │   └── metrics.py             # Prometheus metrics
│       └── exceptions.py              # Custom exceptions
├── configs/
│   ├── setup/                         # Bootstrap + onboarding configs
│   ├── openai/seed/                   # OpenAI seed data (pricing, subscriptions)
│   ├── anthropic/seed/                # Anthropic seed data
│   ├── gemini/seed/                   # Gemini seed data
│   └── system/                        # Provider configurations
├── tests/
│   ├── test_00_health.py              # Health check tests
│   ├── test_01_bootstrap.py           # Bootstrap tests
│   ├── test_02_organizations.py       # Onboarding tests
│   └── test_03_integrations.py        # Integration tests
├── Dockerfile
├── requirements.txt
├── pytest.ini
└── CLAUDE.md
```

## Local Development

```bash
cd api-service
pip install -r requirements.txt

# Environment variables
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="your-secure-admin-key"
export ENVIRONMENT="development"
export DISABLE_AUTH="true"  # LOCAL ONLY

# Run server
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000

# Run tests
python -m pytest tests/ -v
```

## Relationship with data-pipeline-service

| api-service | data-pipeline-service |
|---------------------|---------------------------|
| Frontend-facing API | Pipeline execution engine |
| Org management | Scheduled pipelines |
| Integration setup | Usage data processing |
| Credential storage | Cost calculations |
| Same BigQuery | Same BigQuery |

Both services share:
- BigQuery datasets (organizations, per-org datasets)
- KMS encryption keys
- Configuration files
- Auth models

## Security

- All endpoints require authentication (X-CA-Root-Key or X-API-Key)
- Credentials stored encrypted via KMS
- Rate limiting enabled by default
- CORS configured for frontend domains

Required production environment variables:
```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```
