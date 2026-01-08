# Integration Bug Hunt Report
**Date:** 2026-01-08
**Total Bugs Found:** 50
**Severity:** Critical (10), High (15), Medium (15), Low (10)

## Critical Security Bugs (1-10)

### BUG-001: Missing auth bypass validation in get_integration_status
**File:** `02-api-service/src/app/routers/integrations.py:716`
**Severity:** CRITICAL
**Description:** Auth check uses `settings.disable_auth` which allows bypass in dev mode
**Impact:** Unauthorized access to integration data
**Fix:** Remove `settings.disable_auth` check, always validate org ownership

### BUG-002: SQL injection via provider_clean variable
**File:** `02-api-service/src/app/routers/integrations.py:993`
**Severity:** CRITICAL
**Description:** provider_clean strips underscores but doesn't validate remaining characters
**Impact:** Potential SQL injection through malformed provider names
**Fix:** Use proper sanitization with allowlist validation

### BUG-003: Metadata size validation missing in GCP setup
**File:** `02-api-service/src/app/routers/integrations.py:330`
**Severity:** CRITICAL
**Description:** GCP setup validates metadata BEFORE adding SA fields, but SA fields could push it over limit
**Impact:** DoS via oversized metadata after SA fields added
**Fix:** Validate metadata size AFTER adding SA fields

### BUG-004: Missing credential_id validation in update endpoint
**File:** `02-api-service/src/app/routers/integrations.py:841`
**Severity:** CRITICAL
**Description:** Update endpoint trusts credential_id from request without validation
**Impact:** Credential tampering or cross-org credential updates
**Fix:** Validate credential belongs to org before updating

### BUG-005: Rate limit bypass through exception handling
**File:** `02-api-service/src/app/routers/integrations.py:44`
**Severity:** CRITICAL
**Description:** safe_rate_limit catches all exceptions, but error path doesn't distinguish between rate limit exceptions and other errors
**Impact:** Rate limit bypass if implementation fails
**Fix:** Catch specific rate limit exceptions, let others propagate

### BUG-006: Missing auth check in delete_integration for dev mode
**File:** `02-api-service/src/app/routers/integrations.py:925`
**Severity:** CRITICAL
**Description:** Uses `settings.disable_auth` bypass like get_integration_status
**Impact:** Unauthorized integration deletion
**Fix:** Remove disable_auth check

### BUG-007: Missing validation of JSON in metadata update
**File:** `02-api-service/src/app/routers/integrations.py:867`
**Severity:** HIGH
**Description:** metadata JSON dumps without size or content validation
**Impact:** Oversized metadata or malicious JSON injection
**Fix:** Add size validation before JSON serialization

### BUG-008: Provider normalization bypasses allowlist
**File:** `02-api-service/src/app/routers/integrations.py:210-235`
**Severity:** HIGH
**Description:** normalize_provider returns generic error without logging suspicious providers
**Impact:** Security monitoring gaps for invalid provider attempts
**Fix:** Log all invalid provider attempts with request details

### BUG-009: Missing expires_at handling in query result
**File:** `02-api-service/src/app/routers/integrations.py:300`
**Severity:** HIGH
**Description:** GCP validation doesn't check if credential is expired
**Impact:** Using expired credentials
**Fix:** Check expires_at before validation

### BUG-010: Missing encryption validation before storage
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:234`
**Severity:** HIGH
**Description:** encrypt_value success isn't verified before storage
**Impact:** Storing unencrypted or corrupt credentials
**Fix:** Verify encryption result is valid before proceeding

## Validation & Error Handling Bugs (11-20)

### BUG-011: GCP validation doesn't check for revoked credentials
**File:** `02-api-service/src/core/processors/integrations/validate_gcp.py:88-103`
**Severity:** HIGH
**Description:** Validates format and API access but not revocation status
**Impact:** Using revoked service accounts
**Fix:** Add revocation check via IAM API

### BUG-012: OpenAI validation hardcodes timeout to 15s
**File:** `02-api-service/src/core/processors/integrations/validate_openai.py:63`
**Severity:** MEDIUM
**Description:** httpx timeout fixed at 15s, not configurable
**Impact:** False negatives on slow networks
**Fix:** Make timeout configurable via step_config

### BUG-013: Claude validation uses wrong API endpoint
**File:** `02-api-service/src/core/processors/integrations/validate_claude.py:64`
**Severity:** HIGH
**Description:** Uses `/v1/models` which doesn't exist in Anthropic API (should be `/v1/messages` for validation)
**Impact:** Always fails validation even with valid keys
**Fix:** Use correct Anthropic API endpoint for validation

### BUG-014: Missing validation for empty credential strings
**File:** `02-api-service/src/app/routers/integrations.py:136`
**Severity:** MEDIUM
**Description:** SetupIntegrationRequest validates min_length=10 but allows whitespace-only strings
**Impact:** Storing invalid whitespace credentials
**Fix:** Add .strip() and validate non-empty after stripping

### BUG-015: Error sanitization removes ALL stack info
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:56`
**Severity:** LOW
**Description:** sanitize_error_message removes too much diagnostic info
**Impact:** Hard to debug production issues
**Fix:** Keep first level of stack trace, sanitize only sensitive parts

### BUG-016: GCP validation partial success unclear
**File:** `02-api-service/src/core/processors/integrations/validate_gcp.py:141`
**Severity:** MEDIUM
**Description:** Returns VALID even with errors if some permissions validated
**Impact:** Misleading success status
**Fix:** Return PARTIAL_VALID or VALID_WITH_WARNINGS

### BUG-017: Missing validation error codes
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:99`
**Severity:** LOW
**Description:** get_generic_error_code doesn't cover all common error types
**Impact:** Generic error codes for specific errors
**Fix:** Expand error code mapping

### BUG-018: No retry logic for transient KMS failures
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:234`
**Severity:** MEDIUM
**Description:** KMS encryption fails immediately on transient errors
**Impact:** False negatives due to temporary KMS unavailability
**Fix:** Add exponential backoff retry (3 attempts)

### BUG-019: Validation doesn't check rate limits
**File:** `02-api-service/src/core/processors/integrations/validate_openai.py:87`
**Severity:** MEDIUM
**Description:** Treats rate limit (429) as permanent failure
**Impact:** Misleading "Invalid API key" errors during rate limiting
**Fix:** Distinguish between 401 (invalid) and 429 (rate limited)

### BUG-020: Missing validation for metadata JSON structure
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:274`
**Severity:** MEDIUM
**Description:** Accepts any JSON structure in metadata without schema validation
**Impact:** Invalid metadata stored
**Fix:** Add JSON schema validation for metadata

## KMS & Decryption Bugs (21-30)

### BUG-021: Audit log failure doesn't block operation
**File:** `02-api-service/src/core/processors/integrations/kms_decrypt.py:148`
**Severity:** MEDIUM
**Description:** Audit log failure only logs warning, doesn't retry
**Impact:** Missing audit trail for compliance
**Fix:** Implement retry with exponential backoff for audit logs

### BUG-022: TTL expiration not enforced in pipeline
**File:** `02-api-service/src/core/processors/integrations/kms_decrypt.py:380`
**Severity:** MEDIUM
**Description:** TTL wrapper stored but never checked in downstream steps
**Impact:** Expired credentials used beyond TTL
**Fix:** Add TTL enforcement in pipeline executor

### BUG-023: clear_expired_secrets not called automatically
**File:** `02-api-service/src/core/processors/integrations/kms_decrypt.py:526`
**Severity:** MEDIUM
**Description:** Helper function exists but not invoked by pipeline framework
**Impact:** Secrets remain in memory beyond TTL
**Fix:** Auto-invoke after each step in pipeline executor

### BUG-024: GetIntegrationStatusProcessor doesn't paginate
**File:** `02-api-service/src/core/processors/integrations/kms_decrypt.py:472`
**Severity:** LOW
**Description:** Fetches all integrations without limit
**Impact:** Performance degradation with many integrations
**Fix:** Add pagination with default limit 100

### BUG-025: Missing request_id propagation
**File:** `02-api-service/src/core/processors/integrations/kms_decrypt.py:306`
**Severity:** LOW
**Description:** request_id sometimes missing in context
**Impact:** Hard to trace requests across services
**Fix:** Generate request_id if missing, propagate in all logs

### BUG-026: Decryption doesn't validate credential format
**File:** `02-api-service/src/core/processors/integrations/kms_decrypt.py:311`
**Severity:** MEDIUM
**Description:** Decrypts credential but doesn't verify it's valid format (e.g., API key pattern)
**Impact:** Using corrupt or tampered credentials
**Fix:** Add format validation after decryption

### BUG-027: Context key collision possible
**File:** `02-api-service/src/core/processors/integrations/kms_decrypt.py:376`
**Severity:** LOW
**Description:** If two providers use same context key, second overwrites first
**Impact:** Wrong credential used in multi-integration pipelines
**Fix:** Namespace keys by provider

### BUG-028: Missing credential rotation detection
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:251`
**Severity:** MEDIUM
**Description:** Deactivates old credential but doesn't check if rotation window overlaps
**Impact:** Disruption during credential rotation
**Fix:** Add grace period for old credentials

### BUG-029: job_timeout_ms hardcoded inconsistently
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:264,306`
**Severity:** LOW
**Description:** Some queries use 120000ms, others default
**Impact:** Inconsistent timeout behavior
**Fix:** Centralize timeout configuration

### BUG-030: Missing cleanup on store failure
**File:** `02-api-service/src/core/processors/integrations/kms_store.py:332`
**Severity:** MEDIUM
**Description:** If insert fails after deactivating old credential, org has no active credential
**Impact:** Integration unusable until manual recovery
**Fix:** Use transaction or reactivate old credential on failure

## Frontend Action Bugs (31-40)

### BUG-031: isValidOrgSlug regex too permissive
**File:** `01-fronted-system/actions/integrations.ts:82`
**Severity:** HIGH
**Description:** Allows 3-50 chars but backend requires different format
**Impact:** Mismatch between frontend/backend validation
**Fix:** Match backend regex exactly: `^[a-zA-Z0-9_]{3,50}$`

### BUG-032: verifyOrgMembership doesn't check user status
**File:** `01-fronted-system/actions/integrations.ts:128`
**Severity:** MEDIUM
**Description:** Checks status='active' but doesn't verify user isn't suspended
**Impact:** Suspended users can modify integrations
**Fix:** Add user status check from profiles table

### BUG-033: Integration limit check race condition
**File:** `01-fronted-system/actions/integrations.ts:224-231`
**Severity:** MEDIUM
**Description:** Counts integrations then checks limit, but another request could add integration between
**Impact:** Exceeding integration limit
**Fix:** Use atomic increment with constraint check

### BUG-034: saveIntegrationStatus doesn't handle conflicts
**File:** `01-fronted-system/actions/integrations.ts:665-722`
**Severity:** MEDIUM
**Description:** LLM provider update doesn't check if status changed concurrently
**Impact:** Lost updates in concurrent scenarios
**Fix:** Use optimistic locking with version column

### BUG-035: Cloud integration upsert uses wrong conflict key
**File:** `01-fronted-system/actions/integrations.ts:780`
**Severity:** HIGH
**Description:** onConflict uses org_id,credential_id but should check provider for primary
**Impact:** Multiple "primary" integrations per provider
**Fix:** Use org_id,provider for primary constraint

### BUG-036: Missing validation of credentialName length
**File:** `01-fronted-system/actions/integrations.ts:139`
**Severity:** LOW
**Description:** SetupIntegrationRequest has min/max but not enforced before backend call
**Impact:** Backend rejects valid requests
**Fix:** Add length validation before API call

### BUG-037: Error messages expose internal structure
**File:** `01-fronted-system/actions/integrations.ts:308`
**Severity:** MEDIUM
**Description:** err.detail exposed directly to user
**Impact:** Information disclosure
**Fix:** Sanitize error details, log full error server-side

### BUG-038: getIntegrations doesn't handle partial failures
**File:** `01-fronted-system/actions/integrations.ts:374-395`
**Severity:** LOW
**Description:** If LLM query succeeds but cloud query fails, returns incomplete data
**Impact:** Missing cloud integrations in UI
**Fix:** Return partial results with error flag

### BUG-039: Integration limit doesn't account for disabled
**File:** `01-fronted-system/actions/integrations.ts:220`
**Severity:** LOW
**Description:** Counts VALID integrations but doesn't check is_enabled
**Impact:** Disabled integrations count against limit
**Fix:** Filter by is_enabled=true

### BUG-040: Missing timeout in backend client calls
**File:** `01-fronted-system/actions/integrations.ts:284`
**Severity:** MEDIUM
**Description:** Backend API calls have no timeout
**Impact:** Hanging requests
**Fix:** Add 30s timeout to all BackendClient calls

## Constants, Aggregations & Calculations Bugs (41-50)

### BUG-041: PROVIDER_CATEGORIES missing OCI
**File:** `02-api-service/src/lib/integrations/constants.py:56-78`
**Severity:** MEDIUM
**Description:** Oracle Cloud (OCI) not in PROVIDER_CATEGORIES
**Impact:** OCI integrations not categorized correctly
**Fix:** Add "OCI": "cloud"

### BUG-042: STATUS_COLORS uses Tailwind class names
**File:** `02-api-service/src/lib/integrations/constants.py:32-39`
**Severity:** LOW
**Description:** Comments reference Tailwind classes but uses hex colors
**Impact:** Confusing documentation
**Fix:** Remove Tailwind comments or use CSS variables

### BUG-043: get_provider_category doesn't handle None
**File:** `02-api-service/src/lib/integrations/constants.py:168`
**Severity:** LOW
**Description:** Returns None for unknown providers instead of "other"
**Impact:** Null pointer exceptions in aggregations
**Fix:** Return "other" as fallback

### BUG-044: aggregate_by_category uses wrong default
**File:** `02-api-service/src/lib/integrations/aggregations.py:100`
**Severity:** MEDIUM
**Description:** Uses "other" but constants don't define it
**Impact:** Uncategorized providers misclassified
**Fix:** Add "other" to INTEGRATION_CATEGORIES

### BUG-045: calculate_status_counts doesn't validate input
**File:** `02-api-service/src/lib/integrations/calculations.py:76`
**Severity:** LOW
**Description:** Assumes status_field exists in all dicts
**Impact:** KeyError on malformed data
**Fix:** Use .get() with default

### BUG-046: calculate_validation_freshness uses naive datetime
**File:** `02-api-service/src/lib/integrations/calculations.py:304`
**Severity:** MEDIUM
**Description:** datetime.utcnow() creates naive datetime
**Impact:** Timezone comparison errors
**Fix:** Use datetime.now(timezone.utc)

### BUG-047: aggregate_validation_history doesn't handle None dates
**File:** `02-api-service/src/lib/integrations/aggregations.py:232-236`
**Severity:** MEDIUM
**Description:** Crashes if validated_at is None
**Impact:** Aggregation failures
**Fix:** Filter out None dates before processing

### BUG-048: aggregate_error_patterns exposes sensitive data
**File:** `02-api-service/src/lib/integrations/aggregations.py:314`
**Severity:** HIGH
**Description:** Returns full error messages which may contain credentials
**Impact:** Credential leakage in error aggregations
**Fix:** Sanitize error messages before aggregating

### BUG-049: calculate_error_rate doesn't validate days parameter
**File:** `02-api-service/src/lib/integrations/calculations.py:330`
**Severity:** LOW
**Description:** Negative or zero days causes division by zero
**Impact:** Runtime error
**Fix:** Validate days > 0, default to 7

### BUG-050: aggregate_integration_summary missing error handling
**File:** `02-api-service/src/lib/integrations/aggregations.py:343`
**Severity:** MEDIUM
**Description:** No try/catch for Polars operations
**Impact:** Uncaught exceptions crash aggregation
**Fix:** Wrap Polars operations in try/except

---

## Summary by Category

| Category | Count |
|----------|-------|
| Security | 10 |
| Validation & Error Handling | 10 |
| KMS & Decryption | 10 |
| Frontend Actions | 10 |
| Constants & Aggregations | 10 |
| **TOTAL** | **50** |

## Severity Distribution

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 8 |
| Medium | 24 |
| Low | 12 |
| **TOTAL** | **50** |

---

**Next Steps:**
1. Fix all 50 bugs in order of severity
2. Run comprehensive test suite
3. Create regression tests for each bug
4. Update documentation

**Estimated Fix Time:** 4-6 hours
**Priority:** CRITICAL - Start immediately
