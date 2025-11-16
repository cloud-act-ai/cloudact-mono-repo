# Rate Limiting Implementation

## Overview

This document describes the multi-tenant rate limiting system implemented to protect the API from resource exhaustion across 10,000+ tenants.

## Architecture

### Components

1. **Rate Limiter Core** (`src/core/utils/rate_limiter.py`)
   - `RateLimiter`: Main rate limiting service
   - `InMemoryRateLimitStore`: Development/single-instance store (not for distributed systems)
   - `RateLimitStore`: Abstract interface for pluggable backends (Redis support ready)

2. **Middleware** (`src/app/main.py`)
   - Global rate limiting middleware checking all requests
   - Per-tenant and global limits enforced at request level
   - Health check endpoints excluded from rate limiting

3. **Decorators** (`src/app/dependencies/rate_limit_decorator.py`)
   - `rate_limit_by_tenant()`: Per-tenant rate limit checks
   - `rate_limit_global()`: Global/unauthenticated endpoint limits
   - Standard HTTP rate limit headers added to responses

4. **Configuration** (`src/app/config.py`)
   - Environment variable based rate limit configuration
   - Separate limits for critical endpoints
   - Enable/disable switch for entire system

## Rate Limits

### Default Limits (Configurable via Environment Variables)

| Category | Limit | Window | Purpose |
|----------|-------|--------|---------|
| Per-tenant (general) | 100 req/min | 60 seconds | Prevents single tenant from exhausting resources |
| Per-tenant (hourly) | 1,000 req/hour | 3600 seconds | Tracks sustained abuse patterns |
| Global (all requests) | 10,000 req/min | 60 seconds | Protects cluster from traffic spikes |
| Global (hourly) | 100,000 req/hour | 3600 seconds | Prevents sustained global attacks |
| Admin tenant creation | 10 req/min | 60 seconds | Protects expensive BigQuery operations |
| Pipeline execution | 50 req/min per tenant | 60 seconds | Protects expensive query execution |

### Critical Endpoints Protection

#### 1. **POST /api/v1/admin/tenants** (Create Tenant)
- **Rate Limit**: 10 requests/minute per admin
- **Reason**: Creates BigQuery datasets (expensive GCP operation)
- **Impact**: Prevents rogue admins from DoS via tenant creation spam
- **Fallback**: Global limit (10,000 req/min) as backup

#### 2. **POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}** (Run Pipeline Template)
- **Rate Limit**: 50 requests/minute per tenant
- **Reason**: Executes BigQuery queries that can consume significant compute
- **Impact**: Single tenant cannot trigger pipeline spam that affects other tenants
- **Multi-layer**: Both per-tenant and global limits apply

#### 3. **POST /api/v1/pipelines/run/{pipeline_id}** (Run Pipeline - Deprecated)
- **Rate Limit**: 50 requests/minute per tenant
- **Reason**: Same as templated pipeline (expensive query execution)
- **Impact**: Prevents legacy endpoints from being abuse vectors

### Protected Endpoints (General Limits)

- **GET /api/v1/admin/tenants/{tenant_id}**: 100 req/min (tenant query)
- **POST /api/v1/admin/api-keys**: 100 req/min (API key generation)
- **DELETE /api/v1/admin/api-keys/{api_key_hash}**: 100 req/min (API key revocation)
- **GET /api/v1/pipelines/runs/{pipeline_logging_id}**: 100 req/min (run query)
- **GET /api/v1/pipelines/runs**: 100 req/min (list runs)
- **DELETE /api/v1/pipelines/runs/{pipeline_logging_id}**: 100 req/min (cancel run)

### Excluded Endpoints

- **GET /health**: No rate limiting (load balancer health checks)
- **GET /**: No rate limiting (root endpoint for monitoring)

## Environment Variables

Configure rate limiting via these environment variables:

```bash
# Enable/disable rate limiting
RATE_LIMIT_ENABLED=true                              # Default: true

# Per-tenant limits
RATE_LIMIT_REQUESTS_PER_MINUTE=100                   # Default: 100
RATE_LIMIT_REQUESTS_PER_HOUR=1000                    # Default: 1000

# Global limits (all tenants combined)
RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=10000          # Default: 10000
RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=100000           # Default: 100000

# Critical endpoint limits
RATE_LIMIT_ADMIN_TENANTS_PER_MINUTE=10               # Default: 10 (tenant creation)
RATE_LIMIT_PIPELINE_RUN_PER_MINUTE=50                # Default: 50 (pipeline execution)
```

### Example Configuration for 10k Tenants

```bash
# Production settings for 10,000 tenants
export RATE_LIMIT_ENABLED=true
export RATE_LIMIT_REQUESTS_PER_MINUTE=100
export RATE_LIMIT_REQUESTS_PER_HOUR=1000
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=500000  # 50 req/min per avg tenant
export RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=5000000
export RATE_LIMIT_ADMIN_TENANTS_PER_MINUTE=10
export RATE_LIMIT_PIPELINE_RUN_PER_MINUTE=50
```

## How It Works

### Sliding Window Counter Algorithm

The rate limiter uses a sliding window counter approach:

1. **Track Requests**: Each request increments a counter for the time window
2. **Clean Old Data**: Entries outside the window are automatically removed
3. **Decision**: Compare current count against limit
4. **Response**: Return 429 Too Many Requests if limit exceeded

### Multi-Layer Protection

```
Request
   ↓
[Rate Limit Middleware]
   ├─ Check per-tenant limit (if tenant_id available)
   │  ├─ Minute limit
   │  └─ Hour limit
   └─ Check global limit
      ├─ Minute limit
      └─ Hour limit
   ↓
[Pass: Proceed to Endpoint Logic]
[Fail: Return 429 with retry_after header]
```

### Multi-Tenant Isolation

Each tenant has isolated rate limit counters:

```
tenant:acmeinc_1:minute    ← Request 1 from tenant 1
tenant:acmeinc_2:minute    ← Request 1 from tenant 2
tenant:acmeinc_3:minute    ← Request 1 from tenant 3
...
tenant:acmeinc_10000:minute ← Request 1 from tenant 10000

global:api:minute          ← Total of all requests across tenants
```

One tenant exhausting its limit (e.g., 100 req/min) does NOT affect other tenants because:
- Each tenant has separate counters
- Global limit (10,000 req/min) only blocks when ALL tenants combined exceed limit
- Critical endpoints have per-tenant + global limits

## Response Format

### Success Response (429 Not Hit)

```bash
curl -H "X-API-Key: sk_..." https://api.example.com/api/v1/pipelines/runs

# Response Headers
X-RateLimit-Tenant-Limit: 100
X-RateLimit-Tenant-Remaining: 99
X-RateLimit-Reset: 1700000060
```

### Rate Limited Response (429 Hit)

```json
HTTP/1.1 429 Too Many Requests

{
  "error": "Rate limit exceeded",
  "message": "Too many requests for tenant acmeinc_23xv2",
  "retry_after": 1700000060
}
```

### Global Rate Limited Response

```json
HTTP/1.1 429 Too Many Requests

{
  "error": "Rate limit exceeded",
  "message": "Global rate limit exceeded",
  "retry_after": 1700000120
}
```

## Implementation Details

### Initialization

Rate limiter is initialized during application startup in the lifespan manager:

```python
# src/app/main.py
@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.rate_limit_enabled:
        init_rate_limiter(
            default_limit_per_minute=settings.rate_limit_requests_per_minute,
            default_limit_per_hour=settings.rate_limit_requests_per_hour,
            global_limit_per_minute=settings.rate_limit_global_requests_per_minute,
            global_limit_per_hour=settings.rate_limit_global_requests_per_hour
        )
```

### Middleware Execution

The rate limit middleware runs BEFORE endpoint handlers:

```python
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # 1. Skip health endpoints
    if request.url.path in ["/health", "/"]:
        return await call_next(request)

    # 2. Check per-tenant limit
    if tenant_id:
        await rate_limiter.check_tenant_limit(...)

    # 3. Check global limit
    await rate_limiter.check_global_limit(...)

    # 4. Proceed if allowed
    return await call_next(request)
```

### Endpoint-Level Protection

Critical endpoints add additional rate limit checks:

```python
@router.post("/pipelines/run/{tenant_id}/...")
async def trigger_templated_pipeline(...):
    # Additional per-tenant check with stricter limit (50 vs 100)
    await rate_limit_by_tenant(
        http_request,
        tenant_id=tenant.tenant_id,
        limit_per_minute=settings.rate_limit_pipeline_run_per_minute,
        endpoint_name="trigger_templated_pipeline"
    )
    # ... endpoint logic
```

## Storage Backends

### Current: In-Memory Store (Development)

```python
# src/core/utils/rate_limiter.py
class InMemoryRateLimitStore(RateLimitStore):
    def __init__(self):
        self._store: Dict[str, list] = defaultdict(list)
        self._lock = asyncio.Lock()
```

**Limitations**:
- Data lost on restart
- Not shared across multiple instances
- Suitable for development and single-instance deployments

**Usage**: Default for local development

### Future: Redis Store (Production)

Ready to implement when needed:

```python
class RedisRateLimitStore(RateLimitStore):
    def __init__(self, redis_client):
        self.redis = redis_client

    async def check_and_increment(self, key: str, limit: int, window_seconds: int):
        # Use INCR and EXPIRE commands
        # Supports distributed rate limiting
```

**Advantages**:
- Persists across restarts
- Shared across multiple instances
- Automatic cleanup with Redis expiration
- Atomic operations

**Migration Path**:
1. Set environment variable: `RATE_LIMIT_STORE=redis`
2. Provide Redis connection string: `REDIS_URL=redis://localhost:6379`
3. System automatically uses RedisRateLimitStore instead of InMemoryStore

## Monitoring & Logging

### Log Messages

Rate limit violations are logged with context:

```
WARNING:root:Rate limit exceeded for tenant acmeinc_23xv2
{
  "tenant_id": "acmeinc_23xv2",
  "endpoint": "trigger_templated_pipeline",
  "path": "/api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/template",
  "remaining": 0,
  "reset": 1700000060
}
```

### Metrics (Ready for Integration)

The rate limiter can be integrated with monitoring systems:

```python
# Example: Emit metrics to CloudMonitoring/Prometheus
logger.info(
    "rate_limit_check",
    extra={
        "metric": "rate_limit.check",
        "tenant_id": tenant_id,
        "is_allowed": True,
        "remaining": 99,
        "limit": 100
    }
)
```

### Dashboard Queries

For monitoring dashboards:

```sql
-- Count rate limit violations per tenant
SELECT
    tenant_id,
    COUNT(*) as violations,
    TIMESTAMP_MILLIS(window_start) as timestamp
FROM logs
WHERE message LIKE 'Rate limit exceeded%'
GROUP BY tenant_id, window_start

-- Identify abusive tenants
SELECT
    tenant_id,
    COUNT(*) as violation_count
FROM logs
WHERE message LIKE 'Rate limit exceeded%'
  AND timestamp > NOW() - INTERVAL 1 HOUR
GROUP BY tenant_id
ORDER BY violation_count DESC
LIMIT 10
```

## Testing Rate Limits

### Load Testing (Simple)

```bash
#!/bin/bash
# Test per-tenant limit (should get 429 after 100 requests)
for i in {1..120}; do
    curl -X GET \
      -H "X-API-Key: sk_acmeinc_23xv2_test" \
      https://localhost:8080/api/v1/pipelines/runs \
      -s -o /dev/null -w "%{http_code}\n"

    # Check for 429 response
    if [ $? -eq 429 ]; then
        echo "Rate limit hit after $i requests"
        break
    fi
done
```

### Load Testing (Advanced)

```bash
# Using Apache Bench (100 concurrent requests, 120 total)
ab -n 120 -c 100 \
   -H "X-API-Key: sk_acmeinc_23xv2_test" \
   https://localhost:8080/api/v1/pipelines/runs

# Using wrk (Lua scripting for custom load)
wrk -t4 -c100 -d30s \
    -H "X-API-Key: sk_acmeinc_23xv2_test" \
    https://localhost:8080/api/v1/pipelines/runs
```

### Unit Tests (Planned)

```python
# tests/test_rate_limiter.py
async def test_per_tenant_rate_limit():
    limiter = RateLimiter(default_limit_per_minute=5)

    # First 5 requests should succeed
    for i in range(5):
        is_allowed, _ = await limiter.check_tenant_limit("tenant1")
        assert is_allowed

    # 6th request should fail
    is_allowed, _ = await limiter.check_tenant_limit("tenant1")
    assert not is_allowed

    # Different tenant should not be affected
    is_allowed, _ = await limiter.check_tenant_limit("tenant2")
    assert is_allowed
```

## Troubleshooting

### Issue: Rate limited even with low traffic

**Possible Causes**:
1. Global limit too low for number of tenants
2. Rate limit window too short
3. Load balancer making multiple health checks

**Solution**:
```bash
# Increase global limits
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=50000
export RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=500000

# Or disable per-tenant limits for specific endpoints
# (Edit endpoint-specific rate limit calls)
```

### Issue: Tenant complains about hitting limits

**Possible Causes**:
1. Legitimate spike in usage
2. Inefficient client making duplicate requests
3. Testing/integration issues

**Solution**:
```bash
# Temporarily increase per-tenant limits
export RATE_LIMIT_REQUESTS_PER_MINUTE=500

# Monitor specific tenant
grep "tenant_id: acmeinc_23xv2" logs | grep "rate_limit"

# Contact tenant to optimize their usage
```

### Issue: Health checks failing (429 responses)

**Possible Causes**:
1. Health check endpoint includes tenant_id in URL
2. Rate limit configuration excludes it

**Solution**:
```python
# Ensure health endpoints are excluded from middleware
if request.url.path in ["/health", "/"]:
    return await call_next(request)
```

## Security Considerations

### DoS Protection

- **Per-tenant limits**: Prevent single tenant from affecting others
- **Global limits**: Protect infrastructure from coordinated attacks
- **Endpoint-specific limits**: Critical operations (tenant creation, pipeline execution) have stricter limits

### Multi-Tenant Safety

- Separate counters per tenant ensure isolation
- No shared state between tenants (except global limit)
- Rate limit bypass not possible via auth header tampering (hashed in auth module)

### Future Enhancements

1. **Distributed Rate Limiting**: Switch to Redis for multi-instance deployments
2. **Adaptive Limits**: Auto-adjust based on tenant tier/SLA
3. **Circuit Breaker**: Temporarily block tenants repeatedly hitting limits
4. **Cost-Based Limiting**: Limit based on estimated BigQuery cost instead of request count
5. **Whitelisting**: Allow high-volume tenants to exceed limits (with approval/SLA)

## Production Checklist

Before deploying to production with 10k+ tenants:

- [ ] Test with realistic load distribution across tenants
- [ ] Configure appropriate limits based on expected usage patterns
- [ ] Set up monitoring/alerting for rate limit violations
- [ ] Document rate limits in API documentation
- [ ] Plan communication for customers about rate limits
- [ ] Set up process to handle rate limit exceptions (API for manual overrides)
- [ ] Consider migrating to Redis store for distributed deployments
- [ ] Implement cost-based limiting for expensive endpoints
- [ ] Add rate limit status dashboard for customer visibility
- [ ] Plan for gradual rollout (enable for small tenant set first)

## FAQ

### Q: Why separate limits for each endpoint instead of one global limit?

A: Different endpoints have different resource costs. Tenant creation creates BigQuery datasets (expensive), while reading pipeline runs is cheap. This allows higher throughput for cheap operations while protecting expensive ones.

### Q: Can a tenant increase their rate limit?

A: Currently no, but this can be added via:
1. Tenant tier system (Premium tenants get higher limits)
2. Manual approval process
3. API key permissions system

### Q: What happens to requests rejected for rate limiting?

A: They get a 429 response with `retry_after` header. Clients should wait before retrying.

### Q: Is rate limiting retroactive?

A: No, it only starts after deployment. Historical requests are not checked.

### Q: Can I disable rate limiting?

A: Yes, set `RATE_LIMIT_ENABLED=false`, but not recommended for multi-tenant production systems.
