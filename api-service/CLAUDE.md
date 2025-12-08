# CloudAct API Service

## Gist

Frontend-facing API for org management, auth, and integrations. Port 8000. Handles bootstrap, onboarding, integration setup, and LLM data CRUD. Does NOT run pipelines or ETL jobs.

**Full Platform Architecture:** `../requirements-docs/00-ARCHITECTURE.md`

## Service Flow

```
Frontend (Next.js)
    │
    ├─ POST /api/v1/admin/bootstrap (X-CA-Root-Key)
    │   └─ One-time: Create central dataset + 15 meta tables
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

### Environment Setup (.env.local)

All credentials are stored in `.env.local`. Create this file:

```bash
# .env.local
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_PROJECT_ID=gac-prod-471220
CA_ROOT_API_KEY=your-secure-admin-key-32chars
KMS_KEY_NAME=projects/gac-prod-471220/locations/us-central1/keyRings/.../cryptoKeys/...
ENVIRONMENT=development
DISABLE_AUTH=false
RUN_INTEGRATION_TESTS=true
```

### Running the Server

```bash
cd api-service
pip install -r requirements.txt

# Load .env.local and run server
source .env.local && python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Running Tests

Tests automatically load credentials from `.env.local`:

```bash
# Unit tests (mocked BigQuery)
python -m pytest tests/ -v

# Integration tests (real BigQuery - uses .env.local credentials)
python -m pytest tests/ -v --run-integration

# Single test file
python -m pytest tests/test_01_bootstrap.py -v --run-integration

# Pattern match
python -m pytest tests/ -k "test_health" -v
```

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

**Bootstrap is idempotent:** If tables already exist, they won't be recreated unless `force_recreate_tables: true`.

## E2E Testing

### Quick Start

```bash
# Run E2E tests (requires real services)
./run_e2e_tests.sh

# Specific test scenarios
./run_e2e_tests.sh full          # Complete onboarding journey
./run_e2e_tests.sh bootstrap     # Bootstrap only
./run_e2e_tests.sh onboard       # Org onboarding only
./run_e2e_tests.sh integration   # Integration setup only
```

### E2E Test Flow

E2E tests validate the **complete user onboarding journey**:

1. **Bootstrap** - Create 15 meta tables in BigQuery
2. **Organization Onboarding** - Create org profile + API key + dataset
3. **Integration Setup** - Store encrypted OpenAI credentials (KMS)
4. **Pipeline Execution** - Run OpenAI usage pipeline
5. **Data Verification** - Verify quota consumption and data storage
6. **Final Verification** - Check subscription status and limits

### Requirements

- Real BigQuery connection (GCP project)
- Valid GCP credentials (service account JSON)
- KMS encryption enabled and accessible
- Real OpenAI API key (for integration testing)
- Both services running:
  - api-service on port 8000
  - data-pipeline-service on port 8001

**Environment Setup:**
```bash
export REQUIRES_INTEGRATION_TESTS=true
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="your-admin-key"
export OPENAI_API_KEY="sk-your-openai-key"
export KMS_KEY_NAME="projects/.../cryptoKeys/..."
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"
```

**See `tests/README.md` for detailed E2E testing documentation.**

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

## Recent Improvements

### Bootstrap Fix (December 2024)
- **Fixed bootstrap table count from 14 to 15 tables:**
  - Added `org_idempotency_keys` table for webhook deduplication
  - Updated all documentation and tests to reflect 15 tables
  - E2E tests now verify all 15 tables are created
  - Bootstrap endpoint response shows `total_tables: 15`

### E2E Testing Infrastructure
- **Added comprehensive E2E test suite** (`test_06_user_onboarding_e2e.py`):
  - Tests complete user onboarding journey (6 steps)
  - Validates bootstrap, onboarding, integration setup, pipeline execution
  - Supports focused testing (bootstrap-only, onboarding-only, integration-only)
  - Automatic cleanup of test organizations
- **Created shell script runner** (`run_e2e_tests.sh`):
  - Environment variable validation
  - Service availability checks
  - Helpful error messages and troubleshooting tips
  - Multiple test scenarios support

### Quota Management Simplification
- **Removed `concurrent_pipelines_limit` from subscription model:**
  - Not used in current pipeline execution logic
  - Simplified quota tracking to `daily_limit` and `monthly_limit`
  - Reduced complexity in onboarding and subscription management
  - Backend validates subscription status before pipeline execution

### SaaS Subscription Plan CRUD with Version History (December 2024)
- **Added version-creating edit endpoint:**
  - `POST /api/v1/subscriptions/{org}/providers/{provider}/plans/{id}/edit-version`
  - Creates new row when editing (old row gets `end_date`, new row starts from `effective_date`)
  - Maintains full version history for audit and cost tracking
  - Supports future-dated changes (shows "Pending" status)
- **Changed delete to soft delete:**
  - Plans are ended via `end_date` instead of hard delete
  - Status changes to `cancelled` when ended
  - Historical data preserved for cost calculations
- **New status values:** `active`, `cancelled`, `expired`, `pending`
- **Pipeline compatibility:** Existing `sp_calculate_saas_subscription_plan_costs_daily.sql` already handles date ranges correctly

### Documentation Updates
- Created `README.md` with quick start and bootstrap details
- Created `tests/README.md` with comprehensive E2E testing guide
- Updated `CLAUDE.md` with 15 tables and E2E testing section
- All docs now consistent with 15-table bootstrap

### Performance Analysis (December 2024)
- **Comprehensive BigQuery performance audit:**
  - Analyzed 14 files with BigQuery operations
  - ✅ SELECT * queries already optimized (explicit column lists)
  - ✅ MAX_LIMIT already at 500 (not 10000)
  - ⚠️ Missing query timeouts (30s user, 300s batch) - HIGH PRIORITY
  - ⚠️ Connection cleanup needs verification - MEDIUM PRIORITY
- **Created `PERFORMANCE_ANALYSIS.md`:**
  - Detailed findings for all 14 files
  - Query timeout recommendations
  - Performance testing plan
  - Success criteria and benchmarks
- **Next steps:** Add timeouts to all BigQuery operations (Phase 2 - Week 2)

---

**Last Updated:** 2025-12-07
