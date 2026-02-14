# Cost Analytics - Test Plan

## Frontend Tests

Cost analytics filter architecture and dashboard validation.

### Test Matrix (25 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Initial dashboard load fetches 365 days | E2E | API call to `getCostTrendGranular()` with 365-day range |
| 2 | Time range 7d uses L1 cache (no API call) | Cache | `L1_USE_CACHE` decision, instant UI update |
| 3 | Time range 30d uses L1 cache | Cache | `L1_USE_CACHE` decision, no network request |
| 4 | Time range 90d uses L1 cache | Cache | `L1_USE_CACHE` decision, no network request |
| 5 | Time range 365d uses L1 cache | Cache | `L1_USE_CACHE` decision, no network request |
| 6 | MTD preset uses L1 cache | Cache | `L1_USE_CACHE` decision |
| 7 | YTD preset uses L1 cache | Cache | `L1_USE_CACHE` decision |
| 8 | QTD preset uses L1 cache | Cache | `L1_USE_CACHE` decision |
| 9 | Custom range within 365d uses L1 cache | Cache | `L1_USE_CACHE` decision |
| 10 | Custom range beyond 365d triggers API call | Cache | `L1_NO_CACHE` decision, new fetch |
| 11 | Provider filter toggle uses L1 cache | Cache | `L1_USE_CACHE`, instant toggle |
| 12 | Category filter toggle uses L1 cache | Cache | `L1_USE_CACHE`, instant toggle |
| 13 | Hierarchy filter change triggers API call | Cache | `L1_NO_CACHE`, server-side filter required |
| 14 | Clear Cache (PageActionsMenu) triggers API call | Cache | `clearBackendCache()` → `L1_NO_CACHE`, backend Polars cache bypassed |
| 15 | Org switch resets all cache | Cache | `resetToInitialState()` called, fresh fetch |
| 16 | Category filter resets on page unmount (CTX-002) | Bug fix | Overview shows ALL categories after leaving GenAI page |
| 17 | Cross-user auth cache isolation (AUTH-001) | Security | Cache key includes `userId:orgSlug` |
| 18 | Hierarchy filters sent in API call (CTX-005) | Bug fix | `filtersOverride` used, not stale closure |
| 19 | Timezone-safe date filtering (DATE-001) | Bug fix | String comparison for dates, not Date objects |
| 20 | Provider case-insensitive matching (FILTER-007) | Bug fix | "OpenAI" matches "openai" in selection state |
| 21 | NaN guard in trend calculations | Data | `Number.isFinite()` prevents NaN in charts |
| 22 | Abort controller cancels stale requests | Race | `mainFetchAbortRef` cancels on org switch |
| 23 | Duplicate fetch prevention | Race | `isFetchingRef` blocks concurrent fetches |
| 24 | Overview page loads all cost types | E2E | GenAI + Cloud + Subscription data visible |
| 25 | Error boundary catches component failures | Resilience | ErrorBoundary wraps dashboard components |

## Backend Tests (API Service Port 8000)

### Cache and Data Layer Matrix (12 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | L1 LRU cache stores Polars DataFrames | Unit | Cache entry with Arrow-format DataFrame |
| 2 | L1 cache key format: `costs:{org}:{date_hash}:{filters_hash}` | Unit | Key structure verified |
| 3 | L1 cache max 50 entries, 512MB | Config | Eviction when limit exceeded |
| 4 | L2 cache stores pre-computed aggregations | Unit | Summary dict with totals, forecasts |
| 5 | L2 cache max 200 entries, 128MB | Config | Eviction when limit exceeded |
| 6 | TTL: historical data until midnight UTC | TTL | Cache valid until midnight, then evicts |
| 7 | TTL: today's data 60 seconds | TTL | Cache expires after 60s for current-day data |
| 8 | TTL: minimum 300s for midnight edge case | TTL | Never less than 5 minutes |
| 9 | BigQuery query timeout 30 seconds | Config | Query cancelled after 30s |
| 10 | org_slug validation (SQL injection prevention) | Security | `validate_org_slug()` regex rejects malicious input |
| 11 | Empty DataFrame returns defaults | Data | Empty array with zero totals, not error |
| 12 | Cache stats endpoint returns hit/miss data | API | `GET /cache/stats` with `hit_count`, `miss_count` |

## Dashboard Page Tests

### Page Load Matrix (5 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `/{org}/cost-dashboards/overview` loads | E2E | Unified cost view with all cost types |
| 2 | `/{org}/cost-dashboards/cloud-costs` loads | E2E | Cloud provider costs only |
| 3 | `/{org}/cost-dashboards/genai-costs` loads | E2E | GenAI provider costs only |
| 4 | `/{org}/cost-dashboards/subscription-costs` loads | E2E | Subscription costs only |
| 5 | PipelineAutoTrigger fires on dashboard load | E2E | Pipeline triggered, data freshness ensured |

## Verification Commands

```bash
# 1. TypeScript build must pass
cd 01-fronted-system && npm run build

# 2. Run frontend tests
cd 01-fronted-system && npm run test

# 3. Check backend health and cache stats
curl -s http://localhost:8000/health | python3 -m json.tool

# 4. Check backend cache stats (admin)
curl -s http://localhost:8000/api/v1/admin/cache/stats \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | python3 -m json.tool

# 5. Force cache invalidation
curl -X POST http://localhost:8000/api/v1/admin/cache/invalidate \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# 6. Fetch cost data with cache bypass
curl -s "http://localhost:8000/api/v1/costs/{org}/total?start_date=2025-12-01&end_date=2026-01-31&clear_cache=true" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool

# 7. Check data freshness in BigQuery
bq query --use_legacy_sql=false \
  "SELECT MAX(x_ingested_at) as latest, COUNT(*) as total FROM \`{project}.{org}_prod.cost_data_standard_1_3\` WHERE ChargePeriodStart >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)"

# 8. Check data by source system
bq query --use_legacy_sql=false \
  "SELECT x_source_system, COUNT(*) as records, SUM(BilledCost) as total FROM \`{project}.{org}_prod.cost_data_standard_1_3\` WHERE ChargePeriodStart >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) GROUP BY x_source_system"

# 9. Verify category persistence fix (CTX-002)
# Navigate GenAI costs -> Overview -> verify all cost types shown

# 10. Check console for errors on cost dashboard
# Open browser DevTools -> Console, navigate all 4 cost pages
```

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Initial load performance | Navigate to Overview, measure time | Data renders in 2-5s |
| Time range toggle (instant) | Click 7d -> 30d -> 90d | Each change is instant (<10ms) |
| Provider filter toggle | Toggle OpenAI off/on | Instant chart update, no API call |
| Category filter (page scope) | Visit GenAI page -> go to Overview | Overview shows ALL categories |
| Hierarchy filter | Select department -> check API | API call with dept ID in params |
| Org switch | Switch orgs in dropdown | Cache resets, fresh data loads |
| Clear Cache (3-dot menu) | Click PageActionsMenu → Clear Cache | Visible loading state, fresh data from BigQuery |
| Forecast metrics | Check monthly/annual forecast | Non-zero, reasonable projections |
| Error boundary recovery | Trigger component error | Error boundary message, not crash |

## Performance Benchmarks

| Operation | Target Latency | Cache Layer |
|-----------|---------------|-------------|
| Initial dashboard load | 2-5s | Backend L1 miss -> BigQuery |
| Time range change (preset) | <10ms | Frontend L1 filter |
| Custom range within 365d | <10ms | Frontend L1 filter |
| Custom range beyond 365d | 2-5s | Backend L1 miss -> BigQuery |
| Provider filter toggle | <10ms | Frontend L1 filter |
| Category filter toggle | <10ms | Frontend L1 filter |
| Hierarchy filter change | 2-5s | Backend L1 (new query) |
| Clear Cache (PageActionsMenu) | 2-5s | Backend Polars cache invalidation via `clear_cache=true` |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Frontend filter tests | 25/25 (100%) |
| Backend cache tests | 12/12 (100%) |
| Dashboard page loads | 5/5 (100%) |
| TypeScript build | 0 errors |
| Console errors on cost pages | 0 |
| NaN values in charts | 0 |
| Cross-user data leakage | 0 |
| Category persistence bug (CTX-002) | Fixed -- verified |
| Timezone date filtering (DATE-001) | Fixed -- verified |

## Known Limitations

1. **BigQuery dependency**: Backend cache and data layer tests require active BigQuery connection
2. **Frontend L1 cache has no explicit TTL**: Relies on user actions (Clear Cache via PageActionsMenu, org switch) for invalidation
3. **Hierarchy filter always triggers API call**: Cannot be filtered client-side due to BigQuery path prefix query
4. **Performance benchmarks**: Actual latency depends on BigQuery cold start and data volume
5. **Auth cache race**: 5-second auth cache in `actions/costs.ts` -- cross-user isolation fixed (AUTH-001) but requires `userId` from Supabase session
6. **Demo data date range**: Demo data spans Dec 2025 - Jan 2026 -- use `?start_date=2025-12-01&end_date=2026-01-31` for verification
