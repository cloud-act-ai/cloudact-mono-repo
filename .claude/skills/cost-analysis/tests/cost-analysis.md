# Cost Analysis - Test Plan

## Overview

Validates FOCUS 1.3 data integrity, multi-currency support, period comparisons (MTD/YTD/MoM), cost totals across all three cost types (Cloud, GenAI, SaaS), frontend cost helpers, and API cost endpoints.

## Test Matrix

### FOCUS 1.3 Data Integrity (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `cost_data_standard_1_3` table exists | Query | Table present in `{org_slug}_prod` dataset |
| 2 | Required FOCUS fields populated | Query | `ChargePeriodStart`, `EffectiveCost`, `ServiceProviderName`, `SubAccountId` not NULL |
| 3 | `x_source_system` identifies cost type | Query | Values are `cloud_gcp`, `genai_openai`, `subscription`, etc. |
| 4 | `x_pipeline_id` and `x_run_id` populated | Query | Pipeline lineage fields present on all rows |
| 5 | `BillingCurrency` matches org currency | Query | Currency code matches org's configured currency |
| 6 | Idempotent writes prevent duplicates | Query | Re-running pipeline produces no duplicate rows (composite key check) |

### Cost Totals API (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 7 | GET `/{org}/total` returns combined costs | API | Total across Cloud + GenAI + SaaS |
| 8 | GET `/{org}/cloud` returns cloud costs only | API | Filtered to `ServiceCategory=Cloud` |
| 9 | GET `/{org}/genai` returns GenAI costs only | API | Filtered to `ServiceCategory=LLM` |
| 10 | GET `/{org}/saas-subscriptions` returns SaaS costs | API | Filtered to `ServiceCategory=SaaS` |
| 11 | GET `/{org}/by-provider` groups by provider | API | Costs grouped by `ServiceProviderName` |
| 12 | GET `/{org}/by-service` groups by service | API | Costs grouped by `ServiceName` |

### Period Comparisons (7 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 13 | Month-to-date (MTD) calculation | Functional | Sum from 1st of current month to today |
| 14 | Year-to-date (YTD) calculation | Functional | Sum from Jan 1 (or fiscal start) to today |
| 15 | Month-over-month (MoM) comparison | Functional | Returns `current`, `previous`, `changePercent`, `trend` |
| 16 | Week-over-week (WoW) comparison | Functional | Current week vs previous week |
| 17 | Year-over-year (YoY) comparison | Functional | Current year vs previous year |
| 18 | Custom period comparison | Functional | Arbitrary date range A vs date range B |
| 19 | Trend direction correct | Functional | "up" when current > previous, "down" when current < previous |

### Cost Summary & Forecasting (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 20 | `calculateSummary` returns all fields | Functional | `total`, `dailyAverage`, `monthlyRunRate`, `annualRunRate`, `mtd`, `ytd` |
| 21 | Daily average uses last 7 days | Functional | `dailyAverage = AVG(costs for last 7 days)` |
| 22 | Monthly forecast formula correct | Functional | `forecastMonthly = mtd + (dailyRate * daysRemaining)` |
| 23 | Annual forecast formula correct | Functional | `forecastAnnual = ytd + (dailyRate * daysRemaining)` |
| 24 | Summary by provider and category | Functional | `byProvider` and `byCategory` maps populated |

### Multi-Currency (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 25 | USD org displays costs in USD | UI | Dollar sign and correct formatting |
| 26 | INR org displays costs in INR | UI | Rupee sign with INR formatting |
| 27 | EUR org displays costs in EUR | UI | Euro sign with EUR formatting |
| 28 | Exchange rate stored with cost data | Query | `source_currency` and `exchange_rate_used` fields populated |
| 29 | `formatCost` respects currency locale | Functional | `formatCost(1234.56, "JPY")` returns no decimal places |
| 30 | `formatCostCompact` abbreviates correctly | Functional | `formatCostCompact(1234567, "USD")` returns `$1.2M` |

### Frontend Cost Helpers (7 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 31 | `dateRanges.mtd()` returns correct range | Unit | Start of month to today |
| 32 | `dateRanges.ytd()` returns correct range | Unit | Jan 1 to today |
| 33 | `filterByDateRange` filters correctly | Unit | Only records within range returned |
| 34 | `filterByProvider` filters by provider | Unit | Only specified provider records returned |
| 35 | `groupByProvider` aggregates totals | Unit | Map of provider to total cost |
| 36 | `toTimeSeries` generates daily/weekly/monthly | Unit | Array of `{date, total}` objects |
| 37 | `formatTrend` returns text, arrow, colorClass | Unit | Object with display properties |

### Cost Trend API (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 38 | GET `/{org}/trend?granularity=daily` | API | Daily cost time series |
| 39 | GET `/{org}/trend?granularity=weekly` | API | Weekly cost time series |
| 40 | GET `/{org}/trend?granularity=monthly` | API | Monthly cost time series |
| 41 | GET `/{org}/trend-granular` returns full data | API | Granular cost trend for dashboard |

### Cache Management (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 42 | GET `/{org}/cache/stats` returns hit/miss | API | Cache statistics with hit ratio |
| 43 | POST `/{org}/cache/invalidate` clears cache | API | Cache invalidated, next request is fresh |
| 44 | Cache TTL expires at midnight org timezone | Functional | Cache auto-invalidates at midnight |

### Fiscal Year (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 45 | Calendar year org (start=1) | Functional | YTD from Jan 1 |
| 46 | India/UK fiscal year (start=4) | Functional | YTD from Apr 1 |
| 47 | Australia fiscal year (start=7) | Functional | YTD from Jul 1 |

**Total: 47 tests**

## Verification Commands

```bash
# Cost totals
curl -s "http://localhost:8000/api/v1/costs/{org}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Cost by provider
curl -s "http://localhost:8000/api/v1/costs/{org}/by-provider?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Cost trend
curl -s "http://localhost:8000/api/v1/costs/{org}/trend?granularity=daily&days=30" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Cloud costs only
curl -s "http://localhost:8000/api/v1/costs/{org}/cloud?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# GenAI costs only
curl -s "http://localhost:8000/api/v1/costs/{org}/genai?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Cache stats
curl -s "http://localhost:8000/api/v1/costs/{org}/cache/stats" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# BigQuery: FOCUS 1.3 field validation
bq query --nouse_legacy_sql \
  "SELECT ChargePeriodStart, EffectiveCost, ServiceProviderName, SubAccountId, x_source_system
   FROM \`{project}.{org}_prod.cost_data_standard_1_3\`
   WHERE ChargePeriodStart >= '2025-12-01'
   LIMIT 10"

# BigQuery: Cost by provider
bq query --nouse_legacy_sql \
  "SELECT ServiceProviderName, SUM(EffectiveCost) as total
   FROM \`{project}.{org}_prod.cost_data_standard_1_3\`
   WHERE ChargePeriodStart >= '2025-12-01'
   GROUP BY 1 ORDER BY total DESC"

# BigQuery: Check for duplicates
bq query --nouse_legacy_sql \
  "SELECT x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date, COUNT(*) as cnt
   FROM \`{project}.{org}_prod.cost_data_standard_1_3\`
   GROUP BY 1, 2, 3, 4
   HAVING cnt > 1"
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| FOCUS 1.3 data integrity | 6/6 (100%) |
| Cost totals API | 6/6 (100%) |
| Period comparisons | 7/7 (100%) |
| Summary & forecasting | 5/5 (100%) |
| Multi-currency | 4/6 (non-USD org tests require specific setup) |
| Frontend helpers | 7/7 (100%) |
| Duplicate rows in FOCUS table | 0 |
| Cost data matches demo expectations | GenAI ~$232K, Cloud ~$382, Subscription ~$1.4K |

## Known Limitations

1. **Demo data date range**: Demo data spans Dec 2025 - Jan 2026. Always use `start_date=2025-12-01&end_date=2026-01-31` for testing.
2. **Multi-currency tests**: Require an org configured with non-USD currency. INR/EUR/AED orgs needed for full coverage.
3. **Fiscal year tests**: Require orgs with different `fiscal_year_start_month` values (1, 4, 7, 10).
4. **Cache TTL**: Cache expires at midnight in org timezone. Testing expiry requires waiting or manual invalidation.
5. **Forecast accuracy**: Forecast values depend on data density. Sparse data yields less accurate projections.
6. **YoY comparison**: Requires data spanning 2+ years. Demo data only covers 2 months.
7. **Polars read service**: Requires API Service running with BigQuery access for cost reads.

## Edge Cases Tested

- Zero cost data for date range (returns empty with $0 total)
- Single day of cost data (daily average = that day's total)
- Very large cost values (>$1M formatted as compact notation)
- Negative cost values (credits/refunds)
- Multiple currencies in same org (should not happen, but graceful handling)
- Future date range (no data, $0)
- Overlapping pipeline runs (idempotency prevents duplicates)
