# Organization Onboarding

**v1.7** | 2026-02-05

> Org creation → BigQuery dataset → API key

---

## Two-Phase Workflow

```
PHASE 1: Frontend (Supabase + Stripe)
1. Signup (email + password) → Supabase auth.users
2. Company info (name, currency, timezone)
3. Plan selection (Starter/Professional/Scale)
4. Stripe Checkout → Payment
5. Webhook → Supabase organizations table (source of truth for billing)
   org_slug: {company_name}_{base36_timestamp}
   billing_status, stripe_price_id, stripe_subscription_id stored here

PHASE 2: Backend (BigQuery)
POST /api/v1/organizations/onboard (X-CA-Root-Key)
├─ org_profiles (org metadata)
├─ org_api_keys (SHA256 hashed + KMS encrypted)
├─ org_subscriptions (plan limits — read from Supabase)
└─ {org_slug}_prod dataset (all org cost tables)
```

**Note:** No billing sync to BigQuery. API reads plan limits from Supabase directly.

---

## API Endpoints (Port 8000)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/organizations/dryrun` | X-CA-Root-Key | Validate before create |
| POST | `/organizations/onboard` | X-CA-Root-Key | Full onboarding |
| POST | `/organizations/{org}/api-key/rotate` | X-API-Key | Rotate API key |

---

## API Key Standard

- **Format:** `{org_slug}_api_{random_16_chars}` (e.g., `acme_corp_api_xK9mN2pL5qR8sT1v`)
- **Storage:** SHA256 hash in BigQuery, KMS encrypted for recovery
- **Display:** Shown ONCE during onboarding — cannot be retrieved again
- **Rotation:** Old key invalidated immediately on rotate

---

## Plan Limits

| Plan | Daily Pipelines | Monthly Pipelines | Concurrent | Providers | Seats | Price |
|------|-----------------|-------------------|------------|-----------|-------|-------|
| Starter | 6 | 180 | 20 | 3 | 2 | $19 |
| Professional | 25 | 750 | 20 | 6 | 6 | $69 |
| Scale | 100 | 3000 | 20 | 10 | 11 | $199 |

---

## Org Slug Standard

- **Pattern:** `{company_name}_{base36_timestamp}`
- **Validation:** `^[a-zA-Z0-9_]{3,50}$`
- **Rules:** Alphanumeric + underscores only, NO hyphens
- **Example:** `acme_inc_ml01ua8p` (auto-generated at signup)

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/backend-onboarding.ts` | Frontend server action |
| `02-api-service/src/app/routers/organizations.py` | API endpoints |
| `02-api-service/src/core/services/onboarding/` | Onboarding service |
