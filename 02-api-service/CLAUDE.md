# API Service (Port 8000)

## Gist

Frontend-facing API for org management, auth, and integrations. Handles bootstrap, onboarding, integration setup, subscription plans, and cost analytics (Polars-powered). Does NOT run pipelines or ETL jobs.

**Full Platform Architecture:** `../00-requirements-docs/00-ARCHITECTURE.md`

## Service Responsibilities

```
Frontend (Next.js) → API Service (8000)
    │
    ├─ Bootstrap: Create 15 meta tables (one-time)
    ├─ Onboarding: Create org + dataset + API key
    ├─ Integrations: Setup/validate credentials (OpenAI, Anthropic, GCP)
    ├─ Subscription Plans: CRUD with version history
    └─ Cost Analytics: Polars-powered cost aggregation and analysis
```

**Pipeline execution happens on port 8001** (see `../03-data-pipeline-service/CLAUDE.md`)

## Router Structure

| Router | File | Endpoints | Purpose |
|--------|------|-----------|---------|
| **Admin** | `src/app/routers/admin.py` | `/api/v1/admin/*` | Bootstrap, dev API key retrieval |
| **Organizations** | `src/app/routers/organizations.py` | `/api/v1/organizations/*` | Onboarding, subscription management |
| **Integrations** | `src/app/routers/integrations.py` | `/api/v1/integrations/*` | Integration setup/validate/status |
| **LLM Data** | `src/app/routers/llm_data.py` | `/api/v1/integrations/{org}/{provider}/pricing` | LLM pricing/subscriptions CRUD |
| **Subscription Plans** | `src/app/routers/subscription_plans.py` | `/api/v1/subscriptions/*` | SaaS plan CRUD with version history |
| **Cost Service** | `src/app/routers/cost_service.py` | `/api/v1/costs/*` | Polars-powered cost analytics |

## FastAPI Server Commands

```bash
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/02-api-service

# Install dependencies
pip install -r requirements.txt

# Run server (development)
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Run with .env.local
source .env.local && python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Run tests
python -m pytest tests/ -v                    # All tests
python -m pytest tests/ -v --run-integration  # Integration tests (real BigQuery)
python -m pytest tests/test_01_bootstrap.py   # Single test file
python -m pytest tests/ -k "test_health"      # Pattern match
```

## Bootstrap Process

### 15 Meta Tables

Bootstrap creates **15 central tables** in the `organizations` dataset:

| Table | Purpose | Partitioned By |
|-------|---------|----------------|
| `org_profiles` | Organization metadata | - |
| `org_api_keys` | API key management | `created_at` |
| `org_subscriptions` | Subscription plans & limits | `created_at` |
| `org_usage_quotas` | Daily/monthly quota tracking | `usage_date` |
| `org_integration_credentials` | Encrypted credentials (KMS) | - |
| `org_meta_pipeline_runs` | Pipeline execution history | `start_time` |
| `org_meta_step_logs` | Step-by-step execution logs | `start_time` |
| `org_meta_dq_results` | Data quality validation results | `ingestion_date` |
| `org_pipeline_configs` | Pipeline configurations | - |
| `org_scheduled_pipeline_runs` | Scheduled pipeline jobs | `scheduled_time` |
| `org_pipeline_execution_queue` | Pipeline queue management | `scheduled_time` |
| `org_cost_tracking` | Cost analytics data | `usage_date` |
| `org_audit_logs` | Audit trail for all operations | `created_at` |
| `org_kms_keys` | KMS key management | - |
| `org_idempotency_keys` | Webhook deduplication (24h TTL) | - |

**Schema Location:** `configs/setup/bootstrap/schemas/*.json`

**Config Location:** `configs/setup/bootstrap/config.yml`

**Bootstrap is idempotent:** Tables won't be recreated unless `force_recreate_tables: true`.

### Bootstrap Endpoint

```bash
# One-time system initialization
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Response includes:
# - total_tables: 15
# - created_tables: [list of new tables]
# - existing_tables: [list of skipped tables]
```

## Organization Onboarding

### Onboarding Flow

```
POST /api/v1/organizations/onboard
  │
  ├─ 1. Validate org_slug, email, subscription plan
  ├─ 2. Create org profile in org_profiles
  ├─ 3. Generate org API key (encrypted, stored in org_api_keys)
  ├─ 4. Create org subscription record
  ├─ 5. Create BigQuery dataset: {org_slug}_prod
  ├─ 6. Create 6 org-specific tables (usage, metadata, integrations, etc.)
  └─ 7. Return org profile + API key (dev only)
```

### Onboarding Endpoints

```bash
# Dry-run validation (no changes)
curl -X POST "http://localhost:8000/api/v1/organizations/dryrun" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "test_org",
    "company_name": "Test Org",
    "admin_email": "admin@test.com",
    "subscription_plan": "FREE"
  }'

# Actual onboarding
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "test_org",
    "company_name": "Test Org",
    "admin_email": "admin@test.com",
    "subscription_plan": "FREE"
  }'

# Get org API key (dev only - blocked in production)
curl -X GET "http://localhost:8000/api/v1/admin/dev/api-key/test_org" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Update subscription
curl -X PUT "http://localhost:8000/api/v1/organizations/test_org/subscription" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_name": "PRO",
    "daily_limit": 1000,
    "monthly_limit": 25000
  }'

# Delete org (soft delete)
curl -X DELETE "http://localhost:8000/api/v1/organizations/test_org" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "confirm_org_slug": "test_org",
    "delete_dataset": false
  }'
```

## Integration Management

### Setup Flow

```
POST /api/v1/integrations/{org}/{provider}/setup
  │
  ├─ 1. Validate credentials (call provider API)
  ├─ 2. Encrypt credentials via KMS
  ├─ 3. Store in org_integration_credentials
  ├─ 4. Seed default data (pricing models, subscriptions)
  └─ 5. Return integration status
```

### Integration Endpoints

```bash
# Setup integration (OpenAI, Anthropic, GCP)
curl -X POST "http://localhost:8000/api/v1/integrations/test_org/openai/setup" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-..."
  }'

# Validate integration
curl -X POST "http://localhost:8000/api/v1/integrations/test_org/openai/validate" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Get all integrations status
curl -X GET "http://localhost:8000/api/v1/integrations/test_org" \
  -H "X-API-Key: $ORG_API_KEY"

# Get specific integration status
curl -X GET "http://localhost:8000/api/v1/integrations/test_org/openai" \
  -H "X-API-Key: $ORG_API_KEY"

# Delete integration
curl -X DELETE "http://localhost:8000/api/v1/integrations/test_org/openai" \
  -H "X-API-Key: $ORG_API_KEY"
```

### LLM Pricing & Subscriptions CRUD

```bash
# List pricing models
curl -X GET "http://localhost:8000/api/v1/integrations/test_org/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY"

# Add pricing model
curl -X POST "http://localhost:8000/api/v1/integrations/test_org/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "gpt-4o",
    "price_per_1k_input_tokens": 5.00,
    "price_per_1k_output_tokens": 15.00,
    "effective_date": "2025-01-01"
  }'

# List subscriptions
curl -X GET "http://localhost:8000/api/v1/integrations/test_org/openai/subscriptions" \
  -H "X-API-Key: $ORG_API_KEY"

# Add subscription
curl -X POST "http://localhost:8000/api/v1/integrations/test_org/openai/subscriptions" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription_name": "team_plan",
    "monthly_cost": 500.00,
    "start_date": "2025-01-01"
  }'
```

## Subscription Plans CRUD (SaaS Providers)

### Version History Pattern

**Key Feature:** All edits create new rows with version history. No data is deleted.

```
Edit Plan:
  Old row → end_date = new_effective_date
  New row → effective_date = specified date, previous row gets end_date

Status Values:
  - active: Current active plan
  - pending: Future-dated plan (effective_date > today)
  - cancelled: Manually ended plan (end_date set)
  - expired: Naturally expired plan (end_date < today)
```

### Subscription Plan Endpoints

```bash
# List all providers with status
curl -X GET "http://localhost:8000/api/v1/subscriptions/test_org/providers" \
  -H "X-API-Key: $ORG_API_KEY"

# Enable provider (seeds default plans from CSV)
curl -X POST "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/enable" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Disable provider (soft delete all plans)
curl -X POST "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/disable" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# List plans for provider
curl -X GET "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $ORG_API_KEY"

# Create plan
curl -X POST "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_name": "TEAM",
    "plan_type": "team",
    "price_per_user_monthly": 25.00,
    "currency": "USD",
    "number_of_users": 10,
    "effective_date": "2025-01-01"
  }'

# Edit plan (creates new version)
curl -X POST "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/plans/123/edit-version" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number_of_users": 15,
    "effective_date": "2025-02-01"
  }'

# End subscription (soft delete)
curl -X DELETE "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/plans/123" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "end_date": "2025-03-31"
  }'
```

### Seed Data

**Location:** `configs/saas/seed/data/saas_subscription_plans.csv`

**Providers:**
- `chatgpt_plus` (4 plans: FREE, PLUS, TEAM, ENTERPRISE)
- `claude_pro` (4 plans: FREE, PRO, TEAM, ENTERPRISE)
- `copilot` (4 plans: INDIVIDUAL, BUSINESS, ENTERPRISE)
- `teams` (2 plans: ESSENTIALS, BUSINESS)
- `canva` (4 plans: FREE, PRO, TEAMS, ENTERPRISE)
- `slack` (4 plans: FREE, PRO, BUSINESS, ENTERPRISE_GRID)

## Cost Service (Polars-Powered)

### Architecture

```
Frontend → GET /api/v1/costs/{org}/summary
              │
              ├─ BigQuery: Fetch raw cost data
              ├─ Polars: Aggregate, filter, pivot
              └─ Return: JSON with totals, breakdowns, trends
```

**Key Feature:** All aggregations happen in Python using Polars (not BigQuery SQL). This allows:
- Complex multi-dimensional analysis
- Fast in-memory pivoting
- Flexible filtering and grouping
- Reduced BigQuery costs

### Cost Endpoints

```bash
# Get cost summary
curl -X GET "http://localhost:8000/api/v1/costs/test_org/summary?start_date=2025-01-01&end_date=2025-01-31" \
  -H "X-API-Key: $ORG_API_KEY"

# Response includes:
# - total_cost
# - breakdown_by_provider (GCP, OpenAI, Anthropic, SaaS)
# - breakdown_by_category (cloud, llm, saas)
# - daily_trend
# - top_services
```

### Polars Processors

**Location:** `src/core/processors/cost/`
- `aggregator.py` - Main cost aggregation logic
- `filters.py` - Date range, provider, category filters
- `pivots.py` - Multi-dimensional pivoting
- `exporters.py` - CSV, JSON, Parquet exports

## Project Structure

```
02-api-service/
├── src/
│   ├── app/
│   │   ├── main.py                    # FastAPI entry point
│   │   ├── config.py                  # Settings (env vars)
│   │   ├── routers/
│   │   │   ├── admin.py               # Bootstrap, dev API key
│   │   │   ├── organizations.py       # Onboarding, subscription mgmt
│   │   │   ├── integrations.py        # Integration CRUD
│   │   │   ├── llm_data.py            # LLM pricing/subscriptions
│   │   │   ├── subscription_plans.py  # SaaS plan CRUD with versions
│   │   │   └── cost_service.py        # Polars-powered cost analytics
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
│       │   ├── setup/                 # Bootstrap + onboarding
│       │   ├── integrations/          # Integration processors
│       │   ├── cost/                  # Polars cost aggregation
│       │   ├── openai/                # OpenAI authenticator
│       │   ├── anthropic/             # Anthropic authenticator
│       │   └── gcp/                   # GCP authenticator
│       ├── utils/
│       │   ├── logging.py             # Logging configuration
│       │   ├── cache.py               # LRU cache with TTL
│       │   └── rate_limiter.py        # Rate limiting utilities
│       ├── observability/
│       │   └── metrics.py             # Prometheus metrics
│       └── exceptions.py              # Custom exceptions
├── configs/
│   ├── setup/                         # Bootstrap + onboarding configs
│   │   └── bootstrap/
│   │       ├── config.yml             # Bootstrap configuration
│   │       └── schemas/*.json         # 15 table schemas
│   ├── openai/seed/                   # OpenAI seed data
│   ├── anthropic/seed/                # Anthropic seed data
│   ├── gemini/seed/                   # Gemini seed data
│   ├── saas/seed/                     # SaaS subscription seed data
│   │   └── data/saas_subscription_plans.csv
│   └── system/
│       └── providers.yml              # Provider configurations
├── tests/
│   ├── test_00_health.py              # Health check tests
│   ├── test_01_bootstrap.py           # Bootstrap tests (15 tables)
│   ├── test_02_organizations.py       # Onboarding tests
│   ├── test_03_integrations.py        # Integration tests
│   ├── test_04_subscription_plans.py  # SaaS plan CRUD tests
│   ├── test_05_quota.py               # Quota management tests
│   ├── test_06_user_onboarding_e2e.py # E2E onboarding journey
│   └── README.md                      # E2E testing guide
├── Dockerfile
├── requirements.txt
├── pytest.ini
└── CLAUDE.md
```

## Environment Setup (.env.local)

```bash
# .env.local (development)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_PROJECT_ID=gac-prod-471220
CA_ROOT_API_KEY=your-secure-admin-key-32chars
KMS_KEY_NAME=projects/gac-prod-471220/locations/us-central1/keyRings/.../cryptoKeys/...
ENVIRONMENT=development
DISABLE_AUTH=false
RUN_INTEGRATION_TESTS=true
OPENAI_API_KEY=sk-...  # For E2E testing
```

## E2E Testing

### Quick Start

```bash
# Run E2E tests (requires both services running)
./run_e2e_tests.sh

# Specific test scenarios
./run_e2e_tests.sh full          # Complete onboarding journey
./run_e2e_tests.sh bootstrap     # Bootstrap only
./run_e2e_tests.sh onboard       # Org onboarding only
./run_e2e_tests.sh integration   # Integration setup only
```

### E2E Test Flow

1. **Bootstrap** - Create 15 meta tables in BigQuery
2. **Organization Onboarding** - Create org profile + API key + dataset
3. **Integration Setup** - Store encrypted OpenAI credentials (KMS)
4. **Pipeline Execution** - Run OpenAI usage pipeline (via port 8001)
5. **Data Verification** - Verify quota consumption and data storage
6. **Final Verification** - Check subscription status and limits

**See `tests/README.md` for detailed E2E testing documentation.**

## Relationship with Pipeline Service

| API Service (8000) | Pipeline Service (8001) |
|--------------------|-------------------------|
| Frontend-facing API | Pipeline execution engine |
| Org management | Scheduled pipelines |
| Integration setup | Usage data processing |
| Credential storage | Cost calculations |
| Cost analytics (Polars) | ETL processors |
| **Same BigQuery datasets** | **Same BigQuery datasets** |

Both services share:
- BigQuery datasets (organizations, per-org datasets)
- KMS encryption keys
- Configuration files (`configs/system/providers.yml`)
- Auth models (X-CA-Root-Key, X-API-Key)

## Security

### Production Requirements

```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```

**CRITICAL:** Backend will NOT start in production without proper security configuration.

### Authentication

- All endpoints require authentication (X-CA-Root-Key or X-API-Key)
- Credentials stored encrypted via KMS
- Rate limiting enabled by default
- CORS configured for frontend domains

### Dev-Only Endpoint

`GET /api/v1/admin/dev/api-key/{org_slug}` - Blocked in production (403 Forbidden)

## Quick Reference

### Complete Onboarding

```bash
# 1. Bootstrap (one-time)
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d '{}'

# 2. Onboard organization
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{
    "org_slug": "my_org",
    "company_name": "My Org",
    "admin_email": "admin@example.com",
    "subscription_plan": "FREE"
  }'

# 3. Get API key (dev only)
curl -X GET "http://localhost:8000/api/v1/admin/dev/api-key/my_org" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# 4. Setup integration
curl -X POST "http://localhost:8000/api/v1/integrations/my_org/openai/setup" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"api_key": "sk-..."}'

# 5. Enable SaaS provider
curl -X POST "http://localhost:8000/api/v1/subscriptions/my_org/providers/chatgpt_plus/enable" \
  -H "X-API-Key: $ORG_API_KEY" -d '{}'

# 6. Sync procedures (pipeline-service port 8001)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d '{}'

# 7. Run pipeline (pipeline-service port 8001)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/my_org/openai/cost/usage_cost" \
  -H "X-API-Key: $ORG_API_KEY" -d '{}'
```

### Re-Onboarding (Dataset Deleted)

```bash
# 1. Delete org from meta tables
curl -X DELETE "http://localhost:8000/api/v1/organizations/my_org" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"confirm_org_slug": "my_org", "delete_dataset": false}'

# 2. Re-onboard (creates new dataset + tables + API key)
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{
    "org_slug": "my_org",
    "company_name": "My Org",
    "admin_email": "admin@example.com",
    "subscription_plan": "FREE"
  }'

# 3. Get new API key
curl -X GET "http://localhost:8000/api/v1/admin/dev/api-key/my_org" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

---

**Last Updated:** 2025-12-10
