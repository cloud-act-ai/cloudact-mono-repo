---
name: cost-analytics
description: |
  Cost analytics unified filter architecture, caching strategy, and troubleshooting.
  Covers frontend React Context with granular data caching, backend Polars L1/L2 caching,
  TTL strategies, and end-to-end data flows.
  Use when: debugging filter issues, understanding data flow, fixing cost page bugs,
  or optimizing cost dashboard performance.
---

# Cost Analytics - Unified Filter Architecture

## Architecture Overview (Updated 2026-01-04)

**Design Philosophy:** ONE fetch (365 days granular data), ALL filters client-side (instant).

```
+-----------------------------------------------------------------------------+
|                           USER ACTION                                        |
|  (Time range, Provider filter, Category filter, Hierarchy filter, Refresh)   |
+-------------------------------------+---------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------+
|                  FRONTEND - React Context (cost-data-context.tsx)            |
|  +-----------------------------------------------------------------------+  |
|  |  Unified Filter State (state.filters: UnifiedFilters)                  |  |
|  |  - timeRange: "7" | "30" | "90" | "365" | "mtd" | "ytd" | "custom"    |  |
|  |  - customDateRange: { startDate, endDate }                            |  |
|  |  - selectedProviders: string[]                                         |  |
|  |  - selectedCategories: ("genai" | "cloud" | "subscription")[]         |  |
|  |  - hierarchyFilters: { departmentId, projectId, teamId }              |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |  L1 Cache (state.granularData: GranularCostRow[])                     |  |
|  |  - 365 days of daily granular cost data                               |  |
|  |  - Source of truth for ALL client-side filtering                      |  |
|  |  - Cached until: org change, refresh button, or beyond-365d range     |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |  Race Condition Prevention                                             |  |
|  |  - isMountedRef: Prevents setState after unmount                      |  |
|  |  - isFetchingRef: Prevents duplicate concurrent fetches               |  |
|  |  - mainFetchAbortRef: Cancels stale main fetch requests               |  |
|  |  - prevOrgSlugRef: Detects org changes to reset cache                 |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  Cache Decision: getL1CacheDecision()                                        |
|  +-- L1_USE_CACHE: Use granularData (INSTANT - no API call)                 |
|  +-- L1_NO_CACHE: Custom range beyond 365 days OR hierarchy filter change   |
|                                                                              |
+-------------------------------------+---------------------------------------+
                                      |
     Filter within 365 days?          |
            |                         |
           YES                       NO (beyond 365 days OR hierarchy change)
            |                         |
            v                         v
      INSTANT UI               HTTP + X-API-Key
      (client-side filter)           |
                                     v
+-----------------------------------------------------------------------------+
|                  BACKEND - API Service (cost_read/service.py)                |
|  +-----------------------------------------------------------------------+  |
|  |  L1 Cache: LRU (Raw Polars DataFrames)                                 |  |
|  |  - Max entries: 50 | Max memory: 512MB                                |  |
|  |  - Key: "costs:{org_slug}:{date_hash}:{filters_hash}"                 |  |
|  |  - Value: Polars DataFrame (Arrow format, zero-copy)                  |  |
|  |  - TTL: Until midnight UTC (historical) / 60s (today's data)          |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |  L2 Cache: LRU (Pre-computed Aggregations)                             |  |
|  |  - Max entries: 200 | Max memory: 128MB                               |  |
|  |  - Key: "summary:{org_slug}:{date_hash}"                              |  |
|  |  - Value: Dict with totals, forecasts, breakdowns                     |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
+-------------------------------------+---------------------------------------+
                                      |
                           Cache miss |
                                      v
+-----------------------------------------------------------------------------+
|                  BIGQUERY - SQL with Parameterized Queries                   |
|                                                                              |
|  Table: `{project}.{org_slug}_{env}.cost_data_standard_1_3` (FOCUS 1.3)     |
|                                                                              |
|  Query pushdown:                                                             |
|  - Date range: WHERE DATE(ChargePeriodStart) BETWEEN @start AND @end        |
|  - Hierarchy: AND x_hierarchy_dept_id = @dept_id (optional)                 |
|                                                                              |
|  Multi-tenancy: Dataset isolation {org_slug}_{env}                          |
|  Query timeout: 30 seconds                                                   |
|                                                                              |
+-----------------------------------------------------------------------------+
```

## Key Concepts

### Unified Filters (UnifiedFilters type)

```typescript
interface UnifiedFilters {
  timeRange: TimeRange           // "7" | "30" | "90" | "365" | "mtd" | "ytd" | "qtd" | "custom"
  customDateRange?: CustomDateRange
  selectedProviders: string[]    // e.g., ["openai", "gcp", "slack"]
  selectedCategories: Category[] // e.g., ["genai", "cloud"]
  hierarchyFilters?: HierarchyFilters
}
```

### Core Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `setUnifiedFilters(filters)` | Set any combination of filters | void (updates state) |
| `getFilteredTimeSeries()` | Get time series from granular data | `{ date, total }[]` |
| `getFilteredGranularData()` | Get filtered granular rows | `GranularCostRow[]` |
| `fetchCostData(clearCache?)` | Fetch from backend (365 days) | void |

### Cache Decision Logic (getL1CacheDecision)

```typescript
function getL1CacheDecision(
  requestedFilters: UnifiedFilters,
  cachedDateRange: DateRange | null,
  hasGranularData: boolean
): "L1_USE_CACHE" | "L1_NO_CACHE"
```

**Decision Rules:**

| Condition | Decision | API Call? |
|-----------|----------|-----------|
| No granular data cached | L1_NO_CACHE | YES |
| Custom range beyond cached range | L1_NO_CACHE | YES |
| Hierarchy filter changed | L1_NO_CACHE | YES |
| All other filter changes | L1_USE_CACHE | NO |

## Key Files

| Layer | File | Purpose |
|-------|------|---------|
| **Frontend Context** | `01-fronted-system/contexts/cost-data-context.tsx` | Unified filter state + L1 cache |
| **Frontend Actions** | `01-fronted-system/actions/costs.ts` | Server actions (fetch from backend) |
| **Chart Components** | `01-fronted-system/components/charts/cost/*.tsx` | Use `getFilteredTimeSeries()` |
| **Dashboard Pages** | `01-fronted-system/app/[orgSlug]/cost-dashboards/*/page.tsx` | Use `setUnifiedFilters()` |
| **Backend Service** | `02-api-service/src/core/services/cost_read/service.py` | Polars L1/L2 cache |
| **Backend Cache** | `02-api-service/src/core/services/_shared/cache.py` | LRU implementation |

## End-to-End Flows

### Flow 1: Initial Page Load

```
1. User navigates to /[orgSlug]/cost-dashboards/overview
2. CostDataProvider detects orgSlug change (prevOrgSlugRef)
3. state.granularData is empty -> L1_NO_CACHE
4. fetchCostData() called with 365-day range
5. actions/costs.ts -> getCostTrendGranular() -> API Service
6. API Service checks L1 cache (miss) -> BigQuery query
7. BigQuery returns FOCUS 1.3 data -> Polars DataFrame
8. API caches in L1 (TTL: midnight UTC if historical, 60s if today)
9. Response -> Frontend -> state.granularData populated
10. getFilteredTimeSeries() computes view for default filters
11. Charts render with data
```

### Flow 2: Time Range Change (Preset)

```
1. User clicks "30 days" filter
2. cost-filters.tsx calls setUnifiedFilters({ timeRange: "30" })
3. getL1CacheDecision() -> L1_USE_CACHE (within 365 days)
4. State updates: filters.timeRange = "30"
5. Components re-render, call getFilteredTimeSeries()
6. getFilteredTimeSeries() filters granularData client-side
7. UI updates INSTANTLY (no API call)
```

### Flow 3: Provider Filter Change

```
1. User toggles "OpenAI" provider off
2. cost-filters.tsx calls setUnifiedFilters({ selectedProviders: [...] })
3. getL1CacheDecision() -> L1_USE_CACHE
4. State updates: filters.selectedProviders = [...]
5. getFilteredGranularData() filters by provider client-side
6. Charts/tables update INSTANTLY
```

### Flow 4: Custom Date Range (Beyond 365 Days)

```
1. User selects custom range: Jan 1, 2024 to Dec 31, 2024
2. cost-filters.tsx calls setUnifiedFilters({ timeRange: "custom", customDateRange: {...} })
3. getL1CacheDecision() -> L1_NO_CACHE (beyond cached 365 days)
4. fetchCostData() called with new date range
5. API Service -> BigQuery (new query for custom range)
6. New granularData replaces cached data
7. UI updates with new data (2-5s latency)
```

### Flow 5: Hierarchy Filter Change

```
1. User selects "Engineering" department
2. cost-filters.tsx calls setUnifiedFilters({ hierarchyFilters: { departmentId: "dept-1" } })
3. getL1CacheDecision() -> L1_NO_CACHE (hierarchy requires server-side filter)
4. fetchCostData() called with hierarchy filters
5. API Service pushes hierarchy to BigQuery WHERE clause
6. Filtered data returned -> state.granularData updated
7. UI updates (2-5s latency)
```

### Flow 6: Refresh Button

```
1. User clicks "Refresh" / "Clear Cache"
2. clearBackendCache() called -> fetchCostData(true)
3. Forces new API call regardless of cache state
4. Backend invalidates L1/L2 cache
5. Fresh data from BigQuery
6. UI updates (2-5s latency)
```

### Flow 7: Organization Switch

```
1. User switches from "acme" to "globex" org
2. prevOrgSlugRef detects change
3. resetToInitialState() clears all cache
4. fetchCostData() for new org
5. Fresh data loaded for new org
```

## Cache Invalidation Rules

| User Action | L1 Decision | API Call? | Latency |
|-------------|-------------|-----------|---------|
| Time range 7/30/90/365 days | L1_USE_CACHE | NO | Instant |
| MTD/YTD/QTD preset | L1_USE_CACHE | NO | Instant |
| Custom range within 365 days | L1_USE_CACHE | NO | Instant |
| Custom range beyond 365 days | L1_NO_CACHE | YES | 2-5s |
| Provider filter toggle | L1_USE_CACHE | NO | Instant |
| Category filter toggle | L1_USE_CACHE | NO | Instant |
| Hierarchy filter change | L1_NO_CACHE | YES | 2-5s |
| Refresh button click | L1_NO_CACHE | YES | 2-5s |
| Org switch | Reset all | YES | 2-5s |

## Chart Component Integration

All cost chart components use the unified filter API:

```typescript
// daily-chart.tsx, trend-chart.tsx, metric-sparkline.tsx
export function SomeCostChart(props) {
  const costData = useCostData()

  const chartData = useMemo(() => {
    if (props.data) return props.data  // Manual data override

    // Get from context using unified filters
    const timeSeries = costData.getFilteredTimeSeries()

    return timeSeries.map((point) => ({
      date: point.date,
      label: formatDate(point.date),
      value: point.total,
    }))
  }, [props.data, costData])

  return <Chart data={chartData} />
}
```

## Failure Points & Recovery

### Frontend Failures

| Failure | Symptom | Recovery |
|---------|---------|----------|
| setState after unmount | Console warning | `isMountedRef` check |
| Duplicate fetches | Multiple API calls | `isFetchingRef` lock |
| Stale org data | Wrong org's data shown | `prevOrgSlugRef` detection |
| Aborted request error | Console error on unmount | `mainFetchAbortRef` + AbortError catch |
| NaN in calculations | Charts show NaN | `Number.isFinite()` guards |

**Frontend Recovery Pattern:**

```typescript
// In fetchCostData (cost-data-context.tsx)
if (controller.signal.aborted || !isMountedRef.current) {
  return  // Don't update state for stale/unmounted requests
}

// In getFilteredTimeSeries
const rawAvg = filteredData.length > 0 ? totalCost / filteredData.length : 0
const avgDaily = Number.isFinite(rawAvg) ? rawAvg : 0
```

### Backend Failures

| Failure | Symptom | Recovery |
|---------|---------|----------|
| BigQuery timeout | 30s timeout error | Returns error, user retries |
| Empty DataFrame | No data for range | Returns empty array with defaults |
| Invalid org_slug | SQL injection risk | `validate_org_slug()` regex |
| Memory exhaustion | Service OOM | Memory-based eviction (512MB limit) |

### Network/Auth Failures

| Failure | Symptom | Recovery |
|---------|---------|----------|
| Auth token expired | 401 response | 5-second auth cache in actions/costs.ts |
| Rate limited | 429 response | User waits/retries |
| API service down | 5xx errors | Error displayed, retry button |

## TTL Strategy

### Backend Cache TTL

```python
# Constants
TTL_TODAY_DATA = 60        # 60 seconds (pipeline might still run)
TTL_MIN_HISTORICAL = 300   # 5 min minimum (midnight edge case)

# Decision
def _get_cache_ttl(includes_today: bool) -> int:
    if includes_today:
        return TTL_TODAY_DATA
    return _seconds_until_midnight_utc()  # Historical data until midnight
```

### Frontend Cache TTL

Frontend L1 cache has NO explicit TTL - data is invalidated by:
1. User clicks "Clear Cache" / "Refresh"
2. User switches organizations
3. Custom date range exceeds 365-day cache window
4. Hierarchy filter changes (requires server-side filter)

## Troubleshooting Commands

### Check Backend Cache

```bash
# Health check with cache stats
curl -s http://localhost:8000/health | python3 -m json.tool

# Cache stats (admin endpoint)
curl -s http://localhost:8000/api/v1/admin/cache/stats \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | python3 -m json.tool
```

### Debug Frontend Cache

```javascript
// In browser console on cost dashboard page:

// Check React DevTools
// 1. Open React DevTools
// 2. Select CostDataProvider component
// 3. Inspect state: granularData, filters, cachedDateRange

// Check console logs in dev mode:
// "[CostData] L1_USE_CACHE: filtering 365 days locally"
// "[CostData] L1_NO_CACHE: fetching new range..."
// "[CostData] Org changed from acme to globex, resetting cache"
```

### BigQuery Query Analysis

```sql
-- Check cost data freshness
SELECT
  MAX(x_ingested_at) as latest_ingestion,
  MAX(ChargePeriodStart) as latest_period,
  COUNT(*) as total_records
FROM `{project}.{org_slug}_prod.cost_data_standard_1_3`
WHERE ChargePeriodStart >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY);

-- Check data by category
SELECT
  x_source_system,
  COUNT(*) as records,
  SUM(BilledCost) as total_cost
FROM `{project}.{org_slug}_prod.cost_data_standard_1_3`
WHERE ChargePeriodStart >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY x_source_system;
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Filter change triggers API call | Hierarchy filter changed | Expected - hierarchy requires server-side |
| Dashboard shows stale data | Backend cache TTL | Click "Clear Cache" or wait for midnight UTC |
| Wrong org's data shown | Org switch race condition | Fixed with `prevOrgSlugRef` |
| Charts show NaN | Division by zero | Fixed with `Number.isFinite()` guards |
| Custom range slow | Beyond 365-day cache | Expected - requires new API call |

## Performance Characteristics

| Operation | Latency | Cache Layer |
|-----------|---------|-------------|
| Initial dashboard load | 2-5s | Backend L1 miss -> BigQuery |
| Time range change (preset) | <10ms | Frontend L1 filter |
| Custom range within 365d | <10ms | Frontend L1 filter |
| Custom range beyond 365d | 2-5s | Backend L1 miss -> BigQuery |
| Provider filter toggle | <10ms | Frontend L1 filter |
| Category filter toggle | <10ms | Frontend L1 filter |
| Hierarchy filter change | 2-5s | Backend L1 (new query) |
| Refresh button | 2-5s | Backend cache invalidation |

## Related Skills

- `cost-analysis` - FOCUS 1.3 standard, calculation formulas
- `pipeline-ops` - Cost data pipelines
- `bigquery-ops` - Direct BigQuery queries
- `subscription-costs` - SaaS subscription cost management

## Example Prompts

```
# Architecture
"How does the unified filter architecture work?"
"What happens when I change the time range?"
"Why does hierarchy filter trigger an API call?"

# Cache Debugging
"Why is my cost dashboard showing old data?"
"How do I force refresh the cost cache?"
"Cost data looks wrong after switching orgs"

# Performance
"Dashboard is slow to load"
"How can I reduce API calls on the cost page?"
"Why does changing time range NOT trigger an API call?"

# Errors
"Getting NaN in the trend chart"
"Console shows setState warning after unmount"
"API call returns 401 on cost dashboard"
```
