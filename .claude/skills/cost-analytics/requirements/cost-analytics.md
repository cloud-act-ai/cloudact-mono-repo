# Cost Analytics - Requirements

## Overview

Dashboard and analytics layer for cost visualization across all cost types (Cloud, GenAI, SaaS Subscription). Data flows from BigQuery through a Polars-powered API with LRU caching to React-based dashboard components with session-level caching, error boundaries, and auto-triggered pipelines.

## Source Specification

`00-requirements-specs/03_DASHBOARD_ANALYTICS.md` (v1.7, 2026-02-08)

---

## Functional Requirements

### FR-01: Dashboard Pages

| Route | Purpose | Data Source |
|-------|---------|------------|
| `/{org}/dashboard` | Main overview | `cost_data_standard_1_3` |
| `/{org}/cost-dashboards/overview` | Unified costs | `cost_data_standard_1_3` |
| `/{org}/cost-dashboards/cloud-costs` | GCP/AWS/Azure/OCI | `cloud_{provider}_billing_raw_daily` |
| `/{org}/cost-dashboards/genai-costs` | OpenAI/Anthropic/etc. | `genai_*_costs_daily` |
| `/{org}/cost-dashboards/subscription-costs` | SaaS subscriptions | `subscription_plan_costs_daily` |

### FR-02: Analytics Features

| Feature | Description |
|---------|-------------|
| Period comparisons | MTD, YTD, MoM, custom date ranges (via trend-granular endpoint) |
| Provider breakdowns | Cost by provider with provider-branded colors |
| Hierarchy allocation | Cost by department/project/team |
| Forecasting | Projected costs based on current trends (`forecast_monthly_cost`, `forecast_annual_cost`) |
| Unified filter | React Context with session-based caching per filter combo |
| Auto-trigger pipelines | PipelineAutoTrigger component fires pipelines on dashboard load |
| Error boundaries | ErrorBoundary wrapping on all dashboard components |
| OrgProviders context | Org-level data shared across dashboard views |

### FR-03: Cost Metrics

| Metric | Description |
|--------|-------------|
| `total_daily_cost` | Total cost for the current day |
| `total_monthly_cost` | Total cost for the current month |
| `total_annual_cost` | Total cost for the current year |
| `ytd_cost` | Year-to-date cumulative cost |
| `mtd_cost` | Month-to-date cumulative cost |
| `forecast_monthly_cost` | Projected cost through end of current month |
| `forecast_annual_cost` | Projected cost through end of current year |

### FR-04: Data Flow

```
1. Pipelines write cost data to BigQuery (raw + FOCUS 1.3)
2. API Service reads via Polars engine with L1 LRU cache (100 entries, TTL until midnight in org TZ)
3. Frontend requests via Server Actions to API cost endpoints (including trend-granular with period comparisons)
4. React Context provides session-based caching per filter combo to dashboard components (wrapped in ErrorBoundary)
5. OrgProviders context provides org-level data across all dashboard views
6. PipelineAutoTrigger component auto-triggers pipelines on dashboard load
7. User applies filters (period, provider, hierarchy) triggering re-fetch with cache
```

---

## Non-Functional Requirements

### NFR-01: Two-Layer Caching Strategy

| Layer | Cache | TTL | Details |
|-------|-------|-----|---------|
| Frontend | React Context per filter combo | Session-based | Cleared on session end |
| API | Polars L1 (in-memory LRU) | Until midnight (org TZ) | 100 entries max |

### NFR-02: Cache Control

| Method | Endpoint / Param | Purpose |
|--------|------------------|---------|
| GET | `/cache/stats` | View cache hit/miss statistics |
| POST | `/cache/invalidate` | Manually invalidate cache entries |
| Query | `?clear_cache=true` | Force bypass cache on any cost endpoint |

### NFR-03: Component Resilience

- All dashboard components wrapped in ErrorBoundary
- PipelineAutoTrigger ensures data freshness on page load

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/[orgSlug]/cost-dashboards/` | Dashboard pages |
| `01-fronted-system/lib/costs/` | Helper library (types, filters, formatters, date-ranges) |
| `02-api-service/src/core/services/cost_read/` | Polars-based read service |
