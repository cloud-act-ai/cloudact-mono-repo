# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Gist

Multi-org cloud cost analytics platform. BigQuery-powered. Two backend services: **api-service** (frontend API, port 8000) + **pipeline-service** (ETL engine, port 8001). Frontend: Next.js with Supabase auth and Stripe payments.

**Architecture:** Everything is a pipeline. No SQL files, no Alembic, no direct DDL.

**Full Platform Architecture:** See `00-requirements-docs/00-ARCHITECTURE.md`

## Folder Structure

```
cloudact-mono-repo/
├── 00-requirements-docs/     # Feature documentation, architecture specs
├── 01-fronted-system/        # Next.js frontend (Port 3000)
├── 02-api-service/           # FastAPI backend API (Port 8000)
├── 03-data-pipeline-service/ # Pipeline engine (Port 8001)
├── 04-inra-cicd-automation/  # Infrastructure & CI/CD
└── ZZ-PRE-ANALLISYS/         # Analysis artifacts
```

## Development Commands

### API Service (Port 8000)
```bash
cd 02-api-service
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
cd 03-data-pipeline-service
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
cd 01-fronted-system
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
cd 01-fronted-system/scripts/supabase_db
./migrate.sh              # Run all pending migrations
./migrate.sh --status     # Show migration status
./migrate.sh --force 12   # Force re-run specific migration
```

## Service Architecture

```
Frontend (Next.js)           API Service (8000)              Pipeline Engine (8001)
Port 3000                    Frontend-facing API             ETL Execution Only
├─ Supabase Auth             ├─ Bootstrap                    ├─ Run pipelines
├─ Stripe Payments           ├─ Org onboarding               ├─ Process usage data
└─ Dashboard UI              ├─ Org management               ├─ Cost calculations
                             ├─ Integration setup/validate   └─ Scheduled jobs
                             ├─ LLM data CRUD
                             └─ SaaS subscription plans

                             ↓                               ↓
                             BigQuery (Shared)
                             ├─ organizations dataset (15 meta tables)
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
- Never call pipeline service directly from frontend (use api-service)
- Never run pipelines for SUSPENDED/CANCELLED orgs
- Never skip input validation or rate limiting
- Never expose CA_ROOT_API_KEY to client-side code

## Documentation

### Service Documentation

| Component | Documentation | Description |
|-----------|---------------|-------------|
| **Architecture** | `00-requirements-docs/00-ARCHITECTURE.md` | Complete system architecture, customer lifecycle, data flow |
| **API Service** | `02-api-service/CLAUDE.md` | Frontend-facing API: bootstrap, onboarding, integrations |
| **Pipeline Engine** | `03-data-pipeline-service/CLAUDE.md` | Pipeline architecture, processors, configs, scheduled ETL |
| **Frontend** | `01-fronted-system/CLAUDE.md` | Next.js frontend, Supabase, Stripe, backend integration |
| **Security** | `03-data-pipeline-service/SECURITY.md` | Production security requirements, API key handling |

### Feature Documentation (00-requirements-docs/)

**Single source of truth for all features. Each document follows standardized format.**

| Category | Document | Status | Description |
|----------|----------|--------|-------------|
| **00 - Core** | `00_INTERNATIONALIZATION.md` | IMPLEMENTED | Org-level currency, timezone, country, language |
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
| **05 - Cross** | `05_SECURITY.md` | IMPLEMENTED | Security patterns, input validation, rate limiting |
| **05 - Cross** | `05_TESTING.md` | IMPLEMENTED | Testing guide, E2E flows, test coverage |

## Backend Services Split

The backend is split into two services that share the same BigQuery datasets and auth flow:

| Service | Port | Purpose | Key Endpoints |
|---------|------|---------|---------------|
| **02-api-service** | 8000 | Frontend-facing API layer | `/api/v1/admin/bootstrap`, `/api/v1/organizations/*`, `/api/v1/integrations/*`, `/api/v1/subscriptions/*` |
| **03-data-pipeline-service** | 8001 | Pipeline execution only | `/api/v1/pipelines/run/*`, scheduled jobs |

**Shared:** Same `CA_ROOT_API_KEY`, same BigQuery datasets, same org API key validation.

**Frontend Integration:** Frontend calls api-service (8000) for ALL operations except pipeline execution. Pipeline-service (8001) is for pipeline runs only.

## Quick Reference

### Core Principle
**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

### Key Paths
- **Bootstrap Schemas**: `02-api-service/configs/setup/bootstrap/schemas/*.json` (15 tables)
- **Pipeline Configs**: `03-data-pipeline-service/configs/{provider}/{domain}/*.yml`
- **Processors**: `03-data-pipeline-service/src/core/processors/{provider}/{domain}.py`
- **Frontend Actions**: `01-fronted-system/actions/*.ts`
- **Frontend Backend Client**: `01-fronted-system/lib/api/backend.ts`

## API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (15 meta tables)
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

**Dev-Only Key Retrieval:**
```bash
# DEV ONLY: Get org API key for local testing
curl -X GET "http://localhost:8000/api/v1/admin/dev/api-key/{org_slug}" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

## API Endpoints Summary

### api-service (Port 8000) - All Frontend Operations

**Admin (X-CA-Root-Key)**
- `POST /api/v1/admin/bootstrap` - Initialize system (15 meta tables)
- `POST /api/v1/organizations/onboard` - Create organization + API key + dataset (includes default_currency, default_timezone)
- `POST /api/v1/organizations/dryrun` - Validate org before onboarding
- `PUT /api/v1/organizations/{org}/subscription` - Update subscription limits
- `GET /api/v1/admin/dev/api-key/{org_slug}` - Get org API key (dev only)

**Integrations (X-API-Key)**
- `POST /api/v1/integrations/{org}/{provider}/setup` - Setup integration
- `POST /api/v1/integrations/{org}/{provider}/validate` - Validate integration
- `GET /api/v1/integrations/{org}` - List all integrations
- `GET /api/v1/integrations/{org}/{provider}` - Get integration status
- `DELETE /api/v1/integrations/{org}/{provider}` - Delete integration
- `GET /api/v1/integrations/{org}/{provider}/pricing` - List pricing models
- `POST /api/v1/integrations/{org}/{provider}/pricing` - Add pricing model

**SaaS Subscription Plans (X-API-Key)**
- `GET /api/v1/subscriptions/{org}/providers` - List all providers
- `POST /api/v1/subscriptions/{org}/providers/{provider}/enable` - Enable provider
- `GET /api/v1/subscriptions/{org}/providers/{provider}/plans` - List plans
- `POST /api/v1/subscriptions/{org}/providers/{provider}/plans` - Create plan
- `PUT /api/v1/subscriptions/{org}/providers/{provider}/plans/{id}` - Update plan
- `DELETE /api/v1/subscriptions/{org}/providers/{provider}/plans/{id}` - End plan (soft delete)
- `POST /api/v1/subscriptions/{org}/providers/{provider}/plans/{id}/edit-version` - Edit with version history

**Locale (X-API-Key)**
- `GET /api/v1/organizations/{org}/locale` - Get org locale settings
- `PUT /api/v1/organizations/{org}/locale` - Update org locale (currency, timezone)

### data-pipeline-service (Port 8001) - Pipeline Execution Only

**Organization (X-API-Key)**
- `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` - Run pipeline
- `POST /api/v1/scheduler/trigger` - Trigger scheduled pipeline
- `GET /api/v1/scheduler/queue` - Get pipeline queue

**Pipeline URL Structure:** `/api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}`
- Provider and domain are **lowercase**
- Domain matches subfolder in `configs/{provider}/{domain}/`

## Production Security

**CRITICAL:** Backend will NOT start in production without proper security configuration.

Required environment variables:
```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```

See `00-requirements-docs/00-ARCHITECTURE.md` for complete security details.

## Bootstrap System Tables

Bootstrap creates 15 management tables in the `organizations` dataset:

1. org_profiles (includes i18n fields: default_currency, default_timezone, default_country, default_language)
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

Note: All subscription plan changes are logged to org_audit_logs (not a separate audit table).

## Key Patterns

**BigQuery Partitioning:**
- Always verify partition field exists in schema
- Use `created_at` for general timestamps
- Use domain-specific fields (`usage_date`, `scheduled_time`) when appropriate

**Testing:**
- Integration tests use `--run-integration` flag
- E2E tests require real BigQuery/KMS (no mocks for critical paths)
- Clean up test data in `finally` blocks
- Test against actual GCP project

**Error Handling:**
- Use structured error responses with error, message, and error_id
- Wrap cleanup code in try-except to prevent shutdown errors
- Validate partition fields before table creation

**Cache Management:**
- Implement LRU eviction with max_size limits
- Use background threads for TTL cleanup
- Prefix all cache keys with org_slug for multi-tenant isolation
- Handle graceful shutdown of background threads

**SaaS Subscription Plans:**
- Use version history for edits (old row gets `end_date`, new row starts from `effective_date`)
- Soft delete via `end_date` instead of hard delete
- Status values: `active`, `pending`, `cancelled`, `expired`

## Recent Enhancements

### Multi-Currency Support
- **Frontend**: CSV-based exchange rates (`public/data/exchange_rates.csv`) with async loading and caching
- **Backend**: Full audit trail with `source_currency`, `source_price`, `exchange_rate_used` fields
- **Enforcement**: All subscription plans automatically converted to org's default currency
- **Data Quality**: Historical cost preservation with timezone-safe date formatting

### Subscription Plan Management
- **Duplicate Detection**: Prevents overlapping plans for same tier/provider
- **Version History**: Edit tracking with automatic versioning (old plan ends, new plan starts)
- **Audit Logging**: Complete change history in `org_audit_logs` table
- **Proration Calculations**: Automatic cost breakdown for monthly/annual/quarterly/weekly billing cycles
- **Currency Conversion**: Real-time conversion using org's default currency at plan creation

### Pipeline Improvements
- **Date Validation**: Strict ISO 8601 format enforcement with timezone handling
- **Auto Start Date**: Plans use `effective_date` as default start date if not specified
- **Failure Notifications**: Email and Slack alerts for pipeline execution failures
- **Migration Endpoint**: One-time data migration with idempotency and rollback support
- **Provider Registry**: Dynamic pipeline discovery from `configs/system/providers.yml`

### Data Quality & Observability
- **Timezone-Safe Processing**: Consistent UTC conversion across all date operations
- **Currency Enforcement**: Validation at API layer ensures data consistency
- **Historical Cost Preservation**: Source currency + exchange rate tracked for audit
- **Structured Error Responses**: Error codes, messages, and error_id for tracking
- **Pipeline Metrics**: Execution logs in `org_meta_pipeline_runs` and `org_meta_step_logs`

See service-specific CLAUDE.md files for detailed implementation guides.

## Common Debugging

### Check Services
```bash
# Health checks
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:8001/health | python3 -m json.tool

# Check what's running on ports
lsof -i :8000  # API service
lsof -i :8001  # Pipeline engine
lsof -i :3000  # Frontend

# Kill services
pkill -f "uvicorn.*8000"
pkill -f "uvicorn.*8001"
```

### Test Pipeline Execution
```bash
# Run GCP billing pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-30"}'

# List available pipelines (no auth)
curl -s http://localhost:8000/api/v1/validator/pipelines | python3 -m json.tool
```

### Common Issues

1. **Pipeline 404 errors**: Check provider/domain match config path. Provider is lowercase (`gcp` not `GCP`), domain matches subfolder (`cost` for `configs/gcp/cost/`).

2. **Frontend calls wrong port**: Frontend should call api-service (8000) for ALL operations (bootstrap, onboarding, integrations, subscriptions). Pipeline-service (8001) is ONLY for pipeline execution. Set `PIPELINE_SERVICE_URL=http://localhost:8001` in `.env.local`.

3. **Config not updating**: Pipeline configs are loaded dynamically. Check `configs/system/providers.yml` for provider registry.

4. **Org slug validation**: Backend requires `^[a-zA-Z0-9_]{3,50}$` (underscores only, no hyphens).

5. **API key not found**: Use dev endpoint above for local testing, or check `user.user_metadata.org_api_keys[org_slug]` in Supabase.

## Environments
- **Stage**: `https://convergence-pipeline-stage-526075321773.us-central1.run.app`
- **Prod**: `https://convergence-pipeline-prod-820784027009.us-central1.run.app`

---

**Last Updated:** 2025-12-14
