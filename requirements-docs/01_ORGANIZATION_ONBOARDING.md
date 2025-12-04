# Organization Onboarding

**Status**: IMPLEMENTED (v1.5) | **Updated**: 2025-12-04 | **Single Source of Truth**

> Organization creation, BigQuery dataset setup, API key generation
> NOT user authentication (see 01_USER_MANAGEMENT.md)
> NOT Stripe billing (see 01_BILLING_STRIPE.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier (3-50 chars, alphanumeric + underscore) | `acme_corp`, `genai_12042025` |
| `{env}` | Environment suffix | `local`, `stage`, `prod` |
| `{org_slug}_{env}` | Full BigQuery dataset name | `acme_corp_prod` |
| `{api_key}` | Organization API key | `acme_corp_api_abcdef1234567890` |

---

## TERMINOLOGY

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Organization** | Company/team entity in Supabase | Acme Corp | Supabase `organizations` |
| **Org Slug** | Unique identifier for org | `acme_corp` | `organizations.org_slug` |
| **Backend Onboarding** | Process to create BigQuery resources | Dataset + API key | BigQuery `org_profiles` |
| **Org Dataset** | Per-org BigQuery dataset for data | `acme_corp_prod` | BigQuery dataset |
| **Org API Key** | Credential for backend API access | `{org_slug}_api_{random}` | BigQuery `org_api_keys` |

---

## Where Data Lives

| Storage | Table/Dataset | What |
|---------|---------------|------|
| Supabase | `organizations` | Org metadata, billing status, plan limits |
| Supabase | `organization_members` | User membership |
| Supabase | `org_api_keys_secure` | API key storage (server-side only) |
| BigQuery | `organizations.org_profiles` | Central org registry |
| BigQuery | `organizations.org_api_keys` | Hashed API keys |
| BigQuery | `organizations.org_subscriptions` | Subscription limits |
| BigQuery | `organizations.org_usage_quotas` | Usage tracking |
| BigQuery | `{org_slug}_{env}` dataset | Per-org data tables |

---

## Lifecycle

| Stage | What Happens | State |
|-------|--------------|-------|
| **Signup** | User creates account | User exists, no org |
| **Org Created (Supabase)** | User creates org in frontend | Supabase org record |
| **Plan Selected** | User selects plan, starts checkout | Stripe session |
| **Payment Completed** | Stripe webhook confirms | Supabase org updated |
| **Backend Onboarding** | API service creates BigQuery resources | Dataset + API key created |
| **Integrations Added** | User adds LLM/cloud credentials | Ready for pipelines |
| **Active Usage** | User runs pipelines, views data | Operational |

---

## Architecture Flow

### Two-Phase Onboarding

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TWO-PHASE ONBOARDING                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: FRONTEND (Supabase)                                               │
│  ─────────────────────────────                                              │
│  1. User signs up at /signup                                                │
│  2. User enters company name + type                                         │
│  3. User selects billing plan at /onboarding/billing                       │
│  4. Stripe Checkout completes                                               │
│  5. Success page calls completeOnboarding()                                │
│     ├── Creates Supabase organization record                                │
│     │   - org_slug: {firstWord}_{MMDDYYYY}                                 │
│     │   - Plan limits from Stripe metadata                                  │
│     │   - billing_status: "trialing"                                       │
│     └── Creates organization_members (user as owner)                       │
│                                                                             │
│  PHASE 2: BACKEND (API Service)                                             │
│  ─────────────────────────────                                              │
│  6. Frontend calls onboardToBackend(orgSlug, companyName, email)           │
│     ├── Header: X-CA-Root-Key                                               │
│     └── Endpoint: POST /api/v1/organizations/onboard                        │
│  7. Backend creates:                                                        │
│     ├── BigQuery org_profiles record                                        │
│     ├── Org API key (SHA256 hash + KMS encrypted)                          │
│     ├── org_subscriptions record with limits                                │
│     ├── org_usage_quotas record for tracking                               │
│     └── Per-org BigQuery dataset: {org_slug}_{env}                         │
│  8. API key returned (SHOWN ONCE)                                           │
│  9. Frontend stores key reference in Supabase                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Org Slug Generation

**File:** `fronted-system/actions/organization.ts` (Lines 91-104)

```
Format: {firstWord}_{MMDDYYYY}
Example: "genai_12042025"

Algorithm:
1. Sanitize company name (remove HTML, special chars)
2. Extract first word, lowercase
3. Remove non-alphanumeric characters
4. Limit to 20 characters
5. Append date suffix (MMDDYYYY)
```

### Backend Onboarding Steps

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND ONBOARDING (8 Steps)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POST /api/v1/organizations/onboard                                         │
│  Header: X-CA-Root-Key (required)                                           │
│                                                                             │
│  Step 1: Check if org already exists                                        │
│          └── Query org_profiles for org_slug                                │
│          └── If exists + regenerate_api_key=false: 409 Conflict            │
│          └── If exists + regenerate_api_key=true: Skip to Step 3           │
│                                                                             │
│  Step 2: Create org_profiles record                                         │
│          └── org_slug, company_name, admin_email, status=ACTIVE            │
│                                                                             │
│  Step 3: Generate API Key                                                   │
│          └── Format: {org_slug}_api_{random_16_chars}                      │
│          └── SHA256 hash stored for lookup                                  │
│          └── KMS encrypted blob for recovery                                │
│          └── Plaintext returned ONCE                                        │
│                                                                             │
│  Step 4: Create org_subscriptions record                                    │
│          └── plan_name, daily_limit, monthly_limit, concurrent_limit        │
│          └── trial_end_date (14 days from now)                             │
│                                                                             │
│  Step 5: Create org_usage_quotas record                                     │
│          └── usage_id: {org_slug}_{YYYYMMDD}                               │
│          └── Counters initialized to 0                                      │
│                                                                             │
│  Step 6: Create BigQuery Dataset                                            │
│          └── OrgOnboardingProcessor.execute()                               │
│          └── Dataset: {project_id}.{org_slug}                              │
│          └── Metadata tables: saas_subscription_plans, llm_model_pricing   │
│          └── Views: pipeline_logs, step_logs, org_consolidated             │
│                                                                             │
│  Step 7: Store idempotency key                                              │
│          └── 24-hour TTL for duplicate prevention                           │
│                                                                             │
│  Step 8: Return response                                                    │
│          └── org_slug, api_key (plaintext), dataset info                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
Frontend (3000)                 API Service (8000)              BigQuery
     │                              │                              │
     │  1. completeOnboarding()     │                              │
     │  (after Stripe success)      │                              │
     ├─────────────────────────────>│ Supabase INSERT              │
     │                              │                              │
     │  2. onboardToBackend()       │                              │
     │     X-CA-Root-Key            │                              │
     ├─────────────────────────────>│                              │
     │                              │  INSERT org_profiles         │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  Generate API Key            │
     │                              │  SHA256 + KMS encrypt        │
     │                              │  INSERT org_api_keys         │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  INSERT org_subscriptions    │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  INSERT org_usage_quotas     │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  CREATE DATASET              │
     │                              │  CREATE metadata tables      │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │<─────────────────────────────│  Return api_key (once)       │
     │                              │                              │
     │  3. Store API key            │                              │
     │     - Full key in user_metadata                             │
     │     - Fingerprint in organizations                          │
     │                              │                              │

Authentication:
- X-CA-Root-Key: Admin key for onboarding
- API Key: Org key for subsequent operations
```

---

## Schema Definitions

### BigQuery: org_profiles

**File:** `api-service/configs/setup/bootstrap/schemas/org_profiles.json`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| org_slug | STRING | REQUIRED | Primary key |
| company_name | STRING | REQUIRED | Organization name |
| admin_email | STRING | REQUIRED | Admin contact |
| org_dataset_id | STRING | REQUIRED | Dataset name |
| status | STRING | REQUIRED | ACTIVE, SUSPENDED, CANCELLED |
| subscription_plan | STRING | NULLABLE | Plan name |
| created_at | TIMESTAMP | REQUIRED | Creation time |
| updated_at | TIMESTAMP | NULLABLE | Last update |

### BigQuery: org_api_keys

**File:** `api-service/configs/setup/bootstrap/schemas/org_api_keys.json`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| org_api_key_id | STRING | REQUIRED | UUID for key |
| org_slug | STRING | REQUIRED | FK to org_profiles |
| org_api_key_hash | STRING | REQUIRED | SHA256 hash for lookup |
| encrypted_org_api_key | BYTES | NULLABLE | KMS encrypted backup |
| scopes | STRING | REPEATED | Permission scopes |
| is_active | BOOLEAN | REQUIRED | Active flag |
| expires_at | TIMESTAMP | NULLABLE | Expiration (if any) |
| created_at | TIMESTAMP | REQUIRED | Creation time |
| last_used_at | TIMESTAMP | NULLABLE | Last usage |

### BigQuery: org_subscriptions

**File:** `api-service/configs/setup/bootstrap/schemas/org_subscriptions.json`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| subscription_id | STRING | REQUIRED | UUID |
| org_slug | STRING | REQUIRED | FK to org_profiles |
| plan_name | STRING | REQUIRED | STARTER, PROFESSIONAL, SCALE |
| status | STRING | REQUIRED | ACTIVE, TRIAL, SUSPENDED, CANCELLED |
| daily_limit | INTEGER | REQUIRED | Pipelines per day |
| monthly_limit | INTEGER | REQUIRED | Pipelines per month |
| concurrent_limit | INTEGER | REQUIRED | Concurrent pipelines |
| seat_limit | INTEGER | NULLABLE | Team member limit |
| providers_limit | INTEGER | NULLABLE | Integration limit |
| trial_end_date | DATE | NULLABLE | Trial expiration |
| created_at | TIMESTAMP | REQUIRED | Creation time |
| updated_at | TIMESTAMP | NULLABLE | Last update |

### BigQuery: org_usage_quotas

Partitioned by: `usage_date` (daily)

| Column | Type | Description |
|--------|------|-------------|
| usage_id | STRING | `{org_slug}_{YYYYMMDD}` |
| org_slug | STRING | FK to org_profiles |
| usage_date | DATE | Partition key |
| pipelines_run_today | INTEGER | Daily counter |
| pipelines_run_month | INTEGER | Monthly counter |
| concurrent_pipelines_running | INTEGER | Current running |
| daily_limit | INTEGER | Plan limit |
| monthly_limit | INTEGER | Plan limit |
| concurrent_limit | INTEGER | Plan limit |

### Supabase: organizations (Relevant Columns)

| Column | Type | Description |
|--------|------|-------------|
| backend_onboarded | BOOLEAN | Backend onboarding complete |
| backend_api_key_fingerprint | STRING | Last 4 chars of API key |
| backend_onboarded_at | TIMESTAMPTZ | When onboarded |

---

## API Service Endpoints

**File:** `api-service/src/app/routers/organizations.py`

### POST /api/v1/organizations/dryrun

**Authentication:** X-CA-Root-Key (admin)

**Purpose:** Validate org before onboarding (no resources created)

**Validation Checks:**
1. Org slug format validation (`^[a-zA-Z0-9_]{3,50}$`)
2. Email format validation
3. GCP credentials validation
4. BigQuery connectivity test
5. Subscription plan validation
6. Organization uniqueness check
7. Central tables existence check

**Response:**
```typescript
{
  status: "SUCCESS" | "FAILED",
  org_slug: string,
  validation_summary: {
    total_checks: number,
    passed: number,
    failed: number,
    all_passed: boolean
  },
  validation_results: Array<{
    check_name: string,
    passed: boolean,
    message: string
  }>,
  ready_for_onboarding: boolean
}
```

### POST /api/v1/organizations/onboard

**Authentication:** X-CA-Root-Key (admin)

**Request:**
```typescript
{
  org_slug: string,              // Required: 3-50 chars, alphanumeric + underscore
  company_name: string,          // Required: 2-200 chars
  admin_email: string,           // Required: valid email
  subscription_plan?: string,    // Default: "STARTER"
  dataset_location?: string,     // Default: "US"
  force_recreate_dataset?: boolean,  // Default: false (DESTRUCTIVE)
  regenerate_api_key_if_exists?: boolean  // Default: false
}
```

**Response:**
```typescript
{
  org_slug: string,
  api_key: string,               // Plaintext - SHOWN ONCE
  subscription_plan: string,
  dataset_location: string,
  dataset_created: boolean,
  tables_created: string[],
  dryrun_status: string,
  message: string
}
```

### PUT /api/v1/organizations/{org_slug}/subscription

**Authentication:** X-CA-Root-Key (admin)

**Purpose:** Sync subscription changes from Stripe webhook

**Updates:**
- org_subscriptions (plan, status, limits)
- org_usage_quotas (limits)
- org_profiles (subscription_plan)

### POST /api/v1/organizations/{org_slug}/api-key/rotate

**Authentication:** X-API-Key (current org key)

**Purpose:** Generate new API key, revoke old ones

**Response:**
```typescript
{
  org_slug: string,
  api_key: string,               // New key - SHOWN ONCE
  api_key_fingerprint: string,   // Last 4 chars
  previous_key_revoked: boolean,
  message: string
}
```

### GET /api/v1/organizations/{org_slug}/api-key

**Authentication:** X-API-Key or X-CA-Root-Key

**Purpose:** Get API key info (fingerprint only, not actual key)

---

## Frontend Implementation

### Server Actions

**File:** `fronted-system/actions/backend-onboarding.ts`

#### onboardToBackend()

```typescript
async function onboardToBackend(input: {
  orgSlug: string,
  companyName: string,
  adminEmail: string,
  subscriptionPlan?: "STARTER" | "PROFESSIONAL" | "SCALE"
}): Promise<{
  success: boolean,
  orgSlug?: string,
  apiKey?: string,
  apiKeyFingerprint?: string,
  error?: string
}>
```

**Flow:**
1. Get current user from Supabase
2. Get backend URL from environment
3. Get CA_ROOT_API_KEY from server env
4. Call backend POST /api/v1/organizations/onboard
5. Store API key in `org_api_keys_secure` table
6. Update Supabase org with fingerprint
7. Return API key (shown once to user)

**Error Handling:**
- 409 Conflict: Auto-retry with `regenerate_api_key_if_exists=true`
- Other errors: Return failure without failing entire onboarding

#### getOrgApiKeySecure()

```typescript
async function getOrgApiKeySecure(orgSlug: string): Promise<string | null>
```

- Server-side only function
- Queries `org_api_keys_secure` table
- Uses service_role client (bypasses RLS)

#### rotateApiKey()

```typescript
async function rotateApiKey(orgSlug: string): Promise<{
  success: boolean,
  apiKey?: string,
  apiKeyFingerprint?: string,
  error?: string
}>
```

- Validates org membership
- Acquires rotation lock (prevents concurrent rotations)
- Calls backend key rotation endpoint
- Updates Supabase fingerprint
- Stores new key in secure storage

#### syncSubscriptionToBackend()

```typescript
async function syncSubscriptionToBackend(params: {
  orgSlug: string,
  planName?: string,
  billingStatus?: string,
  dailyLimit?: number,
  monthlyLimit?: number,
  concurrentLimit?: number,
  seatLimit?: number,
  providersLimit?: number,
  trialEndsAt?: string,
  syncType?: 'plan_change' | 'checkout' | 'webhook'
}): Promise<{ success: boolean, error?: string }>
```

**Status Mapping:**
| Frontend (Supabase) | Backend (BigQuery) |
|---------------------|-------------------|
| trialing | TRIAL |
| active | ACTIVE |
| past_due | SUSPENDED |
| canceled | CANCELLED |
| paused | SUSPENDED |

### Pages

| Route | Purpose |
|-------|---------|
| `/onboarding/organization` | Company name/type input |
| `/onboarding/billing` | Plan selection |
| `/onboarding/success` | Complete onboarding after Stripe |
| `/{org}/settings/onboarding` | View API key, re-onboard |

---

## Subscription Plan Limits

| Plan | Daily | Monthly | Concurrent | Seats | Providers |
|------|-------|---------|------------|-------|-----------|
| STARTER | 6 | 180 | 1 | 2 | 3 |
| PROFESSIONAL | 20 | 600 | 3 | 5 | 10 |
| SCALE | 50+ | 1500+ | 5+ | 10+ | 20+ |

---

## Security Measures

### API Key Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API KEY SECURITY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GENERATION                                                                 │
│  ├── Format: {org_slug}_api_{random_16_chars}                              │
│  ├── Random: secrets.token_urlsafe(16)                                     │
│  └── Example: acme_corp_api_xK9mN2pL5qR8sT1v                              │
│                                                                             │
│  STORAGE                                                                    │
│  ├── SHA256 Hash: For lookup verification                                  │
│  ├── KMS Encrypted: For recovery (encrypted bytes)                         │
│  ├── Fingerprint: Last 4 chars (for display)                               │
│  └── Plaintext: Returned ONCE, never stored                                │
│                                                                             │
│  VERIFICATION                                                               │
│  ├── Hash incoming key with SHA256                                         │
│  ├── Query org_api_keys by hash                                            │
│  └── Extract org_slug from matched record                                  │
│                                                                             │
│  LOCATIONS                                                                  │
│  ├── BigQuery: org_api_keys (hash + encrypted)                             │
│  ├── Supabase: org_api_keys_secure (full key, service_role only)           │
│  └── Frontend: user.user_metadata.org_api_keys[orgSlug]                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Input Validation

**Org Slug:**
```
Pattern: ^[a-zA-Z0-9_]{3,50}$
- Alphanumeric + underscores ONLY
- 3-50 characters
- NO hyphens (unlike some slug formats)
```

**Company Name:**
```typescript
function sanitizeOrgName(name: string): string {
  return name
    .replace(/<[^>]*>/g, "")      // Remove HTML tags
    .replace(/[<>"'&;]/g, "")     // Remove dangerous chars
    .trim()
    .slice(0, 100)                // Limit length
}
```

### KMS Encryption

- All API keys encrypted with GCP KMS before storage
- Mandatory in production (hard fail if KMS unavailable)
- Shared key for all orgs (isolation via org_slug filter)

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| Org creation (Supabase) | Frontend | actions/organization.ts |
| Backend onboarding endpoint | API Service | routers/organizations.py |
| Dry-run validation | API Service | routers/organizations.py |
| API key generation | API Service | routers/organizations.py |
| API key rotation | API Service | routers/organizations.py |
| Dataset creation | API Service | processors/organizations/onboarding.py |
| Subscription sync | Frontend | actions/backend-onboarding.ts |
| API key secure storage | Frontend | org_api_keys_secure table |
| Onboarding UI | Frontend | app/onboarding/* |

### NOT IMPLEMENTED

| Component | Notes |
|-----------|-------|
| Org deletion | Manual process only |
| Dataset migration | Not supported |
| Multi-region datasets | Single location per org |

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| 409 Conflict | Org already exists | Use `regenerate_api_key_if_exists=true` |
| 400 Bad Request | Invalid org_slug | Alphanumeric + underscore, 3-50 chars |
| 401 Unauthorized | Missing X-CA-Root-Key | Include admin API key |
| 500 KMS Error | KMS encryption failed | Check KMS key permissions |
| Backend Connection Failed | API_SERVICE_URL not set | Set env vars, retry from Settings |

---

## Test Files

| File | Purpose |
|------|---------|
| `api-service/tests/test_02_organizations.py` | Onboarding endpoint tests |
| `fronted-system/tests/01-signup-onboarding-billing-dashboard.test.ts` | E2E onboarding flow |

---

## File References

### Backend Files

| File | Purpose |
|------|---------|
| `api-service/src/app/routers/organizations.py` | Onboarding endpoints (948 lines) |
| `api-service/src/core/processors/setup/organizations/onboarding.py` | Dataset creation processor |
| `api-service/src/core/processors/setup/organizations/dryrun.py` | Validation processor |
| `api-service/configs/setup/bootstrap/schemas/org_profiles.json` | Schema |
| `api-service/configs/setup/bootstrap/schemas/org_api_keys.json` | Schema |
| `api-service/configs/setup/bootstrap/schemas/org_subscriptions.json` | Schema |

### Frontend Files

| File | Purpose |
|------|---------|
| `fronted-system/actions/organization.ts` | Org creation (200 lines) |
| `fronted-system/actions/backend-onboarding.ts` | Backend onboarding (1084 lines) |
| `fronted-system/app/onboarding/organization/page.tsx` | Org form |
| `fronted-system/app/onboarding/billing/page.tsx` | Plan selection |
| `fronted-system/app/onboarding/success/page.tsx` | Completion page |
| `fronted-system/app/[orgSlug]/settings/onboarding/page.tsx` | Settings view |

---

**Version**: 1.5 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
