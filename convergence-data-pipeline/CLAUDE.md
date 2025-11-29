# CLAUDE.md - Convergence Data Pipeline

**Full Platform Architecture:** `../../ARCHITECTURE.md`

**Security Documentation:** `SECURITY.md` - Production requirements, API key handling, credential management

## Core Principle

**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

**Single Source of Truth:** All configs, schemas, and pipeline definitions live in `configs/`

---

## Quick Reference: Frontend ↔ Backend Flow

```
Frontend (Supabase)                    Backend (BigQuery)
─────────────────                      ──────────────────
1. User signup
2. Org created in Supabase
3. Stripe subscription
                    ────────────────►
4. Call /organizations/onboard         5. Create dataset + API key
                    ◄────────────────
6. Save fingerprint to Supabase        (returns api_key - shown once!)
                    ────────────────►
7. User adds credentials               8. Validate → KMS encrypt → Store
   (via integration pages)
                    ◄────────────────
9. Save status to Supabase columns     (returns validation_status)

                                       10. Daily scheduler runs pipelines
                                       11. User can trigger ad-hoc runs
```

---

## API Key Architecture

### Key Types
| Key | Header | Used For |
|-----|--------|----------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, Org Onboarding |
| Org API Key | `X-API-Key` | Integrations, Pipelines, Data |

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. BOOTSTRAP (One-time system setup)                           │
│  POST /api/v1/admin/bootstrap                                   │
│  Header: X-CA-Root-Key: {CA_ROOT_API_KEY}                       │
│                                                                 │
│  Creates centralized "organizations" dataset with meta tables:  │
│  └── org_api_keys, org_profiles, org_subscriptions, etc.        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. ONBOARD ORGANIZATION                                        │
│  POST /api/v1/organizations/onboard                             │
│  Header: X-CA-Root-Key: {CA_ROOT_API_KEY}                       │
│                                                                 │
│  Creates:                                                       │
│  ├── org_api_keys row (SHA256 hash + KMS encrypted key)        │
│  ├── org_profiles row (company info)                            │
│  ├── org_subscriptions row (plan limits)                        │
│  ├── org_usage_quotas row (initialized to 0)                    │
│  └── Dataset: {org_slug} (per-org data isolation)               │
│                                                                 │
│  Returns: api_key (shown ONCE, stored in frontend user metadata)│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. SETUP INTEGRATIONS                                          │
│  POST /api/v1/integrations/{org_slug}/{provider}/setup          │
│  Header: X-API-Key: {org_api_key}                               │
│                                                                 │
│  Stores credentials (KMS encrypted) per org:                    │
│  ├── GCP Service Account JSON (gcp/setup)                       │
│  ├── OpenAI API Key (openai/setup) + init pricing/subscriptions │
│  ├── Anthropic API Key (anthropic/setup)                        │
│  └── DeepSeek API Key (deepseek/setup)                          │
│                                                                 │
│  Isolation: WHERE org_slug = @org_slug                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. RUN PIPELINES                                               │
│  POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}│
│  Header: X-API-Key: {org_api_key}                               │
│                                                                 │
│  Execution:                                                     │
│  1. Validate org API key → get org_slug                         │
│  2. Check quota: WHERE org_slug = @org_slug                     │
│  3. Get credentials: WHERE org_slug = @org_slug AND provider=X  │
│  4. KMS decrypt org's credentials                               │
│  5. Create BigQuery client with org's credentials               │
│  6. Execute pipeline                                            │
│  7. Write results to {project}.{org_slug}.{table}               │
│  8. Log execution: INSERT ... (org_slug, pipeline_id, ...)      │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Tenant Isolation

**Single KMS Key for All Orgs** - Isolation is at DATA layer:

```sql
-- Credentials encrypted with shared KMS key
-- Isolation via org_slug filter in every query
SELECT encrypted_credential
FROM organizations.org_integration_credentials
WHERE org_slug = @org_slug  -- ← THIS provides isolation
  AND provider = 'GCP_SA'
```

**Concurrent Pipeline Execution (Org A + Org B):**
- Each request authenticated by unique org API key
- org_slug extracted from API key lookup
- Credentials fetched: WHERE org_slug = @org_slug
- Separate BigQuery client per execution
- Data writes to separate datasets: {org_slug}.*
- NO shared state between executions

## MUST FOLLOW: Authentication Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TWO API KEY TYPES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CA_ROOT_API_KEY (X-CA-Root-Key header)                         │
│  ───────────────────────────────────────                        │
│  Source: Environment variable CA_ROOT_API_KEY                   │
│  Storage: NOT stored anywhere - compared directly               │
│  Purpose: Bootstrap, onboarding, platform operations            │
│  Code: src/app/dependencies/auth.py:verify_admin_key()          │
│                                                                 │
│  ORGANIZATION API KEY (X-API-Key header)                        │
│  ────────────────────────────────────────                       │
│  Source: Generated during onboarding                            │
│  Format: {org_slug}_api_{random_16_chars}                       │
│  Storage: SHA256 hash + KMS encrypted in org_api_keys table     │
│  Purpose: Run pipelines for that organization                   │
│  Code: src/app/dependencies/auth.py:get_current_org()           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## MUST FOLLOW: Who Uses What Key

```
┌─────────────────────────────────────────────────────────────────┐
│                    WHO USES WHAT                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PLATFORM ADMIN (You)                                           │
│  ────────────────────                                           │
│  Key: CA_ROOT_API_KEY (X-CA-Root-Key header)                    │
│  Can do:                                                        │
│    ✓ Bootstrap system (one-time)                                │
│    ✓ Onboard new organizations                                  │
│    ✓ Dry-run validation                                         │
│    ✓ Platform-level operations                                  │
│  NEVER share with customers!                                    │
│                                                                 │
│  CUSTOMER (e.g., guruinc_234234)                                │
│  ───────────────────────────────                                │
│  Key: guruinc_234234_api_xxxxxxxx (X-API-Key header)            │
│  Can do:                                                        │
│    ✓ Run pipelines for THEIR org only                           │
│    ✓ View THEIR pipeline results                                │
│  Cannot do:                                                     │
│    ✗ Bootstrap or onboard                                       │
│    ✗ Access other orgs' data                                    │
│    ✗ Use Admin endpoints                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Handoff Flow: Admin → Customer

```
┌──────────────────┐                    ┌──────────────────┐
│  PLATFORM ADMIN  │                    │     CUSTOMER     │
│  (You)           │                    │  (guruinc)       │
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         │ 1. Onboard org (Admin Key)            │
         │    POST /organizations/onboard        │
         │                                       │
         │ 2. Get Org API Key from response      │
         │    "guruinc_234234_api_xxxxxxxx"      │
         │                                       │
         │ 3. Give Org API Key to customer ──────┼───────────►
         │    (email, secure channel, etc.)      │
         │                                       │
         │                                       │ 4. Customer runs pipelines
         │                                       │    POST /pipelines/run/...
         │                                       │    Header: X-API-Key
         │                                       │
         ▼                                       ▼
```

---

## MUST FOLLOW: Complete Customer Lifecycle (Frontend → Backend)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE CUSTOMER LIFECYCLE                              │
│                    Frontend (Supabase) ↔ Backend (BigQuery)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ PHASE 1: USER SIGNUP & ORG CREATION (Frontend Only)                 │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ 1. User signs up via Supabase Auth                                  │    │
│  │ 2. User creates organization in Supabase                            │    │
│  │ 3. User subscribes to plan via Stripe                               │    │
│  │ ↓                                                                   │    │
│  │ Supabase stores: org_slug, user_id, subscription status             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ PHASE 2: BACKEND ONBOARDING (One-time per org)                      │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ Frontend calls: POST /api/v1/organizations/onboard                  │    │
│  │ Backend creates:                                                    │    │
│  │   - org_profile in BigQuery                                         │    │
│  │   - org_api_key (hashed + KMS encrypted)                            │    │
│  │   - org_subscription record                                         │    │
│  │   - Customer dataset: {org_slug}_{env}                              │    │
│  │                                                                     │    │
│  │ Returns: { api_key: "org_xxx_api_xxxxxxxx" } ← SHOWN ONCE!          │    │
│  │                                                                     │    │
│  │ Frontend saves to Supabase:                                         │    │
│  │   - backend_onboarded: true                                         │    │
│  │   - backend_api_key_fingerprint: "xxxx" (last 4 chars for display)  │    │
│  │   - backend_onboarded_at: timestamp                                 │    │
│  │   ❌ NEVER stores actual API key                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ PHASE 3: INTEGRATIONS SETUP (User provides credentials)             │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ User adds LLM/Cloud provider credentials via frontend UI            │    │
│  │ Frontend calls backend with Org API Key:                            │    │
│  │                                                                     │    │
│  │   POST /integrations/{org_slug}/openai/setup                        │    │
│  │   POST /integrations/{org_slug}/anthropic/setup                     │    │
│  │   POST /integrations/{org_slug}/deepseek/setup                      │    │
│  │   POST /integrations/{org_slug}/gcp/setup                           │    │
│  │                                                                     │    │
│  │ Backend for each:                                                   │    │
│  │   1. Validates credential (calls provider API)                      │    │
│  │   2. KMS encrypts credential                                        │    │
│  │   3. Stores in org_integration_credentials (BigQuery)               │    │
│  │   4. Returns: { success: true, validation_status: "VALID" }         │    │
│  │                                                                     │    │
│  │ Frontend saves to Supabase (reference only):                        │    │
│  │   - integration_{provider}_status: "VALID"                          │    │
│  │   - integration_{provider}_configured_at: timestamp                 │    │
│  │   ❌ NEVER stores actual credentials                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ PHASE 4: PIPELINE EXECUTION (Data Processing)                       │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │ TWO MODES:                                                          │    │
│  │                                                                     │    │
│  │ A) SCHEDULED (Daily Automatic) - Offline batch processing           │    │
│  │    - Runs daily via Cloud Scheduler / cron                          │    │
│  │    - Processes all orgs with valid integrations                     │    │
│  │    - No user intervention needed                                    │    │
│  │                                                                     │    │
│  │ B) AD-HOC (User Triggered) - On-demand                              │    │
│  │    - User clicks "Run Now" in frontend                              │    │
│  │    - Frontend calls: POST /pipelines/run/{org}/{provider}/{domain}  │    │
│  │    - Useful for: backfills, immediate data refresh, testing         │    │
│  │                                                                     │    │
│  │ Pipeline Flow:                                                      │    │
│  │   1. Decrypt stored credentials from BigQuery                       │    │
│  │   2. Fetch data from provider (GCP billing, LLM usage, etc.)        │    │
│  │   3. Transform and load into org's dataset                          │    │
│  │   4. Log execution to org_meta_pipeline_runs                        │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Storage Split

| Data Type | Stored In | Why |
|-----------|-----------|-----|
| User accounts, auth | Supabase | Auth system |
| Org metadata (name, slug) | Supabase | Frontend queries |
| Subscription/billing | Supabase + Stripe | Billing system |
| Integration status reference | Supabase | Fast frontend reads |
| Org API Key | BigQuery (hashed + KMS) | Security |
| Provider credentials | BigQuery (KMS encrypted) | Security |
| Pipeline data (billing, usage) | BigQuery | Analytics |
| Execution logs | BigQuery | Audit trail |

### Integration API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/integrations/{org_slug}/gcp/setup` | Org Key | Setup GCP Service Account |
| POST | `/integrations/{org_slug}/openai/setup` | Org Key | Setup OpenAI API key + init pricing/subscriptions |
| POST | `/integrations/{org_slug}/anthropic/setup` | Org Key | Setup Anthropic API key |
| POST | `/integrations/{org_slug}/deepseek/setup` | Org Key | Setup DeepSeek API key |
| POST | `/integrations/{org_slug}/gcp/validate` | Org Key | Re-validate GCP credential |
| POST | `/integrations/{org_slug}/openai/validate` | Org Key | Re-validate OpenAI credential |
| POST | `/integrations/{org_slug}/anthropic/validate` | Org Key | Re-validate Anthropic credential |
| POST | `/integrations/{org_slug}/deepseek/validate` | Org Key | Re-validate DeepSeek credential |
| GET | `/integrations/{org_slug}` | Org Key | Get all integration statuses |
| GET | `/integrations/{org_slug}/{provider}` | Org Key | Get specific integration status |
| DELETE | `/integrations/{org_slug}/{provider}` | Org Key | Remove integration |

### OpenAI Data API Endpoints (CRUD)

When OpenAI integration is set up, pricing and subscription tables are auto-initialized with default data from `configs/openai/seed/data/`.

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/integrations/{org_slug}/openai/pricing` | Org Key | List all pricing models |
| POST | `/integrations/{org_slug}/openai/pricing` | Org Key | Add new pricing model |
| PUT | `/integrations/{org_slug}/openai/pricing/{model_id}` | Org Key | Update pricing model |
| DELETE | `/integrations/{org_slug}/openai/pricing/{model_id}` | Org Key | Delete pricing model |
| POST | `/integrations/{org_slug}/openai/pricing/reset` | Org Key | Reset to default pricing from CSV |
| GET | `/integrations/{org_slug}/openai/subscriptions` | Org Key | List all subscriptions |
| POST | `/integrations/{org_slug}/openai/subscriptions` | Org Key | Add new subscription |
| PUT | `/integrations/{org_slug}/openai/subscriptions/{plan_name}` | Org Key | Update subscription |
| DELETE | `/integrations/{org_slug}/openai/subscriptions/{plan_name}` | Org Key | Delete subscription |
| POST | `/integrations/{org_slug}/openai/subscriptions/reset` | Org Key | Reset to default subscriptions from CSV |

**Default Data Files:**
- `configs/openai/seed/data/default_pricing.csv` - GPT-4o, GPT-4, GPT-3.5, o1 pricing
- `configs/openai/seed/data/default_subscriptions.csv` - FREE, TIER1, TIER2, TIER3, PAY_AS_YOU_GO plans (quantity=0)

**Auto-Initialization:** Tables are created and populated when OpenAI integration is set up via `/integrations/{org_slug}/openai/setup`.

### Example: bfnd_23423 Complete Flow

```bash
# Step 1: Admin onboards organization
curl -X POST $BASE_URL/api/v1/organizations/onboard \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_slug": "bfnd_23423", "company_name": "BFND Inc", "admin_email": "admin@bfnd.com"}'

# Response: {"api_key": "bfnd_23423_api_xxxxxxxxxxxxxxxx", "org_slug": "bfnd_23423", ...}
# SAVE THIS API KEY!

export ORG_API_KEY="bfnd_23423_api_xxxxxxxxxxxxxxxx"

# Step 2: Customer configures OpenAI integration (auto-creates pricing + subscriptions tables)
curl -X POST $BASE_URL/api/v1/integrations/bfnd_23423/openai/setup \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"credential": "sk-...", "credential_name": "Production Key"}'

# Response: {"success": true, "validation_status": "VALID", "pricing_initialized": true, "subscriptions_initialized": true}

# Step 3: Customer configures GCP Service Account
curl -X POST $BASE_URL/api/v1/integrations/bfnd_23423/gcp/setup \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"credential": "{\"type\":\"service_account\",\"project_id\":\"my-project\",...}"}'

# Step 4: Check all integration statuses
curl $BASE_URL/api/v1/integrations/bfnd_23423 \
  -H "X-API-Key: $ORG_API_KEY"

# Response: {"integrations": {"OPENAI": {"status": "VALID"}, "GCP_SA": {"status": "VALID"}, ...}}

# Step 5: Run cost billing pipeline
curl -X POST $BASE_URL/api/v1/pipelines/run/bfnd_23423/gcp/cost/cost_billing \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-25"}'
```

---

## MUST FOLLOW: New Organization Onboarding Flow

### Prerequisites (Environment Variables)

```bash
# REQUIRED - Set these BEFORE running anything
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="your-secure-admin-key"    # Any secure string YOU choose
export ENVIRONMENT="production"                    # development|staging|production
export KMS_KEY_NAME="projects/{project}/locations/{loc}/keyRings/{ring}/cryptoKeys/{key}"

# OPTIONAL
export DISABLE_AUTH="false"                        # true = skip auth (local dev only)
export BIGQUERY_LOCATION="US"
```

---

### Step 1: Bootstrap (ONE-TIME per environment)

**Run ONCE when setting up a new environment. Skip if already done.**

```bash
curl -X POST $BASE_URL/api/v1/admin/bootstrap \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force_recreate_dataset": false}'
```

| Field | Value |
|-------|-------|
| Config | `configs/setup/bootstrap/pipeline.yml` |
| Schemas | `configs/setup/bootstrap/schemas/*.json` (11 files) |
| Processor | `setup.initial.onetime_bootstrap` |
| Creates | `organizations` dataset + 11 management tables |

---

### Step 2: Dry-Run Validation (RECOMMENDED)

**Validates org_slug, email, GCP connectivity before onboarding.**

```bash
curl -X POST $BASE_URL/api/v1/organizations/dryrun \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "guruinc_234234",
    "company_name": "Guru Inc",
    "admin_email": "admin@guru.com",
    "subscription_plan": "STARTER"
  }'
```

| Field | Value |
|-------|-------|
| Config | `configs/setup/organizations/dryrun/pipeline.yml` |
| Processor | `setup.organizations.dryrun` |
| Validates | org_slug format, uniqueness, GCP connectivity, central tables exist |

---

### Step 3: Onboard Organization

**Creates org profile, API key, subscription, dataset.**

```bash
curl -X POST $BASE_URL/api/v1/organizations/onboard \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "guruinc_234234",
    "company_name": "Guru Inc",
    "admin_email": "admin@guru.com",
    "subscription_plan": "STARTER"
  }'
```

**Response (SAVE THE API KEY!):**
```json
{
  "api_key": "guruinc_234234_api_xxxxxxxxxxxxxxxx",
  "org_slug": "guruinc_234234",
  "dataset_created": true
}
```

| Field | Value |
|-------|-------|
| Config | `configs/setup/organizations/onboarding/pipeline.yml` |
| Processor | `setup.organizations.onboarding` |
| Creates | `org_profiles`, `org_api_keys`, `org_subscriptions`, `org_usage_quotas` rows |
| Creates | Dataset `guruinc_234234_{env}` (e.g., `guruinc_234234_prod`) |

---

### Step 4: Run Pipeline (using Org API Key)

**Use the API key returned from Step 3.**

```bash
# Run GCP Billing pipeline
curl -X POST $BASE_URL/api/v1/pipelines/run/guruinc_234234/gcp/billing \
  -H "X-API-Key: guruinc_234234_api_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-25"}'

# Run OpenAI Usage & Cost pipeline
curl -X POST $BASE_URL/api/v1/pipelines/run/guruinc_234234/openai/usage_cost \
  -H "X-API-Key: guruinc_234234_api_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2025-11-25", "end_date": "2025-11-25"}'
```

| Pipeline | Config | Processor(s) | Output Table |
|----------|--------|--------------|--------------|
| GCP Billing | `configs/gcp/billing.yml` | `gcp.bq_etl` | `gcp_billing_daily_raw` |
| OpenAI Usage+Cost | `configs/openai/usage_cost.yml` | `openai.usage` → `openai.cost` | `openai_usage_daily_raw`, `openai_cost_daily` |

---

## Unified Config Structure (Single Source of Truth)

**NO separate `ps_templates/` - everything in `configs/`**

```
configs/                                    # SINGLE SOURCE OF TRUTH
├── openai/                                 # LLM Provider: OpenAI
│   ├── seed/                               # Seed data loaded on integration setup
│   │   ├── schemas/                        # openai_pricing.json, openai_subscriptions.json
│   │   └── data/                           # default_pricing.csv, default_subscriptions.csv
│   ├── usage_cost.yml                      # Daily: extract usage → transform cost
│   └── subscriptions.yml                   # Monthly: subscription data
├── anthropic/                              # LLM Provider: Anthropic
│   ├── auth/
│   │   ├── setup.yml
│   │   └── validate.yml
│   └── usage_cost.yml                      # Daily: usage + cost
├── deepseek/                               # LLM Provider: DeepSeek
│   ├── auth/
│   │   ├── setup.yml
│   │   └── validate.yml
│   └── usage_cost.yml                      # Daily: usage + cost
├── gcp/                                    # Cloud Provider: GCP
│   ├── auth/
│   │   ├── setup.yml
│   │   └── validate.yml
│   ├── billing.yml                         # Daily: GCP billing data
│   └── bq_etl/
│       └── schema_template.json
├── integrations/                           # Integration setup pipelines
│   ├── openai/
│   │   ├── setup.yml
│   │   └── validate.yml
│   ├── claude/
│   │   ├── setup.yml
│   │   └── validate.yml
│   ├── deepseek/
│   │   ├── setup.yml
│   │   └── validate.yml
│   └── gcp_sa/
│       ├── setup.yml
│       └── validate.yml
├── setup/                                  # System setup pipelines
│   ├── bootstrap/
│   │   ├── pipeline.yml
│   │   ├── config.yml
│   │   └── schemas/*.json                  # 14 table schemas
│   └── organizations/
│       ├── onboarding/
│       │   └── pipeline.yml
│       └── dryrun/
│           └── pipeline.yml
├── notify_systems/
│   ├── email_notification/
│   │   └── config.yml
│   └── slack_notification/
│       └── config.yml
└── system/
    └── dataset_types.yml
```

---

## Pipeline Types

### LLM Provider Pipelines (Daily/Monthly)

| Config | Schedule | Steps (ps_type) | Output Tables |
|--------|----------|-----------------|---------------|
| `openai/usage_cost.yml` | Daily | `openai.usage` → `openai.cost` | `openai_usage_daily_raw`, `openai_cost_daily` |
| `openai/subscriptions.yml` | Monthly | `openai.subscriptions` | `openai_subscriptions_monthly` |
| `anthropic/usage_cost.yml` | Daily | `anthropic.usage` → `anthropic.cost` | `anthropic_usage_daily_raw`, `anthropic_cost_daily` |
| `deepseek/usage_cost.yml` | Daily | `deepseek.usage` → `deepseek.cost` | `deepseek_usage_daily_raw`, `deepseek_cost_daily` |

### Cloud Provider Pipelines

| Config | Schedule | Steps (ps_type) | Output Tables |
|--------|----------|-----------------|---------------|
| `gcp/billing.yml` | Daily | `gcp.bq_etl` | `gcp_billing_daily_raw` |

### System Pipelines (Admin)

| Type | Config | Processor | Purpose |
|------|--------|-----------|---------|
| Bootstrap | `setup/bootstrap/pipeline.yml` | `setup.initial.onetime_bootstrap` | Create central dataset + 14 tables |
| Dry-run | `setup/organizations/dryrun/pipeline.yml` | `setup.organizations.dryrun` | Validate before onboarding |
| Onboarding | `setup/organizations/onboarding/pipeline.yml` | `setup.organizations.onboarding` | Create org + API key + dataset |

### Integration Pipelines

| Config | Processor | Purpose |
|--------|-----------|---------|
| `integrations/{provider}/setup.yml` | `integrations.kms_store` | Store KMS-encrypted credentials |
| `integrations/{provider}/validate.yml` | `integrations.kms_decrypt` + `integrations.validate_*` | Re-validate credentials |

---

## Naming Conventions

### File & Folder Naming
| Item | Convention | Example |
|------|------------|---------|
| Config folder | `snake_case` | `openai/`, `gcp/` |
| Config file | `snake_case.yml` | `usage_cost.yml`, `billing.yml` |
| Processor file | `snake_case.py` | `cost.py`, `usage.py` |

### Pipeline & Step Naming
| Item | Convention | Pattern | Example |
|------|------------|---------|---------|
| Pipeline ID | `kebab-case` | `{org}-{provider}-{domain}` | `acme-openai-usage-cost` |
| Step ID | `snake_case` | `{action}_{target}` | `extract_usage`, `transform_cost` |
| ps_type | `dot.notation` | `{provider}.{domain}` | `openai.usage`, `gcp.bq_etl` |

### BigQuery Table Naming
| Item | Convention | Pattern | Example |
|------|------------|---------|---------|
| Dataset | `snake_case` | `{org}_{env}` | `acme_prod` |
| Table | `snake_case` | `{provider}_{domain}_{granularity}_{state}` | `openai_usage_daily_raw` |

### Table Name Components
```
{provider}_{domain}_{granularity}_{state}

Components:
├── provider:    openai, anthropic, deepseek, gcp
├── domain:      usage, cost, billing, subscriptions
├── granularity: daily, monthly, hourly
└── state:       raw, staging, (none = final)
```

### Step ID Actions
| Prefix | Use Case | Examples |
|--------|----------|----------|
| `extract_` | Pull data from external API | `extract_usage`, `extract_billing` |
| `transform_` | Transform/derive data | `transform_cost` |
| `load_` | Write to destination | `load_to_bq` |
| `validate_` | Validate data/credentials | `validate_credential` |
| `notify_` | Send notifications | `notify_on_failure` |
| `decrypt_` | Decrypt credentials | `decrypt_credentials` |

---

## PROCESSORS: The Heart & Core of the Backend Pipeline

Processors are the **execution engines** that do the actual work. Each processor:
- Reads configuration from `configs/`
- Executes business logic (BigQuery operations, validations, notifications)
- Returns structured results for logging

### Processor Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROCESSOR EXECUTION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  API Request                                                                │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────┐                                                        │
│  │  Pipeline YAML  │  configs/{provider}/{domain}/pipeline.yml              │
│  │  + Schemas      │  configs/{provider}/{domain}/schemas/*.json            │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  Pipeline       │  src/core/pipeline/executor.py                         │
│  │  Executor       │  - Loads config, resolves variables                    │
│  └────────┬────────┘  - Calls processor.execute(step_config, context)       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  PROCESSOR      │  src/core/processors/{provider}/{domain}.py            │
│  │  (Engine)       │  - THE HEART OF THE SYSTEM                             │
│  └────────┬────────┘  - Loads schemas from configs/                         │
│           │           - Executes BigQuery operations                        │
│           │           - Returns result dict                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  BigQuery API   │  via src/core/engine/bq_client.py                      │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Available Processors

```
src/core/processors/
├── setup/
│   ├── initial/
│   │   └── onetime_bootstrap_processor.py    # Bootstrap system
│   └── organizations/
│       ├── onboarding.py                     # Onboard new org
│       └── dryrun.py                         # Pre-onboard validation
├── gcp/
│   └── bq_etl.py                             # BigQuery ETL (extract/load)
├── integrations/                             # ⭐ NEW: Integration processors
│   ├── kms_store.py                          # Encrypt & store credentials
│   ├── kms_decrypt.py                        # Decrypt credentials for use
│   ├── validate_openai.py                    # Validate OpenAI API key
│   ├── validate_claude.py                    # Validate Claude/Anthropic key
│   ├── validate_deepseek.py                  # Validate DeepSeek key
│   └── validate_gcp.py                       # Validate GCP Service Account
├── notify_systems/
│   └── email_notification.py                 # Email notifications
└── aws/
    └── (future AWS processors)
```

### Processor Details

#### 1. Bootstrap Processor (`setup.initial.onetime_bootstrap`)
**File:** `src/core/processors/setup/initial/onetime_bootstrap_processor.py`

```python
class OnetimeBootstrapProcessor:
    """Creates central organizations dataset + 11 management tables"""

    def __init__(self):
        # Loads config from configs/setup/bootstrap/config.yml
        # Loads schemas from configs/setup/bootstrap/schemas/*.json

    async def execute(step_config, context) -> Dict:
        # 1. Create 'organizations' dataset
        # 2. For each table in config.yml:
        #    - Load schema from schemas/{table}.json
        #    - Apply partitioning/clustering from config
        #    - Create table via BigQuery API
        return {"status": "SUCCESS", "tables_created": [...]}
```

#### 2. Dry-Run Processor (`setup.organizations.dryrun`)
**File:** `src/core/processors/setup/organizations/dryrun.py`

```python
class OrgDryRunProcessor:
    """Validates org before onboarding - NO resources created"""

    async def execute(step_config, context) -> Dict:
        # Validates:
        # ✓ org_slug format (alphanumeric, 3-50 chars)
        # ✓ email format
        # ✓ GCP credentials valid
        # ✓ BigQuery connectivity
        # ✓ Subscription plan (STARTER/PROFESSIONAL/SCALE)
        # ✓ Org doesn't already exist
        # ✓ Central tables exist (bootstrap done)
        return {"status": "SUCCESS", "ready_for_onboarding": True}
```

#### 3. Onboarding Processor (`setup.organizations.onboarding`)
**File:** `src/core/processors/setup/organizations/onboarding.py`

```python
class OrgOnboardingProcessor:
    """Creates org dataset and metadata - THE MAIN ONBOARDING ENGINE"""

    def __init__(self):
        # Loads from configs/setup/organizations/onboarding/

    async def execute(step_config, context) -> Dict:
        # 1. Create dataset: {org_slug}_{env} (e.g., acmecorp_prod)
        # 2. Create metadata tables from config
        # 3. Create validation test table
        # 4. Insert test record
        # 5. Create org_comprehensive_view
        return {"status": "SUCCESS", "dataset_id": "...", "tables_created": [...]}
```

#### 4. BigQuery ETL Processor (`gcp.bq_etl`)
**File:** `src/core/processors/gcp/bq_etl.py`

```python
class BigQueryETLEngine:
    """Extract-Transform-Load for BigQuery - THE DATA PIPELINE ENGINE"""

    def __init__(self):
        # Loads schema templates from configs/gcp/bq_etl/schema_template.json

    async def execute(step_config, context) -> Dict:
        # 1. Replace {variables} in query from context
        # 2. Execute source query
        # 3. Get schema template if specified
        # 4. Ensure destination table exists
        # 5. Write data (append/overwrite/truncate)
        return {"status": "SUCCESS", "rows_processed": N, "destination_table": "..."}
```

#### 5. Email Notification Processor (`notify_systems.email_notification`)
**File:** `src/core/processors/notify_systems/email_notification.py`

```python
class EmailNotificationEngine:
    """Send email notifications for pipeline events"""

    async def execute(step_config, context) -> Dict:
        # Triggers: on_failure, on_success, on_completion, always
        # Uses notification service to send emails
        return {"status": "SUCCESS", "notification_sent": True}
```

### Creating a New Processor

**MUST FOLLOW when adding new features:**

1. **Create processor file:**
   ```
   src/core/processors/{provider}/{domain}.py
   ```

2. **Implement required interface:**
   ```python
   class MyNewProcessor:
       def __init__(self):
           self.settings = get_settings()
           self.logger = logging.getLogger(__name__)

       async def execute(
           self,
           step_config: Dict[str, Any],
           context: Dict[str, Any]
       ) -> Dict[str, Any]:
           # Your logic here
           return {"status": "SUCCESS", ...}

   def get_engine():
       """Factory function - REQUIRED for dynamic loading"""
       return MyNewProcessor()
   ```

3. **Create config folder with pipeline.yml:**
   ```
   configs/{provider}/{domain}/
   ├── pipeline.yml            # Pipeline definition
   ├── config.yml              # Additional config (optional)
   └── schemas/                # JSON schemas (if needed)
       └── my_table.json
   ```

4. **Update this documentation!**

---

## Dataset Structure

```
Central: organizations
├── org_profiles                    # Organization metadata
├── org_api_keys                    # API keys (SHA256 hash + KMS encrypted)
├── org_subscriptions               # Subscription tiers (STARTER, PROFESSIONAL, SCALE)
├── org_usage_quotas                # Usage limits per org
├── org_integration_credentials     # LLM & cloud integration credentials (KMS encrypted)
├── org_pipeline_configs            # Pipeline configurations
├── org_scheduled_pipeline_runs
├── org_pipeline_execution_queue
├── org_meta_pipeline_runs          # Execution logs
├── org_meta_step_logs              # Step-level logs
└── org_meta_dq_results             # Data quality results

Per-Organization: {org_slug}_{env}
└── billing_cost_daily, etc.  # Data tables only
```

---

## Project Structure

```
convergence-data-pipeline/
├── src/app/
│   ├── main.py                        # FastAPI entry
│   ├── config.py                      # Settings (env vars)
│   ├── routers/
│   │   ├── admin.py                   # POST /api/v1/admin/bootstrap
│   │   ├── organizations.py           # POST /api/v1/organizations/onboard, /dryrun
│   │   ├── integrations.py            # Integration management endpoints
│   │   ├── openai_data.py             # OpenAI pricing/subscriptions CRUD
│   │   └── pipelines.py               # POST /api/v1/pipelines/run/...
│   ├── models/
│   │   └── openai_data_models.py      # Pydantic models for OpenAI CRUD
│   └── dependencies/
│       └── auth.py                    # verify_admin_key(), get_current_org()
├── src/core/processors/               # ⭐ PROCESSORS - Heart of the system
│   ├── setup/initial/                 #    Bootstrap processor
│   ├── setup/organizations/           #    Onboarding + dryrun processors
│   ├── gcp/bq_etl.py                  #    BigQuery ETL engine
│   ├── integrations/                  # ⭐ NEW: Integration processors
│   │   ├── kms_store.py               #    Encrypt & store credentials
│   │   ├── kms_decrypt.py             #    Decrypt credentials
│   │   └── validate_*.py              #    Provider-specific validators
│   └── notify_systems/                #    Email notification engine
└── configs/                           # ⭐ SINGLE SOURCE OF TRUTH
    ├── setup/bootstrap/               #    Bootstrap pipeline + schemas (12 tables)
    ├── setup/organizations/           #    Onboarding + dryrun pipelines
    ├── gcp/cost/                      #    GCP cost pipelines
    ├── gcp/bq_etl/                    #    BQ ETL schema templates
    ├── openai/seed/                   #    OpenAI seed data (auto-loaded on integration)
    │   ├── schemas/                   #    openai_pricing.json, openai_subscriptions.json
    │   └── data/                      #    default_pricing.csv, default_subscriptions.csv
    └── integrations/                  #    Integration pipelines
        ├── openai/                    #    OpenAI setup & validate
        ├── claude/                    #    Claude/Anthropic setup & validate
        ├── deepseek/                  #    DeepSeek setup & validate
        └── gcp_sa/                    #    GCP Service Account setup & validate
```

---

## Deployment

```bash
./simple_deploy.sh stage|prod
./simple_test.sh stage|prod
```

## URLs

| Environment | URL |
|-------------|-----|
| Stage | `https://convergence-pipeline-stage-526075321773.us-central1.run.app` |
| Prod | `https://convergence-pipeline-prod-820784027009.us-central1.run.app` |

---

## ⚠️ CRITICAL: Production Security Configuration

**Last Updated: 2025-11-26**

The backend has strict security validation that **WILL FAIL startup in production** if not configured correctly.

### Production Startup Validation

When `ENVIRONMENT=production`, the application validates these requirements at startup:

```python
# src/app/main.py:validate_production_config()
def validate_production_config():
    if settings.environment != "production":
        return  # Skip for non-production

    errors = []

    # 1. CA_ROOT_API_KEY is REQUIRED
    if not settings.ca_root_api_key:
        errors.append("CA_ROOT_API_KEY environment variable is required in production")

    # 2. Authentication CANNOT be disabled
    if settings.disable_auth:
        errors.append("DISABLE_AUTH must be false in production")

    # 3. Rate limiting MUST be enabled
    if not settings.rate_limit_enabled:
        errors.append("RATE_LIMIT_ENABLED must be true in production")

    if errors:
        raise RuntimeError(f"Production configuration invalid: {errors}")
```

### Required Environment Variables for Production

```bash
# ============================================
# REQUIRED - Application will NOT start without these
# ============================================
export ENVIRONMENT="production"
export GCP_PROJECT_ID="your-gcp-project"
export CA_ROOT_API_KEY="your-secure-admin-key-min-32-chars"  # NEVER use default!

# ============================================
# SECURITY - These have secure defaults but review them
# ============================================
export DISABLE_AUTH="false"           # MUST be false in production
export RATE_LIMIT_ENABLED="true"      # MUST be true in production

# ============================================
# KMS Encryption (for credential storage)
# ============================================
export KMS_PROJECT_ID="your-kms-project"
export KMS_LOCATION="us-central1"
export KMS_KEYRING="your-keyring"
export KMS_KEY="your-key"
# OR use full path:
export KMS_KEY_NAME="projects/{project}/locations/{loc}/keyRings/{ring}/cryptoKeys/{key}"

# ============================================
# CORS - Configure for your frontend domains
# ============================================
export CORS_ORIGINS='["https://your-frontend.com", "https://app.your-domain.com"]'
```

### Security Features Implemented

| Feature | File | Description |
|---------|------|-------------|
| **Admin Key Hashing** | `auth.py:1179-1240` | Admin API key compared using constant-time `hmac.compare_digest()` to prevent timing attacks |
| **Production Validation** | `main.py:90-127` | Startup fails if security settings are misconfigured |
| **Request ID Tracking** | `validation.py:229-233` | Every request gets unique ID for distributed tracing via `X-Request-ID` header |
| **Pipeline Error Handling** | `pipelines.py:87-144` | Failed background pipelines update status to `FAILED` in BigQuery |
| **Input Validation** | `pipelines.py:33-58` | Pipeline requests reject unknown fields (`extra="forbid"`) |
| **Connection Timeouts** | `bq_client.py:195-212` | BigQuery connections timeout after 60s connect / 300s read |
| **Graceful Shutdown** | `main.py:229-247` | Auth metrics flush with 10s timeout, thread pool cleanup |

### Admin API Key Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CA_ROOT_API_KEY SECURITY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OLD (Insecure):                                                            │
│  ───────────────                                                            │
│  if x_ca_root_key != settings.ca_root_api_key:  # Plaintext comparison!    │
│      raise HTTPException(403)                    # Vulnerable to timing attack │
│                                                                             │
│  NEW (Secure):                                                              │
│  ─────────────                                                              │
│  provided_hash = hash_api_key(x_ca_root_key)                                │
│  expected_hash = hash_api_key(settings.ca_root_api_key)                     │
│  if not hmac.compare_digest(provided_hash, expected_hash):  # Constant-time│
│      raise HTTPException(403)                                               │
│                                                                             │
│  Why This Matters:                                                          │
│  - Timing attacks can guess keys character-by-character                     │
│  - String comparison '==' leaks timing information                          │
│  - hmac.compare_digest() takes same time regardless of where mismatch is    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Request ID Tracing

All requests now include `X-Request-ID` header for distributed tracing:

```bash
# Request
curl -X POST $BASE_URL/api/v1/pipelines/run/org/gcp/cost/billing \
  -H "X-API-Key: $API_KEY"

# Response headers include:
# X-Request-ID: 550e8400-e29b-41d4-a716-446655440000

# Use this ID to trace logs:
gcloud logging read "jsonPayload.request_id=550e8400-e29b-41d4-a716-446655440000"
```

### Pipeline Error Tracking

Background pipeline failures are now tracked in BigQuery:

```sql
-- Check for failed pipelines
SELECT
  pipeline_logging_id,
  pipeline_id,
  org_slug,
  status,
  error_message,
  start_time,
  end_time
FROM `{project}.organizations.org_meta_pipeline_runs`
WHERE status = 'FAILED'
ORDER BY start_time DESC
LIMIT 10;
```

### CORS Configuration

Default CORS settings are now explicit (not wildcard):

```python
# src/app/config.py
cors_allow_methods: List[str] = [
    "GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"
]
cors_allow_headers: List[str] = [
    "Content-Type", "Authorization", "X-API-Key",
    "X-CA-Root-Key", "X-User-ID", "X-Request-ID"
]
```

### Rate Limiting Constants

Rate limiting uses explicit time constants (no magic numbers):

```python
# src/core/utils/rate_limiter.py
SECONDS_PER_MINUTE = 60
SECONDS_PER_HOUR = 3600
MINUTE_WINDOW_SECONDS = 60
HOUR_WINDOW_SECONDS = 3600
ENTRY_COALESCE_SECONDS = 1
```

---

## Testing Locally

```bash
cd convergence-data-pipeline
pip install -r requirements.txt

# For LOCAL DEVELOPMENT ONLY - never use these in production!
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="test-admin-key"
export DISABLE_AUTH="true"
export ENVIRONMENT="development"  # NOT production!

python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000

# Health check
curl http://localhost:8000/health
```

### Production Deployment Checklist

Before deploying to production, verify:

- [ ] `ENVIRONMENT=production` is set
- [ ] `CA_ROOT_API_KEY` is set to a secure, unique value (min 32 chars)
- [ ] `DISABLE_AUTH=false` (or not set, defaults to false)
- [ ] `RATE_LIMIT_ENABLED=true` (or not set, defaults to true)
- [ ] `CORS_ORIGINS` is configured for your frontend domains
- [ ] KMS encryption is configured for credential storage
- [ ] Cloud Run service account has necessary IAM permissions

---

## Verified Processor & Config Mapping

**Last verified: 2025-11-26**

| Processor | Config Path | Status |
|-----------|-------------|--------|
| `setup.initial.onetime_bootstrap` | `configs/setup/bootstrap/` | ✓ Verified |
| `setup.organizations.dryrun` | `configs/setup/organizations/dryrun/` | ✓ Verified |
| `setup.organizations.onboarding` | `configs/setup/organizations/onboarding/` | ✓ Verified |
| `gcp.bq_etl` | `configs/gcp/bq_etl/` | ✓ Verified |
| `notify_systems.email_notification` | `configs/notify_systems/email_notification/` | ✓ Verified |

### Config Files Verified

```
configs/
├── setup/
│   ├── bootstrap/
│   │   ├── pipeline.yml          ✓  Bootstrap pipeline definition
│   │   ├── config.yml            ✓  Table definitions (11 tables)
│   │   └── schemas/              ✓  11 JSON schema files
│   │       ├── org_profiles.json
│   │       ├── org_api_keys.json
│   │       ├── org_subscriptions.json
│   │       ├── org_usage_quotas.json
│   │       ├── org_integration_credentials.json
│   │       ├── org_pipeline_configs.json
│   │       ├── org_scheduled_pipeline_runs.json
│   │       ├── org_pipeline_execution_queue.json
│   │       ├── org_meta_pipeline_runs.json
│   │       ├── org_meta_step_logs.json
│   │       └── org_meta_dq_results.json
│   └── organizations/
│       ├── onboarding/
│       │   └── pipeline.yml      ✓  Onboarding pipeline
│       └── dryrun/
│           └── pipeline.yml      ✓  Dryrun validation pipeline
├── gcp/
│   ├── cost/
│   │   └── cost_billing.yml      ✓  GCP cost pipeline
│   └── bq_etl/
│       └── schema_template.json  ✓  Schema templates (billing_cost, default)
└── notify_systems/
    ├── email_notification/
    │   └── config.yml            ✓  Email notification config
    └── slack_notification/
        └── config.yml            ✓  Slack notification config
```

### Verification Command

Run this to verify all processors and configs:

```bash
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="test-admin-key"
export ENVIRONMENT="development"

python3 -c "
import sys; sys.path.insert(0, '.')
from src.core.processors.setup.initial.onetime_bootstrap_processor import OnetimeBootstrapProcessor
from src.core.processors.setup.organizations.dryrun import OrgDryRunProcessor
from src.core.processors.setup.organizations.onboarding import OrgOnboardingProcessor
from src.core.processors.gcp.bq_etl import BigQueryETLEngine

print('Bootstrap:', OnetimeBootstrapProcessor().template_dir)
print('Dryrun:', OrgDryRunProcessor().settings.gcp_project_id)
print('Onboarding:', OrgOnboardingProcessor().template_dir)
print('BQ ETL:', BigQueryETLEngine().template_dir)
print('All processors verified!')
"
```
