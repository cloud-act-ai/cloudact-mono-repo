# Cost Analytics - Requirements

## Overview

Dashboard and analytics layer for cost visualization across all cost types (Cloud, GenAI, SaaS Subscription). Data flows from BigQuery through a Polars-powered API with LRU caching to React-based dashboard components with session-level caching, error boundaries, and auto-triggered pipelines.

## Source Specification

`03_DASHBOARD_ANALYTICS.md` (v1.7, 2026-02-08)

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  Frontend (3000) - Next.js 16                                        │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Dashboard Pages (5)                                            │  │
│  │  /{org}/dashboard                                               │  │
│  │  /{org}/cost-dashboards/overview                                │  │
│  │  /{org}/cost-dashboards/cloud-costs                             │  │
│  │  /{org}/cost-dashboards/genai-costs                             │  │
│  │  /{org}/cost-dashboards/subscription-costs                      │  │
│  └─────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌─────────────────▼───────────────────────────────────────────────┐  │
│  │  L1 Cache: React Context (session-based, per filter combo)      │  │
│  │  OrgProviders context (org-level shared data)                   │  │
│  │  ErrorBoundary wrapping on all dashboard components             │  │
│  │  PipelineAutoTrigger (fires pipelines on dashboard load)        │  │
│  └─────────────────┬───────────────────────────────────────────────┘  │
│                     │ Server Actions                                   │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────────────────────┐
│  API Service (8000) - FastAPI                                          │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  L2 Cache: Polars LRU (100 entries, TTL until midnight org TZ)  │  │
│  │  Cache control: /cache/stats, /cache/invalidate, ?clear_cache   │  │
│  └─────────────────┬────────────────────────────────────────────────┘  │
│                     │ Polars DataFrames                                 │
│  Cost Endpoints:    │                                                  │
│  /costs/{org}/summary, /by-provider, /trend, /trend-granular, etc.   │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────────────────────┐
│  BigQuery: {org_slug}_prod                                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ cost_data_standard_1_3 (FOCUS 1.3 unified - all cost types)     │  │
│  │ cloud_{provider}_billing_raw_daily (provider detail)             │  │
│  │ genai_*_costs_daily (GenAI detail)                               │  │
│  │ subscription_plan_costs_daily (subscription detail)              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

**Two-Layer Caching Strategy:**
- **L1 (Frontend):** React Context caches per filter combination (period, provider, hierarchy). Cleared on session end. Prevents redundant API calls during navigation.
- **L2 (API):** Polars in-memory LRU cache with 100 entries. TTL expires at midnight in the org's timezone. Manually invalidatable via `/cache/invalidate` or bypassed with `?clear_cache=true`.

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

## SDLC

### Development Workflow

1. **Frontend development** -- `cd 01-fronted-system && npm run dev` (port 3000)
2. **API development** -- `cd 02-api-service && python -m uvicorn src.app.main:app --port 8000 --reload`
3. **Iterate on dashboard components** -- Edit pages in `app/[orgSlug]/cost-dashboards/`, helpers in `lib/costs/`
4. **Verify cache behavior** -- Use `/cache/stats` to confirm hit rates, `?clear_cache=true` to test fresh fetches
5. **Run tests** -- Vitest for frontend, pytest for API, Playwright for E2E
6. **Deploy** -- Push to `main` (stage) or tag `v*` (prod)

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| Frontend components | Vitest | Cost helpers (formatters, date-ranges, filters, types) |
| API cost reads | pytest | Polars read service, cache hit/miss, endpoint responses |
| Dashboard E2E | Playwright | Page loads, filter interactions, data rendering, error boundaries |
| Cache validation | Manual / pytest | LRU eviction, midnight TTL reset, manual invalidation |
| Demo verification | Demo scripts | Load demo data (Dec 2025 - Jan 2026), verify dashboard displays |

### Deployment / CI/CD Integration

- **Stage:** Automatic on `git push origin main` via `cloudbuild-stage.yaml`
- **Production:** Triggered by `git tag v*` via `cloudbuild-prod.yaml`
- **Cache invalidation on deploy:** L2 Polars cache resets on API service restart. L1 React Context clears on new session.
- **Post-deploy verification:** Navigate to `/{org}/cost-dashboards/overview`, confirm data loads and filters work

### Release Cycle Position

Cost analytics is a downstream consumer of cost data. Pipeline and API changes must deploy first. Frontend dashboard changes can deploy independently as long as API contracts are stable.

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/[orgSlug]/cost-dashboards/` | Dashboard pages |
| `01-fronted-system/lib/costs/` | Helper library (types, filters, formatters, date-ranges) |
| `02-api-service/src/core/services/cost_read/` | Polars-based read service |
