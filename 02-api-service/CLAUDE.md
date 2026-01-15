# API Service (Port 8000)

Frontend-facing API. Handles bootstrap, onboarding, integrations, subscriptions, hierarchy, quota enforcement, cost reads. Does NOT run pipelines (8001).

## Production Requirements

1. **NO MOCKS** - Production-ready code only
2. **VERIFY FIRST** - Read files before referencing
3. **ENV FILES** - Use `.env.local` (never `.env`)

## Development

```bash
cd 02-api-service
python3 -m uvicorn src.app.main:app --port 8000 --reload
python -m pytest tests/ -v
```

## Routers

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| Admin | `/api/v1/admin/*` | Bootstrap, sync |
| Organizations | `/api/v1/organizations/*` | Onboarding, locale, quota |
| Integrations | `/api/v1/integrations/*` | Credential setup/validate |
| Subscriptions | `/api/v1/subscriptions/*` | SaaS plan CRUD |
| Hierarchy | `/api/v1/hierarchy/*` | Dept/Project/Team CRUD |
| Costs | `/api/v1/costs/*` | Polars-powered reads |
| Validator | `/api/v1/validator/*` | Pipeline validation |

## Bootstrap Tables (21)

| Table | Purpose |
|-------|---------|
| `org_profiles` | Org metadata + i18n |
| `org_api_keys` | API keys |
| `org_subscriptions` | Plans & limits |
| `org_usage_quotas` | Daily/monthly usage |
| `org_integration_credentials` | KMS-encrypted creds |
| `org_hierarchy` | Dept/Project/Team |
| `org_meta_pipeline_runs` | Execution logs |

**Schemas:** `configs/setup/bootstrap/schemas/*.json`

## Quota Enforcement

**This service enforces all quotas before pipeline execution.**

```python
# Atomic check-and-reserve (prevents race conditions)
reserve_pipeline_quota_atomic(org_slug)
```

| Quota | Check |
|-------|-------|
| Daily pipelines | `pipelines_run_today < daily_limit` |
| Monthly pipelines | `pipelines_run_month < monthly_limit` |
| Concurrent | `concurrent_pipelines_running < concurrent_limit` |
| Providers | Count vs `providers_limit` |
| Seats | Member count vs `seat_limit` |

**Endpoint:** `GET /api/v1/organizations/{org}/quota`

## Services Architecture

```
src/core/services/
├─ _shared/           # Cache, date_utils, validation
├─ cost_read/         # Dashboard cost queries (Polars)
├─ usage_read/        # GenAI usage metrics (Polars)
├─ hierarchy_crud/    # Dept/Project/Team CRUD
└─ notification_crud/ # Channels/Rules CRUD
```

**Pattern:** `*_read/` = Polars + Cache | `*_crud/` = Direct BigQuery

## Table Ownership

| Table | Owner | Writes |
|-------|-------|--------|
| `org_subscriptions` | API (8000) | CRUD |
| `org_usage_quotas` | API (8000) | Quota updates |
| `subscription_plans` | API (8000) | CRUD |
| `org_hierarchy` | API (8000) | CRUD |
| `*_costs_daily` | Pipeline (8001) | Read-only |

**Rule:** Tables with `x_*` fields → Pipeline writes, API reads only

## Key Endpoints

```bash
# Bootstrap
POST /api/v1/admin/bootstrap

# Onboard org
POST /api/v1/organizations/onboard

# Quota
GET  /api/v1/organizations/{org}/quota

# Integration setup
POST /api/v1/integrations/{org}/{provider}/setup

# Subscription CRUD
POST /api/v1/subscriptions/{org}/providers/{p}/plans

# Hierarchy
GET  /api/v1/hierarchy/{org}/tree

# Validation (for pipeline service)
POST /api/v1/validator/validate/{org}
```

## Key Files

| File | Purpose |
|------|---------|
| `configs/setup/bootstrap/schemas/*.json` | 21 meta tables |
| `src/app/routers/quota.py` | Quota endpoint |
| `src/app/dependencies/auth.py` | Quota enforcement |
| `src/app/models/org_models.py` | `SUBSCRIPTION_LIMITS` |
| `src/core/services/*_read/` | Polars read services |

---
**v4.1.0** | 2026-01-15
