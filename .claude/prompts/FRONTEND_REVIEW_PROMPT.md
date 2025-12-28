# Frontend Code Review Prompt

## Overview
Review Next.js frontend for **Supabase + Stripe multi-tenancy enterprise SaaS** patterns.

---

## Critical Rules

1. DO NOT change existing logic unless security vulnerability found
2. DO NOT add backward compatibility - this is a new system
3. DO NOT over-engineer - keep solutions simple
4. REVIEW IS MANDATORY - check every file mentioned
5. Focus on HARDENING, not refactoring

---

## Review Philosophy

**IDENTIFYING GAPS IS KEY - BUT NEVER OVERDO!**

| DO | DON'T |
|----|-------|
| Identify security vulnerabilities | Refactor working code |
| Flag missing validation | Add "nice to have" features |
| Note missing rate limits | Restructure architecture |
| Report cross-tenant risks | Add comments/docs unless critical |

**What IS a gap:** Security vulnerability, data leak risk, missing validation, production stability risk

**What is NOT a gap:** Code style, "better" ways, missing tests, premature optimization

---

## Scalability Focus (10K+ Parallel Users)

### Supabase Best Practices

| Check | Description |
|-------|-------------|
| Connection pooling | Use Supabase pooler, not direct PostgREST |
| RLS performance | Policies avoid complex JOINs (max 2 tables) |
| Real-time limits | Max 10 subscriptions per user |
| Rate limiting | Per user/org, not just global |
| Query timeouts | Default 60s configured |

### Stripe Best Practices

| Check | Description |
|-------|-------------|
| Idempotency keys | Format: `userId_priceId` (NOT timestamps) |
| Event tracking | Store webhook event IDs to prevent reprocessing |
| Customer caching | Cache customer ID per session |
| Session dedup | Same user + price = same checkout session |
| Retry handling | Handle up to 3 days of webhook retries |

### Multi-Tenant Isolation

| Check | Description |
|-------|-------------|
| URL param verification | Never trust org_slug from URL alone - verify membership |
| Query isolation | Include org_slug in ALL queries (parameterized: @org_slug) |
| Pagination | All list queries limited to max 100 per page |
| Membership caching | Cache org membership checks with 5min TTL |
| Background jobs | Queue jobs scoped to org, not global |

### Concurrent Request Handling

| Check | Description |
|-------|-------------|
| Race conditions | Use optimistic locking for state updates |
| Critical operations | Use DB locks (FOR UPDATE) |
| Deduplication | Prevent parallel duplicate submissions |
| Webhook serialization | Process webhooks serially per org |
| Cache invalidation | Atomic, no stale reads |

---

## Review Checklist

### 1. Multi-Tenant Data Isolation (CRITICAL)

**Instructions:**
1. Open each server action file in `actions/*.ts`
2. For EVERY function that takes `orgSlug` parameter:
   - Verify it calls `verifyOrgMembership()` BEFORE any data access
   - Verify the membership check uses authenticated user ID
   - Verify the check validates BOTH org exists AND user is member
3. Flag any action that queries data using URL-provided org_slug without verification

**Files to check:**
- `actions/*.ts` - All server actions
- `app/[orgSlug]/**/*.tsx` - Dynamic org routes
- `lib/auth.ts` - Auth guards

**Gap indicators:**
- Direct Supabase query with only `.eq("org_slug", orgSlug)`
- Missing `getUser()` call before org data access
- No membership table check

---

### 2. Stripe Integration Security

**Instructions:**
1. Open `actions/stripe.ts` and find checkout session creation
2. Verify idempotency key uses deterministic format (userId_priceId)
3. Open webhook handler at `app/api/webhooks/stripe/route.ts`
4. Verify signature verification happens FIRST, before any processing
5. Check for event ID tracking to prevent duplicate processing

**Files to check:**
- `actions/stripe.ts` - Checkout, plan changes
- `app/api/webhooks/stripe/route.ts` - Webhook handler
- `lib/stripe.ts` - Client initialization

**Gap indicators:**
- Idempotency key contains `Date.now()` or `Math.random()`
- Webhook processes before signature verification
- No `event.id` tracking for deduplication
- Customer ID lookup on every request (no caching)

---

### 3. Input Validation

**Instructions:**
1. Check all form inputs for validation before submission
2. Verify org_slug validation: alphanumeric, underscores, hyphens, 2-100 chars
3. Verify redirect URL validation: must start with `/`, no `//`, no `\`, no `@`
4. Verify email validation on invite forms
5. Check Stripe price ID validation: must start with `price_`

**Files to check:**
- `app/login/page.tsx` - Redirect validation
- `app/signup/page.tsx` - Input sanitization
- `actions/organization.ts` - Org name sanitization
- `actions/members.ts` - Email validation

**Gap indicators:**
- Missing regex validation on org_slug
- Redirect URL allows external domains
- HTML tags not stripped from org name
- Email format not validated

---

### 4. Rate Limiting

**Required rate limits:**

| Operation | Limit | Window |
|-----------|-------|--------|
| Checkout sessions | 1 per user | 30 seconds |
| Member invites | 10 per user | 1 hour |
| Password reset | 3 per email | 15 minutes |
| Login attempts | 5 per IP | 15 minutes |

**Instructions:**
1. Check each sensitive operation for rate limiting
2. Verify rate limit key includes user/org identifier (not just global)
3. Verify rate limit state has cleanup mechanism

**Gap indicators:**
- No rate limiting on checkout creation
- Global rate limit allowing one org to exhaust quota
- Unbounded Map for rate limit state (memory leak)

---

### 5. Security Headers

**Instructions:**
1. Open `next.config.mjs`
2. Verify ALL security headers are set:

| Header | Required Value |
|--------|----------------|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | SAMEORIGIN |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Strict-Transport-Security | max-age=31536000; includeSubDomains (prod only) |

---

### 6. API Client Configuration

**Instructions:**
1. Find all `fetch()` calls to backend API
2. Verify timeout is configured (30s default, 60s for pipelines)
3. Verify AbortController is used for timeout
4. Verify timeout cleanup in finally block

**Gap indicators:**
- No timeout on fetch calls
- Missing AbortController cleanup
- Different timeout values inconsistently applied

---

### 7. Pagination Requirements

**Standard limits:**

| Resource | Max per page |
|----------|-------------|
| Members | 100 |
| Invites | 50 |
| Activity logs | 50 |
| Invoices | 10 |

**Instructions:**
1. Find all list queries in actions
2. Verify `.range()` or `.limit()` is used
3. Verify no unbounded `.select("*")` without limit

---

### 8. Error Handling

**Instructions:**
1. Check all catch blocks in server actions
2. Verify error messages are generic, not exposing internals
3. Verify errors are logged server-side with context

**Gap indicators:**
- `return { error: error.message }` (exposes internals)
- Stack traces in user-facing errors
- No server-side logging of errors

---

## Output Format

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | X | Cross-tenant, Auth bypass |
| HIGH | X | SQL injection, XSS |
| MEDIUM | X | Missing validation |
| LOW | X | Code style |

For each issue:
- **File:** path/to/file.ts:LINE
- **Issue:** Description
- **Fix:** What needs to change (not code, just description)

## Recommended Actions
1. Fix CRITICAL issues immediately - block deployment
2. Fix HIGH issues before production
3. Address MEDIUM issues in next sprint
4. Track LOW issues only
