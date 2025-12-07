# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Gist

Multi-org cloud cost analytics platform. BigQuery-powered. Two backend services: **api-service** (frontend API, port 8000) + **pipeline** (ETL engine, port 8001). Frontend: Next.js with Supabase auth and Stripe payments.

**Architecture:** Everything is a pipeline. No SQL files, no Alembic, no direct DDL.

**Full Platform Architecture:** See `requirements-docs/00-ARCHITECTURE.md`

## Development Commands

### API Service (Port 8000)
```bash
cd api-service
pip install -r requirements.txt

# Run server
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Run tests
python -m pytest tests/ -v                    # All tests
python -m pytest tests/test_01_bootstrap.py   # Single test file
python -m pytest tests/ -k "test_health"      # Pattern match
```

### Pipeline Service (Port 8001)
```bash
cd data-pipeline-service
pip install -r requirements.txt

# Run server
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload

# Run tests
python -m pytest tests/ -v

# Lint & format
ruff check src/
black src/
mypy src/
```

### Frontend (Port 3000)
```bash
cd fronted-system
npm install

npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint

# Tests (Vitest)
npx vitest                                    # All tests
npx vitest tests/auth-flow.test.ts            # Single file
npx vitest --watch                            # Watch mode
npx vitest -c vitest.api.config.ts            # API tests
```

### Database Migrations (Supabase)
```bash
cd fronted-system/scripts/supabase_db
./migrate.sh              # Run all pending migrations
./migrate.sh --status     # Show migration status
./migrate.sh --force 12   # Force re-run specific migration
```

## Service Architecture

```
Frontend (Next.js)           API Service (8000)              Pipeline Engine (8001)
Port 3000                    Frontend-facing API             ETL Execution + Integrations
├─ Supabase Auth             ├─ Bootstrap                    ├─ Run pipelines
├─ Stripe Payments           ├─ Org onboarding               ├─ Process usage data
└─ Dashboard UI              └─ Org management               ├─ Cost calculations
                                                             ├─ Integration setup/validate
                                                             ├─ LLM data CRUD
                                                             └─ Scheduled jobs

                             ↓                               ↓
                             BigQuery (Shared)
                             ├─ organizations dataset (meta tables)
                             └─ {org_slug}_prod datasets (data tables)
```

## DO's and DON'Ts

### DO
- Use configs/ for all schema and pipeline definitions
- Let processors handle all BigQuery operations
- Validate all inputs before processing
- Use API key hierarchy correctly (CA_ROOT_API_KEY vs Org API Key)
- Check subscription status before running pipelines
- Sync billing status from Stripe to BigQuery via webhooks
- Encrypt all credentials using KMS
- Follow naming conventions (snake_case, kebab-case, dot.notation)

### DON'T
- **NEVER use DISABLE_AUTH=true** - Always authenticate properly, even in development
- Never write raw SQL or use Alembic
- Never hardcode schemas in Python code
- Never skip authentication in production
- Never store actual API keys in Supabase (only fingerprints)
- Never call pipeline service directly from frontend
- Never run pipelines for SUSPENDED/CANCELLED orgs
- Never skip input validation or rate limiting
- Never expose CA_ROOT_API_KEY to client-side code

## Documentation

### Service Documentation

| Component | Documentation | Description |
|-----------|---------------|-------------|
| **Architecture** | `ARCHITECTURE.md` | Complete system architecture, customer lifecycle, data flow |
| **API Service** | `api-service/CLAUDE.md` | Frontend-facing API: bootstrap, onboarding, integrations |
| **Pipeline Engine** | `data-pipeline-service/CLAUDE.md` | Pipeline architecture, processors, configs, scheduled ETL |
| **Frontend** | `fronted-system/CLAUDE.md` | Next.js frontend, Supabase, Stripe, backend integration |
| **Security** | `data-pipeline-service/SECURITY.md` | Production security requirements, API key handling |

### Feature Documentation (requirements-docs/)

**Single source of truth for all features. Each document follows standardized format.**

| Category | Document | Status | Description |
|----------|----------|--------|-------------|
| **01 - Core** | `01_USER_MANAGEMENT.md` | IMPLEMENTED | Auth, roles, team invites, permissions |
| **01 - Core** | `01_ORGANIZATION_ONBOARDING.md` | IMPLEMENTED | Org creation, API key generation, dataset setup |
| **01 - Core** | `01_BILLING_STRIPE.md` | IMPLEMENTED | Stripe subscriptions, webhooks, billing portal |
| **02 - Costs** | `02_SAAS_SUBSCRIPTION_COSTS.md` | IMPLEMENTED | SaaS subscription tracking (Canva, Slack, etc.) |
| **02 - Costs** | `02_CLOUD_COSTS.md` | IMPLEMENTED | GCP billing extraction and analytics |
| **02 - Costs** | `02_LLM_API_USAGE_COSTS.md` | PARTIAL | LLM pricing config (usage tracking future) |
| **03 - Features** | `03_PIPELINES.md` | IMPLEMENTED | Pipeline execution, scheduling, async processing |
| **03 - Features** | `03_INTEGRATIONS.md` | IMPLEMENTED | Provider setup, credential encryption |
| **03 - Features** | `03_DASHBOARD_ANALYTICS.md` | IMPLEMENTED | Charts, metrics, cost visualization |
| **04 - UI** | `04_LANDING_PAGES.md` | IMPLEMENTED | Public marketing pages, SEO |
| **04 - UI** | `04_CONSOLE_UI.md` | IMPLEMENTED | Dashboard layout, navigation, theming |

**Document Format:** Each document includes Notation, Terminology, Where Data Lives, Lifecycle, Architecture Flow (ASCII), Data Flow, Schema Definitions, Frontend Implementation, API Endpoints, Implementation Status, Error Handling, Test Files, and File References.

## Backend Services Split

The backend is split into two services that share the same BigQuery datasets and auth flow:

| Service | Port | Purpose | Key Endpoints |
|---------|------|---------|---------------|
| **api-service** | 8000 | Frontend-facing API layer | `/api/v1/admin/bootstrap`, `/api/v1/organizations/*` |
| **data-pipeline-service** | 8001 | Pipeline + Integrations | `/api/v1/pipelines/run/*`, `/api/v1/integrations/*`, scheduled jobs |

**Shared:** Same `CA_ROOT_API_KEY`, same BigQuery datasets, same org API key validation.

**Frontend Integration:** Frontend calls api-service (8000) for bootstrap/onboarding, pipeline-service (8001) for integrations and pipeline execution.

## Production Security

**CRITICAL:** Backend will NOT start in production without proper security configuration.

Required environment variables:
```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```

See `ARCHITECTURE.md` for complete security details.

## Quick Reference

### Core Principle
**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

### Key Paths
- **Bootstrap Schemas**: `api-service/configs/setup/bootstrap/schemas/*.json` (14 tables)
- **Pipeline Configs**: `data-pipeline-service/configs/{provider}/{domain}/*.yml`
- **Processors**: `data-pipeline-service/src/core/processors/{provider}/{domain}.py`

## API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (meta tables)
    │
    └── Creates → Org API Keys (per-organization)
                    │
                    ├── Integrations: POST /api/v1/integrations/{org}/{provider}/setup
                    ├── Pipelines: POST /api/v1/pipelines/run/{org}/...
                    └── Data Access: Query org-specific BigQuery datasets
```

**Key Types:**
| Key | Header | Purpose | Scope |
|-----|--------|---------|-------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, org onboarding | System-wide |
| Org API Key | `X-API-Key` | Integrations, pipelines, data | Per-organization |
| Provider Keys | N/A (stored encrypted) | OpenAI, Anthropic, GCP SA | Per-provider |

### API Endpoints

#### api-service (Port 8000) - Bootstrap & Onboarding

**Admin (X-CA-Root-Key)**
- `POST /api/v1/admin/bootstrap` - Initialize system
- `POST /api/v1/organizations/onboard` - Create organization + API key
- `POST /api/v1/organizations/dryrun` - Validate org before onboarding
- `PUT /api/v1/organizations/{org}/subscription` - Update subscription limits

#### data-pipeline-service (Port 8001) - Pipelines & Integrations

**Organization (X-API-Key)**
- `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` - Run pipeline
- `POST /api/v1/scheduler/trigger` - Trigger scheduled pipeline
- `GET /api/v1/scheduler/queue` - Get pipeline queue
- `POST /api/v1/integrations/{org}/{provider}/setup` - Setup integration (OpenAI, Anthropic, GCP)
- `POST /api/v1/integrations/{org}/{provider}/validate` - Validate integration
- `GET /api/v1/integrations/{org}` - Get all integrations status
- `GET /api/v1/integrations/{org}/{provider}` - Get specific integration status
- `DELETE /api/v1/integrations/{org}/{provider}` - Delete integration
- `GET /api/v1/integrations/{org}/{provider}/pricing` - List pricing models
- `POST /api/v1/integrations/{org}/{provider}/pricing` - Add pricing model
- `GET /api/v1/integrations/{org}/{provider}/subscriptions` - List subscriptions
- `POST /api/v1/integrations/{org}/{provider}/subscriptions` - Add subscription

### Customer Lifecycle

See `ARCHITECTURE.md` for complete customer journey (signup → onboarding → integrations → pipelines).

### Environments
- **Stage**: `https://convergence-pipeline-stage-526075321773.us-central1.run.app`
- **Prod**: `https://convergence-pipeline-prod-820784027009.us-central1.run.app`

---

## Debugging Quick Reference

### Pipeline Configuration

**Source of Truth:** `data-pipeline-service/configs/`

Pipeline URL structure: `/api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}`

| Pipeline | Provider | Domain | Pipeline | Config Path |
|----------|----------|--------|----------|-------------|
| GCP Billing | `gcp` | `cost` | `billing` | `configs/gcp/cost/billing.yml` |
| OpenAI Usage | `openai` | `cost` | `usage_cost` | `configs/openai/cost/usage_cost.yml` |
| Anthropic Usage | `anthropic` | `` (empty) | `usage_cost` | `configs/anthropic/usage_cost.yml` |

**Important:** Provider and domain values are **lowercase**. Domain matches subfolder structure.

### Get Org API Key

```bash
# From BigQuery (org_api_keys table)
bq query --use_legacy_sql=false "
SELECT api_key, org_slug
FROM \`gac-prod-471220.organizations.org_api_keys\`
WHERE org_slug = 'your_org_slug' AND is_active = true"

# From frontend user metadata (Supabase)
# Keys stored in: user.user_metadata.org_api_keys[org_slug]
```

### Key File Locations

| What | Path |
|------|------|
| **Pipeline configs** | `data-pipeline-service/configs/{provider}/{domain}/*.yml` |
| **Provider registry** | `data-pipeline-service/configs/system/providers.yml` |
| **API Service routers** | `api-service/src/app/routers/*.py` |
| **Pipeline Engine routers** | `data-pipeline-service/src/app/routers/*.py` |
| **Frontend pipeline actions** | `fronted-system/actions/pipelines.ts` |
| **Frontend backend client** | `fronted-system/lib/api/backend.ts` |
| **Frontend env config** | `fronted-system/.env.local` |
| **GCP billing processor** | `data-pipeline-service/src/core/processors/gcp/external_bq_extractor.py` |
| **Bootstrap schemas** | `api-service/configs/setup/bootstrap/schemas/*.json` |

### Test Pipeline Execution (curl)

```bash
# Run GCP billing pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-30"}'

# List available pipelines (no auth)
curl -s http://localhost:8000/api/v1/validator/pipelines | python3 -m json.tool
```

### Common Debugging Commands

```bash
# Check what's running on ports
lsof -i :8000  # API service
lsof -i :8001  # Pipeline engine
lsof -i :3000  # Frontend

# Kill services on port
pkill -f "uvicorn.*8000"
pkill -f "uvicorn.*8001"

# Check health
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:8001/health | python3 -m json.tool
```

### Debugging Learnings

1. **Pipeline 404 errors**: Check provider/domain match config path. Provider is lowercase (`gcp` not `GCP`), domain matches subfolder (`cost` for `configs/gcp/cost/`).

2. **Frontend calls wrong port**: Frontend should call api-service (8000) for bootstrap/onboarding, pipeline-service (8001) for integrations and execution. Set `PIPELINE_SERVICE_URL=http://localhost:8001` in `.env.local`.

3. **Config not updating**: Pipeline configs are loaded dynamically. Check `configs/system/providers.yml` for provider registry.

4. **Org slug validation**: Backend requires `^[a-zA-Z0-9_]{3,50}$` (underscores only, no hyphens).

5. **API key not found**: Check user.user_metadata.org_api_keys[org_slug] in Supabase, or org_api_keys table in BigQuery.

---

## Learnings and Recent Fixes (December 2025)

### Bootstrap Configuration Fix

**Issue:** Bootstrap failed with partition field error
**Error:** "The field specified for partitioning cannot be found in the schema"
**Root Cause:** `org_subscriptions` table config specified `effective_date` for partitioning but schema had `created_at`
**Fix:** Updated `api-service/configs/setup/bootstrap/config.yml` line 28 to use `created_at` instead of `effective_date`
**Impact:** Bootstrap now creates all 15 tables successfully

### Table Count Correction

**Issue:** Tests and documentation referenced 14 tables but system creates 15
**Missing Table:** `org_idempotency_keys` (for duplicate request prevention with 24-hour TTL)
**Fix Applied:**
- Updated `api-service/tests/test_01_bootstrap.py` to expect 15 tables
- Added `org_idempotency_keys` to all test fixtures
- Changed all references from "14 management tables" to "15 management tables"

**All 15 Tables:**
1. org_profiles
2. org_api_keys (partitioned by created_at)
3. org_subscriptions (partitioned by created_at)
4. org_usage_quotas (partitioned by usage_date)
5. org_integration_credentials
6. org_pipeline_configs
7. org_scheduled_pipeline_runs (partitioned by scheduled_time)
8. org_pipeline_execution_queue (partitioned by scheduled_time)
9. org_meta_pipeline_runs (partitioned by start_time)
10. org_meta_step_logs (partitioned by start_time)
11. org_meta_dq_results (partitioned by ingestion_date)
12. org_audit_logs (partitioned by created_at)
13. org_cost_tracking (partitioned by usage_date)
14. org_kms_keys
15. org_idempotency_keys

### QueryPerformanceMonitor Fix

**Issue:** ImportError for `QueryTimer` class
**Fix:** Updated `api-service/src/app/routers/subscription_plans.py` to use `QueryPerformanceMonitor` instead of `QueryTimer`
**Lines Changed:** 388, 765, 1351
**Added:** `monitor.set_result(result)` calls to capture query metrics

### Structured Error Response Fix

**Issue:** Test expected string error format but API returned structured dict
**Fix:** Updated `api-service/tests/test_05_quota.py` to check `detail["message"].lower()` instead of `detail.lower()`
**Impact:** Tests now correctly validate structured error responses with error, message, and error_id fields

### Cache Cleanup Thread Fix

**Issue:** Logging error during shutdown - "I/O operation on closed file"
**Fix:** Wrapped `logger.info` in try-except block in `api-service/src/core/utils/cache.py:124`
**Impact:** Clean shutdown without logging errors

### Stripe Webhook Fix

**Issue:** Column 'concurrent_pipelines_limit' does not exist
**Fix:** Removed all references to `concurrent_pipelines_limit` from:
- `fronted-system/app/api/webhooks/stripe/route.ts`
- `fronted-system/actions/backend-onboarding.ts`
- `fronted-system/actions/stripe.ts`
- `fronted-system/app/api/cron/billing-sync/route.ts`

### Integration Testing Setup

**Created:** Complete E2E user onboarding test at `api-service/tests/test_06_user_onboarding_e2e.py`
**Documentation:**
- `tests/README_E2E.md` - Quick reference
- `tests/E2E_TEST_GUIDE.md` - Comprehensive guide
- `tests/E2E_SUMMARY.md` - Technical details
**Helper Script:** `run_e2e_tests.sh` with pre-flight checks

**E2E Test Flow:**
1. Service availability check
2. Bootstrap (15 tables)
3. Organization onboarding (create org + API key + dataset)
4. Integration setup (OpenAI credentials with KMS encryption)
5. Pipeline execution (usage pipeline)
6. Data verification (quota consumption)
7. Cleanup (delete test data)

**Requirements:**
- OPENAI_API_KEY for integration testing
- Real BigQuery access (no mocks)
- Real KMS for credential encryption
- Both services running (api-service:8000, pipeline-service:8001)

### Test Suite Improvements

**No More Skipping:** All integration tests now run with `--run-integration` flag instead of `REQUIRES_INTEGRATION_TESTS` env var
**Test Results:** 170 passing tests (87.6% success rate)
**Parallel Execution:** Tests can be run in parallel using pytest-xdist

### Key Patterns Learned

**BigQuery Partitioning:**
- Always verify partition field exists in schema
- Use `created_at` for general timestamps
- Use domain-specific fields (`usage_date`, `scheduled_time`) when appropriate

**Testing Best Practices:**
- Write integration tests with real services (no mocks for critical paths)
- Use `--run-integration` flag for conditional test execution
- Clean up test data in `finally` blocks
- Test against actual GCP project, not "test-project"

**Error Handling:**
- Use structured error responses with error, message, and error_id
- Wrap cleanup code in try-except to prevent shutdown errors
- Validate partition fields before table creation

**Cache Management:**
- Implement LRU eviction with max_size limits
- Use background threads for TTL cleanup
- Prefix all cache keys with org_slug for multi-tenant isolation
- Handle graceful shutdown of background threads

---

**Last Updated:** 2025-12-06
