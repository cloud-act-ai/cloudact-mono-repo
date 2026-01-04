---
name: cost-analytics
description: |
  Cost analytics cache architecture, failure handling, and troubleshooting.
  Covers frontend React Context caching, backend Polars L1/L2 caching,
  TTL strategies, and recovery patterns for cost dashboard pages.
  Use when: debugging cache issues, understanding data flow, fixing cost page bugs,
  or optimizing cost dashboard performance.
---

# Cost Analytics - Cache Architecture & Troubleshooting

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER ACTION                                        │
│  (Time range change, Provider filter, Refresh button, Page navigation)       │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  FRONTEND - React Context (cost-data-context.tsx)            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Light Cache (useState)                                                │  │
│  │  • 365-day cost data cached on initial load                           │  │
│  │  • Time range filtering: INSTANT (no API call)                        │  │
│  │  • Provider/Category filtering: INSTANT (no API call)                 │  │
│  │  • Category trend data: LAZY-LOADED (on page navigation)              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Race Condition Prevention                                             │  │
│  │  • isMountedRef: Prevents setState after unmount                      │  │
│  │  • isFetchingRef: Prevents duplicate concurrent fetches               │  │
│  │  • categoryTrendLoadingRef: Tracks in-flight category requests        │  │
│  │  • abortControllerRef: Cancels stale category trend requests          │  │
│  │  • mainFetchAbortRef: Cancels stale main fetch requests (CACHE-005)   │  │
│  │  • prevOrgSlugRef: Detects org changes to reset cache                 │  │
│  │  • loadedCategoriesRef: Tracks loaded categories synchronously        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Cache Decision: isRangeWithinCache() + getCacheDecision()                   │
│  ├─ "filter-cache": Use local data (INSTANT)                                │
│  ├─ "fetch-new": Custom range beyond 365 days                               │
│  └─ "use-cache": Not initialized yet                                        │
│                                                                              │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
     Filter within 365 days?  │
            │                 │
           YES                NO (beyond 365 days OR hierarchy filter)
            │                 │
            ▼                 ▼
      INSTANT UI         HTTP + X-API-Key
      (no API call)           │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  BACKEND - API Service (cost_read/service.py)                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  L1 Cache: LRU (Raw Polars DataFrames)                                 │  │
│  │  • Max entries: 50 (memory is the real constraint)                    │  │
│  │  • Max memory: 512MB (enforced, prevents OOM)                         │  │
│  │  • Key: "costs:{org_slug}:{date_hash}:{filters_hash}"                 │  │
│  │  • Value: Polars DataFrame (Arrow format, zero-copy)                  │  │
│  │  • TTL: Until midnight UTC (historical) / 60s (today's data)          │  │
│  │  • Eviction: LRU when EITHER entry count OR memory limit exceeded     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  L2 Cache: LRU (Pre-computed Aggregations)                             │  │
│  │  • Max entries: 200                                                    │  │
│  │  • Max memory: 128MB (enforced)                                        │  │
│  │  • Key: "summary:{org_slug}:{date_hash}"                              │  │
│  │  • Value: Dict with totals, forecasts, breakdowns                     │  │
│  │  • TTL: Same as L1 (midnight UTC / 60s)                               │  │
│  │  • Eviction: LRU when EITHER entry count OR memory limit exceeded     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  TTL Strategy (Daily Cost Data):                                            │
│  ├─ _seconds_until_midnight_utc(): Calculates seconds until midnight UTC   │
│  ├─ _get_cache_ttl(includes_today):                                        │
│  │   ├─ includes_today=True → 60s (pipeline might still run)              │
│  │   └─ includes_today=False → Until midnight UTC (data won't change)     │
│  └─ TTL_MIN_HISTORICAL: 300s minimum (edge case protection)               │
│                                                                              │
│  Thread Safety:                                                              │
│  ├─ Singleton pattern with threading.Lock                                   │
│  ├─ _cost_read_service_lock for initialization                             │
│  └─ LRUCache uses internal threading.Lock                                  │
│                                                                              │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                   Cache miss │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  BIGQUERY - SQL with Parameterized Queries                   │
│                                                                              │
│  Query Structure:                                                            │
│  SELECT ... FROM `{project}.{org_slug}_{env}.cost_data_standard_1_3`        │
│  WHERE DATE(ChargePeriodStart) >= @start_date                               │
│    AND DATE(ChargePeriodStart) <= @end_date                                 │
│    [AND category filters - pushed to SQL for efficiency]                    │
│    [AND hierarchy filters - dept/project/team]                              │
│                                                                              │
│  Category SQL Push-down (reduces data transfer):                            │
│  ├─ subscription: x_source_system = 'subscription_costs_daily'              │
│  ├─ cloud: LOWER(ServiceProviderName) IN (gcp, aws, azure, ...)            │
│  └─ genai: LOWER(ServiceProviderName) IN (openai, anthropic, ...)          │
│                                                                              │
│  Multi-tenancy: Dataset isolation {org_slug}_{env}                          │
│  Query timeout: 30 seconds                                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Files

| Layer | File | Purpose |
|-------|------|---------|
| **Frontend** | `01-fronted-system/contexts/cost-data-context.tsx` | React Context with hybrid cache |
| **Frontend** | `01-fronted-system/actions/costs.ts` | Server actions (fetch from backend) |
| **Backend** | `02-api-service/src/core/services/cost_read/service.py` | Polars service with L1/L2 cache |
| **Backend** | `02-api-service/src/core/services/_shared/cache.py` | LRU cache implementation |
| **Pages** | `01-fronted-system/app/[orgSlug]/cost-dashboards/*/page.tsx` | Dashboard pages |

## Cache Invalidation Rules

| User Action | Cache Decision | API Call? | Latency |
|-------------|----------------|-----------|---------|
| Time range 7/30/90/365 days | Filter frontend cache | NO | Instant |
| MTD/YTD/QTD preset | Filter frontend cache | NO | Instant |
| Custom range within 365 days | Filter frontend cache | NO | Instant |
| Custom range beyond 365 days | Invalidate + fetch | YES | 2-5s |
| Provider filter change | Filter frontend cache | NO | Instant |
| Category filter change | Filter frontend cache | NO | Instant |
| Hierarchy filter (dept/proj/team) | New API call | YES | 2-5s |
| Refresh button | Invalidate all + fetch | YES | 2-5s |
| Org switch | Reset all cache | YES | 2-5s |

## Failure Points & Recovery

### 1. Frontend Failures

| Failure | Symptom | Recovery |
|---------|---------|----------|
| **setState after unmount** | Console warning, potential memory leak | `isMountedRef` check before setState |
| **Duplicate fetches** | Multiple API calls, wasted bandwidth | `isFetchingRef` + `categoryTrendLoadingRef` |
| **Stale category data** | Wrong org's data shown after switch | `prevOrgSlugRef` detection + cache reset |
| **Aborted request not handled** | Console error on unmount | `abortControllerRef` + AbortError catch |
| **NaN in trend calculations** | Chart shows NaN values | `Number.isFinite()` guards in `getDailyTrendForRange` |

**Frontend Recovery Pattern:**
```typescript
// Race condition prevention (cost-data-context.tsx:641-646)
if (controller.signal.aborted || !isMountedRef.current) {
  return  // Don't update state for stale/unmounted requests
}

// NaN protection (cost-data-context.tsx:866)
const rawAvg = filteredData.length > 0 ? totalCost / filteredData.length : 0
const overallDailyAvg = Number.isFinite(rawAvg) ? rawAvg : 0
```

### 2. Backend Failures

| Failure | Symptom | Recovery |
|---------|---------|----------|
| **BigQuery timeout** | 30s timeout error | Query has `job_timeout_ms=30000`, returns error |
| **Cache key collision** | Wrong data returned | Include all filter params in cache key |
| **Empty DataFrame** | `.to_dicts()` fails | Empty check before operations |
| **Invalid org_slug** | SQL injection risk | `validate_org_slug()` with regex |
| **Clock skew near midnight** | Cache expires too early | `TTL_MIN_HISTORICAL = 300` minimum |
| **Memory exhaustion (OOM)** | Service crashes with large orgs | Memory-based eviction (512MB L1 limit) |
| **Large DataFrame cache** | Slow eviction, high memory | `_estimate_dataframe_memory()` tracks size |

**Backend Recovery Pattern:**
```python
# Empty DataFrame handling (service.py:980-1001)
if df.is_empty():
    return CostResponse(
        success=True,
        data=[],
        summary={...empty defaults...},
        cache_hit=False
    )

# TTL edge case protection (service.py:94-95)
return max(seconds, TTL_MIN_HISTORICAL)  # Never less than 5 min
```

### 3. Network/Auth Failures

| Failure | Symptom | Recovery |
|---------|---------|----------|
| **Auth token expired** | 401 response | 5-second auth cache in `actions/costs.ts` |
| **Rate limited** | 429 response | Exponential backoff (not implemented) |
| **Network timeout** | Request hangs | 30s timeout in BigQuery client |
| **API service down** | 5xx errors | Error displayed to user, retry button |

**Auth Cache Pattern (actions/costs.ts):**
```typescript
// 5-second auth cache to reduce Supabase queries in parallel requests
const AUTH_CACHE_TTL_MS = 5000
let authCache: { data: AuthResult; timestamp: number } | null = null

async function getAuthCached() {
  if (authCache && Date.now() - authCache.timestamp < AUTH_CACHE_TTL_MS) {
    return authCache.data
  }
  const result = await getAuth()
  authCache = { data: result, timestamp: Date.now() }
  return result
}
```

## Gap Analysis

### Fixed Gaps (2025-01-04)

| Gap | Fix ID | Description |
|-----|--------|-------------|
| ~~Hierarchy filters not passed~~ | FILTER-001 | `fetchCostData` now passes hierarchy filters to all API calls |
| ~~State batching race condition~~ | FILTER-002 | `setHierarchyFilters` passes filters directly to avoid race |
| ~~Category trend missing filters~~ | FILTER-003 | `fetchCategoryTrend` now uses hierarchy filters |
| ~~Main fetch not cancellable~~ | CACHE-005 | `mainFetchAbortRef` cancels stale main fetch requests |
| ~~getCostTrend missing filters~~ | - | `getCostTrend` action now accepts `CostFilterParams` |
| ~~Stale category trend on filter~~ | GAP-FE-001 | `setHierarchyFilters` now clears `categoryTrendData` state |

### Current Gaps

| Gap | Impact | Recommended Fix |
|-----|--------|-----------------|
| **No retry on network failure** | User must manually refresh | Add exponential backoff |
| **No offline support** | Page fails without network | Service worker + IndexedDB |
| **No prefetch on hover** | Slower perceived navigation | Prefetch on link hover |
| **No stale-while-revalidate** | Shows loading on stale data | Show stale + background refresh |
| **No WebSocket for live updates** | Manual refresh needed | WebSocket for pipeline completion |
| **No cache compression** | Higher memory usage | Compress large DataFrames |

### Implemented Protections

| Protection | Location | Description |
|------------|----------|-------------|
| Race condition prevention | `cost-data-context.tsx:289-305` | Multiple refs for tracking |
| Org change detection | `cost-data-context.tsx:959-997` | Reset cache on org switch |
| AbortController cleanup | `cost-data-context.tsx:1005-1021` | Cancel requests on unmount |
| Main fetch abort | `cost-data-context.tsx:350-354` | Cancel stale main fetches (CACHE-005) |
| NaN/Infinity guards | `cost-data-context.tsx:890-902` | Safe number handling |
| Thread-safe singleton | `service.py:1290-1307` | Lock-protected initialization |
| Minimum TTL protection | `service.py:94-95` | 300s minimum near midnight |
| **Memory-based eviction** | `cache.py:144-157` | 512MB L1 limit, prevents OOM |
| **DataFrame size tracking** | `cache.py:30-47` | Uses Polars `estimated_size()` |
| **Hierarchy filter propagation** | `cost-data-context.tsx:367-372` | Pass filters to API (FILTER-001) |
| **Direct filter passing** | `cost-data-context.tsx:592-595` | Avoid state race condition (FILTER-002) |
| **Category trend filters** | `cost-data-context.tsx:660-672` | Hierarchy filters in lazy load (FILTER-003) |
| **Category data clear on filter** | `cost-data-context.tsx:575-582` | Clear stale trend data (GAP-FE-001) |

## TTL Strategy

### Backend Cache TTL

```python
# Constants (service.py:73-74)
TTL_TODAY_DATA = 60        # 60 seconds for today's data
TTL_MIN_HISTORICAL = 300   # 5 min minimum (midnight edge case)

# TTL Decision (service.py:98-112)
def _get_cache_ttl(includes_today: bool) -> int:
    if includes_today:
        return TTL_TODAY_DATA  # 60s - pipeline might still run
    return _seconds_until_midnight_utc()  # Until midnight UTC

# Example at 2pm UTC:
# - Historical data: ~10 hours (36000s) TTL
# - Today's data: 60s TTL
```

### Frontend Cache TTL

Frontend cache has NO explicit TTL - data is cached until:
1. User clicks "Clear Cache" button
2. User switches organizations
3. User navigates away and React unmounts
4. Custom date range exceeds 365-day cache window

## Troubleshooting Commands

### Check Backend Cache Status

```bash
# Health check with cache stats
curl -s http://localhost:8000/health | python3 -m json.tool

# Get cache stats (if endpoint exists)
curl -s http://localhost:8000/api/v1/admin/cache/stats \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | python3 -m json.tool

# Cache stats include memory info:
# {
#   "l1_cache": {
#     "hits": 42,
#     "misses": 10,
#     "evictions": 2,
#     "memory_evictions": 5,    # Evictions due to memory limit
#     "size": 8,                 # Current entry count
#     "max_size": 50,            # Max entries (reduced from 1000)
#     "memory_bytes": 234567890,
#     "memory_mb": 223.67,       # Current memory usage
#     "max_memory_mb": 512,      # Memory limit
#     "memory_utilization": 0.43,# Percentage of limit used
#     "hit_rate": 0.807
#   }
# }
```

### Check Frontend Cache

```javascript
// In browser console on cost dashboard page:

// Check if context is available
const costData = window.__COST_DATA_CONTEXT__  // If exposed

// Check React DevTools
// 1. Open React DevTools
// 2. Select CostDataProvider component
// 3. Check state: isInitialized, lastFetchedAt, cachedDateRange

// Force refresh
document.querySelector('[data-testid="refresh-button"]')?.click()
```

### Debug Cache Decisions

```typescript
// Enable dev mode logging in cost-data-context.tsx
// Look for these console logs:

// Cache hit (instant)
"[CostData] Cache HIT: 30"

// Cache miss (API call)
"[CostData] Cache MISS: Custom range exceeds 365-day cache, fetching..."

// Data loaded
"[CostData] Data loaded: { providers: 5, trendPoints: 365, ... }"

// Category trend lazy-load
"[CostData] Fetching genai trend data..."
"[CostData] genai trend loaded: 365 points"

// Org change
"[CostData] Org changed from acme_us to acme_eu, resetting cache"
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

-- Check data by source
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
| Dashboard shows stale data | Cache TTL too long | Click "Clear Cache" or wait for midnight UTC |
| Wrong org's data displayed | Org switch race condition | Fixed with `prevOrgSlugRef` detection |
| Trend chart shows NaN | Division by zero in avg calc | Fixed with `Number.isFinite()` guards |
| Duplicate API calls on load | Missing fetch lock | Fixed with `isFetchingRef` |
| Category page slow to load | Trend data not prefetched | Lazy-load optimization (intentional) |
| Custom range fails | Beyond 365-day cache | Triggers new API call (expected behavior) |
| Provider filter shows wrong count | Category mismatch | Backend categorization is source of truth |

## Performance Characteristics

| Operation | Latency | Cache Layer |
|-----------|---------|-------------|
| Initial dashboard load | 2-5s | Backend L1 miss → BigQuery |
| Time range change (preset) | <10ms | Frontend filter |
| Custom range within 365d | <10ms | Frontend filter |
| Custom range beyond 365d | 2-5s | Backend L1 miss → BigQuery |
| Provider filter toggle | <10ms | Frontend filter |
| Category page navigation | 1-2s | Backend L1 (category trend) |
| Subsequent category visit | <10ms | Frontend category cache |
| Refresh button | 2-5s | Backend cache invalidation |

## Related Skills

- `cost-analysis` - Frontend cost helpers, FOCUS 1.3, formulas
- `pipeline-ops` - Cost data pipelines
- `bigquery-ops` - Direct BigQuery queries
- `subscription-costs` - SaaS subscription cost management

## Example Prompts

```
# Cache Debugging
"Why is my cost dashboard showing old data?"
"How do I force refresh the cost cache?"
"Cost data looks wrong after switching orgs"

# Performance
"Dashboard is slow to load"
"How can I reduce API calls on the cost page?"
"Why does changing time range trigger an API call?"

# Architecture
"How does the frontend cache work?"
"What's the TTL for cost data?"
"How is category filtering handled?"

# Errors
"Getting NaN in the trend chart"
"Console shows setState warning after unmount"
"API call returns 401 on cost dashboard"
```
