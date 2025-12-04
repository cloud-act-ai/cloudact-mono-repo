# Backend Code Review Prompt

## Overview
Review FastAPI + BigQuery backend for **multi-tenant pipeline orchestration** patterns.

---

## Critical Rules

1. DO NOT change existing logic unless security vulnerability found
2. DO NOT add backward compatibility - this is a new system
3. DO NOT over-engineer - keep solutions simple
4. REVIEW IS MANDATORY - check every file mentioned
5. Focus on HARDENING, not refactoring
6. CA_ROOT_API_KEY is from environment variable by design - DO NOT encrypt

---

## Review Philosophy

**IDENTIFYING GAPS IS KEY - BUT NEVER OVERDO!**

| DO | DON'T |
|----|-------|
| Identify authentication bypass | Refactor working code |
| Flag SQL injection risks | Add "nice to have" features |
| Note missing parameterized queries | Restructure architecture |
| Report cross-tenant access risks | Add abstractions |
| Check quota enforcement gaps | Encrypt env-var API keys |

**What IS a gap:** Auth bypass, SQL injection, cross-tenant access, quota bypass, error exposure

**What is NOT a gap:** Code style, "better" BigQuery patterns, missing type hints, premature optimization

---

## Architecture Context

**API Key Hierarchy:**

| Key | Header | Purpose | Storage |
|-----|--------|---------|---------|
| CA_ROOT_API_KEY | X-CA-Root-Key | Bootstrap, onboarding, admin | Environment variable (NOT encrypted) |
| Org API Key | X-API-Key | Integrations, pipelines, data | SHA256 hash + KMS encrypted in BigQuery |

**Authentication Dependencies:**

| Dependency | Use For |
|------------|---------|
| `verify_admin_key` | Admin-only endpoints (/bootstrap, /onboard, /dryrun) |
| `get_current_org` | Org-scoped endpoints (integrations, pipelines) |
| `get_org_or_admin_auth` | Dual-auth endpoints (can use either key) |

---

## Scalability Focus (10K+ Parallel Users)

### BigQuery Best Practices

| Check | Requirement |
|-------|-------------|
| Parameterized queries | ALL user input via `@param`, arrays via `UNNEST(@array)` |
| Query limits | Auth: LIMIT 1, Lists: LIMIT 100, Logs: LIMIT 1000 |
| Batch writes | Use batch inserts, not single-row loops |
| Table partitioning | Date-partition high-volume tables (pipeline_runs, step_logs) |
| Query caching | Enable for repeated auth lookups |

**Gap examples:**
- String interpolation in SQL (f-string with user input)
- SELECT without LIMIT that could return 100K+ rows
- Single INSERT in a loop instead of batch

### Pipeline Execution

| Check | Requirement |
|-------|-------------|
| Concurrent limit | Enforce per-org limit from quotas table |
| Counter atomicity | Increment BEFORE pipeline, decrement in finally |
| Isolation | Each pipeline uses org's own credentials |
| No shared state | No instance variables between executions |
| Timeouts | Connect: 60s, Read: 300s |

**Gap examples:**
- Missing quota check allowing unlimited pipelines
- Counter increment AFTER pipeline (quota bypass)
- Shared credentials between orgs

### Multi-Tenant Isolation

| Check | Requirement |
|-------|-------------|
| org_slug validation | Regex + cross-org check on EVERY endpoint |
| Quota timing | Check BEFORE expensive operations |
| Rate limiting | Per-org, not just global |
| Credential scope | Decrypt only for current request, never cache |
| Dataset isolation | WHERE org_slug = @org_slug on ALL queries |

### Concurrent Handling

| Check | Requirement |
|-------|-------------|
| BigQuery client | Thread-safe singleton with lock |
| HTTP clients | Connection pooling with limits |
| Request context | No global state, use dependency injection |
| Graceful degradation | Return 429 with Retry-After header |

---

## Review Checklist

### 1. Endpoint Authentication (CRITICAL)

**Instructions:**
1. Open each router file
2. For EVERY endpoint, verify it has authentication dependency:
   - Admin endpoints: `Depends(verify_admin_key)`
   - Org endpoints: `Depends(get_current_org)` or `Depends(get_org_or_admin_auth)`
3. For org-scoped endpoints, verify org_slug from URL matches authenticated org

**Files to check:**
- `src/app/routers/organizations.py`
- `src/app/routers/integrations.py`
- `src/app/routers/pipelines.py`
- `src/app/routers/admin.py`

**Gap indicators:**
- Endpoint without any Depends() for auth
- org_slug from path used without verification against authenticated org
- Admin operation without verify_admin_key

---

### 2. SQL Injection Prevention (CRITICAL)

**Instructions:**
1. Search for all BigQuery query executions
2. For EACH query, verify:
   - User input uses `@param` syntax
   - Arrays use `UNNEST(@array_param)`
   - No f-string interpolation of user input
   - Table/dataset names validated with regex if dynamic

**Files to check:**
- `src/app/dependencies/auth.py`
- `src/app/routers/organizations.py`
- `src/core/processors/**/*.py`

**Gap indicators:**
- `f"... WHERE id = '{user_input}'"` (string interpolation)
- `", ".join(...)` for IN clause instead of UNNEST
- Dynamic table name without regex validation

---

### 3. Input Validation

**Instructions:**
1. Check all Pydantic models for:
   - Field length limits (min_length, max_length)
   - Format validators (@field_validator)
   - Extra fields rejected (extra = "forbid")
2. Verify org_slug validation: 3-64 chars, alphanumeric + underscore/hyphen, no path traversal

**Files to check:**
- `src/app/routers/organizations.py` - Request models
- `src/app/models/*.py` - Shared models

**Gap indicators:**
- Model without Field(...) constraints
- Missing field_validator for org_slug
- extra = "allow" or no extra config

---

### 4. Quota Management

**Instructions:**
1. Find pipeline execution endpoints
2. Verify `validate_quota` dependency runs BEFORE any pipeline logic
3. Verify quota checks include: daily limit, monthly limit, concurrent limit
4. Verify concurrent counter: increment before, decrement in finally

**Required quota checks:**

| Check | When |
|-------|------|
| Daily pipeline limit | Before pipeline starts |
| Monthly pipeline limit | Before pipeline starts |
| Concurrent pipeline limit | Before pipeline starts |
| Decrement concurrent | In finally block (always runs) |

**Gap indicators:**
- Quota check after pipeline starts
- No GREATEST(counter - 1, 0) protection on decrement
- Missing finally block for counter decrement

---

### 5. KMS Credential Handling

**Instructions:**
1. Find credential encryption/decryption calls
2. Verify decrypted credentials are:
   - Never logged
   - Never returned in API responses
   - Used immediately, not stored in variables
   - Not cached in instance variables

**Files to check:**
- `src/core/security/kms_encryption.py`
- `src/app/routers/integrations.py`

**Gap indicators:**
- `logger.info(f"Credentials: {decrypted}")`
- Decrypted value in response JSON
- Decrypted value assigned to self.credentials

---

### 6. Error Message Sanitization

**Instructions:**
1. Search for all HTTPException raises
2. Verify detail messages are generic, not exposing:
   - Exception messages (str(e))
   - Stack traces
   - Internal paths
   - Query details

**Standard error messages:**

| Status | Detail |
|--------|--------|
| 400 | "Invalid request format" |
| 401 | "Invalid or inactive API key" |
| 403 | "Cannot access another organization" |
| 404 | "Resource not found" |
| 429 | "Rate limit exceeded" |
| 500 | "Internal error. Check server logs." |

**Gap indicators:**
- `detail=f"Failed to X: {str(e)}"`
- Exception message in response
- Internal path exposed

---

### 7. Query Result Limits

**Instructions:**
1. Search for all SELECT queries
2. Verify EVERY query has LIMIT clause

**Standard limits:**

| Query Type | Limit |
|------------|-------|
| Auth lookups | LIMIT 1 |
| Integration queries | LIMIT 10 |
| Pipeline runs | LIMIT 100 |
| Step logs | LIMIT 1000 |

**Gap indicators:**
- SELECT * without LIMIT
- List query returning potentially unbounded results

---

### 8. Production Configuration

**Instructions:**
1. Open `src/app/main.py`
2. Verify startup validation for production environment

**Required production checks:**

| Setting | Requirement |
|---------|-------------|
| CA_ROOT_API_KEY | Present and >= 32 characters |
| DISABLE_AUTH | Must be false |
| RATE_LIMIT_ENABLED | Must be true |

---

### 9. Connection Timeouts

**Instructions:**
1. Find BigQuery client initialization
2. Verify timeout configuration

**Required timeouts:**

| Connection | Timeout |
|------------|---------|
| BigQuery connect | 60 seconds |
| BigQuery read | 300 seconds |
| HTTP clients | 30 seconds |
| KMS operations | 30 seconds |

---

## Output Format

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | X | Auth bypass, SQL injection |
| HIGH | X | Missing validation, info leak |
| MEDIUM | X | Missing limits, timeouts |
| LOW | X | Code style |

For each issue:
- **File:** src/path/to/file.py:LINE
- **Issue:** Description
- **Fix:** What needs to change (not code, just description)

## Recommended Actions
1. Fix CRITICAL issues - deploy blocked until resolved
2. Fix HIGH issues before production
3. Address MEDIUM issues in next sprint
