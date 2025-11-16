# Rate Limits Reference

## Summary of All Rate Limits

### Tier 1: Unlimited (Health Checks)
No rate limiting applied - suitable for load balancer health checks

| Endpoint | Method | Rate Limit | Window |
|----------|--------|-----------|--------|
| `/health` | GET | Unlimited | N/A |
| `/` | GET | Unlimited | N/A |

---

### Tier 2: Critical Operations (Tightest Limits)
Endpoints performing expensive operations (BigQuery dataset creation, pipeline execution)

#### Tenant Creation (Creates BQ Datasets)
| Endpoint | Method | Rate Limit | Window | Reason |
|----------|--------|-----------|--------|--------|
| `/api/v1/admin/tenants` | POST | **10 req/min** | Per admin | Creates BigQuery datasets (~5-10 API calls per tenant) |

**Configuration**: `RATE_LIMIT_ADMIN_TENANTS_PER_MINUTE=10`

**Impact on 10,000 tenants**:
- Max 10 new tenants/min = 600 new tenants/hour
- Prevents rogue admins from creating mass test tenants
- Protects GCP quota and BigQuery API limits

#### Pipeline Execution (Runs Expensive Queries)
| Endpoint | Method | Rate Limit | Window | Reason |
|----------|--------|-----------|--------|--------|
| `/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}` | POST | **50 req/min per tenant** | Per tenant | Executes BigQuery queries consuming compute and IO |
| `/api/v1/pipelines/run/{pipeline_id}` | POST | **50 req/min per tenant** | Per tenant | Deprecated but protects same expensive operation |

**Configuration**: `RATE_LIMIT_PIPELINE_RUN_PER_MINUTE=50`

**Impact on 10,000 tenants**:
- Each tenant can run 50 pipelines/min
- Total cluster: 500,000 pipeline executions/min (if all tenants max out)
- Prevents single tenant from consuming all BigQuery slots
- Allows seasonal spikes (e.g., month-end reporting)

---

### Tier 3: Standard Operations (Moderate Limits)
Regular read/write operations (list pipelines, get run status, create API keys)

| Endpoint | Method | Rate Limit | Window | Reason |
|----------|--------|-----------|--------|--------|
| `/api/v1/admin/tenants/{tenant_id}` | GET | 100 req/min (global) | Per admin | Query tenant metadata - cheap operation |
| `/api/v1/admin/api-keys` | POST | 100 req/min (global) | Per admin | Generate API key - requires one BQ insert |
| `/api/v1/admin/api-keys/{api_key_hash}` | DELETE | 100 req/min (global) | Per admin | Revoke API key - requires one BQ update |
| `/api/v1/pipelines/runs/{pipeline_logging_id}` | GET | 100 req/min (tenant) | Per tenant | Query single pipeline run |
| `/api/v1/pipelines/runs` | GET | 100 req/min (tenant) | Per tenant | List pipeline runs with filtering |
| `/api/v1/pipelines/runs/{pipeline_logging_id}` | DELETE | 100 req/min (tenant) | Per tenant | Cancel pipeline run |

**Configuration**: `RATE_LIMIT_REQUESTS_PER_MINUTE=100` (default)

**Impact on 10,000 tenants**:
- Each tenant can make 100 reads/writes/min
- Total cluster: 1,000,000 requests/min at full utilization
- Allows normal workflow + integration testing
- Prevents accidental polling loops

---

### Tier 4: Global Fallback Limits
Applied to all requests if per-tenant limits aren't triggered

| Limit Type | Limit | Window | Applies To |
|-----------|-------|--------|-----------|
| Per-Tenant Min | 100 req/min | 60 seconds | Any authenticated request |
| Per-Tenant Hour | 1,000 req/hour | 3600 seconds | Any authenticated request |
| Global Min | 10,000 req/min | 60 seconds | All requests combined |
| Global Hour | 100,000 req/hour | 3600 seconds | All requests combined |

**Configuration**:
```bash
RATE_LIMIT_REQUESTS_PER_MINUTE=100
RATE_LIMIT_REQUESTS_PER_HOUR=1000
RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=10000
RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=100000
```

**Impact on 10,000 tenants**:
- Global limit = 10,000 req/min for 10,000 tenants = 1 req/sec per tenant on average
- Adequate for normal usage, allows 50 req/min per tenant for burst
- Entire cluster can spike to 10k req/min when needed
- 24-hour limit of 100k prevents sustained attacks

---

## Rate Limit Decisions

### How Rate Limits Are Applied

```
Request arrives
  ↓
1. Check per-tenant minute limit
   └─ If tenant has made 100 requests in last 60s → BLOCKED (429)
   └─ Else → Continue
  ↓
2. Check per-tenant hour limit
   └─ If tenant has made 1000 requests in last 3600s → BLOCKED (429)
   └─ Else → Continue
  ↓
3. Check global minute limit (all tenants combined)
   └─ If all tenants combined: 10000 requests in last 60s → BLOCKED (429)
   └─ Else → Continue
  ↓
4. Check global hour limit (all tenants combined)
   └─ If all tenants combined: 100000 requests in last 3600s → BLOCKED (429)
   └─ Else → Continue
  ↓
5. Check endpoint-specific limit (if critical operation)
   └─ POST /admin/tenants: 10 req/min (stricter than default 100)
   └─ POST /pipelines/run/*: 50 req/min (stricter than default 100)
  ↓
6. Endpoint logic executes
```

### Multi-Tenant Isolation

Example: 10,000 tenants, each hitting their limit

```
Scenario: Each of 10,000 tenants makes exactly 100 requests

tenant_1:      100 requests ✓ (within 100 limit)
tenant_2:      100 requests ✓ (within 100 limit)
tenant_3:      100 requests ✓ (within 100 limit)
...
tenant_10000:  100 requests ✓ (within 100 limit)

Total:        1,000,000 requests in 60 seconds (within 10,000 limit? NO!)
              Global limit hit! → 1,000,000 > 10,000

BUT:
- Each tenant independently is OK (100 < 100 ✓)
- Cluster-wide is over limit (1,000,000 > 10,000 ✗)

Resolution:
1. Additional requests are rejected with 429
2. Clients should back off
3. Window resets after 60 seconds
4. On-call team reviews if global limit needs adjustment
```

---

## Configuration Examples

### Development (No Restrictions)
```bash
export RATE_LIMIT_ENABLED=false
# or
export RATE_LIMIT_REQUESTS_PER_MINUTE=10000
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=1000000
```

### Staging (Realistic Load)
```bash
export RATE_LIMIT_ENABLED=true
export RATE_LIMIT_REQUESTS_PER_MINUTE=100
export RATE_LIMIT_REQUESTS_PER_HOUR=1000
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=10000
export RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=100000
export RATE_LIMIT_ADMIN_TENANTS_PER_MINUTE=10
export RATE_LIMIT_PIPELINE_RUN_PER_MINUTE=50
```

### Production (Conservative)
```bash
export RATE_LIMIT_ENABLED=true
export RATE_LIMIT_REQUESTS_PER_MINUTE=50      # Tighter per-tenant
export RATE_LIMIT_REQUESTS_PER_HOUR=500       # Tighter hourly
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=5000  # 1 req/min per tenant
export RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=50000
export RATE_LIMIT_ADMIN_TENANTS_PER_MINUTE=5
export RATE_LIMIT_PIPELINE_RUN_PER_MINUTE=25
```

### Production 10k Tenants (Generous)
```bash
export RATE_LIMIT_ENABLED=true
export RATE_LIMIT_REQUESTS_PER_MINUTE=500     # 50 req/min per tenant on average
export RATE_LIMIT_REQUESTS_PER_HOUR=5000
export RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE=500000  # 50 req/min per tenant
export RATE_LIMIT_GLOBAL_REQUESTS_PER_HOUR=5000000
export RATE_LIMIT_ADMIN_TENANTS_PER_MINUTE=50  # Busy admin
export RATE_LIMIT_PIPELINE_RUN_PER_MINUTE=500  # High pipeline volume
```

---

## HTTP Response Details

### 429 Too Many Requests Response

**Headers**:
```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

X-RateLimit-Tenant-Limit: 100
X-RateLimit-Tenant-Remaining: 0
X-RateLimit-Reset: 1700000060
```

**Body**:
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests for tenant acmeinc_23xv2",
  "retry_after": 1700000060
}
```

**Meaning**:
- Tenant has made 100 requests in the last 60 seconds
- No requests allowed until timestamp `1700000060`
- Client should wait at least 5 seconds before retrying
- Retry-After header indicates when to try again

---

## Practical Examples

### Example 1: Single Tenant Normal Usage
```
Tenant: acme_company

Minute 1:
- 10 API calls ✓ (10/100)
- 5 GET requests ✓ (15/100)
- Rate limit remaining: 85

Minute 2:
- 20 pipeline reads ✓ (20/100)
- Rate limit remaining: 80

Minute 3:
- 100 pipeline reads ✓ (100/100)
- Rate limit remaining: 0
- 101st request ✗ (429 Too Many Requests)

After 60 seconds:
- Window rolls forward
- Counter resets to 0
- Can make 100 more requests
```

### Example 2: Tenant Hitting Pipeline Limit
```
Tenant: dataheavy_company

Pipeline execution requests in Minute 1:
- Request 1 ✓ (1/50)
- Request 2 ✓ (2/50)
- ...
- Request 50 ✓ (50/50)
- Rate limit remaining: 0
- Request 51 ✗ (429 Too Many Requests)

But can still make:
- 50 GET requests ✓ (within 100 general limit)
- 50 API key creation requests ✓
- Total: 100 non-pipeline requests allowed

Cannot make more pipelines until 60 second window resets
```

### Example 3: Global Limit at Scale
```
Cluster with 10,000 active tenants:

Each tenant averages: 0.1 req/sec (6 req/min)
Total: 60,000 req/min per tenant * 10,000 = 600,000 req/min (NO, max is 100k req/min)

Actually limited by global hour limit:
100,000 req/hour = 1,667 req/min average across all tenants
Per tenant: 1,667 / 10,000 = 0.167 req/min on average
But with per-tenant limit of 100 req/min, most get their limit first

Global limit only kicks in if:
- ALL 10,000 tenants make 100 req/min each
- That's 1,000,000 req/min cluster-wide
- Global limit of 10,000 req/min would block this
```

---

## Monitoring Rate Limits

### Metrics to Track

```python
# In your monitoring system

metrics = {
    "rate_limit.checks": COUNT,           # Total rate limit checks
    "rate_limit.allowed": COUNT,          # Passed checks
    "rate_limit.blocked": COUNT,          # Failed checks (429)
    "rate_limit.tenant_distribution": {   # How spread out is usage?
        "tenant_1": 95,  # Using 95/100
        "tenant_2": 50,  # Using 50/100
        "tenant_3": 5,   # Using 5/100
    },
    "rate_limit.violation_rate": PERCENT, # % of requests blocked
}
```

### Alerts to Set Up

```
ALERT RateLimitHighViolationRate
  IF (rate_limit.blocked / rate_limit.checks) > 0.05  # > 5% blocked
  FOR 5 minutes
  ACTION: Page on-call team

ALERT RateLimitSingleTenantDominance
  IF any tenant using > 80% of their limit consistently
  FOR 10 minutes
  ACTION: Check if legitimate spike or abuse

ALERT RateLimitGlobalApproach
  IF (global_requests_per_minute) > 9000  # Approaching 10k limit
  FOR 5 minutes
  ACTION: Check if coordinated spike or attack
```

---

## Adjusting Limits

### When to Increase Limits

1. **Growing user base**: More tenants need higher per-tenant limits
2. **Feature expansion**: New heavy features need more requests
3. **Seasonal peaks**: Month-end reporting needs burst capacity
4. **SLA requirements**: Premium customers need guaranteed throughput

### When to Decrease Limits

1. **Abuse detected**: Repeated DDoS attempts
2. **Resource constraints**: BigQuery slots running low
3. **Cost control**: Monthly spend exceeding budget
4. **Stability issues**: High error rates with high load

### Adjustment Process

```bash
# 1. Monitor current usage
grep "Rate limit exceeded" logs | wc -l  # How many 429s?

# 2. Test new limits in staging
export RATE_LIMIT_REQUESTS_PER_MINUTE=500  # Increase test
# Run load test, measure stability

# 3. Gradual production rollout
# Option A: Increase by 20% per day
#   Day 1: 100 → 120
#   Day 2: 120 → 144
#   Day 3: 144 → 173

# Option B: Increase for specific tenant tier
#   Premium tenants: 500 req/min
#   Standard tenants: 100 req/min

# 4. Monitor impact
# Track response times, error rates, costs

# 5. Adjust again if needed
```

---

## Quick Reference Card

```
ENDPOINTS RATE LIMITS:
┌──────────────────────────────────────────────────┐
│ Health checks (/health, /)         → Unlimited   │
│ Admin tenants (POST)               → 10 req/min  │
│ Pipeline execution (POST /run/*)   → 50 req/min  │
│ Standard operations (GET/POST)     → 100 req/min │
│ Global fallback                    → 10k req/min │
└──────────────────────────────────────────────────┘

MULTI-TENANT ISOLATION:
Each tenant has isolated counters:
  tenant:acme_1:minute   (separate from other tenants)
  tenant:acme_2:minute
  tenant:acme_3:minute

WINDOWS:
  Minute:  60 seconds (resets every 60s)
  Hour:    3600 seconds (resets every hour)

RESPONSE:
  Success:  200-299 (check X-RateLimit-Remaining header)
  Limited:  429 (check retry_after field)

DISABLE:
  export RATE_LIMIT_ENABLED=false
```
