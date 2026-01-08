# Frontend-Backend Onboarding Integration Gaps & Issues
**Date:** 2026-01-08  
**Component:** Signup → Billing → Backend Onboarding Flow  
**Severity:** CRITICAL - Multiple production-blocking issues found

## Summary
Identified **18 gaps** in the onboarding integration between frontend (Supabase/Stripe) and backend (FastAPI/BigQuery). These issues affect user experience, data consistency, and system reliability.

---

## 🔴 CRITICAL Gaps (Fix Before Production)

### GAP-001: No Bootstrap Validation Before Onboarding ⚠️
**Location:** `app/onboarding/success/page.tsx`, `actions/backend-onboarding.ts`  
**Issue:** Frontend calls `/organizations/onboard` without verifying that `/admin/bootstrap` completed successfully

**Impact:**
- If bootstrap never ran, onboarding fails with cryptic error
- If bootstrap incomplete (only 15/21 tables), org creation fails
- No user-friendly guidance on what went wrong

**Current Flow:**
```
User → Stripe Checkout → /onboarding/success → onboardToBackend() → FAILS (no dataset)
```

**Fix Needed:**
```typescript
// In app/onboarding/success/page.tsx - BEFORE calling onboardToBackend()
const bootstrapStatus = await fetch('/api/v1/admin/bootstrap/status', {
  headers: { 'X-CA-Root-Key': process.env.CA_ROOT_API_KEY }
})

if (bootstrapStatus.status !== 'SYNCED') {
  // Show error: "System not ready. Contact support."
  return
}
```

---

### GAP-002: Currency/Timezone from Signup Not Passed to Backend 💰
**Location:** `app/signup/page.tsx` lines 202-206, `actions/backend-onboarding.ts` lines 312-319  
**Issue:** Signup form collects currency/timezone but `onboardToBackend()` doesn't retrieve them from `user_metadata`

**Current Code:**
```typescript
// Signup stores in user_metadata:
userData.pending_currency = currency  // USD, EUR, INR, etc.
userData.pending_timezone = timezone  // UTC, Asia/Kolkata, etc.

// But onboardToBackend() receives:
default_currency: input.defaultCurrency || "USD",  // ❌ Always USD!
default_timezone: input.defaultTimezone || "UTC",  // ❌ Always UTC!
```

**Impact:**
- User selects INR + Asia/Kolkata in signup
- Backend creates org with USD + UTC
- User sees wrong currency everywhere in dashboard

**Fix:**
```typescript
// In app/onboarding/success/page.tsx:
const { data: { user } } = await supabase.auth.getUser()
const currency = user.user_metadata.pending_currency || 'USD'
const timezone = user.user_metadata.pending_timezone || 'UTC'

await onboardToBackend({
  // ...
  defaultCurrency: currency,
  defaultTimezone: timezone,
})
```

---

### GAP-003: Race Condition - Multiple Tabs Can Trigger Onboarding 🏃
**Location:** `actions/backend-onboarding.ts` line 267  
**Issue:** No distributed lock prevents concurrent onboarding calls from multiple browser tabs/windows

**Scenario:**
1. User completes Stripe checkout
2. Opens `/onboarding/success` in 2 tabs simultaneously
3. Both tabs call `onboardToBackend()` concurrently
4. Backend receives 2 identical requests
5. First succeeds, second gets 409 Conflict (wasteful)

**Fix:**
```typescript
// Add distributed lock using Supabase
const { data: lock, error } = await supabase
  .from('onboarding_locks')
  .insert({ org_slug: orgSlug, expires_at: new Date(Date.now() + 60000) })

if (error?.code === '23505') {
  return { success: false, error: 'Onboarding already in progress' }
}
```

---

### GAP-004: No Rollback on Partial Onboarding Failure 🔄
**Location:** `actions/backend-onboarding.ts` lines 329-350  
**Issue:** If backend onboarding succeeds but Supabase update fails, system left in inconsistent state

**Failure Scenarios:**
- Backend creates org dataset + tables ✅
- Returns API key ✅
- Supabase `organizations` update fails ❌ (network error)
- `backend_onboarded` stays `false` in Supabase
- User can't access org (frontend thinks not onboarded)

**Current Code:**
```typescript
// Backend succeeded
const response = await backend.onboardOrganization(request)

// Supabase update (not atomic with backend)
const { error: updateError } = await adminClient
  .from("organizations")
  .update({ backend_onboarded: true })
  .eq("org_slug", input.orgSlug)

if (updateError) {
  // ❌ Just logs warning - no rollback!
  console.warn("Failed to update org")
}
```

**Fix:** Implement idempotent retry logic or compensating transaction

---

### GAP-005: Org Slug Generation Not Handled 🏷️
**Location:** Entire signup/onboarding flow  
**Issue:** Signup collects `company_name` but never generates `org_slug`

**Questions:**
- Where is `org_slug` created? Frontend or backend?
- What's the generation logic? (company_name → snake_case?)
- How are collisions handled? (acme_inc already exists)

**Missing Flow:**
```
User enters "Acme Inc." 
  → Generate "acme_inc_01082026" (with timestamp suffix)
  → Check availability in Supabase
  → Store in user_metadata.pending_org_slug
  → Pass to backend onboarding
```

**Impact:** Critical - can't onboard without org_slug!

---

### GAP-006: No Progress Indicator During Onboarding ⏳
**Location:** `app/onboarding/success/page.tsx`  
**Issue:** Backend onboarding takes 10-30 seconds (creates dataset + 6-7 tables), no progress shown

**Current UX:**
```
User lands on /onboarding/success
  → Sees static "Setting up your workspace..." message
  → No spinner, no progress bar
  → After 20 seconds → redirect
```

**User Perception:** "Is it stuck? Should I refresh?"

**Fix Needed:**
```tsx
<ProgressBar stages={[
  { label: "Creating dataset", status: "in_progress" },
  { label: "Setting up tables (1/6)", status: "pending" },
  { label: "Generating API key", status: "pending" },
  { label: "Finalizing", status: "pending" },
]} />
```

---

### GAP-007: Technical Error Messages Exposed to Users 😱
**Location:** `actions/backend-onboarding.ts` line 379  
**Issue:** Backend errors like "dataset 'acme_prod' already exists" shown directly to user

**Current:**
```typescript
return { success: false, error: "Organization already exists with status 'ACTIVE'" }
// User sees: "Organization already exists with status 'ACTIVE'" ❌
```

**Should Be:**
```typescript
return { success: false, error: "This organization has already been set up. Please sign in." }
// User-friendly, actionable ✅
```

**Fix:** Error mapping table:
```typescript
const ERROR_MESSAGES = {
  '409': 'Organization already exists. Please contact support if you need to reset your workspace.',
  '503': 'Our servers are busy. Please try again in a few moments.',
  'timeout': 'Setup is taking longer than expected. Please check back in a minute.',
}
```

---

## 🟠 HIGH Priority Gaps (Fix Soon)

### GAP-008: Unauthenticated Access to /onboarding/success 🔒
**Location:** `app/onboarding/success/page.tsx`  
**Issue:** Page doesn't verify user is authenticated before calling backend

**Attack Vector:**
```
Attacker → Navigates to /onboarding/success?org_slug=victim_org
  → Page calls onboardToBackend(victim_org)
  → Could cause DoS or resource exhaustion
```

**Fix:**
```typescript
// Add at top of page
const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  redirect('/login?error=unauthorized')
}
```

---

### GAP-009: No Stripe Checkout Verification Before Onboarding 💳
**Location:** `app/onboarding/success/page.tsx`  
**Issue:** User could skip payment and navigate directly to `/onboarding/success`

**Bypass:**
```
User → /signup → /onboarding/billing
  → Manually types /onboarding/success in URL bar
  → Skips Stripe payment
  → Gets onboarded anyway ❌
```

**Fix:**
```typescript
// Verify subscription exists in Supabase
const { data: sub } = await supabase
  .from('subscriptions')
  .select('*')
  .eq('org_slug', orgSlug)
  .eq('billing_status', 'active')
  .single()

if (!sub) {
  redirect('/onboarding/billing?error=payment_required')
}
```

---

### GAP-010: API Key Reveal Token Expires Too Soon ⏰
**Location:** `actions/backend-onboarding.ts` line 35  
**Issue:** Reveal token expires after 30 minutes, but onboarding flow could take longer

**Scenario:**
1. User completes Stripe checkout (5 min to decide)
2. Onboarding starts (20 sec backend call)
3. User distracted, returns after 35 minutes
4. Token expired, can't see API key
5. No way to re-reveal

**Current:**
```typescript
const REVEAL_TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes
```

**Fix:** Either increase to 2 hours OR add re-reveal mechanism:
```typescript
// Option 1: Longer TTL
const REVEAL_TOKEN_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

// Option 2: Add re-reveal endpoint
export async function reRevealApiKey(orgSlug: string) {
  // Verify org membership
  // Get API key from secure storage
  // Generate new reveal token
}
```

---

### GAP-011: No Retry Mechanism for Failed Onboarding 🔁
**Location:** `app/onboarding/success/page.tsx`  
**Issue:** If backend onboarding fails (network error, backend down), user is stuck

**Current UX:**
```
Backend fails → Shows error message → No retry button
User must:
  1. Go back to /signup
  2. Start over
  3. Re-enter all information
  4. Go through Stripe again ❌
```

**Fix:**
```tsx
{onboardingError && (
  <div className="error-card">
    <p>{onboardingError}</p>
    <button onClick={() => retryOnboarding()}>
      Retry Setup
    </button>
    <Link href="/settings/onboarding">
      Manual Setup Instructions
    </Link>
  </div>
)}
```

---

### GAP-012: Backend Doesn't Validate Supabase Org Exists First 🔗
**Location:** `02-api-service/src/app/routers/organizations.py` line 267  
**Issue:** Backend creates org independently without checking if Supabase org exists

**Problem:**
- Frontend creates Supabase org
- Backend called with org_slug
- Backend creates BigQuery org
- But doesn't verify Supabase org exists
- Could lead to orphaned backend orgs

**Fix:** Add Supabase validation webhook or API call before creating BigQuery resources

---

## 🟡 MEDIUM Priority Gaps (Nice to Have)

### GAP-013: No Post-Onboarding Sync Status Check ✅
**Location:** `app/onboarding/success/page.tsx`  
**Issue:** After onboarding, should verify all tables created successfully

**Fix:**
```typescript
// After onboardToBackend() succeeds
const statusCheck = await fetch(`/api/v1/organizations/${orgSlug}/status`, {
  headers: { 'X-API-Key': apiKey }
})

if (statusCheck.status !== 'SYNCED') {
  // Show warning: "Setup incomplete. Contact support."
}
```

---

### GAP-014: No Welcome Email After Onboarding 📧
**Issue:** User should receive confirmation email with:
- API key fingerprint
- Getting started guide
- Support contact

**Missing:** Email notification system integration

---

### GAP-015: No Audit Log for Onboarding Events 📝
**Issue:** Should log:
- Onboarding started (timestamp, user)
- Onboarding succeeded (timestamp, API key fingerprint)
- Onboarding failed (timestamp, error)

**Missing:** Integration with `org_audit_logs` table

---

### GAP-016: Backend Location Not Configurable 🌍
**Issue:** Signup form doesn't ask for preferred BigQuery location

**Current:** Always uses US (server default)  
**Should:** Ask user: "Where should we store your data? US / EU / Asia"

---

### GAP-017: No Company Name Validation/Sanitization 🧹
**Issue:** Special characters, emojis in company name could break org_slug generation

**Example:**
- User enters: "Acme™ Inc. 🚀"
- Org slug becomes: "acme_inc_" (emojis stripped)
- Or breaks entirely

**Fix:** Sanitization function before org_slug generation

---

### GAP-018: Subscription Plan from Stripe Not Synced 💎
**Issue:** User selects "Professional" in Stripe, but onboarding uses default "STARTER"

**Fix:** Read actual plan from Supabase `subscriptions` table before calling backend

---

## 📊 Summary

| Severity | Count | Must Fix Before Prod |
|----------|-------|----------------------|
| CRITICAL | 7 | YES |
| HIGH | 5 | YES |
| MEDIUM | 6 | Recommended |
| **TOTAL** | **18** | **12 must-fix** |

---

## 🔧 Recommended Fix Order

### Phase 1 (Pre-Launch - MUST FIX)
1. **GAP-005** - Implement org_slug generation (blocking)
2. **GAP-002** - Pass currency/timezone from signup (data loss)
3. **GAP-001** - Validate bootstrap before onboarding (stability)
4. **GAP-009** - Verify Stripe checkout completed (security)
5. **GAP-008** - Require authentication (security)

### Phase 2 (Launch Week)
6. **GAP-006** - Add progress indicator (UX)
7. **GAP-007** - User-friendly error messages (UX)
8. **GAP-011** - Retry mechanism (UX)
9. **GAP-004** - Rollback/retry logic (reliability)

### Phase 3 (Post-Launch)
10. **GAP-003** - Distributed locking (optimization)
11. **GAP-010** - Longer reveal token TTL (UX)
12. **GAP-013** - Post-onboarding validation (quality)

### Phase 4 (Future Enhancements)
- GAP-014 through GAP-018 (nice-to-have features)

---

## 🧪 Testing Checklist

After fixes:
- [ ] Bootstrap runs successfully before any onboarding
- [ ] Signup currency/timezone propagates to backend
- [ ] Concurrent onboarding attempts blocked
- [ ] Failed onboarding can be retried
- [ ] Org slug generated correctly for all company names
- [ ] Progress shown during 10-30 second onboarding
- [ ] User-friendly errors for all failure scenarios
- [ ] Unauthenticated users can't access /onboarding/success
- [ ] Direct navigation without Stripe payment blocked
- [ ] API key reveal token doesn't expire mid-flow

---

## 💡 Architectural Recommendations

1. **Add Onboarding State Machine:** Track PENDING → IN_PROGRESS → COMPLETED → FAILED
2. **Implement Idempotency:** Allow onboarding to be safely retried
3. **Add Health Check:** `/health/onboarding` endpoint to verify prerequisites
4. **Create Onboarding Queue:** Handle concurrent requests gracefully
5. **Add Compensating Transactions:** Rollback Supabase on backend failure

