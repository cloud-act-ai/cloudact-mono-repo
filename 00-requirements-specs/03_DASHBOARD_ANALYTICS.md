# Dashboard & Analytics

**v1.6** | 2026-02-05

> Cost visualization and analytics

---

## Data Flow Workflow

```
1. Pipelines write cost data → BigQuery (raw + FOCUS 1.3)
2. API Service reads → Polars engine with L1/L2 cache
3. Frontend requests → Server actions → API cost endpoints
4. React Context → Granular data caching → Dashboard components
5. User applies filters → Period, provider, hierarchy → Re-fetch with cache
```

---

## Pages

| Route | Purpose | Data Source |
|-------|---------|------------|
| `/{org}/dashboard` | Main overview | `cost_data_standard_1_3` |
| `/{org}/cost-dashboards/overview` | Unified costs | `cost_data_standard_1_3` |
| `/{org}/cost-dashboards/cloud-costs` | GCP/AWS/Azure/OCI | `cloud_{provider}_billing_raw_daily` |
| `/{org}/cost-dashboards/genai-costs` | OpenAI/Anthropic/etc. | `genai_*_costs_daily` |
| `/{org}/cost-dashboards/subscription-costs` | SaaS subscriptions | `subscription_plan_costs_daily` |

---

## Features

| Feature | Description |
|---------|-------------|
| Period comparisons | MTD, YTD, MoM, custom date ranges |
| Provider breakdowns | Cost by provider with provider-branded colors |
| Hierarchy allocation | Cost by department/project/team |
| Forecasting | Projected costs based on current trends |
| Unified filter | React Context with granular caching per filter combo |

---

## Caching Strategy

| Layer | Cache | TTL |
|-------|-------|-----|
| Frontend | React Context per filter combo | Session-based |
| API | Polars L1 (in-memory LRU) | 5 min |
| API | Polars L2 (disk) | 15 min |

---

## Key Files

| File | Purpose |
|------|---------|
| `app/[orgSlug]/cost-dashboards/` | Dashboard pages |
| `lib/costs/` | Helper library (types, filters, formatters, date-ranges) |
| `02-api-service/src/core/services/cost_read/` | Polars-based read service |
