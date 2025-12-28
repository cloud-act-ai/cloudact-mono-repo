---
name: quota-mgmt
description: |
  Quota management for CloudAct. Usage limits, enforcement, tracking, and alerts.
  Use when: configuring quotas, checking usage limits, enforcing quotas, understanding quota system,
  or debugging quota issues.
---

# Quota Management

## Overview
CloudAct enforces usage quotas per organization for API calls, pipeline runs, and data storage.

## Key Locations
- **Quota Schema:** `02-api-service/configs/setup/bootstrap/schemas/quotas.json`
- **Quota Router:** `02-api-service/src/app/routers/quotas.py`
- **Quota Tests:** `{service}/tests/test_quota.py`
- **Frontend Page:** `01-fronted-system/app/[orgSlug]/settings/quota-usage/`

## Quota Types
| Quota Type | Unit | Default Limit | Billing Cycle |
|------------|------|---------------|---------------|
| api_calls | requests | 10,000/hour | hourly |
| pipeline_runs | runs | 1,000/day | daily |
| data_storage | GB | 100 GB | monthly |
| data_export | exports | 100/day | daily |
| integrations | count | 10 | none |
| users | count | 50 | none |

## Quota Schema
```json
{
  "table_name": "org_usage_quotas",
  "schema": [
    {"name": "org_slug", "type": "STRING", "mode": "REQUIRED"},
    {"name": "quota_type", "type": "STRING", "mode": "REQUIRED"},
    {"name": "limit_value", "type": "INTEGER", "mode": "REQUIRED"},
    {"name": "current_usage", "type": "INTEGER", "mode": "NULLABLE"},
    {"name": "billing_cycle", "type": "STRING", "mode": "NULLABLE"},
    {"name": "reset_at", "type": "TIMESTAMP", "mode": "NULLABLE"},
    {"name": "created_at", "type": "TIMESTAMP", "mode": "REQUIRED"},
    {"name": "updated_at", "type": "TIMESTAMP", "mode": "REQUIRED"}
  ]
}
```

## Instructions

### 1. Check Org Quota Status
```bash
curl -s "http://localhost:8000/api/v1/quotas/{org_slug}" \
  -H "X-API-Key: {org_api_key}" | python3 -m json.tool
```

Response:
```json
{
  "org_slug": "acme_corp",
  "quotas": [
    {
      "type": "api_calls",
      "limit": 10000,
      "used": 4523,
      "remaining": 5477,
      "reset_at": "2024-01-15T00:00:00Z"
    },
    {
      "type": "pipeline_runs",
      "limit": 1000,
      "used": 156,
      "remaining": 844,
      "reset_at": "2024-01-15T00:00:00Z"
    }
  ]
}
```

### 2. Update Org Quota
```bash
curl -X PUT "http://localhost:8000/api/v1/quotas/{org_slug}" \
  -H "X-CA-Root-Key: {CA_ROOT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "quota_type": "api_calls",
    "limit_value": 50000
  }'
```

### 3. Query Quota Usage
```sql
SELECT
    org_slug,
    quota_type,
    limit_value,
    current_usage,
    ROUND(current_usage * 100.0 / limit_value, 2) as usage_percent,
    reset_at
FROM `organizations.org_usage_quotas`
WHERE org_slug = @org_slug  -- Always use parameterized queries
ORDER BY quota_type;
```

### 4. Check Near-Limit Orgs
```sql
SELECT
    org_slug,
    quota_type,
    limit_value,
    current_usage,
    ROUND(current_usage * 100.0 / limit_value, 2) as usage_percent
FROM `organizations.org_usage_quotas`
WHERE current_usage >= limit_value * 0.8  -- 80% threshold
ORDER BY usage_percent DESC;
```

### 5. Reset Quota Usage
```bash
# Manual reset (admin only)
curl -X POST "http://localhost:8000/api/v1/quotas/{org_slug}/reset" \
  -H "X-CA-Root-Key: {CA_ROOT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "quota_type": "api_calls"
  }'
```

## Quota Enforcement Logic
```python
# Middleware check
async def check_quota(org_slug: str, quota_type: str) -> bool:
    quota = await get_quota(org_slug, quota_type)

    if quota.current_usage >= quota.limit_value:
        raise HTTPException(
            429,
            f"Quota exceeded for {quota_type}. "
            f"Limit: {quota.limit_value}, Used: {quota.current_usage}"
        )

    return True

# Increment usage (always use parameterized queries)
async def increment_usage(org_slug: str, quota_type: str, amount: int = 1):
    await bq_client.query(
        """
        UPDATE `organizations.org_usage_quotas`
        SET current_usage = current_usage + @amount,
            updated_at = CURRENT_TIMESTAMP()
        WHERE org_slug = @org_slug
          AND quota_type = @quota_type
        """,
        parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("quota_type", "STRING", quota_type),
            bigquery.ScalarQueryParameter("amount", "INT64", amount),
        ]
    )
```

## Quota Reset Schedule
```python
# Cron-based reset
RESET_SCHEDULES = {
    "hourly": "0 * * * *",     # Every hour
    "daily": "0 0 * * *",       # Midnight daily
    "monthly": "0 0 1 * *",     # First of month
}

async def reset_expired_quotas():
    await bq_client.query("""
        UPDATE `organizations.org_usage_quotas`
        SET current_usage = 0,
            reset_at = TIMESTAMP_ADD(reset_at, INTERVAL 1 DAY)
        WHERE reset_at < CURRENT_TIMESTAMP()
          AND billing_cycle = 'daily'
    """)
```

## Frontend Quota Display
```tsx
// app/[orgSlug]/settings/quota-usage/page.tsx
export default function QuotaUsagePage({ params }: PageProps) {
  return (
    <div className="space-y-6">
      <h1>Quota Usage</h1>
      <QuotaCard
        type="API Calls"
        used={4523}
        limit={10000}
        resetAt="2024-01-15T00:00:00Z"
      />
      <QuotaCard
        type="Pipeline Runs"
        used={156}
        limit={1000}
        resetAt="2024-01-15T00:00:00Z"
      />
    </div>
  )
}
```

## Alert Thresholds
| Threshold | Action |
|-----------|--------|
| 50% | Info log |
| 80% | Warning notification |
| 90% | Email alert |
| 100% | Block + Critical alert |

## Quota by Subscription Plan
| Plan | API Calls | Pipelines | Storage |
|------|-----------|-----------|---------|
| Free | 1,000/hr | 100/day | 10 GB |
| Starter | 10,000/hr | 500/day | 50 GB |
| Pro | 50,000/hr | 2,000/day | 250 GB |
| Enterprise | Unlimited | Unlimited | 1 TB |

## Validation Checklist
- [ ] Quota types defined in schema
- [ ] Limits set per org
- [ ] Enforcement middleware active
- [ ] Reset schedule configured
- [ ] Alerts configured
- [ ] Frontend displays usage

## Common Issues
| Issue | Solution |
|-------|----------|
| 429 Too Many Requests | Quota exceeded, wait for reset |
| Quota not resetting | Check reset_at timestamp |
| Usage not incrementing | Check enforcement middleware |
| Wrong limits | Verify plan assignment |

## Example Prompts

```
# Checking Quotas
"What's our current quota usage?"
"Check API call limits for acme_corp"
"How many pipeline runs remaining?"

# Configuring Quotas
"Increase API quota for acme_corp"
"Set storage limit to 500GB"
"Configure custom quota limits"

# Enforcement
"Why am I getting 429 errors?"
"Quota exceeded - what now?"
"How does quota enforcement work?"

# Resetting
"Reset quota for testing"
"When do quotas reset?"
"Manual quota reset needed"

# Alerts
"Setup quota warning alerts"
"Get notified at 80% usage"
```

## Related Skills
- `bootstrap-onboard` - Initial quota setup
- `cost-analysis` - Cost-based quotas
- `security-audit` - Quota security
