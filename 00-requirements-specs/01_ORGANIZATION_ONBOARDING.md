# Organization Onboarding

**v1.6** | 2026-01-15

> Org creation → BigQuery dataset → API key

---

## Two-Phase Flow

```
PHASE 1: Frontend (Supabase)       PHASE 2: Backend (BigQuery)
1. Signup → 2. Company → 3. Plan   POST /api/v1/organizations/onboard
   ↓                                  ├─ org_profiles
4. Stripe Checkout                    ├─ org_api_keys (SHA256 + KMS)
5. Supabase org record                ├─ org_subscriptions
   org_slug: {name}_{MMDDYYYY}        └─ {org_slug}_prod dataset
```

---

## API Endpoints (Port 8000)

```bash
POST /api/v1/organizations/dryrun   # Validate (X-CA-Root-Key)
POST /api/v1/organizations/onboard  # Create (X-CA-Root-Key)
POST /api/v1/organizations/{org}/api-key/rotate  # Rotate (X-API-Key)
```

---

## API Key Format

```
{org_slug}_api_{random_16_chars}
Example: acme_corp_api_xK9mN2pL5qR8sT1v

Storage: SHA256 hash → BigQuery, KMS encrypted → recovery
Shown: ONCE during onboarding
```

---

## Plan Limits

| Plan | Daily Pipelines | Providers | Seats |
|------|-----------------|-----------|-------|
| Starter | 6 | 3 | 2 |
| Professional | 20 | 10 | 5 |
| Scale | 50+ | 20+ | 10+ |

---

## Validation

```
Org slug: ^[a-zA-Z0-9_]{3,50}$
(Alphanumeric + underscores only, NO hyphens)
```

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/backend-onboarding.ts` | Frontend action |
| `02-api-service/src/app/routers/organizations.py` | API |
