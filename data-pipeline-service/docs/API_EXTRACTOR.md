# Generic API Extractor Architecture

## Overview

The Generic API Extractor implements an **ELT (Extract-Load-Transform)** pattern for any REST API. It's designed for high-volume data extraction with memory efficiency and resilience.

**File:** `src/core/processors/generic/api_extractor.py`

**ps_type:** `generic.api_extractor`

---

## Core Concept: Stream & Batch

Instead of loading all data into memory, the processor functions as a **pipeline within a pipeline**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         STREAM & BATCH FLOW                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────┐                                                          │
│   │  REST API   │                                                          │
│   └──────┬──────┘                                                          │
│          │                                                                 │
│          ▼                                                                 │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐  │
│   │ 1. Fetch Page N  │ ──► │ 2. Yield Rows    │ ──► │ 3. Buffer Batch  │  │
│   │    (HTTP GET)    │     │    (Generator)   │     │    (1000 rows)   │  │
│   └──────────────────┘     └──────────────────┘     └────────┬─────────┘  │
│                                                               │            │
│                                                               ▼            │
│                                                    ┌──────────────────┐   │
│                                                    │ 4. Insert to BQ  │   │
│                                                    │    (Smart Mode)  │   │
│                                                    └────────┬─────────┘   │
│                                                               │            │
│                                                               ▼            │
│                                                    ┌──────────────────┐   │
│                                                    │ 5. Clear Buffer  │   │
│                                                    │    REPEAT        │   │
│                                                    └──────────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Why This Wins

| Benefit | Description |
|---------|-------------|
| **Memory Safe** | Only holds ~1000 rows in memory at a time |
| **Simple** | Single processor handles everything - no complex state management |
| **Resilient** | Partial data saved. If fails at row 9000, rows 1-8000 are already in BigQuery |
| **Idempotent** | Uses insertId for streaming inserts, preventing duplicates on retry |

---

## Architecture

### Authentication Layer Integration

The API Extractor integrates with the existing authentication infrastructure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL RESOLUTION                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Priority Order:                                                        │
│                                                                          │
│   1. context["secrets"][provider]                                        │
│      └── From prior kms_decrypt step in pipeline                         │
│      └── Already decrypted, ready to use                                 │
│                                                                          │
│   2. org_integration_credentials table → KMS decrypt                     │
│      └── Direct query: SELECT encrypted_credential                       │
│      └── WHERE org_slug = @org_slug AND provider = @provider             │
│      └── Decrypt via KMS: decrypt_value(encrypted_credential)            │
│                                                                          │
│   3. context["secrets"][secret_key]                                      │
│      └── Direct key reference for simple cases                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Authentication Types

| Type | Implementation | Header/Param |
|------|----------------|--------------|
| `bearer` | `Authorization: Bearer {token}` | Most common for OAuth2, API tokens |
| `header` | Custom header name | `X-API-Key: {key}` or custom |
| `query` | Query parameter | `?api_key={key}` |
| `basic` | Base64 encoded | `Authorization: Basic {user:pass}` |
| `oauth2` | Bearer token (future: refresh) | `Authorization: Bearer {token}` |

### Pagination Strategies

| Type | Description | Example Response |
|------|-------------|------------------|
| `cursor` | Token-based, most APIs | `{"data": [...], "meta": {"next_cursor": "abc123"}}` |
| `offset` | Numeric offset | `?offset=100&limit=100` |
| `page` | Page number | `?page=2&per_page=100` |
| `link` | URL in response/header | `{"next": "https://api.com/v1/users?page=2"}` |
| `none` | Single request | No pagination |

---

## Configuration Reference

### Full Configuration Schema

```yaml
- step: "extract_data"
  processor: "generic.api_extractor"
  config:
    # ═══════════════════════════════════════════════════════════════════════
    # REQUIRED
    # ═══════════════════════════════════════════════════════════════════════
    url: "https://api.vendor.com/v1/resource"

    destination:
      table: "vendor_data_raw"           # Target BigQuery table name

    # ═══════════════════════════════════════════════════════════════════════
    # AUTHENTICATION (choose one approach)
    # ═══════════════════════════════════════════════════════════════════════
    auth:
      # Option 1: Provider-based (recommended)
      type: "bearer"                     # bearer | header | query | basic | oauth2
      provider: "VENDOR_API"             # Provider name in org_integration_credentials

      # Option 2: Direct secret key reference
      # secret_key: "vendor_api_key"     # Key in context["secrets"]

      # For header auth type:
      # header_name: "X-Custom-Auth"     # Default: "X-API-Key"

      # For query auth type:
      # param_name: "api_key"            # Default: "api_key"

    # ═══════════════════════════════════════════════════════════════════════
    # PAGINATION (optional, default: none)
    # ═══════════════════════════════════════════════════════════════════════
    pagination:
      type: "cursor"                     # cursor | offset | page | link | none
      param: "after"                     # Query param name for cursor/offset/page
      response_path: "meta.next_cursor"  # JSON path to find next cursor/link
      limit: 100                         # Page size
      limit_param: "limit"               # Query param name for page size

    # ═══════════════════════════════════════════════════════════════════════
    # DATA EXTRACTION
    # ═══════════════════════════════════════════════════════════════════════
    method: "GET"                        # HTTP method (default: GET)
    data_path: "data"                    # JSON path to array of records
    timeout: 60                          # Request timeout in seconds

    # Additional query parameters
    params:
      include: "metadata"
      status: "{status}"                 # Variables resolved from context

    # Additional headers
    headers:
      Accept: "application/json"
      X-Request-ID: "{request_id}"

    # ═══════════════════════════════════════════════════════════════════════
    # DESTINATION & BATCHING
    # ═══════════════════════════════════════════════════════════════════════
    destination:
      table: "vendor_data_raw"           # Target table name
      batch_size: 1000                   # Rows per batch insert (default: 1000)
      key_fields:                        # Fields for idempotent insertId
        - "id"
        - "updated_at"

    # ═══════════════════════════════════════════════════════════════════════
    # RATE LIMITING
    # ═══════════════════════════════════════════════════════════════════════
    rate_limit:
      requests_per_second: 10            # Max RPS (default: 10)
      retry_on_429: true                 # Auto-retry on rate limit (default: true)
      max_retries: 3                     # Max retry attempts (default: 3)

    # ═══════════════════════════════════════════════════════════════════════
    # TRANSFORMATION (optional)
    # ═══════════════════════════════════════════════════════════════════════
    transform:
      flatten: false                     # Store raw JSON or flatten fields
      add_fields:                        # Additional fields to add
        source: "vendor_api"
        org_slug: "{org_slug}"
        extracted_at: "{now}"
```

---

## Implementation Details

### 1. Credential Resolution

The processor resolves credentials in priority order:

```python
async def _resolve_credential(self, auth_config, context, org_slug):
    provider = auth_config.get("provider", "").upper()
    secret_key = auth_config.get("secret_key")

    # 1. Check context["secrets"] (from prior kms_decrypt step)
    secrets = context.get("secrets", {})
    if provider:
        for key in [provider.lower(), f"{provider.lower()}_api_key"]:
            if key in secrets:
                return extract_api_key(secrets[key])

    # 2. Query org_integration_credentials directly
    if provider:
        return await self._fetch_credential_from_bq(org_slug, provider)

    # 3. Direct secret_key reference
    if secret_key and secret_key in secrets:
        return secrets[secret_key]
```

### 2. The Generator (Streaming)

```python
async def _fetch_pages(self, config, headers, params, context):
    """Generator that fetches and yields pages of data."""

    async with httpx.AsyncClient(timeout=60) as client:
        has_more = True
        cursor = None

        while has_more:
            # Rate limiting
            await self._rate_limit()

            # Build params with pagination
            current_params = self._build_params(params, pagination, cursor)

            # Make request with retry
            response = await self._make_request_with_retry(
                client, method, url, headers, current_params
            )

            data = response.json()

            # Yield rows immediately (don't accumulate)
            rows = get_nested_value(data, data_path, [])
            if rows:
                yield rows

            # Get next cursor
            cursor = get_nested_value(data, response_path)
            has_more = bool(cursor)
```

### 3. The Execution Loop (Batching)

```python
async def execute(self, step_config, context):
    # ... setup ...
    buffer = []
    total_rows = 0

    async for page_rows in self._fetch_pages(...):
        # Transform rows
        transformed = self._transform_rows(page_rows, ...)
        buffer.extend(transformed)

        # Flush if buffer is full
        while len(buffer) >= batch_size:
            batch = buffer[:batch_size]
            buffer = buffer[batch_size:]

            result = await self._flush_to_bq(batch, ...)
            total_rows += result.rows_inserted

    # Flush remaining
    if buffer:
        result = await self._flush_to_bq(buffer, ...)
        total_rows += result.rows_inserted

    return {"status": "SUCCESS", "rows_extracted": total_rows}
```

### 4. Smart Insert to BigQuery

Uses `insert_rows_smart()` from `bq_helpers.py`:

```python
async def _flush_to_bq(self, bq_client, table_id, rows, org_slug, key_fields, context):
    """
    Smart insert:
    - <100 rows: Streaming insert with idempotent insertId
    - >=100 rows: Batch load (more efficient)
    """
    return await insert_rows_smart(
        bq_client=bq_client,
        table_id=table_id,
        rows=rows,
        org_slug=org_slug,
        key_fields=key_fields,
        write_disposition="WRITE_APPEND"
    )
```

---

## Handling API Limits

### Rate Limiting

```python
# Configurable via rate_limit section
rate_limit:
  requests_per_second: 10    # Max 10 requests/second
  retry_on_429: true         # Auto-retry on 429 Too Many Requests
  max_retries: 3             # Max retry attempts
```

The processor implements:
- **Request throttling**: Enforces minimum delay between requests
- **429 handling**: Reads `Retry-After` header or uses exponential backoff
- **Exponential backoff**: 2^attempt seconds delay on server errors (500, 502, 503, 504)

### Retry Logic

```python
async def _make_request_with_retry(self, client, method, url, headers, params):
    attempt = 0
    while attempt <= max_retries:
        response = await client.request(method, url, headers=headers, params=params)

        if response.status_code == 429:
            # Rate limited - wait and retry
            retry_after = response.headers.get("Retry-After", 2 ** attempt)
            await asyncio.sleep(int(retry_after))
            attempt += 1
            continue

        if response.status_code in {500, 502, 503, 504}:
            # Server error - exponential backoff
            await asyncio.sleep(2 ** attempt)
            attempt += 1
            continue

        return response
```

---

## Data Storage Format

### Default (ELT Pattern)

By default, rows are wrapped in a standard format:

```json
{
  "org_slug": "acme",
  "raw_data": "{\"id\": 123, \"name\": \"John\", ...}",
  "extracted_at": "2024-01-01T00:00:00Z"
}
```

This supports the ELT pattern where transformation happens via SQL in BigQuery.

### Flattened Mode

With `transform.flatten: true`, fields are stored directly:

```json
{
  "org_slug": "acme",
  "id": 123,
  "name": "John",
  "email": "john@example.com",
  "extracted_at": "2024-01-01T00:00:00Z"
}
```

---

## Example Pipelines

### Example 1: Simple Cursor Pagination

```yaml
# configs/hubspot/contacts_extract.yml
pipeline_id: hubspot-contacts-extract
steps:
  - step: "extract_contacts"
    processor: "generic.api_extractor"
    config:
      url: "https://api.hubspot.com/crm/v3/objects/contacts"
      auth:
        type: "bearer"
        provider: "HUBSPOT"
      pagination:
        type: "cursor"
        param: "after"
        response_path: "paging.next.after"
        limit: 100
      data_path: "results"
      destination:
        table: "hubspot_contacts_raw"
        batch_size: 1000
```

### Example 2: Offset Pagination with Rate Limiting

```yaml
# configs/stripe/transactions_extract.yml
pipeline_id: stripe-transactions-extract
steps:
  - step: "extract_transactions"
    processor: "generic.api_extractor"
    config:
      url: "https://api.stripe.com/v1/balance_transactions"
      auth:
        type: "bearer"
        provider: "STRIPE"
      pagination:
        type: "cursor"
        param: "starting_after"
        response_path: "data.-1.id"  # Last item's ID
        limit: 100
        limit_param: "limit"
      data_path: "data"
      params:
        created[gte]: "{start_date_unix}"
        created[lte]: "{end_date_unix}"
      destination:
        table: "stripe_transactions_raw"
      rate_limit:
        requests_per_second: 25
        retry_on_429: true
```

### Example 3: Link Pagination (GitHub API)

```yaml
# configs/github/repos_extract.yml
pipeline_id: github-repos-extract
steps:
  - step: "extract_repos"
    processor: "generic.api_extractor"
    config:
      url: "https://api.github.com/orgs/{org_name}/repos"
      auth:
        type: "bearer"
        provider: "GITHUB"
      pagination:
        type: "link"
        response_path: ""  # Use Link header
        limit: 100
        limit_param: "per_page"
      data_path: ""  # Root is array
      headers:
        Accept: "application/vnd.github+json"
      destination:
        table: "github_repos_raw"
```

### Example 4: With Prior KMS Decrypt Step

```yaml
# configs/vendor/full_pipeline.yml
pipeline_id: vendor-data-pipeline
steps:
  # Step 1: Decrypt credentials first
  - step: "decrypt_credentials"
    processor: "integrations.kms_decrypt"
    config:
      provider: "VENDOR_API"
      context_key: "vendor_api_key"

  # Step 2: Extract data (uses decrypted credential from context)
  - step: "extract_data"
    processor: "generic.api_extractor"
    config:
      url: "https://api.vendor.com/v1/data"
      auth:
        type: "bearer"
        provider: "VENDOR_API"  # Will find in context["secrets"]
      pagination:
        type: "cursor"
        param: "cursor"
        response_path: "next_cursor"
      data_path: "items"
      destination:
        table: "vendor_data_raw"

  # Step 3: Transform via SQL
  - step: "transform_data"
    processor: "generic.local_bq_transformer"
    config:
      sql_template: |
        SELECT
          org_slug,
          JSON_EXTRACT_SCALAR(raw_data, '$.id') as id,
          JSON_EXTRACT_SCALAR(raw_data, '$.name') as name,
          TIMESTAMP(JSON_EXTRACT_SCALAR(raw_data, '$.created_at')) as created_at,
          extracted_at
        FROM `{project}.{dataset}.vendor_data_raw`
        WHERE DATE(extracted_at) = '{date}'
      destination_table: "vendor_data_transformed"
```

---

## Best Practices

### 1. Always Use Key Fields for Idempotency

```yaml
destination:
  table: "my_table"
  key_fields:
    - "id"
    - "updated_at"  # Include timestamp for changed records
```

### 2. Set Appropriate Batch Size

| Scenario | Batch Size |
|----------|------------|
| Small records | 1000 (default) |
| Large records (>10KB each) | 100-500 |
| Memory constrained | 500 |

### 3. Handle Pagination Limits

The processor stops at 10,000 pages as a safety measure. For larger datasets:
- Use date-based filters to partition requests
- Run multiple pipelines with different date ranges

### 4. Use Transform for SQL Processing

Store raw data first (ELT), then transform via SQL:

```yaml
# Step 1: Extract raw
- step: "extract"
  processor: "generic.api_extractor"
  config:
    destination:
      table: "raw_data"

# Step 2: Transform via SQL
- step: "transform"
  processor: "generic.local_bq_transformer"
  config:
    sql_template: |
      SELECT
        JSON_EXTRACT_SCALAR(raw_data, '$.field') as field
      FROM `{project}.{dataset}.raw_data`
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Failed to resolve credential` | Provider not in org_integration_credentials | Setup integration first via `/integrations/{org}/{provider}/setup` |
| `API Error 401` | Invalid/expired credential | Re-validate via `/integrations/{org}/{provider}/validate` |
| `API Error 429` | Rate limited | Reduce `requests_per_second`, enable `retry_on_429` |
| `Batch insert failed` | Schema mismatch | Check table schema matches extracted data |
| Empty extraction | Wrong `data_path` | Verify JSON path to array in API response |

### Debug Mode

Enable debug logging to see request details:

```python
import logging
logging.getLogger("src.core.processors.generic.api_extractor").setLevel(logging.DEBUG)
```

---

## Related Documentation

- **CLAUDE.md**: Pipeline architecture overview
- **SCHEDULER.md**: Scheduled pipeline execution
- **bq_helpers.py**: BigQuery insert utilities
- **kms_decrypt.py**: Credential decryption processor

---

**Last Updated:** 2025-12-02
