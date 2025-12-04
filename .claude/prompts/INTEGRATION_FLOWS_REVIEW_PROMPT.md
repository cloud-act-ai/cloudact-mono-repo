# Integration Flows Code Review Prompt

## Overview
Review **end-to-end integration flows** between Frontend (Next.js + Supabase + Stripe) and Backend (FastAPI + BigQuery) for multi-tenant pipeline orchestration.

---

## Critical Rules

1. DO NOT change existing logic unless security vulnerability found
2. DO NOT add backward compatibility - this is a new system
3. DO NOT over-engineer - keep solutions simple
4. REVIEW IS MANDATORY - check every flow mentioned
5. Focus on HARDENING, not refactoring

---

## Review Philosophy

**IDENTIFYING GAPS IS KEY - BUT NEVER OVERDO!**

| DO | DON'T |
|----|-------|
| Identify cross-system security gaps | Add new integration patterns |
| Flag API key exposure risks | Restructure flow architecture |
| Note data sync inconsistencies | Add observability unless critical |
| Report timeout/retry gaps | Create wrapper abstractions |
| Check error handling at boundaries | Add retry logic everywhere |

**What IS a gap:** API key exposed to client, missing auth, orphaned records, quota bypass, unverified webhooks

**What is NOT a gap:** "More elegant" patterns, additional logging, non-critical retries, caching optimizations

---

## Customer Lifecycle Flow

| Step | System | Action |
|------|--------|--------|
| 1. Signup | Frontend | Supabase Auth creates user |
| 2. Onboard | Frontend → Backend | POST /organizations/onboard (X-CA-Root-Key) |
| 3. Subscribe | Frontend → Stripe | Create checkout session |
| 4. Webhook | Stripe → Frontend | Subscription status sync |
| 5. Tier Sync | Frontend → Backend | Update org tier for quotas |
| 6. Integration | Frontend → Backend | POST /integrations/{org}/{provider}/setup |
| 7. Pipeline | Frontend → Backend | POST /pipelines/run/{org}/{provider}/{domain}/{pipeline} |

---

## Scalability Focus (10K+ Parallel Users)

### Cross-System Consistency

| Check | Requirement |
|-------|-------------|
| Idempotency | Same request with same ID = same result |
| Event deduplication | Track webhook event IDs, process each once |
| Eventual consistency | Retry failed syncs with exponential backoff |
| Orphan detection | Flag records that exist in one system but not other |

### API Key Flow

| Check | Requirement |
|-------|-------------|
| Caching | Cache key validation with 5min TTL |
| Hash comparison | Use constant-time comparison (hmac.compare_digest) |
| Key rotation | Support overlapping keys during rotation (24h grace) |
| Rate limiting | Limit per API key, return 429 with Retry-After |

### Stripe ↔ Supabase ↔ Backend Sync

| Check | Requirement |
|-------|-------------|
| Signature first | Verify webhook signature before any processing |
| Idempotent updates | Upsert by stripe_subscription_id, not org_id |
| Atomic tier sync | Supabase + Backend update together or flag for retry |
| Single source | Stripe is truth, Supabase caches, Backend enforces |

### Pipeline Flow

| Check | Requirement |
|-------|-------------|
| Quota at entry | Check before any pipeline logic |
| Polling backoff | 1s, 2s, 4s, 8s, 15s, 30s... max 5min |
| Layer timeouts | Frontend: 30s, Backend: 60s connect/300s read |
| Status on failure | Always update to FAILED in finally block |

### Request Tracing

| Check | Requirement |
|-------|-------------|
| X-Request-ID | Frontend generates, backend extracts or generates |
| Correlation | Include request_id, org_slug, run_id in all logs |
| Safe errors | User sees generic message, logs have full context |

---

## Review Checklist

### 1. API Key Flow (CRITICAL)

**Instructions:**
1. Search frontend for X-API-Key header usage
2. Verify API key is NEVER in client-side code (only server actions)
3. Verify API key is retrieved server-side, never passed as prop
4. Check key storage - should be encrypted or server-only

**Files to check:**
- `actions/backend.ts` - Backend API calls
- `lib/backend-client.ts` - API client
- `app/[orgSlug]/settings/api-keys/page.tsx` - Key display

**Gap indicators:**
- API key in props passed to client component
- API key in localStorage or sessionStorage
- fetch() with X-API-Key in client-side code
- API key in console.log or debugger

---

### 2. Onboarding Flow (CRITICAL)

**Instructions:**
1. Trace org creation from signup to backend
2. Verify CA_ROOT_API_KEY is server-side only
3. Check for rollback on partial failure
4. Verify API key shown once, then stored securely

**Flow verification:**

| Step | Check |
|------|-------|
| Supabase user created | Handled by Supabase Auth |
| Backend org created | Uses CA_ROOT_API_KEY (server-side) |
| API key returned | Shown once to user |
| Supabase org record | Created with hash of API key |
| Stripe customer | Created with org_slug metadata |

**Gap indicators:**
- CA_ROOT_API_KEY accessible in client
- No error handling if backend call fails after Supabase user created
- API key stored in plaintext in Supabase
- Missing org_slug validation before onboarding

---

### 3. Stripe Webhook Flow (CRITICAL)

**Instructions:**
1. Open `app/api/webhooks/stripe/route.ts`
2. Verify signature verification is FIRST operation
3. Check for event ID tracking (prevent duplicate processing)
4. Verify customer ID to org mapping validation

**Flow verification:**

| Step | Check |
|------|-------|
| Signature verify | Before any processing |
| Content-type check | Reject non-application/json |
| Event ID check | Skip if already processed |
| Customer lookup | Verify org exists for customer ID |
| Subscription update | Upsert by subscription_id |
| Backend tier sync | Update backend with new tier |

**Gap indicators:**
- Any code before signature verification
- No event ID tracking table/check
- Customer lookup without handling missing org
- Tier sync without retry on failure

---

### 4. Integration Setup Flow

**Instructions:**
1. Trace credential flow from frontend to backend
2. Verify credentials never logged or exposed
3. Check for format validation before sending
4. Verify status sync between frontend and backend

**Flow verification:**

| Step | Check |
|------|-------|
| Format validation | Frontend validates before sending |
| Server action | Credentials passed server-side only |
| Backend call | Uses org's X-API-Key |
| KMS encryption | Credentials encrypted before storage |
| Status update | Supabase updated with integration status |

**Gap indicators:**
- Credentials in client component props
- Missing format validation (e.g., OpenAI key must start with sk-)
- Credentials in response body
- Integration status not synced to Supabase

---

### 5. Pipeline Execution Flow

**Instructions:**
1. Trace pipeline from frontend trigger to backend completion
2. Verify quota check at entry point
3. Check status polling implementation
4. Verify error handling at each layer

**Flow verification:**

| Step | Check |
|------|-------|
| Frontend trigger | Server action, not client fetch |
| Quota check | Backend Depends(validate_quota) |
| Counter increment | Before pipeline starts |
| Pipeline execution | Uses org's encrypted credentials |
| Status polling | With timeout and backoff |
| Counter decrement | In finally block |
| Status update | FAILED status on exception |

**Gap indicators:**
- Missing quota check
- Counter increment after pipeline start
- No polling timeout
- Missing finally block for counter
- Exception without status update

---

### 6. Data Consistency

**Instructions:**
1. Identify all places where data exists in multiple systems
2. Check for transaction-like patterns or rollback
3. Verify orphan detection exists

**Multi-system data:**

| Data | Systems | Check |
|------|---------|-------|
| Organization | Supabase + Backend | Rollback on partial failure |
| Subscription | Stripe + Supabase | Webhook syncs both ways |
| Integration status | Backend + Supabase | Status field tracks sync |
| Pipeline run | Backend | Single system (no sync needed) |

**Gap indicators:**
- Supabase org created, backend fails, no cleanup logged
- Stripe subscription updated, Supabase not synced
- Integration setup succeeds in backend, Supabase not updated

---

### 7. Timeout Configuration

**Instructions:**
1. Find all cross-system calls
2. Verify timeout is configured at each layer

**Required timeouts:**

| Layer | Operation | Timeout |
|-------|-----------|---------|
| Frontend fetch | API calls | 30 seconds |
| Frontend fetch | Pipeline status | 60 seconds |
| Backend BigQuery | Connect | 60 seconds |
| Backend BigQuery | Read | 300 seconds |
| Backend KMS | Encrypt/Decrypt | 30 seconds |
| Backend Provider | LLM API calls | 120 seconds |

**Gap indicators:**
- fetch() without AbortController
- No timeout on backend external calls
- Inconsistent timeout values

---

### 8. Error Handling at Boundaries

**Instructions:**
1. Find all try/catch blocks in integration code
2. Verify user-facing errors are generic
3. Verify internal errors are logged with context

**Error mapping:**

| Backend Status | Frontend Message |
|----------------|------------------|
| 400 | "Invalid request. Please check your input." |
| 401 | "Session expired. Please log in again." |
| 403 | "You don't have access to this resource." |
| 429 | "Rate limit exceeded. Please wait and try again." |
| 500 | "Something went wrong. Please try again." |

**Gap indicators:**
- `error.message` exposed to user
- Backend exception details in frontend error
- No logging of original error
- Missing error mapping for status codes

---

### 9. Request Tracing

**Instructions:**
1. Check if X-Request-ID is generated in frontend
2. Verify backend extracts or generates request ID
3. Check if request ID is included in logs

**Files to check:**
- `lib/backend-client.ts` - Request ID generation
- Backend: `src/app/middleware/request_id.py`

**Gap indicators:**
- No X-Request-ID header in frontend calls
- Backend doesn't propagate request ID
- Logs missing request ID

---

## Output Format

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | X | Cross-tenant, Data leak, Auth bypass |
| HIGH | X | Sync failure, Quota bypass |
| MEDIUM | X | Missing timeout, Error exposure |
| LOW | X | Missing tracing |

For each issue:
- **Files:** frontend/path.ts ↔ backend/path.py
- **Flow:** Which integration point
- **Issue:** Description
- **Fix:** What needs to change in both systems

## Recommended Actions
1. Fix CRITICAL issues - both sides must be fixed together
2. Fix HIGH issues before production
3. Add integration tests for critical flows
