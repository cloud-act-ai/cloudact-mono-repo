---
name: cost-analysis
description: |
  Cost data architecture and analysis for CloudAct. Multi-currency support, FOCUS 1.3 compliance,
  frontend helpers, period comparisons, and cost allocation.
  Use when: analyzing costs, using frontend cost helpers, comparing periods (MTD, YTD, MoM),
  working with multi-currency data, understanding cost allocation, FOCUS 1.3 format, or validating cost pipelines.
---

# Cost Analysis & Architecture

## Overview

CloudAct tracks costs across cloud providers, LLM APIs, and SaaS subscriptions using FOCUS 1.3 standard.
All cost types flow into a single unified table: `cost_data_standard_1_3`.

## Data Flow Architecture

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

## Key File Locations

| Component | Path |
|-----------|------|
| **Frontend Helpers** | `01-fronted-system/lib/costs/` |
| **Server Actions** | `01-fronted-system/actions/costs.ts` |
| **Cost Dashboards** | `01-fronted-system/app/[orgSlug]/cost-dashboards/` |
| **API Router** | `02-api-service/src/app/routers/costs.py` |
| **Cost Service** | `02-api-service/src/core/services/cost_service.py` |
| **Pipeline Configs** | `03-data-pipeline-service/configs/{provider}/cost/` |
| **Stored Procedures** | `03-data-pipeline-service/configs/system/procedures/` |
| **Architecture Doc** | `COST_DATA_ARCHITECTURE.md` |

## Frontend Cost Helpers (`lib/costs/`)

### File Structure
```
01-fronted-system/lib/costs/
├── index.ts           # Barrel export (import from here)
├── types.ts           # TypeScript types
├── date-ranges.ts     # Period calculations
├── filters.ts         # Data filtering
├── comparisons.ts     # Period vs period
├── summary.ts         # Summary calculations
└── formatters.ts      # Display formatting
```

### Date Ranges
```typescript
import { dateRanges } from "@/lib/costs"

// Current periods
dateRanges.today()
dateRanges.thisWeek()
dateRanges.thisMonth()
dateRanges.thisQuarter()
dateRanges.thisYear()

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

// To-date periods
dateRanges.mtd()       // Month to date
dateRanges.qtd()       // Quarter to date
dateRanges.ytd()       // Year to date

// Fiscal year
dateRanges.fy2025()    // Apr 1, 2024 - Mar 31, 2025
dateRanges.fytd()      // Fiscal year to date

// Custom
dateRanges.custom(startDate, endDate)
dateRanges.month(2025, 1)   // January 2025
dateRanges.quarter(2025, 1) // Q1 2025
```

### Filters
```typescript
import {
  filterByDateRange,
  filterByProvider,
  filterByCategory,
  sumCosts,
  groupByProvider,
  groupByCategory,
  toTimeSeries
} from "@/lib/costs"

// Filter by date range
const mtdCosts = filterByDateRange(records, dateRanges.mtd())

// Filter by provider
const gcpCosts = filterByProvider(records, ["gcp", "aws"])

// Filter by category
const saasCosts = filterByCategory(records, ["SaaS"])

// Sum costs
const total = sumCosts(records)

// Group for charts
const byProvider = groupByProvider(records)  // Map<provider, total>
const byCategory = groupByCategory(records)  // Map<category, total>
const timeSeries = toTimeSeries(records, "daily")
```

### Comparisons
```typescript
import {
  monthOverMonth,
  weekOverWeek,
  yearOverYear,
  comparePeriods
} from "@/lib/costs"

// Pre-built comparisons
const mom = monthOverMonth(records)  // This month vs last month
const wow = weekOverWeek(records)    // This week vs last week
const yoy = yearOverYear(records)    // This year vs last year

// Custom comparison
const custom = comparePeriods(
  records,
  dateRanges.thisMonth(),
  dateRanges.lastMonth()
)

// Result structure
{
  current: { total, label, recordCount },
  previous: { total, label, recordCount },
  change: number,        // Absolute change
  changePercent: number, // Percentage change
  trend: "up" | "down" | "flat"
}
```

### Summary Calculator
```typescript
import { calculateSummary, forecastMonthEnd, forecastYearEnd } from "@/lib/costs"

const summary = calculateSummary(records, dateRanges.thisMonth())

// Result structure
{
  total: number,
  dailyAverage: number,
  monthlyRunRate: number,
  annualRunRate: number,
  mtd: number,
  ytd: number,
  forecastMonthly: number,
  forecastAnnual: number,
  byProvider: Map<string, number>,
  byCategory: Map<string, number>,
  recordCount: number
}

// Forecasts
const monthEndForecast = forecastMonthEnd(records)
const yearEndForecast = forecastYearEnd(records)
```

### Formatters
```typescript
import {
  formatCost,
  formatCostCompact,
  formatPercent,
  formatTrend,
  formatRunRate
} from "@/lib/costs"

formatCost(1234.56, "USD")           // "$1,234.56"
formatCostCompact(1234567, "USD")    // "$1.2M"
formatPercent(15.5)                   // "15.5%"
formatRunRate(1234, "day", "USD")    // "$1,234/day"

const trend = formatTrend(comparison, "USD")
// { text, arrow, colorClass, bgClass }
```

### Usage Pattern (Unified Filter Architecture)

CloudAct uses a **unified filter architecture** for cost analytics:
- ONE fetch (365 days of granular data on initial load)
- ALL filter operations are instant (client-side)
- See `cost-analytics` skill for caching details

```typescript
// Using the CostDataContext (preferred for dashboard pages)
import { useCostData } from "@/contexts/cost-data-context"

const { setUnifiedFilters, getFilteredTimeSeries, getFilteredGranularData } = useCostData()

// Change filters - INSTANT (no API call for preset ranges)
setUnifiedFilters({ timeRange: "30" })
setUnifiedFilters({ selectedProviders: ["openai", "gcp"] })

// Get filtered data for charts
const timeSeries = getFilteredTimeSeries()  // { date, total }[]
const granularData = getFilteredGranularData()  // Full FOCUS 1.3 rows

// Using helpers directly (for server actions or custom analysis)
const mtdCosts = filterByDateRange(data, dateRanges.mtd())
const summary = calculateSummary(data, dateRanges.thisMonth())
const comparison = monthOverMonth(data)
```

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /{org}/summary` | Aggregated cost summary |
| `GET /{org}/by-provider` | Cost grouped by provider |
| `GET /{org}/by-service` | Cost grouped by service |
| `GET /{org}/trend` | Time-series (daily/weekly/monthly) |
| `GET /{org}/saas-subscriptions` | SaaS subscription costs |
| `GET /{org}/cloud` | Cloud infrastructure costs |
| `GET /{org}/llm` | LLM API costs |
| `GET /{org}/total` | Combined all types |

## FOCUS 1.3 Standard

CloudAct implements FinOps FOCUS 1.3 specification:

```
cost_data_standard_1_3
├── SubAccountId (org_slug - multi-tenancy)
├── ServiceProviderName
├── ServiceCategory (Cloud, SaaS, LLM)
├── ServiceName / ServiceSubcategory
├── BilledCost / EffectiveCost / ListCost
├── BillingCurrency
├── ChargePeriodStart / ChargePeriodEnd
├── x_source_system (subscription, gcp_billing, openai_api)
├── x_pipeline_id / x_run_id / x_ingested_at
└── Hierarchy Extensions (x_hierarchy_entity_id, x_hierarchy_path, etc.)
```

## Cost Calculation Formulas

### Daily Rate
```
daily_rate = AVG(costs for last 7 days)
```

### Run Rates
```
monthly_run_rate = daily_rate × days_in_current_month
annual_run_rate = daily_rate × 365
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

## Multi-Currency Support

| Currency | Example Org | Exchange Rate (to USD) |
|----------|-------------|------------------------|
| USD | acme_us | 1.0000 |
| INR | acme_in | 0.0120 |
| EUR | acme_eu | 1.0850 |
| AED | acme_ae | 0.2723 |
| AUD | acme_au | 0.6550 |
| JPY | acme_jp | 0.0067 |

## Fiscal Year Support

| Pattern | Start | Used By |
|---------|-------|---------|
| Calendar | Jan 1 | US companies |
| India/UK | Apr 1 | India, UK |
| Japan | Apr 1 | Japan |
| Australia | Jul 1 | Australia |

## Instructions

### 1. Use Frontend Helpers
```typescript
import { dateRanges, filterByDateRange, monthOverMonth, formatCost } from "@/lib/costs"

// In component
const filtered = filterByDateRange(data, dateRanges.mtd())
const comparison = monthOverMonth(data)
```

### 2. Query Costs via API
```bash
# Get total costs
curl "http://localhost:8000/api/v1/costs/{org_slug}/total" \
  -H "X-API-Key: {org_api_key}"

# Get trend data
curl "http://localhost:8000/api/v1/costs/{org_slug}/trend?granularity=daily&days=30" \
  -H "X-API-Key: {org_api_key}"
```

### 3. BigQuery Analysis
```sql
-- Total costs by provider
SELECT
    ServiceProviderName,
    SUM(EffectiveCost) as total_cost
FROM `{project}.{org_slug}_prod.cost_data_standard_1_3`
WHERE ChargePeriodStart >= '2025-01-01'
GROUP BY ServiceProviderName
ORDER BY total_cost DESC;

-- Month-over-month comparison
WITH monthly AS (
  SELECT
    DATE_TRUNC(ChargePeriodStart, MONTH) as month,
    SUM(EffectiveCost) as total
  FROM `{project}.{org_slug}_prod.cost_data_standard_1_3`
  GROUP BY month
)
SELECT
  month,
  total,
  LAG(total) OVER (ORDER BY month) as prev_month,
  (total - LAG(total) OVER (ORDER BY month)) / LAG(total) OVER (ORDER BY month) * 100 as pct_change
FROM monthly
ORDER BY month DESC;
```

## Validation Checklist

- [ ] Costs use correct currency
- [ ] Exchange rates applied correctly
- [ ] Frontend helpers return expected results
- [ ] Period comparisons are accurate
- [ ] Forecasts use correct daily rate
- [ ] FOCUS 1.3 fields populated
- [ ] Hierarchy mapping correct

## Common Issues

| Issue | Solution |
|-------|----------|
| Currency mismatch | Check org default currency |
| Wrong comparison | Verify date ranges are correct |
| Missing costs | Verify pipeline ran successfully |
| Forecast too high/low | Check daily rate calculation |

## Example Prompts

```
# Using Frontend Helpers
"How do I filter costs by date range?"
"Show month-over-month comparison"
"Calculate YTD costs with forecast"

# Period Analysis
"Compare this month vs last month"
"Show last 6 months trend"
"What's our fiscal year to date spend?"

# Multi-Currency
"Costs showing in wrong currency"
"How do exchange rates work?"
"Convert USD costs to INR"

# FOCUS 1.3
"What FOCUS 1.3 fields are required?"
"Explain EffectiveCost vs ListCost"
```

## Environments

| Environment | API URL | BigQuery Project | Dataset Pattern |
|-------------|---------|------------------|-----------------|
| local | `http://localhost:8000` | cloudact-testing-1 | `{org}_local` |
| stage | Cloud Run URL | cloudact-testing-1 | `{org}_stage` |
| prod | `https://api.cloudact.ai` | cloudact-prod | `{org}_prod` |

```bash
# Query costs (local)
curl -s "http://localhost:8000/api/v1/costs/{org}/total?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: {key}" | python3 -m json.tool

# Query costs (prod)
curl -s "https://api.cloudact.ai/api/v1/costs/{org}/total?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: {key}" | python3 -m json.tool
```

## Testing

### API Cost Endpoints
```bash
# Total costs
curl -s "http://localhost:8000/api/v1/costs/{org}/total?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: {key}"
# Expected: { genai: X, cloud: Y, subscription: Z, total: W }

# Cost breakdown by provider
curl -s "http://localhost:8000/api/v1/costs/{org}/breakdown?start_date=2025-01-01&end_date=2026-12-31&group_by=ServiceProviderName" \
  -H "X-API-Key: {key}"
```

### BigQuery Direct Validation
```bash
bq query --nouse_legacy_sql \
  "SELECT ServiceCategory, SUM(BilledCost) as total FROM \`cloudact-testing-1.{org}_local.cost_data_standard_1_3\` GROUP BY 1"
# Cross-validate against API response
```

### FOCUS 1.3 Field Validation
```bash
bq query --nouse_legacy_sql \
  "SELECT COUNT(*) as nulls FROM \`cloudact-testing-1.{org}_local.cost_data_standard_1_3\` WHERE BilledCost IS NULL OR ServiceCategory IS NULL"
# Expected: 0 nulls in required fields
```

## Related Skills
- `cost-analytics` - **Unified filter architecture, caching, troubleshooting** (see this for cache/filter flows)
- `subscription-costs` - SaaS subscription cost pipelines
- `pipeline-ops` - Run cost pipelines
- `hierarchy` - Cost allocation setup
- `quota-mgmt` - Cost-based quotas
- `i18n-locale` - Multi-currency formatting and conversion
- `notifications` - Cost alert rules and thresholds

## Source Specifications

Requirements consolidated from:
- `02_CLOUD_COSTS.md` - Cloud cost pipelines and provider mappings
- `COST_DATA_ARCHITECTURE.md` - Unified FOCUS 1.3 table and data flow
