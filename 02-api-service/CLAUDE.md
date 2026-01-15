# API Service (Port 8000)

Frontend-facing API. Handles bootstrap, onboarding, integrations, subscriptions, hierarchy, cost reads. Does NOT run pipelines (8001).

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
| Admin | `/api/v1/admin/*` | Bootstrap, sync, dev API key |
| Organizations | `/api/v1/organizations/*` | Onboarding, locale |
| Integrations | `/api/v1/integrations/*` | Credential setup/validate |
| Subscriptions | `/api/v1/subscriptions/*` | SaaS plan CRUD |
| Hierarchy | `/api/v1/hierarchy/*` | Dept/Project/Team CRUD |
| Costs | `/api/v1/costs/*` | Polars-powered reads |

## Bootstrap Tables (21)

| Table | Purpose |
|-------|---------|
| `org_profiles` | Org metadata + i18n |
| `org_api_keys` | API keys |
| `org_subscriptions` | Plans & limits |
| `org_integration_credentials` | KMS-encrypted creds |
| `org_hierarchy` | Dept/Project/Team |
| `org_meta_pipeline_runs` | Execution logs |
| `org_notification_*` | Channels, rules, history |

**Schemas:** `configs/setup/bootstrap/schemas/*.json`

## Schema Evolution

**Add column:** Edit JSON → `POST /sync` → Safe, non-destructive
**Never:** Use `force_recreate_*` flags (deletes data)

```bash
# Check status
curl GET /api/v1/admin/bootstrap/status -H "X-CA-Root-Key: $KEY"

# Sync changes
curl POST /api/v1/admin/bootstrap/sync -H "X-CA-Root-Key: $KEY"
```

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

## Cost Read Service

```python
from src.core.services.cost_read import CostQuery, DatePeriod

result = await service.get_costs(CostQuery(
    org_slug="my_org",
    period=DatePeriod.MTD
))
```

| Method | Purpose |
|--------|---------|
| `get_cost_summary()` | Aggregated + forecasts |
| `get_cost_by_provider()` | Provider breakdown |
| `get_cost_by_hierarchy()` | Dept/Project/Team |
| `get_cost_comparison()` | Period vs Period |

## Date Periods

```python
DatePeriod.MTD          # Month to date
DatePeriod.YTD          # Year to date (fiscal)
DatePeriod.LAST_30_DAYS # Rolling 30 days
```

**Fiscal Year:** `fiscal_year_start_month=4` (April/India)

## Table Ownership

| Table | Owner | Writes |
|-------|-------|--------|
| `subscription_plans` | API (8000) | CRUD |
| `org_hierarchy` | API (8000) | CRUD |
| `*_costs_daily` | Pipeline (8001) | Read-only |
| `cost_data_standard_1_3` | Pipeline (8001) | Read-only |

**Rule:** Tables with `x_*` fields → Pipeline writes, API reads only

## Key Endpoints

```bash
# Bootstrap
POST /api/v1/admin/bootstrap

# Onboard org
POST /api/v1/organizations/onboard

# Integration setup
POST /api/v1/integrations/{org}/{provider}/setup

# Subscription CRUD
POST /api/v1/subscriptions/{org}/providers/{p}/plans
POST /api/v1/subscriptions/{org}/providers/{p}/plans/{id}/edit-version

# Hierarchy
POST /api/v1/hierarchy/{org}/levels/seed
POST /api/v1/hierarchy/{org}/entities
GET  /api/v1/hierarchy/{org}/tree
```

## Key Files

| File | Purpose |
|------|---------|
| `configs/setup/bootstrap/schemas/*.json` | 21 meta tables |
| `src/app/routers/*.py` | API endpoints |
| `src/core/services/*_read/` | Polars read services |
| `src/lib/costs/` | Cost calculation library |

---
**v4.1.0** | 2026-01-15
