# Security Documentation

**CloudAct.ai Frontend Security Architecture**

This document describes all security measures implemented in the frontend codebase. All developers MUST follow these patterns when adding new features.

---

## Table of Contents

1. [Overview](#overview)
2. [Input Validation](#input-validation)
3. [Rate Limiting](#rate-limiting)
4. [XSS Prevention](#xss-prevention)
5. [CSRF Protection](#csrf-protection)
6. [Memory Management](#memory-management)
7. [Database Security](#database-security)
8. [Webhook Security](#webhook-security)
9. [Authentication & Authorization](#authentication--authorization)
10. [Error Handling](#error-handling)
11. [Security Fixes Log](#security-fixes-log)
12. [Security Checklist](#security-checklist)

---

## Overview

The CloudAct.ai frontend implements defense-in-depth security with multiple layers:

| Layer | Protection | Implementation |
|-------|------------|----------------|
| Input | Validation & Sanitization | Server actions validate all inputs |
| Transport | HTTPS/TLS | Enforced by hosting platform |
| Session | JWT + Cookies | Supabase Auth with httpOnly cookies |
| Authorization | RBAC + RLS | Role checks + Supabase Row Level Security |
| Rate Limiting | In-memory limits | Per-user request throttling |
| Webhooks | Signature verification | Stripe signature + idempotency |

---

## Input Validation

### Organization Slug Validation

**Purpose:** Prevent path traversal and injection attacks.

**Location:** `actions/members.ts`, `actions/stripe.ts`

```typescript
const isValidOrgSlug = (slug: string): boolean => {
  // Must be 2-100 chars, alphanumeric with underscores/dashes only
  return /^[a-zA-Z0-9_-]{2,100}$/.test(slug)
}

// Usage - ALWAYS validate before database queries
export async function fetchMembersData(orgSlug: string) {
  if (!isValidOrgSlug(orgSlug)) {
    return { success: false, error: "Invalid organization" }
  }
  // ... proceed with query
}
```

### Organization Name Sanitization

**Purpose:** Prevent XSS and SQL injection via organization names.

**Location:** `actions/organization.ts`

```typescript
function sanitizeOrgName(name: string): string {
  return name
    .replace(/<[^>]*>/g, "")      // Remove HTML tags
    .replace(/[<>"'&;]/g, "")     // Remove dangerous characters
    .trim()
    .slice(0, 100)                // Limit length
}

function isValidOrgName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 2 &&
         trimmed.length <= 100 &&
         !/<script|<\/script|javascript:|on\w+=/i.test(trimmed)
}
```

### Email Validation

**Purpose:** Ensure valid email format before database operations.

**Location:** `actions/members.ts`

```typescript
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254
}
```

### Stripe Price ID Validation

**Purpose:** Ensure only valid Stripe price IDs are processed.

**Location:** `actions/stripe.ts`

```typescript
const isValidStripePriceId = (priceId: string): boolean => {
  return priceId.startsWith("price_") && priceId.length > 10
}
```

---

## Rate Limiting

### Checkout Session Rate Limiting

**Purpose:** Prevent checkout abuse and fraud.

**Location:** `actions/stripe.ts`

```typescript
const checkoutRateLimits = new Map<string, number>()
const CHECKOUT_RATE_LIMIT_MS = 30000 // 30 seconds

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const lastAttempt = checkoutRateLimits.get(userId)

  if (lastAttempt && now - lastAttempt < CHECKOUT_RATE_LIMIT_MS) {
    return false // Rate limited
  }

  checkoutRateLimits.set(userId, now)

  // Cleanup old entries
  if (checkoutRateLimits.size > 1000) {
    const cutoff = now - CHECKOUT_RATE_LIMIT_MS * 2
    checkoutRateLimits.forEach((time, key) => {
      if (time < cutoff) checkoutRateLimits.delete(key)
    })
  }

  return true
}
```

### Member Invite Rate Limiting

**Purpose:** Prevent invite spam and abuse.

**Location:** `actions/members.ts`

```typescript
const inviteRateLimits = new Map<string, { count: number; resetTime: number }>()
const INVITE_RATE_LIMIT = 10 // Max invites per window
const INVITE_RATE_WINDOW = 3600000 // 1 hour

function checkInviteRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = inviteRateLimits.get(userId)

  if (!userLimit || now > userLimit.resetTime) {
    inviteRateLimits.set(userId, { count: 1, resetTime: now + INVITE_RATE_WINDOW })
    return true
  }

  if (userLimit.count >= INVITE_RATE_LIMIT) {
    return false
  }

  userLimit.count++
  return true
}
```

### Rate Limit Summary

| Operation | Limit | Window | Error Message |
|-----------|-------|--------|---------------|
| Checkout sessions | 1 | 30 seconds | "Please wait before trying again" |
| Member invites | 10 | 1 hour | "Too many invites. Please try again later." |
| Account deletion tokens | 1000 total | Rolling cleanup | N/A (internal) |

---

## XSS Prevention

### HTML Escaping in Emails

**Purpose:** Prevent XSS attacks via email content.

**Location:** `lib/email.ts`

```typescript
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
```

**Usage in all email functions:**

```typescript
// sendInviteEmail
const safeInviterName = escapeHtml(inviterName)
const safeOrgName = escapeHtml(orgName)
const safeRoleDisplay = escapeHtml(roleDisplay)
const safeInviteLink = escapeHtml(inviteLink)

// sendPasswordResetEmail
const safeResetLink = escapeHtml(resetLink)

// sendTrialEndingEmail
const safeOrgName = escapeHtml(orgName)
const safeBillingLink = escapeHtml(billingLink)

// sendPaymentFailedEmail
const safeOrgName = escapeHtml(orgName)
const safeBillingLink = escapeHtml(billingLink)

// sendWelcomeEmail
const safeName = escapeHtml(name)
const safeOrgName = escapeHtml(orgName)
const safeDashboardLink = escapeHtml(dashboardLink)
```

---

## CSRF Protection

### Server Actions (Automatic)

Next.js 14+ server actions include built-in CSRF protection:

- Request origin is automatically validated
- Actions only execute from same-origin requests
- No additional CSRF tokens needed

**Documentation in:** `actions/stripe.ts`

```typescript
/**
 * Stripe Server Actions
 *
 * SECURITY NOTE: These server actions are protected by:
 * 1. Next.js server actions automatically validate the request origin
 * 2. User authentication via Supabase session
 * 3. Rate limiting for checkout sessions
 * 4. Input validation for all parameters
 *
 * Server actions in Next.js 14+ include built-in CSRF protection.
 */
```

### API Routes (Manual Validation)

API routes should validate request headers:

```typescript
// app/api/webhooks/stripe/route.ts
const contentType = request.headers.get("content-type")
if (contentType && !contentType.includes("application/json") && !contentType.includes("text/")) {
  return NextResponse.json({ error: "Invalid content type" }, { status: 400 })
}
```

---

## Memory Management

### Bounded Caches

All in-memory caches MUST have size limits to prevent memory leaks:

**Location:** `actions/account.ts`

```typescript
const deletionTokens = new Map<string, { userId: string; expiresAt: Date; email: string }>()
const MAX_DELETION_TOKENS = 1000 // Prevent unbounded memory growth

function cleanupExpiredTokens() {
  const now = Date.now()
  const keysToDelete: string[] = []

  // Remove expired tokens
  deletionTokens.forEach((value, key) => {
    if (value.expiresAt < now) {
      keysToDelete.push(key)
    }
  })
  keysToDelete.forEach(key => deletionTokens.delete(key))

  // Enforce max size - remove oldest tokens
  if (deletionTokens.size > MAX_DELETION_TOKENS) {
    const entries = Array.from(deletionTokens.entries())
      .sort((a, b) => a[1].expiresAt.getTime() - b[1].expiresAt.getTime())

    const removeCount = deletionTokens.size - MAX_DELETION_TOKENS
    entries.slice(0, removeCount).forEach(([key]) => deletionTokens.delete(key))
  }
}
```

---

## Database Security

### Pagination Requirements

All database queries returning lists MUST include limits:

**Location:** `actions/members.ts`

```typescript
// Members - limit 100
const MAX_MEMBERS_PER_PAGE = 100
const { data: membersData } = await adminClient
  .from("organization_members")
  .select("id, user_id, role, status, joined_at")
  .eq("org_id", org.id)
  .eq("status", "active")
  .order("joined_at", { ascending: true })
  .limit(MAX_MEMBERS_PER_PAGE)

// Invites - limit 50
const MAX_INVITES_PER_PAGE = 50
const { data: invitesData } = await adminClient
  .from("invites")
  .select("id, email, role, status, created_at, expires_at")
  .eq("org_id", org.id)
  .eq("status", "pending")
  .order("created_at", { ascending: false })
  .limit(MAX_INVITES_PER_PAGE)
```

### Empty Array Handling

Queries with `IN` clauses must check for empty arrays:

```typescript
// Good - check before query
const userIds = membersData?.map((m) => m.user_id) || []
let profilesData = null
if (userIds.length > 0) {
  const { data } = await adminClient
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds)
  profilesData = data
}

// Bad - query with potentially empty array
const { data } = await adminClient
  .from("profiles")
  .select("*")
  .in("id", userIds)  // Fails if userIds is empty!
```

---

## Webhook Security

### Stripe Webhook Validation

**Location:** `app/api/webhooks/stripe/route.ts`

```typescript
export async function POST(request: NextRequest) {
  // 1. Content-type validation
  const contentType = request.headers.get("content-type")
  if (contentType && !contentType.includes("application/json") && !contentType.includes("text/")) {
    return NextResponse.json({ error: "Invalid content type" }, { status: 400 })
  }

  // 2. Get signature
  const body = await request.text()
  const signature = headersList.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  // 3. Verify signature
  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // 4. Idempotency check (in-memory)
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, skipped: "duplicate" })
  }

  // 5. Idempotency check (database)
  const { data: existingEvent } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_webhook_last_event_id", event.id)
    .limit(1)
    .maybeSingle()

  if (existingEvent) {
    return NextResponse.json({ received: true, skipped: "duplicate" })
  }

  // 6. Process event...
}
```

---

## Authentication & Authorization

### Public Routes

**Location:** `middleware.ts`

```typescript
const publicPaths = [
  "/", "/features", "/pricing", "/solutions", "/integrations",
  "/resources", "/about", "/contact", "/security", "/docs",
  "/privacy", "/terms", "/login", "/signup", "/forgot-password",
  "/reset-password", "/invite", "/onboarding", "/unauthorized"
]

// Handles nested paths (e.g., /invite/[token])
const isPublicPath = publicPaths.includes(path) ||
  publicPaths.some((publicPath) => path.startsWith(publicPath + "/"))
```

### Server Action Authentication

All server actions must verify authentication:

```typescript
export async function sensitiveAction(orgSlug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Continue with action...
}
```

---

## Error Handling

### Centralized Error Logging

**Location:** `lib/utils.ts`

```typescript
export function logError(context: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "An unexpected error occurred"

  // Always log in both development and production
  console.error(`[${context}]`, error)

  // In production, send to error tracking service
  // if (process.env.NODE_ENV === "production") {
  //   Sentry.captureException(error, { tags: { context } })
  // }

  return message
}
```

### Error Boundaries

Error boundaries exist for all major sections:

- `app/error.tsx` - Global error boundary
- `app/[orgSlug]/analytics/error.tsx`
- `app/[orgSlug]/billing/error.tsx`
- `app/[orgSlug]/settings/error.tsx`
- `app/[orgSlug]/settings/members/error.tsx`
- `app/[orgSlug]/settings/profile/error.tsx`

---

## Security Fixes Log

### November 2024 Security Audit

| Issue | Severity | File | Fix |
|-------|----------|------|-----|
| Missing import alias | Medium | `actions/integrations.ts:11` | Changed `BackendClient` to `PipelineBackendClient` |
| Non-null assertion | Medium | `route.ts:91` | Refactored to explicit assignment |
| Empty array query | Low | `actions/members.ts:60` | Added length check before query |
| Missing public paths | High | `middleware.ts:25` | Added `/invite`, `/onboarding`, `/unauthorized` |
| Memory leak | High | `actions/account.ts:13` | Added MAX_TOKENS limit and cleanup |
| Missing await | Low | `actions/account.ts:274` | Changed to fire-and-forget with error handling |
| Unescaped email link | High | `lib/email.ts:159` | Added `escapeHtml(resetLink)` |
| Dev-only logging | Medium | `lib/utils.ts:19` | Enabled logging in production |
| Missing rate limiting | High | `actions/members.ts:13` | Added invite rate limiting |
| Missing orgSlug validation | High | `actions/members.ts:38` | Added `isValidOrgSlug` check |
| Missing content-type check | Medium | `route.ts:124` | Added header validation |
| Missing pagination | Medium | `actions/members.ts:79` | Added `.limit(100)` |
| Missing useEffect deps | Low | `billing/page.tsx:80` | Added ESLint disable comment |
| Missing nested path handling | High | `middleware.ts:30` | Added `startsWith` check |
| Missing input sanitization | High | `actions/organization.ts:19` | Added `sanitizeOrgName` |
| Untyped useParams | Low | `billing/page.tsx:46` | Added generic type parameter |

---

## Security Checklist

Before deploying any new feature, verify:

### Input Handling
- [ ] All user inputs are validated (format, length, characters)
- [ ] Organization slugs use `isValidOrgSlug()`
- [ ] Organization names use `sanitizeOrgName()`
- [ ] Emails use `isValidEmail()`
- [ ] Stripe IDs use `isValidStripePriceId()`

### Database Queries
- [ ] All list queries have `.limit()` clause
- [ ] Empty arrays are checked before `IN` queries
- [ ] Sensitive data is not returned in error messages

### Rate Limiting
- [ ] Sensitive operations have rate limits
- [ ] Rate limit maps have max size limits
- [ ] Cleanup functions prevent memory leaks

### Email Security
- [ ] All user-provided content uses `escapeHtml()`
- [ ] Links are validated before including in emails

### Authentication
- [ ] Server actions verify `user` before proceeding
- [ ] Role checks are performed for sensitive operations
- [ ] Public routes are explicitly listed in middleware

### Error Handling
- [ ] Errors are logged via `logError()`
- [ ] Error boundaries exist for all major sections
- [ ] Error messages don't expose sensitive info

---

## Reporting Security Issues

If you discover a security vulnerability, please report it to:

**Email:** security@cloudact.ai

Do NOT create public GitHub issues for security vulnerabilities.
