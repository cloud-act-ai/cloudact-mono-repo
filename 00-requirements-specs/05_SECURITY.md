# Security

**Status**: IMPLEMENTED | **Updated**: 2026-01-01

> Defense-in-depth security for CloudAct.ai frontend.

---

## Security Layers

| Layer | Protection | Implementation |
|-------|------------|----------------|
| Input | Validation & Sanitization | Server action validators |
| Transport | HTTPS/TLS | Hosting platform |
| Session | JWT + Cookies | Supabase Auth (httpOnly) |
| Authorization | RBAC + RLS | Role checks + Supabase RLS |
| Rate Limiting | In-memory limits | Per-user throttling |
| Webhooks | Signature verification | Stripe signature + idempotency |

---

## Input Validation

```typescript
// Org slug: ^[a-zA-Z0-9_]{2,100}$
isValidOrgSlug(slug)

// Org name: Remove HTML, dangerous chars, limit 100
sanitizeOrgName(name)

// Email: RFC-compliant, max 254 chars
isValidEmail(email)

// Stripe price: price_* prefix, length > 10
isValidStripePriceId(priceId)

// UUID: Standard UUID format
isValidUUID(uuid)
```

---

## Rate Limiting

| Operation | Limit | Window |
|-----------|-------|--------|
| Checkout sessions | 1 | 30 seconds |
| Member invites | 10 | 1 hour |
| Deletion tokens | 1000 total | Rolling cleanup |

---

## XSS Prevention

```typescript
// All email content escaped
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
```

---

## Open Redirect Prevention

```typescript
function isValidRedirect(url: string | null): boolean {
  if (!url) return false
  if (!url.startsWith("/")) return false     // Must be relative
  if (url.startsWith("//")) return false     // No protocol-relative
  if (url.includes("\\")) return false       // No backslash
  if (url.includes("@")) return false        // No user@host
  if (/[\x00-\x1f]/.test(url)) return false  // No control chars
  return true
}
```

---

## Webhook Security (Stripe)

```typescript
// 1. Signature verification
stripe.webhooks.constructEvent(body, signature, secret)

// 2. Content-type validation
if (!contentType.includes("application/json")) reject

// 3. Idempotency (in-memory + database)
if (processedEvents.has(event.id)) skip
```

---

## Database Security

```typescript
// Pagination required
.limit(100)  // Members
.limit(50)   // Invites

// Empty array check before IN queries
if (userIds.length > 0) {
  .in("id", userIds)
}
```

---

## Cross-Tenant Protection

```typescript
// ALWAYS verify org membership before operations
.eq("org_id", org.id)  // THIS org only
.eq("user_id", memberUserId)
.eq("status", "active")
```

---

## Public Routes (Middleware)

```typescript
const publicPaths = [
  "/", "/features", "/pricing", "/solutions",
  "/login", "/signup", "/forgot-password", "/reset-password",
  "/invite", "/onboarding", "/unauthorized"
]
```

---

## KMS Encryption (Credentials)

| Measure | Detail |
|---------|--------|
| Algorithm | GCP KMS AES-256 |
| Key rotation | Automatic |
| Storage | Only encrypted blobs |
| Logging | SHA256 fingerprint (first 8 chars) |

---

## Error Boundaries

```
app/error.tsx                    # Global
app/[orgSlug]/analytics/error.tsx
app/[orgSlug]/billing/error.tsx
app/[orgSlug]/settings/error.tsx
app/[orgSlug]/settings/members/error.tsx
```

---

## Security Checklist

**Input:** All inputs validated (format, length, characters)

**Database:** All list queries have `.limit()`, empty array checks

**Rate Limiting:** Sensitive ops limited, maps have max size

**Email:** All user content uses `escapeHtml()`

**Auth:** Server actions verify user, role checks for sensitive ops

**Errors:** Logged via `logError()`, no sensitive info exposed

---

## Reporting Issues

**Email:** security@cloudact.ai

Do NOT create public GitHub issues for security vulnerabilities.

---

**Updated**: 2026-01-01
