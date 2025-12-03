# GCP API Extractor

## Overview

The GCP API Extractor (`gcp.api_extractor`) extracts data from any GCP REST API using Service Account OAuth2 authentication. It uses the shared `GCPAuthenticator` from the same folder for credential management.

**ps_type:** `gcp.api_extractor`

**Location:** `src/core/processors/gcp/gcp_api_extractor.py`

```
┌────────────────────────────────────────────────────────────────────────┐
│                    GCP API EXTRACTOR FLOW                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   org_integration_credentials (provider: GCP_SA)                       │
│      │                                                                 │
│      ▼                                                                 │
│   ┌─────────────────────┐                                              │
│   │ GCPAuthenticator    │  Shared class in gcp/ folder                 │
│   │ (authenticator.py)  │  - Decrypts SA JSON via KMS                  │
│   └─────────┬───────────┘  - Creates OAuth2 credentials                │
│             │                                                          │
│             ▼                                                          │
│   ┌─────────────────────┐                                              │
│   │ get_access_token()  │  OAuth2 Bearer token                         │
│   │                     │  Auto-refresh on expiry                      │
│   └─────────┬───────────┘                                              │
│             │                                                          │
│             ▼                                                          │
│   ┌─────────────────────┐                                              │
│   │ GcpApiExtractor     │  Processor                                   │
│   │ (gcp_api_extractor) │  - nextPageToken pagination                  │
│   └─────────┬───────────┘  - Rate limiting                             │
│             │              - Batch insert to BQ                        │
│             ▼                                                          │
│   ┌─────────────────────┐                                              │
│   │ BigQuery            │  Raw data landing zone                       │
│   │ {org}_prod.table    │  ELT: Transform later via SQL                │
│   └─────────────────────┘                                              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ELT Pattern

This processor follows the **ELT** (Extract-Load-Transform) pattern:

1. **Extract**: Fetch data from GCP REST APIs
2. **Load**: Store raw JSON in BigQuery (`raw_data` column)
3. **Transform**: Use SQL views/queries to transform data

**Why ELT?**
- Raw data preserved for debugging
- Schema changes don't break ingestion
- Transformation logic in SQL (easier to modify)
- Supports late schema discovery

---

## Authentication

Uses `GCPAuthenticator` from the same folder:

```python
from .authenticator import GCPAuthenticator

auth = GCPAuthenticator(org_slug)
token = await auth.get_access_token()
# Token auto-refreshes on 401
```

**Credential Flow:**
1. Query `org_integration_credentials` for `provider=GCP_SA`
2. Decrypt Service Account JSON via KMS
3. Create OAuth2 credentials
4. Generate Bearer token for REST API calls

---

## Configuration

### Basic Structure

```yaml
steps:
  - step_id: "extract_resources"
    ps_type: "gcp.api_extractor"
    config:
      # URL (choose one)
      api: "cloudbilling.googleapis.com"
      endpoint: "/v1/billingAccounts"
      # OR full URL:
      # url: "https://cloudbilling.googleapis.com/v1/billingAccounts"

      method: "GET"  # GET, POST

      params:                          # Query parameters
        filter: "some_filter"

      pagination:
        page_size: 100                 # Items per page
        page_size_param: "pageSize"    # Query param name
        token_param: "pageToken"       # Token query param
        response_path: "nextPageToken" # Path in response JSON

      data_path: "billingAccounts"     # JSON path to array

      destination:
        table: "gcp_billing_accounts_raw"
        batch_size: 1000
        key_fields:                    # For idempotent inserts
          - "name"

      rate_limit:
        requests_per_second: 10
        max_retries: 3

      transform:
        flatten: false                 # false = ELT (raw JSON)
        add_fields:                    # Additional fields
          source: "billing_api"
```

### API Shorthand

Common GCP APIs have shorthand names:

| Shorthand | Full Host |
|-----------|-----------|
| `billing` | `cloudbilling.googleapis.com` |
| `compute` | `compute.googleapis.com` |
| `storage` | `storage.googleapis.com` |
| `monitoring` | `monitoring.googleapis.com` |
| `iam` | `iam.googleapis.com` |
| `cloudresourcemanager` | `cloudresourcemanager.googleapis.com` |
| `bigquery` | `bigquery.googleapis.com` |

```yaml
# These are equivalent:
api: "billing"
api: "cloudbilling.googleapis.com"
```

### Variable Substitution

Variables can be used in URLs and params:

| Variable | Source |
|----------|--------|
| `{project_id}` | Service Account's GCP project |
| `{gcp_project_id}` | Same as above |
| `{org_slug}` | Organization slug from context |
| Any context variable | From pipeline context |

```yaml
endpoint: "/v1/projects/{project_id}/billingInfo"
# Resolved to: /v1/projects/my-gcp-project/billingInfo
```

---

## Examples

### 1. Cloud Billing Accounts

```yaml
# configs/gcp/billing/accounts.yml
pipeline_id: "{org_slug}-gcp-billing-accounts"
name: "GCP Billing Accounts"
description: "Extract billing account information"

steps:
  - step_id: "extract_billing_accounts"
    ps_type: "gcp.api_extractor"
    config:
      api: "billing"
      endpoint: "/v1/billingAccounts"
      pagination:
        page_size: 50
      data_path: "billingAccounts"
      destination:
        table: "gcp_billing_accounts_raw"
        batch_size: 100
```

### 2. Compute Instances (All Zones)

```yaml
# configs/gcp/compute/instances.yml
pipeline_id: "{org_slug}-gcp-compute-instances"
name: "GCP Compute Instances"

steps:
  - step_id: "extract_instances"
    ps_type: "gcp.api_extractor"
    config:
      api: "compute"
      endpoint: "/compute/v1/projects/{project_id}/aggregated/instances"
      pagination:
        page_size: 500
      data_path: "items"  # Returns nested dict by zone
      destination:
        table: "gcp_compute_instances_raw"
        batch_size: 1000
```

### 3. Cloud Monitoring Metrics

```yaml
# configs/gcp/monitoring/cpu_metrics.yml
pipeline_id: "{org_slug}-gcp-cpu-metrics"
name: "GCP CPU Metrics"

steps:
  - step_id: "extract_cpu_metrics"
    ps_type: "gcp.api_extractor"
    config:
      api: "monitoring"
      endpoint: "/v3/projects/{project_id}/timeSeries"
      params:
        filter: 'metric.type="compute.googleapis.com/instance/cpu/utilization"'
        interval.startTime: "{start_time}"
        interval.endTime: "{end_time}"
      pagination:
        page_size: 10000
      data_path: "timeSeries"
      destination:
        table: "gcp_cpu_metrics_raw"
```

### 4. IAM Service Accounts

```yaml
# configs/gcp/iam/service_accounts.yml
pipeline_id: "{org_slug}-gcp-service-accounts"
name: "GCP Service Accounts"

steps:
  - step_id: "extract_service_accounts"
    ps_type: "gcp.api_extractor"
    config:
      api: "iam"
      endpoint: "/v1/projects/{project_id}/serviceAccounts"
      pagination:
        page_size: 100
      data_path: "accounts"
      destination:
        table: "gcp_service_accounts_raw"
```

---

## GCP Pagination

All GCP REST APIs use the `nextPageToken` pattern:

**Request:**
```
GET /v1/resource?pageSize=100&pageToken=xxx
```

**Response:**
```json
{
  "items": [...],
  "nextPageToken": "yyy"
}
```

The processor automatically handles:
- Fetching all pages
- Token parameter naming
- Empty page detection
- Max page limit (10,000 pages safety)

---

## Rate Limiting

GCP APIs have rate limits. The processor includes:

- **Requests per second**: Configurable (default: 10 RPS)
- **Exponential backoff**: On 429/5xx errors
- **Retry-After header**: Respected when present
- **Max retries**: Configurable (default: 3)

```yaml
rate_limit:
  requests_per_second: 5   # Conservative for shared quotas
  max_retries: 5           # More retries for important data
```

---

## Output Schema (ELT Default)

When `transform.flatten: false` (default), rows are stored as:

| Column | Type | Description |
|--------|------|-------------|
| `org_slug` | STRING | Organization identifier |
| `raw_data` | STRING | JSON-encoded API response item |
| `extracted_at` | TIMESTAMP | Extraction timestamp (UTC) |
| `gcp_project_id` | STRING | Source GCP project |

**Transform via SQL:**
```sql
-- Extract fields from raw JSON
SELECT
  org_slug,
  JSON_VALUE(raw_data, '$.name') AS billing_account_name,
  JSON_VALUE(raw_data, '$.displayName') AS display_name,
  JSON_VALUE(raw_data, '$.open') AS is_open,
  extracted_at
FROM `project.dataset.gcp_billing_accounts_raw`
WHERE DATE(extracted_at) = CURRENT_DATE()
```

---

## Flattened Output (Optional)

For simpler schemas, use `transform.flatten: true`:

```yaml
transform:
  flatten: true
  add_fields:
    pipeline_version: "1.0"
```

Output includes all API fields plus:
- `org_slug`
- `extracted_at`
- `gcp_project_id`
- Any `add_fields`

---

## Comparison: GCP vs Generic API Extractor

| Feature | `gcp.api_extractor` | `generic.api_extractor` |
|---------|---------------------|-------------------------|
| **Auth** | GCP Service Account OAuth2 | Multiple (bearer, header, query, basic, oauth2) |
| **Credential Source** | `GCP_SA` provider only | Any provider in org_integration_credentials |
| **Auth Class** | `GCPAuthenticator` (same folder) | Self-contained resolution |
| **Pagination** | GCP `nextPageToken` | cursor, offset, page, link |
| **Token Refresh** | Auto via google-auth | Manual |
| **URL Building** | `api` + `endpoint` shorthand | Full URL required |
| **Project ID** | Auto from SA credentials | N/A |

**When to use which:**
- **GCP APIs**: Use `gcp.api_extractor` (simpler config, auto project ID)
- **Third-party APIs**: Use `generic.api_extractor`

---

## Error Handling

The processor handles:

| Error | Handling |
|-------|----------|
| 401 Unauthorized | Auto-refresh token, retry |
| 429 Rate Limited | Exponential backoff, respect Retry-After |
| 500/502/503/504 | Retry with backoff |
| Connection errors | Retry with backoff |
| Empty pages | Stop pagination |
| Invalid JSON | Fail with error |

---

## Prerequisites

1. **GCP Service Account** stored in `org_integration_credentials`:
   - Provider: `GCP_SA`
   - Validation status: `VALID`

2. **Required IAM Permissions** on SA:
   - API-specific read permissions (varies by API)
   - Example for Billing: `billing.accounts.list`
   - Example for Compute: `compute.instances.list`

3. **API Enabled** in GCP project:
   - Cloud Billing API
   - Compute Engine API
   - etc.

---

## Troubleshooting

### "No valid GCP credentials found"
- Check `org_integration_credentials` has `provider=GCP_SA` with `validation_status=VALID`

### 403 Forbidden
- Service Account lacks required permissions
- Check IAM roles in GCP Console

### 404 Not Found
- Incorrect endpoint path
- Project ID doesn't match SA's project

### Rate limit exceeded
- Reduce `requests_per_second` in config
- Increase `max_retries`

---

## Related Documentation

- [Generic API Extractor](API_EXTRACTOR.md) - Multi-provider API extraction
- [GCP Authenticator](../src/core/processors/gcp/authenticator.py) - Shared GCP auth
- [Scheduler](SCHEDULER.md) - Pipeline scheduling

---

**Last Updated:** 2025-12-02
