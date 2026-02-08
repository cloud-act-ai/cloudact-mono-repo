# Security

**v2.1** | 2026-02-05

> Defense-in-depth for CloudAct

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
| Input | Server action validators (org slug, email, UUID) |
| Transport | HTTPS/TLS (enforced on all Cloud Run services) |
| Session | Supabase Auth (httpOnly JWT, secure cookies) |
| Authorization | RBAC (owner/collaborator/read_only) + Supabase RLS |
| Credentials | GCP KMS AES-256 encryption at rest |
| Webhooks | Stripe signature verification (`whsec_*`) |
| API Keys | SHA256 hashed in BigQuery, KMS encrypted for recovery |

---

## Input Validation Standards

| Validator | Pattern | Use |
|-----------|---------|-----|
| `isValidOrgSlug` | `^[a-zA-Z0-9_]{2,100}$` | Org slug validation |
| `sanitizeOrgName` | Remove HTML/dangerous chars | Org name cleanup |
| `isValidEmail` | RFC-compliant, max 254 chars | Email validation |
| `isValidUUID` | Standard UUID format | ID validation |

---

## Rate Limiting

| Operation | Limit |
|-----------|-------|
| Checkout | 1 per 30s per user |
| Team invites | 10 per hour per org |
| API requests | 100 req/min per org, 10,000 req/min global |

---

## Backend Security Standards

| Standard | Requirement |
|----------|-------------|
| CA_ROOT_API_KEY | Min 32 chars, NEVER default value |
| DISABLE_AUTH | MUST be `false` in production |
| KMS | All credentials encrypted before storage |
| API keys | SHA256 hashed in BigQuery — raw key shown once |
| Logging | Never log raw credentials; use SHA256 fingerprints |
| Webhook verification | Stripe signatures verified on all incoming events |

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/validators.ts` | Frontend input validation |
| `02-api-service/src/app/dependencies/auth.py` | Backend auth middleware |
| `03-data-pipeline-service/SECURITY.md` | Full security documentation |
