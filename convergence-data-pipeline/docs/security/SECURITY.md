# Security Documentation

Multi-tenant security implementation for Convergence Data Pipeline.

**Version:** 1.0.0 | **Last Updated:** 2025-11-17

---

## 1. Authentication

### API Key Authentication

**Implementation:** `src/app/dependencies/auth.py`

**How It Works:**
1. Client sends API key via `X-API-Key` header
2. SHA256 hash used for database lookup
3. Query `tenants.tenant_api_keys` for tenant_id
4. Return authenticated tenant context

**Code Example:**
```python
# Hash API key
api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

# Query auth table
SELECT tenant_id, api_key_id, is_active, expires_at
FROM tenants.tenant_api_keys
WHERE api_key_hash = @api_key_hash AND is_active = TRUE
```

**Storage Schema:** `tenants.tenant_api_keys`
- `api_key_hash` (STRING) - SHA256 hash for lookup
- `encrypted_api_key` (BYTES) - KMS encrypted full key
- `tenant_id` (STRING) - Foreign key to tenant_profiles
- `is_active` (BOOL) - Key status
- `expires_at` (TIMESTAMP) - Expiration date

**Performance:** Batched `last_used_at` updates reduce auth latency from 50-100ms to <5ms

**Test Mode:** Set `DISABLE_AUTH=true` or `ENABLE_DEV_MODE=true` to use test keys from `test_api_keys.json`

---

## 2. Authorization

### Tenant-Based Access Control

**Function:** `get_current_customer()` in `src/app/dependencies/auth.py`

**Scope-Based Permissions:**
```python
scopes = ["pipelines:read", "pipelines:write", "pipelines:delete", "admin:tenants"]
```

**Subscription Validation:** `validate_subscription()`
- Checks subscription status (ACTIVE, TRIAL, EXPIRED)
- Validates trial expiration date
- Validates subscription end date
- Returns 402/403 if invalid

**Quota Enforcement:** `validate_quota()`
- Daily pipeline limit (e.g., 6, 25, 100 per day)
- Monthly pipeline limit
- Concurrent execution limit (e.g., 3 concurrent pipelines)
- Returns 429 if exceeded

**Quota Table:** `tenants.tenant_usage_quotas`

---

## 3. Data Isolation

### Per-Tenant BigQuery Datasets

**Implementation:** `src/core/engine/bq_client.py`

**Naming Convention:**
```python
# Tenant: acme123
# Datasets:
acme123_raw_openai       # Raw data
acme123_silver_cost      # Processed data
acme123_gold_analytics   # Analytics

# Format: {tenant_id}_{dataset_type}
```

**Isolation Guarantees:**
1. No cross-tenant access (queries filtered by tenant_id)
2. BigQuery IAM policies per dataset
3. Service account has owner access, external users have none
4. All queries authenticated via API

**Metadata Isolation:**
- Centralized: `tenants` dataset (shared, filtered by tenant_id)
  - Contains: tenant_api_keys, tenant_profiles, tenant_subscriptions, tenant_usage_quotas, tenant_cloud_credentials, tenant_pipeline_runs (centralized)
- Per-tenant: `{tenant_id}` dataset (fully isolated)
  - Contains: tenant_step_logs, tenant_dq_results, operational data tables

---

## 4. User Tracking

### X-User-ID Header

**Purpose:** Audit trail for user actions (NOT for authentication)

**Usage:**
```bash
curl -H "X-API-Key: tenant-key" \
     -H "X-User-ID: user@example.com" \
     https://api.example.com/pipelines/run/cost
```

**Stored In:**
- `tenants.tenant_pipeline_runs` - User who triggered pipeline (centralized for all tenants)
- `{tenant_id}.tenant_step_logs` - User context for logs
- `{tenant_id}.tenant_dq_results` - User who ran DQ checks

**Note:** Authentication is via API key only. `user_id` is for logging/auditing.

---

## 5. KMS Encryption

### Google Cloud KMS

**Implementation:** `src/core/security/kms_encryption.py`

**What's Encrypted:**
1. API keys (`tenant_api_keys.encrypted_api_key`)
2. Cloud credentials (`tenant_cloud_credentials.encrypted_credentials`)
3. Sensitive configuration values

**Configuration:**
```bash
# Option 1: Full key name (recommended)
GCP_KMS_KEY_NAME="projects/gac-prod-471220/locations/us-central1/keyRings/convergence-keyring/cryptoKeys/convergence-encryption-key"

# Option 2: Components
KMS_PROJECT_ID=gac-prod-471220
KMS_LOCATION=us-central1
KMS_KEYRING=convergence-keyring
KMS_KEY=convergence-encryption-key
```

**Encryption/Decryption:**
```python
from src.core.security.kms_encryption import encrypt_value, decrypt_value

# Encrypt
encrypted_bytes = encrypt_value("plaintext-secret")

# Decrypt
plaintext = decrypt_value(encrypted_bytes)
```

**Key Rotation:** Manual process (create new key version, re-encrypt data, deactivate old key)

---

## 6. Secrets Management

### Environment Variables

**Production:** Use GCP Secret Manager
```bash
# Store secret
gcloud secrets create api-key-secret --data-file=./secret.txt

# Grant access
gcloud secrets add-iam-policy-binding api-key-secret \
  --member="serviceAccount:pipeline@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Service Account:** Set via `GOOGLE_APPLICATION_CREDENTIALS` environment variable

**Required Permissions:**
- `roles/bigquery.admin` - BigQuery operations
- `roles/cloudkms.cryptoKeyEncrypterDecrypter` - KMS encrypt/decrypt
- `roles/secretmanager.secretAccessor` - Secret Manager access

**Admin API Key:** Set `ADMIN_API_KEY` environment variable (32+ random characters)
```bash
export ADMIN_API_KEY=$(openssl rand -hex 32)
```

---

## 7. Rate Limiting

### Implementation

**Files:** `src/core/utils/rate_limiter.py`, `src/app/dependencies/rate_limit_decorator.py`

**Per-Tenant Limits:**
```python
rate_limiter = RateLimiter(
    default_limit_per_minute=100,     # 100 req/min per tenant
    default_limit_per_hour=1000,      # 1000 req/hour per tenant
    global_limit_per_minute=10000,    # 10k req/min globally
    global_limit_per_hour=100000      # 100k req/hour globally
)
```

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1700235600
```

**Storage:**
- Development: In-memory (not distributed)
- Production: Use Redis for multi-instance deployments

**Error Response:** 429 Too Many Requests with `Retry-After` header

---

## 8. Input Validation

### Middleware Validation

**Implementation:** `src/app/middleware/validation.py`

**Validated Inputs:**
1. **Tenant ID:** `^[a-zA-Z0-9_-]{3,64}$` (prevents SQL injection, path traversal)
2. **Request Size:** Max 10 MB request, 8 KB headers, 4 KB per header
3. **Header Safety:** Blocks XSS, SQL injection, path traversal patterns
4. **Date Format:** `YYYY-MM-DD` (2000-2100 range)
5. **NULL Bytes:** Rejects `\x00` in all inputs

**Blocked Patterns:**
- `<script>`, `javascript:`, `on\w+=` (XSS)
- `../`, `//`, `\` (path traversal)
- `;DROP`, `;DELETE`, `;INSERT` (SQL injection)

---

## 9. Threat Model

### Mitigated Threats

| Threat | Mitigation |
|--------|-----------|
| SQL Injection | Parameterized queries, input validation |
| XSS | Header validation, CSP headers |
| Path Traversal | Tenant ID regex validation |
| Unauthorized Access | API key auth, tenant isolation |
| Data Leakage | Per-tenant datasets, IAM policies |
| Credential Theft | KMS encryption, SHA256 hashing |
| Rate Limit Bypass | Tenant-aware rate limiting |
| MITM Attacks | HTTPS enforcement, HSTS headers |

### Residual Risks

1. **Distributed Rate Limiting:** In-memory store not suitable for multi-instance (use Redis)
2. **KMS Key Rotation:** Manual process (implement automated rotation)
3. **API Key Revocation:** No real-time revocation (implement Redis-based revocation list)

---

## 10. Security Checklist

### Pre-Production

- [ ] Set `DISABLE_AUTH=false` in production
- [ ] Configure KMS encryption for API keys
- [ ] Set unique `ADMIN_API_KEY` (32+ character random)
- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Configure CORS for production domains only
- [ ] Set up BigQuery IAM policies per tenant
- [ ] Enable GCP audit logging
- [ ] Test rate limiting under load
- [ ] Review service account permissions

### Monitoring

- [ ] Monitor failed authentication attempts
- [ ] Track rate limit violations per tenant
- [ ] Alert on quota exceeded events
- [ ] Log KMS decryption failures
- [ ] Monitor BigQuery access patterns
- [ ] Review API key usage patterns

---

**Security Contact:** security@example.com | **Escalation:** CTO | **Response Time:** 24 hours
