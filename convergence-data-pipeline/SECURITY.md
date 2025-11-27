# Security Documentation

**Last Updated: 2025-11-26**

This document describes the security measures implemented in the Convergence Data Pipeline backend.

## Table of Contents

1. [Production Security Checklist](#production-security-checklist)
2. [Authentication & Authorization](#authentication--authorization)
3. [API Key Security](#api-key-security)
4. [Input Validation](#input-validation)
5. [Request Tracing](#request-tracing)
6. [Rate Limiting](#rate-limiting)
7. [Credential Management](#credential-management)
8. [Error Handling](#error-handling)
9. [CORS Configuration](#cors-configuration)
10. [Connection Management](#connection-management)

---

## Production Security Checklist

Before deploying to production, verify ALL items:

### Required Environment Variables

```bash
# Application will NOT start without these in production
ENVIRONMENT="production"
GCP_PROJECT_ID="your-project-id"
CA_ROOT_API_KEY="your-secure-admin-key"  # Minimum 32 characters recommended
```

### Security Settings

```bash
# These MUST be set correctly - startup will fail otherwise
DISABLE_AUTH="false"       # CANNOT be true in production
RATE_LIMIT_ENABLED="true"  # MUST be true in production
```

### KMS Configuration

```bash
# Required for credential encryption
KMS_PROJECT_ID="your-kms-project"
KMS_LOCATION="us-central1"
KMS_KEYRING="your-keyring"
KMS_KEY="your-key"
```

### Validation at Startup

The application validates security configuration at startup (`src/app/main.py:validate_production_config()`):

```python
def validate_production_config():
    if settings.environment != "production":
        return

    errors = []
    if not settings.ca_root_api_key:
        errors.append("CA_ROOT_API_KEY required")
    if settings.disable_auth:
        errors.append("DISABLE_AUTH must be false")
    if not settings.rate_limit_enabled:
        errors.append("RATE_LIMIT_ENABLED must be true")

    if errors:
        raise RuntimeError(f"Production config invalid: {errors}")
```

---

## Authentication & Authorization

### API Key Architecture

#### Key Types
| Key | Header | Used For |
|-----|--------|----------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, Org Onboarding |
| Org API Key | `X-API-Key` | Integrations, Pipelines, Data |

#### Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. BOOTSTRAP (One-time system setup)                           │
│  POST /api/v1/admin/bootstrap                                   │
│  Header: X-CA-Root-Key: {CA_ROOT_API_KEY}                       │
│                                                                 │
│  Creates centralized "organizations" dataset with meta tables:  │
│  └── org_api_keys, org_profiles, org_subscriptions, etc.        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. ONBOARD ORGANIZATION                                        │
│  POST /api/v1/organizations/onboard                             │
│  Header: X-CA-Root-Key: {CA_ROOT_API_KEY}                       │
│                                                                 │
│  Creates:                                                       │
│  ├── org_api_keys row (SHA256 hash + KMS encrypted key)        │
│  ├── org_profiles row (company info)                            │
│  ├── org_subscriptions row (plan limits)                        │
│  ├── org_usage_quotas row (initialized to 0)                    │
│  └── Dataset: {org_slug} (per-org data isolation)               │
│                                                                 │
│  Returns: api_key (shown ONCE, stored in frontend user metadata)│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. SETUP INTEGRATIONS                                          │
│  POST /api/v1/integrations/{org}/{provider}/setup               │
│  Header: X-API-Key: {org_api_key}                               │
│                                                                 │
│  Stores credentials (KMS encrypted) per org:                    │
│  ├── GCP Service Account JSON                                   │
│  ├── OpenAI API Key                                             │
│  ├── Anthropic API Key                                          │
│  └── DeepSeek API Key                                           │
│                                                                 │
│  Isolation: WHERE org_slug = @org_slug                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. RUN PIPELINES                                               │
│  POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}│
│  Header: X-API-Key: {org_api_key}                               │
│                                                                 │
│  Execution:                                                     │
│  1. Validate org API key → get org_slug                         │
│  2. Check quota: WHERE org_slug = @org_slug                     │
│  3. Get credentials: WHERE org_slug = @org_slug AND provider=X  │
│  4. KMS decrypt org's credentials                               │
│  5. Create BigQuery client with org's credentials               │
│  6. Execute pipeline                                            │
│  7. Write results to {project}.{org_slug}.{table}               │
│  8. Log execution: INSERT ... (org_slug, pipeline_id, ...)      │
└─────────────────────────────────────────────────────────────────┘
```

#### Multi-Tenant Isolation

**Single KMS Key for All Orgs** - Isolation is at DATA layer:

```sql
-- Credentials encrypted with shared KMS key
-- Isolation via org_slug filter in every query
SELECT encrypted_credential
FROM organizations.org_integration_credentials
WHERE org_slug = @org_slug  -- ← THIS provides isolation
  AND provider = 'GCP_SA'
```

**Concurrent Pipeline Execution (Org A + Org B):**
- Each request authenticated by unique org API key
- org_slug extracted from API key lookup
- Credentials fetched: WHERE org_slug = @org_slug
- Separate BigQuery client per execution
- Data writes to separate datasets: {org_slug}.*
- NO shared state between executions

### Authentication Flow Details

#### CA Root API Key Flow

```
Request with X-CA-Root-Key header
        │
        ▼
verify_admin_key() in auth.py
        │
        ▼
Hash provided key with SHA256
        │
        ▼
Hash expected key from env var
        │
        ▼
Compare using hmac.compare_digest() ← Constant-time comparison!
        │
        ▼
Grant/Deny access
```

#### Organization API Key Flow

```
Request with X-API-Key header
        │
        ▼
Hash provided key with SHA256
        │
        ▼
Query BigQuery for matching key_hash
        │
        ▼
Verify org subscription is active
        │
        ▼
Check quota limits
        │
        ▼
Return org context (org_slug, user_id, etc.)
```

---

## API Key Security

### Timing Attack Prevention

**File:** `src/app/dependencies/auth.py:1179-1194`

CA Root API key comparison uses constant-time comparison to prevent timing attacks:

```python
def _constant_time_compare(val1: str, val2: str) -> bool:
    """Compare strings in constant time to prevent timing attacks."""
    import hmac
    return hmac.compare_digest(val1.encode(), val2.encode())

async def verify_admin_key(x_ca_root_key: str = Header(...)):
    # Hash both keys before comparison
    provided_hash = hash_api_key(x_ca_root_key)
    expected_hash = hash_api_key(settings.ca_root_api_key)

    # Constant-time comparison
    if not _constant_time_compare(provided_hash, expected_hash):
        raise HTTPException(403, "Invalid CA Root API key")
```

**Why This Matters:**
- Standard string comparison (`==`) returns early on first mismatch
- Attackers can measure response time to guess characters
- `hmac.compare_digest()` takes the same time regardless of where mismatch occurs

### Key Storage

| Key Type | How Stored |
|----------|------------|
| CA Root API Key | Environment variable only (never persisted) |
| Org API Key | SHA256 hash stored in `org_api_keys` table |
| Provider Credentials | KMS encrypted in `org_integration_credentials` table |

---

## Input Validation

### Request Model Validation

**File:** `src/app/routers/pipelines.py:33-58`

Pipeline requests reject unknown fields:

```python
class TriggerPipelineRequest(BaseModel):
    trigger_by: Optional[str] = Field(default="api_user")
    date: Optional[str] = Field(default=None)
    start_date: Optional[str] = Field(default=None)
    end_date: Optional[str] = Field(default=None)
    force_refresh: Optional[bool] = Field(default=False)

    # SECURITY: Forbid unknown fields
    model_config = ConfigDict(extra="forbid")
```

This prevents injection of unexpected parameters.

### Middleware Validation

**File:** `src/app/middleware/validation.py`

All requests are validated for:
- Header size limits (8KB max)
- Request body size (10MB max)
- Organization slug format (alphanumeric, 3-64 chars)
- Path traversal attempts (`..`, `//`, `\`)
- NULL byte injection
- Dangerous header patterns (XSS, SQL injection)

### Integration Credential Validation

**File:** `src/app/routers/integrations.py:145-183`

GCP Service Account JSON is validated for:
- Valid JSON format
- Object type (not array or primitive)
- Required `type: "service_account"` field
- Required fields: `project_id`, `private_key`, `client_email`

---

## Request Tracing

### X-Request-ID Header

**File:** `src/app/middleware/validation.py:229-233`

Every request gets a unique ID for distributed tracing:

```python
# Generate or extract request ID
request_id = request.headers.get("x-request-id") or generate_request_id()

# Store in request state
request.state.request_id = request_id

# Add to response headers
response.headers["X-Request-ID"] = request_id
```

### Usage

```bash
# Make request
curl -X POST $BASE_URL/api/v1/pipelines/run/org/gcp/cost/billing \
  -H "X-API-Key: $API_KEY"

# Response includes X-Request-ID header
# Use for log correlation:
gcloud logging read "jsonPayload.request_id=550e8400-e29b-41d4-a716-446655440000"
```

---

## Rate Limiting

### Configuration

**File:** `src/core/utils/rate_limiter.py`

| Limit | Default | Scope |
|-------|---------|-------|
| Per-org per minute | 100 | Organization |
| Per-org per hour | 1000 | Organization |
| Global per minute | 10000 | All organizations |
| Global per hour | 100000 | All organizations |
| Pipeline runs per minute | 50 | Per organization |

### Time Constants

```python
SECONDS_PER_MINUTE = 60
SECONDS_PER_HOUR = 3600
MINUTE_WINDOW_SECONDS = 60
HOUR_WINDOW_SECONDS = 3600
ENTRY_COALESCE_SECONDS = 1
```

### Limitations

Current rate limiting uses in-memory storage, which:
- Works for single-instance deployments
- Does NOT work for multi-instance (Cloud Run with multiple replicas)
- For distributed deployments, implement Redis-backed rate limiting

---

## Credential Management

### Encryption

All provider credentials are encrypted using GCP KMS:

```
Plaintext credential
        │
        ▼
KMS Encrypt (AES-256-GCM)
        │
        ▼
Base64 encode
        │
        ▼
Store in BigQuery (org_integration_credentials table)
```

### Decryption Flow

```
Read encrypted credential from BigQuery
        │
        ▼
Base64 decode
        │
        ▼
KMS Decrypt
        │
        ▼
Use for API call
        │
        ▼
Clear from memory (not persisted in logs)
```

---

## Error Handling

### Pipeline Failure Tracking

**File:** `src/app/routers/pipelines.py:87-144`

Background pipeline failures are tracked in BigQuery:

```python
async def run_async_pipeline_task(executor, parameters):
    try:
        result = await executor.execute(parameters)
        return result
    except Exception as e:
        # Update status to FAILED in BigQuery
        update_query = """
        UPDATE `{project}.organizations.org_meta_pipeline_runs`
        SET status = 'FAILED',
            end_time = CURRENT_TIMESTAMP(),
            error_message = @error_message
        WHERE pipeline_logging_id = @pipeline_logging_id
        """
        # Execute update...
        return None  # Don't re-raise
```

### Query Failed Pipelines

```sql
SELECT
  pipeline_logging_id,
  pipeline_id,
  org_slug,
  status,
  error_message,
  start_time,
  end_time
FROM `{project}.organizations.org_meta_pipeline_runs`
WHERE status = 'FAILED'
ORDER BY start_time DESC;
```

---

## CORS Configuration

### Default Settings

**File:** `src/app/config.py:69-76`

```python
cors_allow_methods: List[str] = [
    "GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"
]
cors_allow_headers: List[str] = [
    "Content-Type", "Authorization", "X-API-Key",
    "X-CA-Root-Key", "X-User-ID", "X-Request-ID"
]
```

### Production Configuration

Override via environment variable:

```bash
export CORS_ORIGINS='["https://your-frontend.com", "https://app.your-domain.com"]'
```

---

## Connection Management

### BigQuery Client

**File:** `src/core/engine/bq_client.py:195-212`

Connection pool settings:

| Setting | Value | Description |
|---------|-------|-------------|
| pool_connections | 500 | Number of connection pools |
| pool_maxsize | 500 | Max connections per pool |
| max_retries | 3 | Retry failed requests |
| pool_block | False | Don't block if pool full |
| connection_timeout | 60s | Time to establish connection |
| read_timeout | 300s | Time to read response |

### Graceful Shutdown

**File:** `src/app/main.py:229-247`

On shutdown:
1. Stop auth metrics aggregator background task
2. Flush pending auth metrics with 10s timeout
3. Shutdown BigQuery thread pool executor
4. Complete graceful shutdown

```python
# Flush with timeout
await asyncio.wait_for(
    auth_aggregator.flush_updates(bq_client),
    timeout=10.0
)

# Shutdown thread pool
BQ_EXECUTOR.shutdown(wait=False)
```

---

## Security Contact

For security vulnerabilities, please contact the security team immediately.

Do NOT create public issues for security vulnerabilities.
