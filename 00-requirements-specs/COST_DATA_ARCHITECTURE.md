# Cost Data Architecture

CloudAct cost analytics platform architecture documentation. All cost types (SaaS, Cloud, LLM) flow through a unified FOCUS 1.3 standard table.

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Port 3000)                                               │
│  ┌──────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Cost Dashboard   │───▶│ actions/costs.ts                     │  │
│  │ Pages (.tsx)     │    │ lib/costs/* (helpers)                │  │
│  └──────────────────┘    └───────────────┬──────────────────────┘  │
└──────────────────────────────────────────┼──────────────────────────┘
                                           │ HTTP + X-API-Key
                                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API SERVICE (Port 8000)                                            │
│  routers/costs.py ──▶ services/cost_service.py ──▶ BigQuery         │
└─────────────────────────────────────────────────────────────────────┘
                                           ▲
                                           │ Pipeline writes
┌─────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE (Port 8001)                                       │
│  configs/{provider}/cost/*.yml ──▶ cost_data_standard_1_3           │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

### Frontend (01-fronted-system)

```
01-fronted-system/
├── actions/
│   └── costs.ts                    # Server actions (API calls)
├── lib/costs/                      # Cost helper library
│   ├── index.ts                    # Barrel export
│   ├── types.ts                    # TypeScript types
│   ├── date-ranges.ts              # Period calculations
│   ├── filters.ts                  # Data filtering
│   ├── comparisons.ts              # Period vs period
│   ├── summary.ts                  # Summary calculations
│   └── formatters.ts               # Display formatting
└── app/[orgSlug]/cost-dashboards/
    ├── layout.tsx
    ├── overview/page.tsx           # Unified costs
    ├── cloud-costs/page.tsx        # GCP/AWS/Azure
    ├── genai-costs/page.tsx        # OpenAI/Anthropic
    └── subscription-costs/page.tsx # SaaS subscriptions
```

### API Service (02-api-service)

```
02-api-service/src/
├── app/routers/
│   └── costs.py                    # REST endpoints
├── core/services/
│   └── cost_service.py             # Polars + LRU Cache
└── lib/                            # Centralized calculation libraries
    ├── costs/                      # Cost aggregation, forecasting
    │   ├── calculations.py         # DateInfo, forecasts, periods
    │   ├── aggregations.py         # Polars: by_provider, by_date
    │   └── filters.py              # CostFilterParams, filtering
    ├── usage/                      # GenAI usage calculations
    │   ├── calculations.py         # UsageSummary, tokens, latency
    │   ├── aggregations.py         # Polars: tokens, requests
    │   ├── formatters.py           # Display formatting
    │   └── constants.py            # Provider/model configs
    └── integrations/               # Integration status/health
        ├── calculations.py         # IntegrationHealth, status
        ├── aggregations.py         # Polars: by_category, by_provider
        └── constants.py            # Provider configs
```

### Pipeline Service (03-data-pipeline-service)

```
03-data-pipeline-service/
├── configs/
│   ├── subscription/costs/subscription_cost.yml
│   ├── cloud/gcp/cost/billing.yml
│   ├── cloud/aws/cost/billing.yml
│   ├── cloud/azure/cost/billing.yml
│   └── system/procedures/
│       └── subscription/
│           ├── sp_calculate_subscription_plan_costs_daily.sql
│           ├── sp_convert_subscription_costs_to_focus_1_3.sql
│           └── sp_run_subscription_costs_pipeline.sql
└── src/core/processors/
    └── {provider}/cost.py
```

---

## Data Flow

### 1. Frontend → API

```typescript
// Server action in actions/costs.ts
const response = await fetch(`${API_URL}/api/v1/costs/${orgSlug}/cloud`, {
  headers: { "X-API-Key": orgApiKey }
})

// Response
{
  success: boolean
  data: CostRecord[]
  summary: CostSummary
  cache_hit: boolean
  currency: string
}
```

### 2. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/{org_slug}` | GET | Raw cost data with filters |
| `/{org_slug}/summary` | GET | Aggregated cost summary |
| `/{org_slug}/by-provider` | GET | Cost grouped by provider |
| `/{org_slug}/by-service` | GET | Cost grouped by service |
| `/{org_slug}/trend` | GET | Time-series (daily/weekly/monthly) |
| `/{org_slug}/saas-subscriptions` | GET | SaaS subscription costs |
| `/{org_slug}/cloud` | GET | Cloud infrastructure costs |
| `/{org_slug}/llm` | GET | LLM API costs |
| `/{org_slug}/total` | GET | Combined all types |

### 3. BigQuery Schema

**Table:** `cost_data_standard_1_3` (FOCUS 1.3 Standard)

| Column | Type | Description |
|--------|------|-------------|
| SubAccountId | STRING | Org slug (multi-tenancy) |
| ServiceProviderName | STRING | Provider (gcp, aws, openai, slack) |
| ServiceCategory | STRING | Category (Cloud, SaaS, LLM) |
| ServiceName | STRING | Service name |
| BilledCost | NUMERIC | Actual billed cost |
| EffectiveCost | NUMERIC | Effective cost after discounts |
| BillingCurrency | STRING | Currency code |
| ChargePeriodStart | DATE | Period start |
| ChargePeriodEnd | DATE | Period end |
| x_source_system | STRING | Pipeline source identifier |
| x_pipeline_id | STRING | Pipeline that wrote data |
| x_ingested_at | TIMESTAMP | When data was ingested |

---

## Frontend Cost Helpers

### Date Ranges (`lib/costs/date-ranges.ts`)

```typescript
import { dateRanges } from "@/lib/costs"

// Current periods
dateRanges.today()        // { start, end, label: "Today" }
dateRanges.thisWeek()     // Current week (Mon-Sun)
dateRanges.thisMonth()    // Current month
dateRanges.thisQuarter()  // Current quarter
dateRanges.thisYear()     // Current year

// Previous periods (for comparison)
dateRanges.lastWeek()
dateRanges.lastMonth()
dateRanges.lastQuarter()
dateRanges.lastYear()

// Rolling periods
dateRanges.last7Days()
dateRanges.last30Days()
dateRanges.last90Days()
dateRanges.last6Months()
dateRanges.last12Months()

// Fiscal year
dateRanges.fy2025()       // Apr 1, 2024 - Mar 31, 2025

// MTD/YTD
dateRanges.mtd()          // Month start → today
dateRanges.ytd()          // Year start → today

// Custom
dateRanges.custom(start, end)
```

### Filters (`lib/costs/filters.ts`)

```typescript
import { filterByDateRange, filterByProvider, filterByCategory } from "@/lib/costs"

// Filter by date range
const mtdCosts = filterByDateRange(records, dateRanges.mtd())

// Filter by provider
const gcpCosts = filterByProvider(records, ["gcp"])
const cloudCosts = filterByProvider(records, ["gcp", "aws", "azure"])

// Filter by category
const saasCosts = filterByCategory(records, ["SaaS"])

// Group by
const byDay = groupByDay(records)          // Map<date, total>
const byProvider = groupByProvider(records) // Map<provider, total>
const byCategory = groupByCategory(records) // Map<category, total>
```

### Comparisons (`lib/costs/comparisons.ts`)

```typescript
import { comparePeriods, monthOverMonth, weekOverWeek } from "@/lib/costs"

// Compare any two periods
const comparison = comparePeriods(records, dateRanges.thisMonth(), dateRanges.lastMonth())
// Returns: { current, previous, change, changePercent, trend }

// Pre-built comparisons
const mom = monthOverMonth(records)  // This month vs last month
const wow = weekOverWeek(records)    // This week vs last week
const qoq = quarterOverQuarter(records)
const yoy = yearOverYear(records)
```

### Summary (`lib/costs/summary.ts`)

```typescript
import { calculateSummary } from "@/lib/costs"

const summary = calculateSummary(records, dateRanges.thisMonth())
// Returns:
{
  total: number
  dailyAverage: number
  monthlyRunRate: number
  annualRunRate: number
  mtd: number
  ytd: number
  forecastMonthly: number
  forecastAnnual: number
  byProvider: Map<string, number>
  byCategory: Map<string, number>
  recordCount: number
}
```

### Usage in Components

```typescript
// Fetch once with wide range
const { data } = await getCosts(orgSlug, dateRanges.last12Months())

// Filter client-side (no API calls)
const mtdCosts = filterByDateRange(data, dateRanges.mtd())
const summary = calculateSummary(data, dateRanges.thisMonth())
const comparison = monthOverMonth(data)

// Chart interactions are instant
const handleRangeChange = (key) => {
  setFilteredData(filterByDateRange(data, dateRanges[key]()))
}
```

---

## Reusability Patterns

| Component | Reused In | Pattern |
|-----------|-----------|---------|
| `cost_data_standard_1_3` | All cost queries | Single unified table |
| `PolarsCostService._calculate_cost_summary()` | All summary endpoints | Shared calculation |
| `x_source_system` filter | SaaS/Cloud/LLM queries | Source tagging |
| `SubAccountId = org_slug` | Every query | Multi-tenant isolation |
| LRU Cache | All cost endpoints | 1-15 min TTL |
| `lib/costs/*` helpers | All dashboard pages | Client-side filtering |
| FOCUS 1.3 schema | All pipelines | Standard format |

---

## Cost Calculation Formulas

### Daily Rate
```
daily_rate = SUM(costs for most recent day with data)
           OR AVG(costs for last 7 days) if smoothing enabled
```

### Run Rates
```
monthly_run_rate = daily_rate × days_in_current_month
annual_run_rate = daily_rate × 365
```

### Period Totals
```
mtd = SUM(costs from month_start to today)
ytd = SUM(costs from year_start to today)
```

### Forecasts
```
forecast_monthly = mtd + (daily_rate × days_remaining_in_month)
forecast_annual = ytd + (daily_rate × days_remaining_in_year)
```

### Comparison
```
change = current_total - previous_total
change_percent = (change / previous_total) × 100
trend = "up" if change > 0.01 else "down" if change < -0.01 else "flat"
```

---

## Caching Strategy

### API Service (Backend)

| Data Age | TTL | Reason |
|----------|-----|--------|
| Last 7 days | 1 min | Hot data, may change |
| 8-30 days | 5 min | Recent but stable |
| > 30 days | 15 min | Cold data, rarely changes |

**Cache Key:** `MD5(org_slug + endpoint + start_date + end_date + filters)`

### Frontend

- Fetch wide range once (e.g., last 12 months)
- Filter client-side for specific periods
- No API calls for chart interactions
- Refresh on page navigation or explicit action

---

## Security

### Multi-Tenancy
- `SubAccountId = @org_slug` in every query (parameterized)
- URL org_slug must match API key org_slug
- Dataset isolation: `{org_slug}_{env}`

### Authentication
- X-API-Key header required
- Org API key validates against `org_api_keys` table
- Rate limiting: 60 requests/min per org per endpoint
- **AUTH-001 FIX:** Auth cache key includes `userId:orgSlug` to prevent cross-user leakage

### Injection Prevention
- All queries use parameterized values
- org_slug validated: `^[a-zA-Z0-9_]{3,50}$`

---

## Bug Fixes Applied (2026-01-04)

Production-critical fixes for cost analytics. All fixes verified with TypeScript build passing.

| Bug ID | Severity | File | Issue | Fix |
|--------|----------|------|-------|-----|
| CTX-002 | CRITICAL | `*-costs/page.tsx` | Category filter persisted across pages | Added useEffect cleanup |
| AUTH-001 | CRITICAL | `actions/costs.ts` | Cross-user auth cache leakage | Cache key = `userId:orgSlug` |
| CTX-005 | HIGH | `cost-data-context.tsx` | Stale closure in setUnifiedFilters | Added `filtersOverride` param |
| DATE-001 | HIGH | `lib/costs/filters.ts` | Timezone issues in filterGranularByDateRange | String comparison |
| DATE-002 | MEDIUM | `lib/costs/filters.ts` | Timezone issues in filterByDateRange | String comparison |
| FILTER-007 | LOW | `cost-filters.tsx` | Provider selection case sensitivity | Case-insensitive `.some()` |

### Key Architecture Changes

1. **Category Filter Cleanup (CTX-002)**
   - Category-specific pages (`genai-costs`, `cloud-costs`, `subscription-costs`) now reset filters on unmount
   - Overview page correctly shows ALL categories after navigation

2. **Secure Auth Caching (AUTH-001)**
   - Auth context cache key changed from `orgSlug` to `userId:orgSlug`
   - Prevents User B from getting User A's auth context

3. **Stale Closure Prevention (CTX-005)**
   - `fetchCostData()` accepts optional `filtersOverride` parameter
   - Ensures hierarchy filters are sent to API on L1_NO_CACHE decisions

4. **Timezone-Safe Date Filtering (DATE-001, DATE-002)**
   - All date filtering uses YYYY-MM-DD string comparison
   - Same results regardless of user's timezone

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-30 | Initial documentation | Claude |
| 2025-12-30 | Added lib/costs helper library | Claude |
| 2026-01-04 | Bug fixes: CTX-002, AUTH-001, CTX-005, DATE-001, DATE-002, FILTER-007 | Claude |
| 2026-01-04 | Added unified filter architecture section | Claude |

---

**Related Docs:**
- `02-api-service/CLAUDE.md` - API service details
- `03-data-pipeline-service/CLAUDE.md` - Pipeline details
- `01-fronted-system/CLAUDE.md` - Frontend patterns
- `.claude/skills/cost-analytics/SKILL.md` - Detailed troubleshooting & architecture
