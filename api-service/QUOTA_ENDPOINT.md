# Quota Endpoint Documentation

## Overview

The quota endpoint provides current usage and limit information for pipeline executions.

## Endpoint

```
GET /api/v1/organizations/{org_slug}/quota
```

## Authentication

Accepts EITHER:
- **Organization API Key** (`X-API-Key` header) - Self-service access
- **Root API Key** (`X-CA-Root-Key` header) - Admin can access any org's quota

## Request

### URL Parameters
- `org_slug` (string, required): Organization identifier

### Headers
```http
X-API-Key: your_org_api_key_here
# OR
X-CA-Root-Key: your_root_api_key_here
```

## Response

### Success Response (200 OK)

```json
{
  "org_slug": "acme_corp",
  "pipelinesRunToday": 5,
  "dailyLimit": 10,
  "pipelinesRunMonth": 50,
  "monthlyLimit": 300,
  "concurrentRunning": 1,
  "concurrentLimit": 3,
  "usageDate": "2025-12-05",
  "dailyUsagePercent": 50.0,
  "monthlyUsagePercent": 16.67
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `org_slug` | string | Organization identifier |
| `pipelinesRunToday` | integer | Number of pipelines executed today |
| `dailyLimit` | integer | Maximum pipelines allowed per day |
| `pipelinesRunMonth` | integer | Number of pipelines executed this month |
| `monthlyLimit` | integer | Maximum pipelines allowed per month |
| `concurrentRunning` | integer | Number of currently running pipelines |
| `concurrentLimit` | integer | Maximum concurrent pipelines allowed |
| `usageDate` | string | Date of usage record (ISO 8601 format) |
| `dailyUsagePercent` | float | Percentage of daily quota used (0-100) |
| `monthlyUsagePercent` | float | Percentage of monthly quota used (0-100) |

## Error Responses

### 404 Not Found

Organization not found or has no subscription:

```json
{
  "detail": "Organization 'nonexistent_org' not found or has no subscription"
}
```

### 401 Unauthorized

Missing or invalid API key:

```json
{
  "detail": "Valid X-API-Key (org) or X-CA-Root-Key (root) header required."
}
```

### 403 Forbidden

Attempting to access another org's quota with org API key:

```json
{
  "detail": "Cannot access quota for another organization"
}
```

### 500 Internal Server Error

Server error (database failure, etc.):

```json
{
  "detail": "Failed to retrieve quota information. Please check server logs."
}
```

## Usage Examples

### cURL Example (with org API key)

```bash
curl -X GET "http://localhost:8000/api/v1/organizations/acme_corp/quota" \
  -H "X-API-Key: acme_corp_api_abc123xyz"
```

### cURL Example (with admin key)

```bash
curl -X GET "http://localhost:8000/api/v1/organizations/acme_corp/quota" \
  -H "X-CA-Root-Key: your-admin-key-here"
```

### Python Example

```python
import requests

# Using org API key
response = requests.get(
    "http://localhost:8000/api/v1/organizations/acme_corp/quota",
    headers={"X-API-Key": "acme_corp_api_abc123xyz"}
)

if response.status_code == 200:
    quota = response.json()
    print(f"Daily usage: {quota['pipelinesRunToday']}/{quota['dailyLimit']}")
    print(f"Monthly usage: {quota['pipelinesRunMonth']}/{quota['monthlyLimit']}")
    print(f"Concurrent: {quota['concurrentRunning']}/{quota['concurrentLimit']}")
else:
    print(f"Error: {response.json()['detail']}")
```

### TypeScript/JavaScript Example

```typescript
interface QuotaUsage {
  org_slug: string;
  pipelinesRunToday: number;
  dailyLimit: number;
  pipelinesRunMonth: number;
  monthlyLimit: number;
  concurrentRunning: number;
  concurrentLimit: number;
  usageDate?: string;
  dailyUsagePercent?: number;
  monthlyUsagePercent?: number;
}

async function getQuotaUsage(orgSlug: string, apiKey: string): Promise<QuotaUsage> {
  const response = await fetch(
    `http://localhost:8000/api/v1/organizations/${orgSlug}/quota`,
    {
      headers: {
        "X-API-Key": apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get quota: ${response.statusText}`);
  }

  return response.json();
}

// Usage
const quota = await getQuotaUsage("acme_corp", "acme_corp_api_abc123xyz");
console.log(`Daily: ${quota.pipelinesRunToday}/${quota.dailyLimit}`);
```

## Data Sources

The endpoint queries the following BigQuery tables:
- `organizations.org_subscriptions` - Subscription limits (source of truth)
- `organizations.org_usage_quotas` - Current usage tracking

Note: If no usage record exists for today (new org), defaults to 0 for all usage fields.

## Frontend Integration

This endpoint is used by the frontend's `getQuotaUsage()` server action in `actions/quota.ts`. The frontend expects this exact response format to display usage warnings and progress bars.

## Security Considerations

1. **Authorization**: Org API keys can only access their own org's quota. Admin keys can access any org.
2. **Rate Limiting**: Subject to global and per-org rate limits (configured in backend).
3. **Data Privacy**: Only quota/usage data is exposed; no sensitive credentials or personal information.

## Performance

- **Average latency**: ~50-100ms (single BigQuery query with LEFT JOIN)
- **Caching**: No caching (real-time data)
- **Scaling**: Scales with BigQuery query performance

## Related Endpoints

- `GET /api/v1/organizations/{org_slug}/subscription` - Get full subscription details
- `PUT /api/v1/organizations/{org_slug}/subscription` - Update subscription limits (admin only)
