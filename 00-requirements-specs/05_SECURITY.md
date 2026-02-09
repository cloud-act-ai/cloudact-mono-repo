# Security

**v3.0** | 2026-02-08

> Defense-in-depth for CloudAct across frontend, API, and pipeline services.

---

## Security Workflow

```
Request → Input validation → HTTPS/TLS → Supabase Auth (JWT)
       → RBAC check (owner/collaborator/read_only) → RLS (row-level)
       → Business logic → KMS decrypt (if credential needed) → Response
```

---

## Security Layers

| Layer | Implementation |
|-------|----------------|
| Input | Server action validators (org slug, email, UUID, null byte detection, size limits) |
| Transport | HTTPS/TLS (enforced on all Cloud Run services) |
| Session | Supabase Auth (httpOnly JWT, secure cookies) |
| Authorization | RBAC (owner/collaborator/read_only) + Supabase RLS |
| Credentials | GCP KMS AES-256 encryption at rest |
| Webhooks | Stripe signature verification (`whsec_*`) |
| API Keys | SHA256 hashed in BigQuery, KMS encrypted for recovery |
| Auth Comparison | Constant-time hash comparison (timing-attack safe) |

---

## Login Security

| Feature | Implementation |
|---------|----------------|
| Server Action | `loginWithSecurity` — validates inputs before Supabase auth call |
| Rate Limiting | Per-user rate limiting on login attempts |
| Session Reasons | `session_expired`, `auth_error`, `account_locked` (query param on redirect) |
| Billing Enforcement | Inactive billing statuses redirect to billing page |

---

## Open Redirect Prevention

All redirect URLs are validated before use:

| Check | Rule |
|-------|------|
| Must start with | `/` (relative path only) |
| Must not contain | `//` (protocol-relative URLs) |
| Must not contain | `\` (backslash bypass) |
| Must not contain | `@` (credential injection) |
| Must not contain | Control characters |

---

## Input Validation Standards

| Validator | Pattern | Use |
|-----------|---------|-----|
| `isValidOrgSlug` | `^[a-z0-9_]{3,50}$` | Org slug validation (lowercase, 3-50 chars) |
| `sanitizeOrgName` | Remove HTML/dangerous chars | Org name cleanup |
| `isValidEmail` | RFC-compliant, max 254 chars | Email validation |
| `isValidUUID` | Standard UUID format | ID validation |
| Null byte detection | Reject `\0` in all inputs | Injection prevention |
| Size limits | Enforced per field | DoS prevention |

---

## API Key Security

| Property | Implementation |
|----------|----------------|
| Format | `{org_slug}_api_{random_16_chars}` |
| Storage | SHA256 hash stored in BigQuery |
| Recovery | KMS-encrypted original stored for admin recovery |
| Comparison | Constant-time hash comparison |
| Display | Raw key shown once at creation, never again |

---

## Rate Limiting

| Operation | Limit |
|-----------|-------|
| Login | Rate-limited per user |
| Checkout | 1 per 30s per user |
| Team invites | 10 per hour per org |
| API requests | 100 req/min per org, 10,000 req/min global |

---

## Frontend Security Patterns

| Pattern | Implementation |
|---------|----------------|
| Error Boundaries | Wrapping throughout frontend (per-page and per-component) |
| Loading States | Spinner components for async operations |
| Billing Status | Inactive statuses redirect to billing page automatically |

---

## Backend Security Standards

| Standard | Requirement |
|----------|-------------|
| CA_ROOT_API_KEY | Min 32 chars, NEVER default value |
| DISABLE_AUTH | MUST be `false` in production |
| KMS | All credentials encrypted before storage (AES-256 via GCP Cloud KMS) |
| API keys | SHA256 hashed in BigQuery — raw key shown once |
| Logging | Never log raw credentials; use SHA256 fingerprints |
| Webhook verification | Stripe signatures verified on all incoming events |

---

## Audit Logging

| Property | Implementation |
|----------|----------------|
| Table | `org_audit_logs` in BigQuery |
| Scope | All mutations (create, update, delete) |
| Fields | org_slug, action, actor, target, timestamp, metadata |

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/lib/validators.ts` | Frontend input validation |
| `01-fronted-system/app/actions/auth-actions.ts` | `loginWithSecurity` server action |
| `02-api-service/src/app/dependencies/auth.py` | Backend auth middleware |
| `02-api-service/src/lib/encryption.py` | KMS encryption/decryption |
| `03-data-pipeline-service/SECURITY.md` | Full security documentation |
