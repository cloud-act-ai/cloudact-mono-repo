# Organization Onboarding

**Status**: IMPLEMENTED (v1.6) | **Updated**: 2026-01-01

> Org creation + BigQuery dataset + API key. Related: [User Management](01_USER_MANAGEMENT.md) | [Billing](01_BILLING_STRIPE.md)

---

## Quick Reference

| Route | Purpose |
|-------|---------|
| `/onboarding/organization` | Company name/type input |
| `/onboarding/billing` | Plan selection |
| `/onboarding/success` | Complete onboarding + show API key |
| `/{org}/settings/onboarding` | View/rotate API key |

---

## Two-Phase Flow

```
PHASE 1: Frontend (Supabase)              PHASE 2: Backend (BigQuery)
────────────────────────────              ────────────────────────────
1. Signup at /signup                      6. POST /api/v1/organizations/onboard
2. Enter company name + type                 ├─ Create org_profiles
3. Select plan at /onboarding/billing        ├─ Generate API key (SHA256 + KMS)
4. Stripe Checkout completes                 ├─ Create org_subscriptions
5. completeOnboarding() creates:             ├─ Create org_usage_quotas
   ├─ Supabase org record                    └─ Create BigQuery dataset
   ├─ org_slug: {firstWord}_{MMDDYYYY}    7. API key returned (SHOWN ONCE)
   └─ organization_members (owner)        8. Key stored in org_api_keys_secure
```

---

## Data Storage

| Storage | Table | Purpose |
|---------|-------|---------|
| Supabase | `organizations` | Org metadata, billing status |
| Supabase | `org_api_keys_secure` | Full API key (server-side only) |
| BigQuery | `organizations.org_profiles` | Central org registry |
| BigQuery | `organizations.org_api_keys` | Hashed API keys |
| BigQuery | `organizations.org_subscriptions` | Plan limits |
| BigQuery | `{org_slug}_{env}` | Per-org dataset |

---

## API Key Format

```
Format: {org_slug}_api_{random_16_chars}
Example: acme_corp_api_xK9mN2pL5qR8sT1v

Storage:
├─ SHA256 hash → BigQuery lookup
├─ KMS encrypted → Recovery
├─ Fingerprint (last 4) → Display
└─ Plaintext → Returned ONCE
```

---

## Plan Limits

| Plan | Daily | Monthly | Concurrent | Seats | Providers |
|------|-------|---------|------------|-------|-----------|
| STARTER | 6 | 180 | 1 | 2 | 3 |
| PROFESSIONAL | 20 | 600 | 3 | 5 | 10 |
| SCALE | 50+ | 1500+ | 5+ | 10+ | 20+ |

---

## API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/v1/organizations/dryrun` | X-CA-Root-Key | Validate before onboarding |
| `POST /api/v1/organizations/onboard` | X-CA-Root-Key | Create org + dataset + API key |
| `PUT /api/v1/organizations/{org}/subscription` | X-CA-Root-Key | Sync from Stripe webhook |
| `POST /api/v1/organizations/{org}/api-key/rotate` | X-API-Key | Rotate API key |

---

## Validation

```
Org slug: ^[a-zA-Z0-9_]{3,50}$
- Alphanumeric + underscores ONLY
- NO hyphens
- 3-50 characters
```

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/organization.ts` | Org creation |
| `01-fronted-system/actions/backend-onboarding.ts` | Backend onboarding |
| `02-api-service/src/app/routers/organizations.py` | Onboarding endpoints |
| `02-api-service/src/core/processors/setup/organizations/onboarding.py` | Dataset creation |

---

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| 409 Conflict | Org exists | Use `regenerate_api_key_if_exists=true` |
| 400 Bad Request | Invalid org_slug | Use alphanumeric + underscore only |
| 401 Unauthorized | Missing X-CA-Root-Key | Include admin API key |
| 500 KMS Error | KMS failed | Check KMS key permissions |

---

## Not Implemented

- Org deletion (manual only)
- Dataset migration
- Multi-region datasets

---

**v1.6** | 2026-01-01
