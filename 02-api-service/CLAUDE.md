# API Service (Port 8000)

Frontend-facing API for org management, auth, and integrations. Handles bootstrap, onboarding, integration setup, subscription plans, and cost analytics. Does NOT run pipelines (port 8001).

## PRODUCTION-READY REQUIREMENTS (CRITICAL)

**MANDATORY for all code generation and modifications:**

1. **NO MOCKS OR STUBS** - Never create mock implementations, placeholder code, or TODO stubs unless explicitly requested
2. **NO HALLUCINATED CODE** - Only reference files, functions, and APIs that actually exist in the codebase
3. **WORKING CODE ONLY** - All generated code must be complete, functional, and production-ready
4. **VERIFY BEFORE REFERENCE** - Always read/check files before referencing them in code or documentation
5. **USE EXISTING PATTERNS** - Follow established patterns in the codebase, don't invent new ones
6. **NO NEW DEPENDENCIES** - Don't add new pip packages without explicit approval
7. **ENVIRONMENT FILES** - Use this project's environment files:
   - Local/Testing: `02-api-service/.env.local`
   - Staging: `02-api-service/.env.stage`
   - Production: `02-api-service/.env.prod`
   - **NEVER use `.env`** - always use environment-specific files

**Before writing code:**
- Read existing files to understand current patterns
- Verify imports and dependencies exist
- Check that referenced APIs/endpoints are real
- Ensure schema matches actual BigQuery tables

## Routers

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| Admin | `/api/v1/admin/*` | Bootstrap, dev API key |
| Organizations | `/api/v1/organizations/*` | Onboarding, subscription, locale |
| Integrations | `/api/v1/integrations/*` | Setup/validate credentials |
| Subscription Plans | `/api/v1/subscriptions/*` | SaaS CRUD with version history |
| Cost Service | `/api/v1/costs/*` | Polars-powered analytics |

## Development

```bash
cd 02-api-service
pip install -r requirements.txt
python3 -m uvicorn src.app.main:app --port 8000 --reload

# Tests
python -m pytest tests/ -v
python -m pytest tests/ -v --run-integration
```

## Bootstrap (14 Meta Tables)

| Table | Purpose | Partitioned |
|-------|---------|-------------|
| org_profiles | Org metadata + i18n | - |
| org_api_keys | API keys | created_at |
| org_subscriptions | Plans & limits | created_at |
| org_usage_quotas | Quota tracking | usage_date |
| org_integration_credentials | Encrypted creds | - |
| org_meta_pipeline_runs | Execution logs | start_time |
| org_meta_step_logs | Step logs | start_time |
| org_meta_dq_results | DQ results | ingestion_date |
| org_pipeline_configs | Pipeline config | - |
| org_scheduled_pipeline_runs | Scheduled jobs | scheduled_time |
| org_pipeline_execution_queue | Queue | scheduled_time |
| org_cost_tracking | Cost data | usage_date |
| org_audit_logs | Audit trail | created_at |
| org_idempotency_keys | Deduplication | - |

**Schemas:** `configs/setup/bootstrap/schemas/*.json`

## Key Endpoints

```bash
# Bootstrap (one-time)
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Onboard organization
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"org_slug":"my_org","company_name":"My Org","admin_email":"admin@example.com","subscription_plan":"FREE","default_currency":"USD"}'

# Get API key (dev only)
curl -X GET "http://localhost:8000/api/v1/admin/dev/api-key/my_org" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Setup integration
curl -X POST "http://localhost:8000/api/v1/integrations/my_org/openai/setup" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"api_key":"sk-..."}'

# SaaS subscription
curl -X POST "http://localhost:8000/api/v1/subscriptions/my_org/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"plan_name":"TEAM","price_per_user_monthly":25.00,"currency":"USD"}'
```

## i18n (Locale)

**Currencies (16):** USD, EUR, GBP, INR, JPY, CNY, AED, SAR, QAR, KWD, BHD, OMR, AUD, CAD, SGD, CHF

**Timezones (15):** UTC, America/*, Europe/*, Asia/*, Australia/Sydney

```bash
# Get locale
curl -X GET "http://localhost:8000/api/v1/organizations/my_org/locale" -H "X-API-Key: $ORG_API_KEY"

# Update locale
curl -X PUT "http://localhost:8000/api/v1/organizations/my_org/locale" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"default_currency":"INR","default_timezone":"Asia/Kolkata"}'
```

## SaaS Subscription Plans

**Version History:** Edits create new rows. Old row gets `end_date`, new row starts from `effective_date`.

**Status Values:** `active`, `pending`, `cancelled`, `expired`

**Currency Enforcement:** Plans MUST match org's `default_currency`.

**Audit Fields:** `source_currency`, `source_price`, `exchange_rate_used` for currency conversion tracking.

```bash
# Edit with version history
curl -X POST "http://localhost:8000/api/v1/subscriptions/my_org/providers/chatgpt_plus/plans/123/edit-version" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"number_of_users":15,"effective_date":"2025-02-01"}'

# End subscription (soft delete)
curl -X DELETE "http://localhost:8000/api/v1/subscriptions/my_org/providers/chatgpt_plus/plans/123" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"end_date":"2025-03-31"}'
```

## Project Structure

```
02-api-service/
├── src/app/
│   ├── main.py                 # FastAPI entry
│   ├── routers/                # API endpoints
│   └── models/i18n_models.py   # i18n constants
├── src/core/
│   ├── engine/bq_client.py     # BigQuery client
│   ├── security/               # KMS encryption
│   ├── services/               # Read/CRUD services (see below)
│   └── processors/             # Integration processors
├── src/lib/                    # Centralized calculation libraries
│   ├── costs/                  # Cost aggregation, forecasting
│   ├── usage/                  # GenAI usage calculations
│   └── integrations/           # Integration status/health
├── configs/
│   ├── setup/bootstrap/        # 14 table schemas
│   └── saas/seed/              # Subscription templates
└── tests/
```

### Services Directory (`src/core/services/`)

```
services/
├── _shared/                    # Common utilities
│   ├── cache.py               # LRU cache with TTL
│   ├── validation.py          # org_slug validation
│   └── date_utils.py          # Fiscal year, periods, comparisons
├── cost_read/                  # GET /costs/* (Polars + cache)
│   ├── models.py              # CostQuery, CostResponse
│   └── service.py             # CostReadService
├── usage_read/                 # GET /usage/* (Polars + cache)
│   ├── models.py              # UsageQuery, UsageResponse
│   └── service.py             # UsageReadService
├── integration_read/           # GET /integrations/* (Polars + cache)
│   ├── models.py              # IntegrationQuery, IntegrationResponse
│   └── service.py             # IntegrationReadService
├── pipeline_read/              # GET /pipelines/* (Polars + cache)
│   ├── models.py              # PipelineQuery, PipelineResponse
│   └── service.py             # PipelineReadService
└── hierarchy_crud/             # Hierarchy CRUD (direct BigQuery)
    └── service.py             # HierarchyService
```

**Naming Convention:**
- `*_read/` = Polars + Cache for dashboard reads
- `*_crud/` = Direct BigQuery for settings writes

## Calculation Libraries (src/lib/)

Centralized Polars-based calculations. All services use these for consistent results.

```python
from src.lib.costs import (
    # Aggregations
    aggregate_by_provider,
    aggregate_by_service,
    aggregate_by_category,
    aggregate_by_date,
    aggregate_by_hierarchy,
    # Calculations
    calculate_forecasts,
    calculate_daily_rate,
    calculate_monthly_forecast,
    calculate_percentage_change,
    get_date_info,
    # Filters
    filter_date_range,
    filter_providers,
    filter_hierarchy,
    apply_cost_filters,
)
```

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `lib/costs/aggregations.py` | Cost grouping | `aggregate_by_provider`, `aggregate_by_hierarchy`, `aggregate_by_date` |
| `lib/costs/calculations.py` | Forecasting | `calculate_forecasts`, `calculate_percentage_change`, `get_date_info` |
| `lib/costs/filters.py` | Data filtering | `filter_date_range`, `filter_hierarchy`, `apply_cost_filters` |
| `lib/usage/` | GenAI metrics | `aggregate_tokens_*`, `calculate_*_rate`, `format_*` |
| `lib/integrations/` | Provider status | `calculate_integration_health`, `aggregate_*_status` |

## Cost Read Service Architecture

The `cost_read/` service uses `lib/costs/` for all Polars aggregations:

```
API Request → CostQuery(resolve_dates()) → _fetch_cost_data() → lib/costs/* → Response
                     ↓
              DatePeriod.MTD        aggregate_by_*()      calculate_forecasts()
              DatePeriod.YTD        filter_date_range()   calculate_percentage_change()
              ComparisonType.*      aggregate_by_hierarchy()
```

### Available Cost Methods

| Method | Purpose | Uses lib/costs/ |
|--------|---------|-----------------|
| `get_costs()` | Raw cost data | `filter_date_range` |
| `get_cost_summary()` | Aggregated summary | `calculate_forecasts` |
| `get_cost_by_provider()` | Provider breakdown | `aggregate_by_provider` |
| `get_cost_by_service()` | Service breakdown | `aggregate_by_service` |
| `get_cost_by_category()` | Category breakdown | `aggregate_by_category` |
| `get_cost_trend()` | Time series | `aggregate_by_date` |
| `get_cost_by_hierarchy()` | Dept/Project/Team | `aggregate_by_hierarchy` |
| `get_hierarchy_rollup()` | Full hierarchy (single fetch) | `aggregate_by_hierarchy` x3 |
| `get_cost_forecast()` | MTD → forecasts | `calculate_forecasts` |
| `get_cost_comparison()` | Period vs Period | `get_comparison_ranges`, `calculate_percentage_change` |
| `get_saas_subscription_costs()` | SaaS costs | `aggregate_by_provider`, `calculate_forecasts` |
| `get_cloud_costs()` | Cloud costs | `aggregate_by_provider`, `calculate_forecasts` |
| `get_llm_costs()` | LLM API costs | `aggregate_by_provider`, `calculate_forecasts` |

### Usage Examples

```python
from src.core.services.cost_read import (
    get_cost_read_service,
    CostQuery,
    DatePeriod,
    ComparisonType,
)

service = get_cost_read_service()

# Basic cost query with period
result = await service.get_costs(CostQuery(
    org_slug="my_org",
    period=DatePeriod.MTD
))

# Forecasting
forecast = await service.get_cost_forecast(CostQuery(org_slug="my_org"))

# Hierarchy rollup (single fetch, 3 aggregations)
rollup = await service.get_hierarchy_rollup(CostQuery(
    org_slug="my_org",
    period=DatePeriod.YTD
))

# Month-over-month comparison
comparison = await service.get_cost_comparison(
    CostQuery(org_slug="my_org"),
    comparison_type=ComparisonType.MONTH_OVER_MONTH
)

# Custom fiscal year (April start)
result = await service.get_costs(CostQuery(
    org_slug="my_org",
    period=DatePeriod.YTD,
    fiscal_year_start_month=4  # India/UK fiscal
))
```

## Read Services (src/core/services/*_read/)

Polars-powered read services for dashboard performance. All use shared date utilities.

| Service | Endpoint Pattern | Cache TTL | Purpose |
|---------|------------------|-----------|---------|
| `cost_read/` | `GET /costs/*` | 60-300s | Cost aggregations + forecasting + comparisons |
| `usage_read/` | `GET /usage/*` | 60s | GenAI usage metrics |
| `integration_read/` | `GET /integrations/*` | 60s | Integration health |
| `pipeline_read/` | `GET /pipelines/*` | 30s | Run history stats |

## Date Utilities (`_shared/date_utils.py`)

All read services use shared date utilities for fiscal year and period handling.

### Date Periods

```python
from src.core.services._shared import DatePeriod

DatePeriod.TODAY           # Today only
DatePeriod.YESTERDAY       # Yesterday only
DatePeriod.LAST_7_DAYS     # Last 7 days
DatePeriod.LAST_30_DAYS    # Last 30 days
DatePeriod.LAST_90_DAYS    # Last 90 days
DatePeriod.MTD             # Month to date
DatePeriod.QTD             # Quarter to date (fiscal)
DatePeriod.YTD             # Year to date (fiscal)
DatePeriod.LAST_MONTH      # Full last month
DatePeriod.LAST_QUARTER    # Full last quarter
DatePeriod.LAST_YEAR       # Full last fiscal year
DatePeriod.CUSTOM          # Custom date range
```

### Fiscal Year Support

```python
from src.core.services._shared import get_fiscal_year_range

# Calendar year (Jan start) - default
get_fiscal_year_range(fiscal_year_start_month=1)  # Jan 1 to Dec 31

# April fiscal (India/UK/Japan)
get_fiscal_year_range(fiscal_year_start_month=4)  # Apr 1 to Mar 31

# July fiscal (Australia)
get_fiscal_year_range(fiscal_year_start_month=7)  # Jul 1 to Jun 30
```

### Period Comparisons

```python
from src.core.services._shared import ComparisonType, get_comparison_ranges

# Week over week
get_comparison_ranges(ComparisonType.WEEK_OVER_WEEK)

# Month over month
get_comparison_ranges(ComparisonType.MONTH_OVER_MONTH)

# Quarter over quarter
get_comparison_ranges(ComparisonType.QUARTER_OVER_QUARTER)

# Year over year (fiscal)
get_comparison_ranges(ComparisonType.YEAR_OVER_YEAR)

# Last N days vs previous N days
get_comparison_ranges(ComparisonType.CUSTOM_DAYS, days=90)
```

### Query Date Resolution Priority

1. `start_date` + `end_date` → Custom range (customer override)
2. `period` → Predefined period (MTD, QTD, YTD, etc.)
3. `fiscal_year` → Specific fiscal year
4. Default → Current fiscal YTD (cost/usage) or Last 30 days (pipeline)

## Table Ownership (API vs Pipeline)

**IMPORTANT for AI coding agents**: Know which service owns which table.

| Table Pattern | Owner | Field Prefix | Modifications |
|---------------|-------|--------------|---------------|
| `org_integration_credentials` | API (8000) | None | CRUD via routers |
| `saas_subscription_plans` | API (8000) | None | CRUD via routers |
| `org_hierarchy` | API (8000) | None | CRUD via routers |
| `org_profiles` | API (8000) | None | CRUD via routers |
| `*_usage_raw` | Pipeline (8001) | `x_*` | Read-only from API |
| `*_costs_daily` | Pipeline (8001) | `x_*` | Read-only from API |
| `cost_data_standard_1_3` | Pipeline (8001) | `x_*` | Read-only from API |
| `org_meta_pipeline_runs` | Pipeline (8001) | None | Read-only from API |

**Rule**: Tables with `x_*` fields are pipeline-generated → API Service reads only.

## Read vs Write Pattern

```
Dashboard Reads (Polars + Cache)     Settings CRUD (Direct BigQuery)
────────────────────────────────     ──────────────────────────────
GET  /costs/{org}/*       [Polars]   (no CRUD - pipeline writes)
GET  /usage/{org}/*       [Polars]   (no CRUD - pipeline writes)
GET  /pipelines/{org}/*   [Polars]   POST /pipelines/run (execute)
GET  /integrations/{org}  [Polars]   POST /integrations/setup (CRUD)
```

- `GET` endpoints = Dashboard reads → use Polars services
- `POST/PUT/DELETE` = Settings CRUD → direct BigQuery in routers

## Environment (.env.local)

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
GCP_PROJECT_ID=your-project
CA_ROOT_API_KEY=your-admin-key-32chars
KMS_KEY_NAME=projects/.../cryptoKeys/your-key
ENVIRONMENT=development
```

## Security

- All endpoints require auth (X-CA-Root-Key or X-API-Key)
- Credentials encrypted via KMS
- Rate limiting enabled
- Dev API key endpoint blocked in production

## CRUD Services (src/core/services/*_crud/)

Direct BigQuery operations for settings and hierarchy management.

| Service | Endpoint Pattern | Purpose |
|---------|------------------|---------|
| `hierarchy_crud/` | `/hierarchy/*` | Dept/Project/Team CRUD |

```python
from src.core.services.hierarchy_crud import get_hierarchy_crud_service

service = get_hierarchy_crud_service()
result = await service.create_department(org_slug, request)
```

---
**Last Updated:** 2025-12-30
