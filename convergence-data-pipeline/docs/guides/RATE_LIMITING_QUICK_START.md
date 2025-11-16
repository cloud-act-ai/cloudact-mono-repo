# Rate Limiting Quick Start Guide

## What Changed?

Rate limiting has been added to protect the API from resource exhaustion across 10,000+ tenants.

**Without rate limiting**: One tenant can make 1,000 requests/second and exhaust BigQuery quota for all other tenants.

**With rate limiting**: Each tenant limited to 100 requests/minute, and critical endpoints to 10-50 requests/minute.

## Current Rate Limits

| Endpoint | Limit | Reason |
|----------|-------|--------|
| General endpoints | 100 req/min per tenant | Default protection |
| /admin/tenants (create) | 10 req/min | Creates expensive BQ datasets |
| /pipelines/run/* (execute) | 50 req/min per tenant | Executes expensive queries |
| Health checks (/health, /) | Unlimited | Load balancer checks |

## How It Works

### Per-Request Check
```
Request → Rate Limit Check (middleware)
├─ Tenant ID identified from auth
├─ Check: tenant requests in last 60 seconds < 100?
├─ Check: global requests in last 60 seconds < 10,000?
└─ If both OK → Process request, else → Return 429

Response ← Add rate limit headers
```

### Isolation Between Tenants
```
Tenant A: 100 req/min limit
├─ Request 1 ✓ (1/100)
├─ Request 2 ✓ (2/100)
└─ Request 100 ✓ (100/100)
└─ Request 101 ✗ (rate limited)

Tenant B: 100 req/min limit (isolated from Tenant A)
├─ Request 1 ✓ (1/100)
├─ Request 2 ✓ (2/100)
└─ Tenant A being rate limited doesn't affect Tenant B
```

## Using the API

### Success Response
```bash
curl -H "X-API-Key: sk_tenant_xxx" \
     https://api.example.com/api/v1/pipelines/runs

# Response headers show rate limit status
# X-RateLimit-Tenant-Limit: 100
# X-RateLimit-Tenant-Remaining: 99
```

### When Rate Limited (429 Response)
```bash
curl -H "X-API-Key: sk_tenant_xxx" \
     https://api.example.com/api/v1/pipelines/runs

# HTTP 429 Too Many Requests
# {
#   "error": "Rate limit exceeded",
#   "message": "Too many requests for tenant acmeinc_23xv2",
#   "retry_after": 1700000060
# }

# Wait until 'retry_after' timestamp before retrying
sleep 5
# Then retry request
```

## Configuration

### Default Settings (No Changes Needed)
Works out-of-box for 10k+ tenants with sensible defaults:
- Per-tenant: 100 req/min, 1000 req/hour
- Global: 10,000 req/min, 100,000 req/hour
- Critical ops: 10-50 req/min

### Custom Configuration (via Environment Variables)

```bash
# Increase per-tenant limit if needed
export RATE_LIMIT_REQUESTS_PER_MINUTE=500

# Increase global limit for high-volume deployments
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=50000

# Disable rate limiting (NOT RECOMMENDED for production)
export RATE_LIMIT_ENABLED=false
```

## For Developers

### Testing Locally

```bash
# Start API with rate limiting enabled (default)
python -m uvicorn src.app.main:app --reload

# Hit rate limit intentionally
for i in {1..120}; do
    curl -H "X-API-Key: sk_test_key" \
         http://localhost:8080/api/v1/pipelines/runs
done

# Should see 429 responses after 100 requests
```

### Adjusting Limits for Testing

```bash
# Disable for quick testing
export RATE_LIMIT_ENABLED=false

# Enable with low limits to test behavior
export RATE_LIMIT_REQUESTS_PER_MINUTE=5
python -m uvicorn src.app.main:app --reload
```

## For DevOps/SRE

### Monitoring

Watch for rate limit violations in logs:
```bash
# Check if tenants hitting limits
grep "Rate limit exceeded" /var/log/api.log | wc -l

# Which tenants are being rate limited?
grep "Rate limit exceeded" /var/log/api.log | jq '.tenant_id' | sort | uniq -c
```

### Adjusting for Production

For large-scale deployments:

```bash
# 10,000 tenants = ~1 req/sec per tenant on average
# Adjust accordingly:
export RATE_LIMIT_REQUESTS_PER_MINUTE=500   # More headroom
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=5000000  # 5M for 10k tenants

# Run load test
ab -n 100000 -c 1000 -H "X-API-Key: sk_..." https://api.example.com/api/v1/health
```

### Health Checks

Rate limiting excludes health endpoints:
```bash
# These are unlimited (good for load balancers)
curl https://api.example.com/health
curl https://api.example.com/

# All other endpoints are rate limited
curl -H "X-API-Key: sk_..." https://api.example.com/api/v1/...
```

## For Customers/Tenants

### If You Hit Rate Limits

**Issue**: Getting 429 responses
```
{
  "error": "Rate limit exceeded",
  "message": "Too many requests for tenant xxx"
}
```

**Solutions**:
1. **Reduce request frequency**: Spread requests over time
2. **Batch operations**: Combine multiple queries into fewer requests
3. **Optimize pipelines**: Run fewer pipeline executions
4. **Contact support**: If you need higher limits, we can adjust for your tier

### Checking Your Current Usage

```bash
# Monitor X-RateLimit-* headers in responses
curl -I -H "X-API-Key: sk_your_key" https://api.example.com/api/v1/pipelines/runs

# Shows:
# X-RateLimit-Tenant-Limit: 100
# X-RateLimit-Tenant-Remaining: 87
# X-RateLimit-Reset: 1700000123

# You have 87 requests left before hitting 100 req/min limit
# Limit resets at timestamp 1700000123
```

### Best Practices

1. **Use exponential backoff** when retrying:
   ```python
   import time
   for attempt in range(5):
       response = requests.get(url, headers=headers)
       if response.status_code == 429:
           wait_time = 2 ** attempt
           time.sleep(wait_time)
           continue
       break
   ```

2. **Batch your requests**:
   - Instead of: 100 separate list requests
   - Use: 1 list request with filters and pagination

3. **Cache when possible**:
   - Cache pipeline run results
   - Cache tenant configuration
   - Reduces redundant requests

4. **Monitor your usage**:
   - Log X-RateLimit-* headers
   - Track when you approach limits (e.g., > 80 req/min)
   - Alert before hitting limit

## Troubleshooting

### Getting 429 immediately?

**Possible causes**:
1. Other code using same API key (making requests concurrently)
2. Load test/integration test running
3. Global limit hit (check if all tenants combined exceeded 10k req/min)

**Solutions**:
```bash
# Check if rate limiting is the issue
curl -v http://localhost:8080/api/v1/health
# Should see HTTP 200 (health check not rate limited)

# Temporarily disable for testing
export RATE_LIMIT_ENABLED=false

# Or increase limits
export RATE_LIMIT_REQUESTS_PER_MINUTE=1000
```

### Integrating with client retry logic

```python
import requests
import time

def api_call_with_retry(url, headers):
    max_retries = 3
    for attempt in range(max_retries):
        response = requests.get(url, headers=headers)

        if response.status_code == 429:
            # Rate limited - wait and retry
            retry_after = int(response.json().get('retry_after', int(time.time()) + 60))
            wait_seconds = max(5, retry_after - int(time.time()))
            print(f"Rate limited, retrying in {wait_seconds}s...")
            time.sleep(wait_seconds)
            continue

        return response

    raise Exception(f"Failed after {max_retries} retries")
```

## File Locations

- **Core**: `/src/core/utils/rate_limiter.py`
- **Middleware**: `/src/app/main.py` (rate_limit_middleware)
- **Decorators**: `/src/app/dependencies/rate_limit_decorator.py`
- **Config**: `/src/app/config.py` (rate_limit_* settings)
- **Documentation**: `/RATE_LIMITING.md` (comprehensive)

## Next Steps

1. **Deploy** with default limits (100 req/min per tenant)
2. **Monitor** rate limit violations in logs
3. **Adjust** limits based on observed usage patterns
4. **Consider** tier-based limits (Premium customers get higher limits)
5. **Migrate** to Redis backend when scaling to multiple instances

## Support

For questions or to request rate limit adjustments:
1. Check `/RATE_LIMITING.md` for detailed documentation
2. Enable debug logging to see rate limit decisions
3. Contact support with usage patterns and SLA requirements
