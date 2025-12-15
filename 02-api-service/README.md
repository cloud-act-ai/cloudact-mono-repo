# CloudAct API Service

Frontend-facing API for organization management, authentication, and integrations. Port 8000. Handles bootstrap, onboarding, integration setup, and LLM data CRUD. Does NOT run pipelines or ETL jobs.

**Full Platform Architecture:** `../requirements-docs/00-ARCHITECTURE.md`

## Quick Start

```bash
cd api-service
pip install -r requirements.txt

# Environment variables
export GCP_PROJECT_ID="your-gcp-project-id"
export CA_ROOT_API_KEY="your-secure-admin-key"
export ENVIRONMENT="development"
export DISABLE_AUTH="true"  # LOCAL ONLY

# Run server
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Run tests
python -m pytest tests/ -v                    # All tests
python -m pytest tests/test_01_bootstrap.py   # Single test file
python -m pytest tests/ -k "test_health"      # Pattern match
```

## Service Overview

This service is the **API layer** for the CloudAct platform. It handles:

- **System bootstrap** - Creating central BigQuery tables (15 meta tables)
- **Organization onboarding** - Creating org profiles, API keys, datasets
- **Integration management** - Setting up OpenAI, Anthropic, GCP credentials
- **LLM data management** - Pricing and subscriptions CRUD
- **Subscription management** - Syncing billing status with BigQuery

**Pipeline execution and ETL processing** remain in `data-pipeline-service` (port 8001).

## Bootstrap Configuration

### 15 Meta Tables

The bootstrap process creates **15 central tables** in the `organizations` dataset:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `org_profiles` | Organization metadata | org_slug, company_name, status |
| `org_api_keys` | API key management | api_key, org_slug, is_active |
| `org_subscriptions` | Subscription plans & limits | plan_name, status, daily_limit |
| `org_usage_quotas` | Daily/monthly quota tracking | pipelines_run_today, usage_date |
| `org_integration_credentials` | Encrypted credentials (KMS) | provider, encrypted_credential |
| `org_meta_pipeline_runs` | Pipeline execution history | pipeline_id, status, duration_ms |
| `org_meta_step_logs` | Step-by-step execution logs | step_name, step_status, output |
| `org_meta_dq_results` | Data quality validation results | rule_name, validation_status |
| `org_pipeline_configs` | Pipeline configurations | config_name, config_data |
| `org_scheduled_pipeline_runs` | Scheduled pipeline jobs | schedule_expression, next_run |
| `org_pipeline_execution_queue` | Pipeline queue management | queue_position, priority |
| `org_cost_tracking` | Cost analytics data | provider, cost_amount, cost_date |
| `org_audit_logs` | Audit trail for all operations | action, user_id, timestamp |
| `org_kms_keys` | KMS key management | key_name, key_version |
| `org_idempotency_keys` | Webhook deduplication | idempotency_key, expires_at |

**Schema Location:** `configs/setup/bootstrap/schemas/*.json`

### Bootstrap Endpoint

```bash
# One-time system initialization
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "force_recreate_dataset": false,
    "force_recreate_tables": false
  }'

# Response
{
  "status": "SUCCESS",
  "total_tables": 15,
  "tables_created": ["org_profiles", "org_api_keys", ...],
  "tables_existed": [],
  "dataset_created": true
}
```

**Important:** Bootstrap is idempotent. If tables already exist, they won't be recreated unless `force_recreate_tables: true`.

## API Endpoints

### Admin Endpoints (X-CA-Root-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/admin/bootstrap` | Create central dataset + 15 meta tables |
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

## Testing

### Test Structure

```
tests/
├── test_00_health.py              # Health check tests
├── test_01_bootstrap.py           # Bootstrap tests (15 tables)
├── test_02_organizations.py       # Onboarding tests
├── test_03_integrations.py        # Integration tests
├── test_04_llm_data.py            # LLM data CRUD tests
├── test_05_quota.py               # Quota enforcement tests
├── test_06_user_onboarding_e2e.py # E2E integration tests
└── conftest.py                    # Shared fixtures
```

### Running Tests

```bash
# Unit tests (no external dependencies)
pytest tests/ -v

# Skip integration tests
pytest tests/ -v -m "not integration"

# Integration tests only (requires real services)
pytest tests/ -v -m integration

# E2E tests (full user onboarding journey)
./run_e2e_tests.sh                # All E2E tests
./run_e2e_tests.sh full           # Complete onboarding journey
./run_e2e_tests.sh bootstrap      # Bootstrap only
./run_e2e_tests.sh onboard        # Org onboarding only
./run_e2e_tests.sh integration    # Integration setup only
```

### E2E Testing

**E2E tests validate the complete user onboarding journey:**

1. **Bootstrap** - Create 15 meta tables
2. **Organization Onboarding** - Create org + API key + dataset
3. **Integration Setup** - Store encrypted OpenAI credentials
4. **Pipeline Execution** - Run OpenAI usage pipeline
5. **Data Verification** - Verify quota consumption and data storage
6. **Final Verification** - Check subscription status

**Requirements:**
- Real BigQuery connection
- Valid GCP credentials (`GOOGLE_APPLICATION_CREDENTIALS`)
- KMS encryption enabled (`KMS_KEY_NAME`)
- Real OpenAI API key (`OPENAI_API_KEY`)
- Both services running (api-service:8000, data-pipeline-service:8001)

**Environment Setup:**
```bash
export REQUIRES_INTEGRATION_TESTS=true
export GCP_PROJECT_ID="your-gcp-project-id"
export CA_ROOT_API_KEY="your-admin-key"
export OPENAI_API_KEY="sk-your-openai-key"
export KMS_KEY_NAME="projects/.../cryptoKeys/..."
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"
```

**Running E2E Tests:**
```bash
# Using the shell script (recommended)
./run_e2e_tests.sh

# Using pytest directly
pytest tests/test_06_user_onboarding_e2e.py -m integration -v -s --log-cli-level=INFO

# Run specific E2E scenario
pytest tests/test_06_user_onboarding_e2e.py::test_complete_user_onboarding_e2e -v -s
pytest tests/test_06_user_onboarding_e2e.py::test_bootstrap_only -v -s
pytest tests/test_06_user_onboarding_e2e.py::test_org_onboarding_only -v -s
pytest tests/test_06_user_onboarding_e2e.py::test_integration_setup_only -v -s
```

**E2E Test Guide:**
See `tests/README.md` for detailed E2E testing documentation.

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
│   │   │   ├── openai_data.py         # OpenAI-specific data endpoints
│   │   │   ├── quota.py               # Quota management and enforcement
│   │   │   └── subscription_plans.py  # SaaS subscription plan CRUD
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
│       │   ├── rate_limiter.py        # Rate limiting utilities
│       │   ├── cache.py               # Caching utilities
│       │   └── query_performance.py   # Query performance monitoring
│       ├── observability/
│       │   └── metrics.py             # Prometheus metrics
│       └── exceptions.py              # Custom exceptions
├── configs/
│   ├── setup/
│   │   └── bootstrap/
│   │       └── schemas/               # 15 meta table schemas (JSON)
│   ├── openai/seed/                   # OpenAI seed data (pricing, subscriptions)
│   ├── anthropic/seed/                # Anthropic seed data
│   ├── gemini/seed/                   # Gemini seed data
│   ├── saas/seed/                     # SaaS subscription plans seed data
│   └── system/                        # Provider configurations
├── tests/
│   ├── test_00_health.py              # Health check tests
│   ├── test_01_bootstrap.py           # Bootstrap tests
│   ├── test_02_organizations.py       # Onboarding tests
│   ├── test_03_integrations.py        # Integration tests
│   ├── test_04_llm_data.py            # LLM data CRUD tests
│   ├── test_05_quota.py               # Quota enforcement tests
│   ├── test_06_user_onboarding_e2e.py # E2E integration tests
│   ├── test_cache.py                  # Cache tests
│   └── conftest.py                    # Shared fixtures
├── scripts/
│   └── test_quota_manual.py           # Manual quota testing script
├── run_e2e_tests.sh                   # E2E test runner script
├── Dockerfile
├── requirements.txt
├── pytest.ini
├── README.md
└── CLAUDE.md
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

### Production Requirements

**CRITICAL:** Backend will NOT start in production without proper security configuration.

Required environment variables:
```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```

### Authentication

- All endpoints require authentication (X-CA-Root-Key or X-API-Key)
- Credentials stored encrypted via KMS
- Rate limiting enabled by default
- CORS configured for frontend domains

### API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (15 meta tables)
    │
    └── Creates → Org API Keys (per-organization)
                    │
                    ├── Integrations: POST /api/v1/integrations/{org}/{provider}/setup
                    ├── Pipelines: POST /api/v1/pipelines/run/{org}/... (in pipeline service)
                    └── Data Access: Query org-specific BigQuery datasets
```

**Key Types:**
| Key | Header | Purpose | Scope |
|-----|--------|---------|-------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, org onboarding | System-wide |
| Org API Key | `X-API-Key` | Integrations, pipelines, data | Per-organization |
| Provider Keys | N/A (stored encrypted) | OpenAI, Anthropic, GCP SA | Per-provider |

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
- Never start in production without `DISABLE_AUTH=false`

## Recent Improvements

### Bootstrap Fix (December 2024)
- Fixed bootstrap table count from 14 to **15 tables**
- Added `org_idempotency_keys` table for webhook deduplication
- Updated all documentation and tests to reflect 15 tables
- E2E tests now verify all 15 tables are created

### E2E Testing Infrastructure
- Added comprehensive E2E test suite (`test_06_user_onboarding_e2e.py`)
- Created shell script runner (`run_e2e_tests.sh`) with environment validation
- Supports full journey testing and individual step testing
- Automatic cleanup of test organizations

### Quota Management
- Removed `concurrent_pipelines_limit` (not used in current implementation)
- Simplified quota tracking to `daily_limit` and `monthly_limit`
- Backend validates subscription status before pipeline execution

## Documentation

| Document | Description |
|----------|-------------|
| `README.md` | This file - overview and quick start |
| `CLAUDE.md` | Detailed service architecture and API reference |
| `tests/README.md` | Test structure and E2E testing guide |
| `../requirements-docs/00-ARCHITECTURE.md` | Full platform architecture |
| `../requirements-docs/01_ORGANIZATION_ONBOARDING.md` | Onboarding flow details |

---

**Last Updated:** 2025-12-06
