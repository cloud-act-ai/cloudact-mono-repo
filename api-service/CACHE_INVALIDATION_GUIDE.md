# Cache Invalidation Guide

## Overview

This guide explains the caching strategy and cache invalidation patterns implemented in the API service for subscription plan endpoints.

## Cache Configuration

- **Cache Type:** In-memory (thread-safe)
- **TTL (Time-To-Live):** 5 minutes (300 seconds)
- **Cache Implementation:** `/api-service/src/core/utils/cache.py`

## Cached Endpoints

| Endpoint | Cache Key Pattern | TTL |
|----------|-------------------|-----|
| `GET /subscriptions/{org}/providers` | `providers_list_{org_slug}` | 5 min |
| `GET /subscriptions/{org}/providers/{provider}/plans` | `plans_list_{org_slug}_{provider}_{include_disabled}` | 5 min |
| `GET /subscriptions/{org}/all-plans` | `all_plans_{org_slug}_{enabled_only}` | 5 min |

## Cache Invalidation Triggers

### Automatic Invalidation

Cache is automatically invalidated when data is modified through any of these endpoints:

#### 1. Create Custom Plan
**Endpoint:** `POST /subscriptions/{org}/providers/{provider}/plans`

**Invalidates:**
- `plans_list_{org_slug}_{provider}_*` (all plan lists for this provider)
- `all_plans_{org_slug}_*` (all-plans dashboard data)
- `providers_list_{org_slug}` (provider list with plan counts)

**Example:**
```bash
curl -X POST http://localhost:8000/api/v1/subscriptions/acme/slack/plans \
  -H "X-API-Key: acme_api_..." \
  -d '{"plan_name": "CUSTOM", "unit_price_usd": 15.99, "quantity": 5}'
# Invalidates: plans_list_acme_slack_*, all_plans_acme_*, providers_list_acme
```

#### 2. Update Plan
**Endpoint:** `PUT /subscriptions/{org}/providers/{provider}/plans/{subscription_id}`

**Invalidates:**
- Same as Create Plan

**Example:**
```bash
curl -X PUT http://localhost:8000/api/v1/subscriptions/acme/slack/plans/sub_slack_pro_a1b2c3 \
  -H "X-API-Key: acme_api_..." \
  -d '{"quantity": 10}'
# Invalidates: plans_list_acme_slack_*, all_plans_acme_*, providers_list_acme
```

#### 3. Delete Plan
**Endpoint:** `DELETE /subscriptions/{org}/providers/{provider}/plans/{subscription_id}`

**Invalidates:**
- Same as Create Plan

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/v1/subscriptions/acme/slack/plans/sub_slack_pro_a1b2c3 \
  -H "X-API-Key: acme_api_..."
# Invalidates: plans_list_acme_slack_*, all_plans_acme_*, providers_list_acme
```

#### 4. Enable Provider
**Endpoint:** `POST /subscriptions/{org}/providers/{provider}/enable`

**Invalidates:**
- Same as Create Plan

**Example:**
```bash
curl -X POST http://localhost:8000/api/v1/subscriptions/acme/canva/enable \
  -H "X-API-Key: acme_api_..."
# Invalidates: plans_list_acme_canva_*, all_plans_acme_*, providers_list_acme
```

#### 5. Disable Provider
**Endpoint:** `POST /subscriptions/{org}/providers/{provider}/disable`

**Invalidates:**
- Same as Create Plan

**Example:**
```bash
curl -X POST http://localhost:8000/api/v1/subscriptions/acme/canva/disable \
  -H "X-API-Key: acme_api_..."
# Invalidates: plans_list_acme_canva_*, all_plans_acme_*, providers_list_acme
```

#### 6. Toggle Plan
**Endpoint:** `POST /subscriptions/{org}/providers/{provider}/toggle/{subscription_id}`

**Invalidates:**
- Same as Create Plan

**Example:**
```bash
curl -X POST http://localhost:8000/api/v1/subscriptions/acme/slack/toggle/sub_slack_pro_a1b2c3 \
  -H "X-API-Key: acme_api_..."
# Invalidates: plans_list_acme_slack_*, all_plans_acme_*, providers_list_acme
```

### Manual Invalidation

#### Invalidate All Data for an Organization

```python
from src.core.utils.cache import invalidate_org_cache

# Invalidate all cached data for org "acme"
count = invalidate_org_cache("acme")
print(f"Invalidated {count} cache entries")
```

**Use Cases:**
- Organization is deleted
- Major data migration or update
- Testing or debugging

#### Invalidate Specific Provider

```python
from src.core.utils.cache import invalidate_provider_cache

# Invalidate all cached data for org "acme" provider "slack"
count = invalidate_provider_cache("acme", "slack")
print(f"Invalidated {count} cache entries")
```

**Use Cases:**
- Provider configuration changed
- Bulk update to provider plans
- Troubleshooting cache issues

#### Clear All Cache

```python
from src.core.utils.cache import get_cache

# Clear all cached data (all orgs, all endpoints)
cache = get_cache()
cache.clear()
```

**Use Cases:**
- Application restart
- Emergency cache flush
- Development/testing

## Cache Verification

### Check Cache Statistics

```python
from src.core.utils.cache import get_cache

stats = get_cache().get_stats()
print(stats)
# {
#   "hits": 1234,
#   "misses": 56,
#   "sets": 56,
#   "invalidations": 12,
#   "total_requests": 1290,
#   "hit_rate_pct": 95.66,
#   "cache_size": 45
# }
```

### Test Cache Behavior

```bash
# Make a request (cache miss)
curl http://localhost:8000/api/v1/subscriptions/acme/providers
# Response time: ~1-2 seconds

# Make the same request again (cache hit)
curl http://localhost:8000/api/v1/subscriptions/acme/providers
# Response time: ~10ms

# Modify data (invalidates cache)
curl -X POST http://localhost:8000/api/v1/subscriptions/acme/slack/enable

# Make the same request again (cache miss, fresh data)
curl http://localhost:8000/api/v1/subscriptions/acme/providers
# Response time: ~1-2 seconds
```

## Cache Debugging

### Enable Debug Logging

Set log level to DEBUG to see cache hit/miss logs:

```bash
export LOG_LEVEL="DEBUG"
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000
```

**Example logs:**
```
DEBUG: Cache HIT: providers_list_acme
DEBUG: Cache MISS: plans_list_acme_slack_True
DEBUG: Cache SET: plans_list_acme_slack_True
DEBUG: Invalidated cache for org acme provider slack
```

### Monitor Query Performance

Slow queries (>2 seconds) are logged with WARNING level:

```
WARNING: SLOW QUERY DETECTED: 'list_providers_query' took 3.456s (threshold: 2.0s)
```

## Troubleshooting

### Cache Not Invalidating

**Symptom:** Stale data returned after write operation

**Diagnosis:**
1. Check logs for "Invalidated cache for org..." messages
2. Verify cache key patterns match
3. Check if write operation succeeded

**Solution:**
```python
# Manual invalidation
from src.core.utils.cache import invalidate_org_cache
invalidate_org_cache("affected_org")
```

### Cache Hit Rate Too Low

**Symptom:** Cache hit rate < 50%

**Diagnosis:**
1. Check cache statistics: `get_cache().get_stats()`
2. Verify TTL is appropriate (5 minutes default)
3. Check if write operations are too frequent

**Solutions:**
- Increase TTL if data doesn't change often: `CACHE_TTL_SECONDS = 600`
- Implement cache warming for frequently accessed data
- Consider Redis for distributed caching

### Memory Usage High

**Symptom:** API service consuming too much memory

**Diagnosis:**
1. Check cache size: `get_cache().get_stats()["cache_size"]`
2. Identify large cached objects

**Solutions:**
- Implement cache compression
- Reduce TTL to expire entries sooner
- Add max cache size limit
- Cleanup expired entries: `get_cache().cleanup_expired()`

### Cache Stampede

**Symptom:** Multiple requests hit database when cache expires

**Diagnosis:**
- Multiple slow queries logged simultaneously
- Database connection pool exhausted

**Solutions:**
- Implement cache warming before expiration
- Use request coalescing (deduplicate concurrent requests)
- Add jitter to TTL to prevent synchronized expiration

## Best Practices

### 1. Always Invalidate on Write

Every write operation that modifies cached data MUST invalidate the cache:

```python
# GOOD: Invalidate after write
bq_client.client.query(insert_query).result()
invalidate_provider_cache(org_slug, provider)
invalidate_org_cache(org_slug)

# BAD: Forget to invalidate (stale data!)
bq_client.client.query(insert_query).result()
# Missing invalidation!
```

### 2. Use Specific Invalidation Patterns

Invalidate only what's affected, not the entire cache:

```python
# GOOD: Specific invalidation
invalidate_provider_cache("acme", "slack")  # Only invalidates slack data

# OKAY: Org-wide invalidation
invalidate_org_cache("acme")  # Invalidates all data for acme

# BAD: Global invalidation (impacts all orgs!)
get_cache().clear()  # Use only in emergencies
```

### 3. Monitor Cache Performance

Track cache statistics in production:

```python
# Log cache stats periodically
stats = get_cache().get_stats()
logger.info(f"Cache hit rate: {stats['hit_rate_pct']}%", extra=stats)
```

### 4. Test Cache Invalidation

Include cache invalidation in integration tests:

```python
async def test_cache_invalidation():
    # Get cached data
    response1 = await get_plans("acme", "slack")

    # Modify data
    await create_plan("acme", "slack", {...})

    # Verify cache was invalidated
    response2 = await get_plans("acme", "slack")
    assert response1 != response2
```

## Migration to Redis (Future)

For production scalability, consider migrating to Redis:

```python
# Current: In-memory cache
from src.core.utils.cache import get_cache
cache = get_cache()

# Future: Redis cache
from src.core.utils.redis_cache import get_redis_cache
cache = get_redis_cache(redis_url="redis://localhost:6379")

# Same API, different backend
cache.set("key", "value", ttl_seconds=300)
cache.get("key")
cache.invalidate_pattern("org_acme_")
```

**Benefits of Redis:**
- Shared cache across multiple API instances
- Persistent cache across restarts
- Better memory management
- Built-in eviction policies

## Related Documentation

- **Performance Report:** `/api-service/OPTIMIZATION_REPORT.md`
- **Cache Implementation:** `/api-service/src/core/utils/cache.py`
- **Query Performance:** `/api-service/src/core/utils/query_performance.py`
- **API Endpoints:** `/api-service/src/app/routers/subscription_plans.py`
