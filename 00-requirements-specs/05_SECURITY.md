# Security

**v2.0** | 2026-01-15

> Defense-in-depth for CloudAct

---

## Security Layers

| Layer | Implementation |
|-------|----------------|
| Input | Server action validators |
| Transport | HTTPS/TLS |
| Session | Supabase Auth (httpOnly JWT) |
| Authorization | RBAC + RLS |
| Credentials | KMS encryption at rest |
| Webhooks | Stripe signature verification |

---

## Input Validation

```typescript
isValidOrgSlug(slug)     // ^[a-zA-Z0-9_]{2,100}$
sanitizeOrgName(name)    // Remove HTML/dangerous chars
isValidEmail(email)      // RFC-compliant, max 254
isValidUUID(uuid)        // Standard UUID format
```

---

## Rate Limiting

| Operation | Limit |
|-----------|-------|
| Checkout | 1 per 30s |
| Invites | 10 per hour |

---

## Backend Security

- **CA_ROOT_API_KEY**: Min 32 chars, NEVER default value
- **DISABLE_AUTH**: MUST be false in production
- **KMS**: All credentials encrypted
- **API keys**: SHA256 hashed in BigQuery

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/validators.ts` | Input validation |
| `03-data-pipeline-service/SECURITY.md` | Full security docs |
