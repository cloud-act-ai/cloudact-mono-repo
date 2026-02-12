# Security Audit - Requirements

## Overview

Defense-in-depth security across CloudAct frontend, API, and pipeline services. Covers input validation, authentication, authorization, credential management, rate limiting, and audit logging.

## Source Specification

`00-requirements-specs/05_SECURITY.md` (v3.0, 2026-02-08)

---

## Functional Requirements

### FR-SEC-01: Security Workflow

All requests follow the defense-in-depth chain:

```
Request -> Input validation -> HTTPS/TLS -> Supabase Auth (JWT)
        -> RBAC check (owner/collaborator/read_only) -> RLS (row-level)
        -> Business logic -> KMS decrypt (if credential needed) -> Response
```

### FR-SEC-02: Input Validation

| Validator | Pattern | Use |
|-----------|---------|-----|
| `isValidOrgSlug` | `^[a-z0-9_]{3,50}$` | Org slug (lowercase, 3-50 chars) |
| `sanitizeOrgName` | Remove HTML/dangerous chars | Org name cleanup |
| `isValidEmail` | RFC-compliant, max 254 chars | Email validation |
| `isValidUUID` | Standard UUID format | ID validation |
| Null byte detection | Reject `\0` in all inputs | Injection prevention |
| Size limits | Enforced per field | DoS prevention |

### FR-SEC-03: Login Security

- Server action `loginWithSecurity` validates inputs before Supabase auth call
- Per-user rate limiting on login attempts
- Session reason codes: `session_expired`, `auth_error`, `account_locked` (query param on redirect)
- Inactive billing statuses redirect to billing page

### FR-SEC-04: Open Redirect Prevention

All redirect URLs must be validated:
- Must start with `/` (relative path only)
- Must not contain `//` (protocol-relative), `\` (backslash bypass), `@` (credential injection), or control characters

### FR-SEC-05: API Key Security

| Property | Implementation |
|----------|----------------|
| Format | `{org_slug}_api_{random_16_chars}` |
| Storage | SHA256 hash stored in BigQuery |
| Recovery | KMS-encrypted original stored for admin recovery |
| Comparison | Constant-time hash comparison (timing-attack safe) |
| Display | Raw key shown once at creation, never again |

### FR-SEC-06: Credential Encryption

All credentials encrypted at rest using GCP KMS AES-256 before storage. Raw credentials never logged -- use SHA256 fingerprints.

### FR-SEC-07: Webhook Verification

Stripe signatures (`whsec_*`) verified on all incoming webhook events.

### FR-SEC-08: Audit Logging

| Property | Implementation |
|----------|----------------|
| Table | `org_audit_logs` in BigQuery |
| Scope | All mutations (create, update, delete) |
| Fields | org_slug, action, actor, target, timestamp, metadata |

### FR-SEC-09: Rate Limiting

| Operation | Limit |
|-----------|-------|
| Login | Rate-limited per user |
| Checkout | 1 per 30s per user |
| Team invites | 10 per hour per org |
| API requests | 100 req/min per org, 10,000 req/min global |

---

## Non-Functional Requirements

### NFR-SEC-01: Transport Security

HTTPS/TLS enforced on all Cloud Run services. No plaintext HTTP in any environment.

### NFR-SEC-02: Session Management

Supabase Auth with httpOnly JWT and secure cookies. No client-accessible tokens.

### NFR-SEC-03: Authorization Model

RBAC with three roles: `owner`, `collaborator`, `read_only`. Enforced via Supabase RLS at row-level.

### NFR-SEC-04: Backend Security Standards

- `CA_ROOT_API_KEY`: minimum 32 chars, NEVER default value
- `DISABLE_AUTH`: MUST be `false` in production
- All credentials KMS-encrypted before storage
- API keys SHA256 hashed in BigQuery

### NFR-SEC-05: Frontend Security Patterns

- Error boundaries wrapping throughout frontend (per-page and per-component)
- Loading states with spinner components for async operations
- Billing status enforcement (inactive statuses auto-redirect to billing page)

---

## Security Layers Summary

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

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/lib/validators.ts` | Frontend input validation |
| `01-fronted-system/app/actions/auth-actions.ts` | `loginWithSecurity` server action |
| `02-api-service/src/app/dependencies/auth.py` | Backend auth middleware |
| `02-api-service/src/lib/encryption.py` | KMS encryption/decryption |
| `03-data-pipeline-service/SECURITY.md` | Full security documentation |
