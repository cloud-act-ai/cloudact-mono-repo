# Backend: Convergence Data Pipeline

**Full Platform Architecture:** `../../ARCHITECTURE.md`

**Security Documentation:** `SECURITY.md`

## Core Principle

**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

**Single Source of Truth:** All configs, schemas, and pipeline definitions live in `configs/`

## Security

See `SECURITY.md` for production security requirements, API key handling, and credential management.

**Quick Security Notes:**
- Production startup validates security configuration (fails if misconfigured)
- CA Root API key uses constant-time comparison with SHA256 hashing
- All credentials encrypted with KMS
- Rate limiting and request tracing enabled by default

---

## API Architecture

### Key Types

| Key | Header | Used For | Scope |
|-----|--------|----------|-------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, Org Onboarding | System-wide admin operations |
| Org API Key | `X-API-Key` | Integrations, Pipelines, Data | Per-organization operations |

### Authentication Flow

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (creates 14 meta tables)
    │
    └── Onboard: POST /api/v1/organizations/onboard
        └── Creates Org API Key (per-organization)
                    │
                    ├── Setup Integrations: POST /api/v1/integrations/{org}/{provider}/setup
                    ├── Run Pipelines: POST /api/v1/pipelines/run/{org}/...
                    └── Query Data: org-specific BigQuery datasets
```

### API Endpoints

#### Admin Endpoints (X-CA-Root-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/admin/bootstrap` | Create central dataset + 14 meta tables (one-time) |
| POST | `/api/v1/organizations/onboard` | Create organization + API key + dataset |
| POST | `/api/v1/organizations/dryrun` | Validate org before onboarding (no resources created) |

#### Organization Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Run specific pipeline |

#### Integration Management (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/integrations/{org}/gcp/setup` | Setup GCP Service Account |
| POST | `/api/v1/integrations/{org}/openai/setup` | Setup OpenAI API key + init pricing/subscriptions |
| POST | `/api/v1/integrations/{org}/anthropic/setup` | Setup Anthropic API key |
| POST | `/api/v1/integrations/{org}/gcp/validate` | Re-validate GCP integration |
| POST | `/api/v1/integrations/{org}/openai/validate` | Re-validate OpenAI integration |
| POST | `/api/v1/integrations/{org}/anthropic/validate` | Re-validate Anthropic integration |
| GET | `/api/v1/integrations/{org}` | Get all integration statuses |
| GET | `/api/v1/integrations/{org}/{provider}` | Get specific integration status |
| DELETE | `/api/v1/integrations/{org}/{provider}` | Remove integration |

#### LLM Data Management (X-API-Key)

Auto-initialized when LLM integration is set up via default data from `configs/{provider}/seed/data/`.

**Generic LLM Endpoints (works for all providers):**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/integrations/{org}/{provider}/pricing` | List all pricing models |
| POST | `/api/v1/integrations/{org}/{provider}/pricing` | Add new pricing model |
| PUT | `/api/v1/integrations/{org}/{provider}/pricing/{model_id}` | Update pricing model |
| DELETE | `/api/v1/integrations/{org}/{provider}/pricing/{model_id}` | Delete pricing model |
| POST | `/api/v1/integrations/{org}/{provider}/pricing/reset` | Reset to default pricing from CSV |
| GET | `/api/v1/integrations/{org}/{provider}/subscriptions` | List all subscriptions |
| POST | `/api/v1/integrations/{org}/{provider}/subscriptions` | Add new subscription |
| PUT | `/api/v1/integrations/{org}/{provider}/subscriptions/{plan_name}` | Update subscription |
| DELETE | `/api/v1/integrations/{org}/{provider}/subscriptions/{plan_name}` | Delete subscription |
| POST | `/api/v1/integrations/{org}/{provider}/subscriptions/reset` | Reset to default subscriptions from CSV |

**Supported Providers:**
- OpenAI: `/api/v1/integrations/{org}/openai/pricing`, `/api/v1/integrations/{org}/openai/subscriptions`
- Anthropic: `/api/v1/integrations/{org}/anthropic/pricing`, `/api/v1/integrations/{org}/anthropic/subscriptions`

**Default Seed Data Files:**
- OpenAI: `configs/openai/seed/data/default_pricing.csv`, `default_subscriptions.csv`
- Anthropic: `configs/anthropic/seed/data/default_pricing.csv`, `default_subscriptions.csv`

**Note:** Anthropic subscriptions endpoints exist but Anthropic doesn't have subscription tiers like OpenAI.

---

## Customer Lifecycle

### Frontend ↔ Backend Flow

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

### Data Storage Split

| Data Type | Stored In | Why |
|-----------|-----------|-----|
| User accounts, auth | Supabase | Auth system |
| Org metadata (name, slug) | Supabase | Frontend queries |
| Subscription/billing | Supabase + Stripe | Billing system |
| Billing status | Supabase (lowercase) + BigQuery (UPPERCASE) | Synced via webhook |
| Integration status reference | Supabase | Fast frontend reads |
| Org API Key | BigQuery (hashed + KMS) | Security |
| Provider credentials | BigQuery (KMS encrypted) | Security |
| Pipeline data (billing, usage) | BigQuery | Analytics |
| Execution logs | BigQuery | Audit trail |

### Billing Status Mapping

Frontend → Backend status mapping (via `syncSubscriptionToBackend()`):

| Frontend (Supabase) | Backend (BigQuery) | Pipeline Access |
|---------------------|--------------------| ----------------|
| `trialing` | `TRIAL` | ✅ Allowed |
| `active` | `ACTIVE` | ✅ Allowed |
| `past_due` | `SUSPENDED` | ❌ Blocked |
| `canceled` | `CANCELLED` | ❌ Blocked |
| `paused` | `SUSPENDED` | ❌ Blocked |
| `incomplete` | `SUSPENDED` | ❌ Blocked |

**Sync Flow:**
1. Stripe webhook updates Supabase `organizations.billing_status`
2. Webhook calls frontend action `syncSubscriptionToBackend(orgSlug, billingStatus, trialEndsAt)`
3. Frontend maps status and calls `PUT /api/v1/organizations/{org}/subscription`
4. Backend updates `org_subscriptions.status` and `org_subscriptions.trial_end_date`
5. Pipeline execution checks `org_subscriptions.status IN ('ACTIVE', 'TRIAL')` before running

### Complete Lifecycle Phases

#### Phase 1: User Signup (Frontend Only)
1. User signs up via Supabase Auth
2. User creates organization in Supabase
3. User subscribes to plan via Stripe

#### Phase 2: Backend Onboarding (One-time per org)
- Frontend calls: `POST /api/v1/organizations/onboard`
- Backend creates: org_profile, org_api_key (hashed + KMS), org_subscription, dataset
- Returns: `{ api_key: "org_xxx_api_xxxxxxxx" }` (SHOWN ONCE!)
- Frontend saves to Supabase: `backend_onboarded: true`, `backend_api_key_fingerprint: "xxxx"`
- **NEVER stores actual API key**

#### Phase 3: Integrations Setup
User adds LLM/Cloud provider credentials via frontend UI:
- `POST /integrations/{org}/openai/setup`
- `POST /integrations/{org}/anthropic/setup`
- `POST /integrations/{org}/gcp/setup`

Backend validates, KMS encrypts, stores credentials. Returns validation status.
Frontend saves status reference (not credentials) to Supabase.

#### Phase 4: Pipeline Execution

**Two Modes:**

A) **SCHEDULED (Daily Automatic)** - Offline batch processing
   - Runs daily via Cloud Scheduler / cron
   - Processes all orgs with valid integrations
   - No user intervention needed

B) **AD-HOC (User Triggered)** - On-demand
   - User clicks "Run Now" in frontend
   - Frontend calls: `POST /pipelines/run/{org}/{provider}/{domain}`
   - Useful for backfills, immediate data refresh, testing

**Pipeline Flow:**
1. Decrypt stored credentials from BigQuery
2. Fetch data from provider (GCP billing, LLM usage, etc.)
3. Transform and load into org's dataset
4. Log execution to org_meta_pipeline_runs

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
- Credentials fetched: `WHERE org_slug = @org_slug`
- Separate BigQuery client per execution
- Data writes to separate datasets: `{org_slug}.*`
- NO shared state between executions

---

## Pipeline Architecture

### Config Structure (Single Source of Truth)

**NO separate `ps_templates/` - everything in `configs/`**

```
configs/
├── openai/
│   ├── seed/
│   │   ├── schemas/                        # openai_model_pricing.json, openai_subscriptions.json
│   │   └── data/                           # default_pricing.csv, default_subscriptions.csv
│   ├── usage_cost.yml                      # Daily: extract usage → transform cost
│   └── subscriptions.yml                   # Monthly: subscription data
├── anthropic/
│   ├── seed/
│   │   ├── schemas/                        # anthropic_pricing.json, anthropic_subscriptions.json
│   │   └── data/                           # default_pricing.csv, default_subscriptions.csv
│   └── usage_cost.yml                      # Daily: extract usage → transform cost
├── gcp/
│   ├── billing.yml                         # GCP billing pipeline
│   └── bq_etl/
│       ├── config.yml                      # BigQuery ETL configuration
│       └── schema_template.json            # BQ table schema template
├── setup/
│   ├── bootstrap/
│   │   ├── config.yml                      # Bootstrap configuration
│   │   ├── schemas/                        # 14 table schemas
│   │   └── views/                          # BigQuery view definitions
│   └── organizations/
│       └── onboarding/
│           ├── config.yml                  # Onboarding configuration
│           └── schemas/                    # onboarding_validation_test.json
├── notify_systems/
│   ├── email_notification/
│   │   └── config.yml
│   └── slack_notification/
│       └── config.yml
├── data_quality/
│   └── expectations/
│       └── billing_cost_suite.json         # Data quality expectations
└── system/
    ├── dataset_types.yml                   # Dataset type definitions
    └── providers.yml                       # Provider configurations
```

### Processors (Execution Engines)

Processors are the **execution engines** that do the actual work:
- Read configuration from `configs/`
- Execute business logic (BigQuery operations, validations, notifications)
- Return structured results for logging

```
src/core/processors/
├── setup/
│   ├── initial/
│   │   └── onetime_bootstrap_processor.py    # Bootstrap system
│   └── organizations/
│       ├── onboarding.py                     # Onboard new org
│       └── dryrun.py                         # Pre-onboard validation
├── openai/
│   ├── authenticator.py                      # OpenAI authentication
│   ├── usage.py                              # Extract usage data
│   ├── cost.py                               # Calculate costs
│   ├── subscriptions.py                      # Subscription management
│   ├── seed_csv.py                           # Seed pricing/subscriptions from CSV
│   └── validation.py                         # Validate OpenAI credentials
├── anthropic/
│   ├── authenticator.py                      # Anthropic authentication
│   ├── usage.py                              # Extract usage data
│   ├── cost.py                               # Calculate costs
│   └── validation.py                         # Validate Anthropic credentials
├── gcp/
│   ├── authenticator.py                      # GCP authentication
│   ├── bq_etl.py                             # BigQuery ETL (extract/load)
│   └── validation.py                         # Validate GCP credentials
├── integrations/
│   ├── kms_store.py                          # Encrypt & store credentials
│   ├── kms_decrypt.py                        # Decrypt credentials for use
│   ├── validate_openai.py                    # Validate OpenAI API key
│   ├── validate_claude.py                    # Validate Claude/Anthropic key
│   └── validate_gcp.py                       # Validate GCP Service Account
└── notify_systems/
    └── email_notification.py                 # Email notifications
```

#### Processor Execution Flow

```
API Request
     │
     ▼
┌─────────────────┐
│  Pipeline YAML  │  configs/{provider}/{domain}/pipeline.yml
│  + Schemas      │  configs/{provider}/{domain}/schemas/*.json
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pipeline       │  src/core/pipeline/executor.py
│  Executor       │  - Loads config, resolves variables
└────────┬────────┘  - Calls processor.execute(step_config, context)
         │
         ▼
┌─────────────────┐
│  PROCESSOR      │  src/core/processors/{provider}/{domain}.py
│  (Engine)       │  - THE HEART OF THE SYSTEM
└────────┬────────┘  - Loads schemas from configs/
         │           - Executes BigQuery operations
         │           - Returns result dict
         ▼
┌─────────────────┐
│  BigQuery API   │  via src/core/engine/bq_client.py
└─────────────────┘
```

#### Key Processors

**1. Bootstrap Processor (`setup.initial.onetime_bootstrap`)**
- File: `src/core/processors/setup/initial/onetime_bootstrap_processor.py`
- Creates central `organizations` dataset + 14 management tables
- Loads schemas from `configs/setup/bootstrap/schemas/*.json`

**2. Dry-Run Processor (`setup.organizations.dryrun`)**
- File: `src/core/processors/setup/organizations/dryrun.py`
- Validates org before onboarding (NO resources created)
- Checks: org_slug format, email, GCP connectivity, central tables exist

**3. Onboarding Processor (`setup.organizations.onboarding`)**
- File: `src/core/processors/setup/organizations/onboarding.py`
- Creates org dataset and metadata
- Generates and stores API key (hashed + KMS encrypted)

**4. BigQuery ETL Processor (`gcp.bq_etl`)**
- File: `src/core/processors/gcp/bq_etl.py`
- Extract-Transform-Load for BigQuery
- Loads schema templates from `configs/gcp/bq_etl/schema_template.json`

**5. Integration Processors**
- `kms_store.py` - Encrypt & store credentials via KMS
- `kms_decrypt.py` - Decrypt credentials for pipeline use
- `validate_*.py` - Provider-specific credential validation

**6. Email Notification Processor (`notify_systems.email_notification`)**
- File: `src/core/processors/notify_systems/email_notification.py`
- Send email notifications for pipeline events
- Triggers: on_failure, on_success, on_completion, always

#### Creating a New Processor

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

3. **Create config folder with config.yml:**
   ```
   configs/{provider}/{domain}/
   ├── config.yml              # Pipeline/processor configuration
   └── schemas/                # JSON schemas (if needed)
       └── my_table.json
   ```

4. **Update this documentation!**

### Pipeline Types

#### LLM Provider Pipelines (Daily/Monthly)

| Config | Schedule | Processors | Output Tables |
|--------|----------|------------|---------------|
| `openai/usage_cost.yml` | Daily | `openai.usage` → `openai.cost` | `openai_usage_daily_raw`, `openai_cost_daily` |
| `openai/subscriptions.yml` | Monthly | `openai.subscriptions` | `openai_subscriptions_monthly` |
| `anthropic/usage_cost.yml` | Daily | `anthropic.usage` → `anthropic.cost` | `anthropic_usage_daily_raw`, `anthropic_cost_daily` |

#### Cloud Provider Pipelines

| Config | Schedule | Processor | Output Tables |
|--------|----------|-----------|---------------|
| `gcp/cost/billing.yml` | Daily | `gcp.bq_etl` | `gcp_billing_daily_raw` |

#### System Pipelines (Admin)

| Type | Config | Processor | Purpose |
|------|--------|-----------|---------|
| Bootstrap | `setup/bootstrap/config.yml` | `setup.initial.onetime_bootstrap` | Create central dataset + 14 tables |
| Dry-run | N/A (processor only) | `setup.organizations.dryrun` | Validate before onboarding |
| Onboarding | `setup/organizations/onboarding/config.yml` | `setup.organizations.onboarding` | Create org + API key + dataset |

#### Integration Processors

Managed via API endpoints, not separate config files:

| Processor | Purpose |
|-----------|---------|
| `integrations.kms_store` | Store KMS-encrypted credentials |
| `integrations.kms_decrypt` | Decrypt credentials for use |
| `integrations.validate_openai` | Validate OpenAI API key |
| `integrations.validate_claude` | Validate Anthropic/Claude API key |
| `integrations.validate_gcp` | Validate GCP Service Account |

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
├── provider:    openai, anthropic, gcp
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

## Dataset Structure

```
Central: organizations (project.organizations)
├── org_profiles                    # Organization metadata
├── org_api_keys                    # API keys (SHA256 hash + KMS encrypted)
├── org_subscriptions               # Subscription tiers (STARTER, PROFESSIONAL, SCALE)
├── org_usage_quotas                # Usage limits per org
├── org_integration_credentials     # LLM & cloud integration credentials (KMS encrypted)
├── org_pipeline_configs            # Pipeline configurations
├── org_scheduled_pipeline_runs     # Scheduled pipeline definitions
├── org_pipeline_execution_queue    # Pipeline execution queue
├── org_meta_pipeline_runs          # Execution logs
├── org_meta_step_logs              # Step-level logs
├── org_meta_dq_results             # Data quality results
├── org_audit_logs                  # Audit trail
├── org_kms_keys                    # KMS key metadata
└── org_cost_tracking               # Cost tracking data

Per-Organization: {org_slug}_{env} (e.g., acme_prod)
└── billing_cost_daily, openai_usage_daily_raw, etc.  # Data tables only
```

**Note:** Bootstrap creates 14 tables in the central `organizations` dataset.

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
│   │   ├── llm_data.py                # LLM data management endpoints
│   │   ├── pipelines.py               # POST /api/v1/pipelines/run/...
│   │   └── scheduler.py               # Scheduled pipeline execution
│   ├── models/
│   │   └── openai_data_models.py      # Pydantic models for OpenAI CRUD
│   └── dependencies/
│       └── auth.py                    # verify_admin_key(), get_current_org()
├── src/core/processors/               # PROCESSORS - Heart of the system
│   ├── setup/
│   │   ├── initial/                   # Bootstrap processor
│   │   │   └── onetime_bootstrap_processor.py
│   │   └── organizations/             # Onboarding + dryrun processors
│   │       ├── onboarding.py
│   │       └── dryrun.py
│   ├── openai/                        # OpenAI processors
│   │   ├── authenticator.py
│   │   ├── usage.py
│   │   ├── cost.py
│   │   ├── subscriptions.py
│   │   ├── seed_csv.py
│   │   └── validation.py
│   ├── anthropic/                     # Anthropic processors
│   │   ├── authenticator.py
│   │   ├── usage.py
│   │   ├── cost.py
│   │   └── validation.py
│   ├── gcp/                           # GCP processors
│   │   ├── authenticator.py
│   │   ├── bq_etl.py
│   │   └── validation.py
│   ├── integrations/                  # Integration processors
│   │   ├── kms_store.py
│   │   ├── kms_decrypt.py
│   │   ├── validate_openai.py
│   │   ├── validate_claude.py
│   │   └── validate_gcp.py
│   └── notify_systems/                # Notification processors
│       └── email_notification.py
└── configs/                           # SINGLE SOURCE OF TRUTH
    ├── setup/
    │   ├── bootstrap/                 # Bootstrap configs + schemas (14 tables)
    │   │   ├── config.yml
    │   │   ├── schemas/
    │   │   └── views/
    │   └── organizations/             # Onboarding configs
    │       └── onboarding/
    │           ├── config.yml
    │           └── schemas/
    ├── openai/                        # OpenAI configs + seed data
    │   ├── seed/
    │   │   ├── schemas/               # openai_model_pricing.json, openai_subscriptions.json
    │   │   └── data/                  # default_pricing.csv, default_subscriptions.csv
    │   ├── usage_cost.yml
    │   └── subscriptions.yml
    ├── anthropic/                     # Anthropic configs + seed data
    │   ├── seed/
    │   │   ├── schemas/               # anthropic_pricing.json, anthropic_subscriptions.json
    │   │   └── data/                  # default_pricing.csv, default_subscriptions.csv
    │   └── usage_cost.yml
    ├── gcp/                           # GCP configs
    │   ├── billing.yml
    │   └── bq_etl/
    │       ├── config.yml
    │       └── schema_template.json
    ├── notify_systems/                # Notification configs
    │   ├── email_notification/
    │   │   └── config.yml
    │   └── slack_notification/
    │       └── config.yml
    ├── data_quality/                  # Data quality expectations
    │   └── expectations/
    │       └── billing_cost_suite.json
    └── system/                        # System configs
        ├── dataset_types.yml
        └── providers.yml
```

---

## Local Development

### Prerequisites

```bash
# Required environment variables
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="your-secure-admin-key"
export ENVIRONMENT="development"  # development|staging|production
export KMS_KEY_NAME="projects/{project}/locations/{loc}/keyRings/{ring}/cryptoKeys/{key}"

# Optional (for local dev only)
export DISABLE_AUTH="true"         # Skip auth validation
export BIGQUERY_LOCATION="US"
```

### Run Locally

```bash
cd convergence-data-pipeline
pip install -r requirements.txt

# For LOCAL DEVELOPMENT ONLY - never use these in production!
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="test-admin-key"
export DISABLE_AUTH="true"
export ENVIRONMENT="development"

python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000

# Health check
curl http://localhost:8000/health
```

### New Organization Onboarding

#### Step 1: Bootstrap (ONE-TIME per environment)

Run ONCE when setting up a new environment. Skip if already done.

```bash
curl -X POST $BASE_URL/api/v1/admin/bootstrap \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force_recreate_dataset": false}'
```

| Field | Value |
|-------|-------|
| Config | `configs/setup/bootstrap/config.yml` |
| Schemas | `configs/setup/bootstrap/schemas/*.json` (14 files) |
| Processor | `setup.initial.onetime_bootstrap` |
| Creates | `organizations` dataset + 14 management tables |

#### Step 2: Dry-Run Validation (RECOMMENDED)

Validates org_slug, email, GCP connectivity before onboarding.

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
| Processor | `setup.organizations.dryrun` |
| Validates | org_slug format, uniqueness, GCP connectivity, central tables exist |

#### Step 3: Onboard Organization

Creates org profile, API key, subscription, dataset.

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
| Config | `configs/setup/organizations/onboarding/config.yml` |
| Processor | `setup.organizations.onboarding` |
| Creates | `org_profiles`, `org_api_keys`, `org_subscriptions`, `org_usage_quotas` rows |
| Creates | Dataset `guruinc_234234_{env}` (e.g., `guruinc_234234_prod`) |

#### Step 4: Setup Integrations

```bash
# Setup OpenAI (auto-creates pricing + subscriptions tables)
curl -X POST $BASE_URL/api/v1/integrations/guruinc_234234/openai/setup \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"credential": "sk-...", "credential_name": "Production Key"}'

# Setup GCP Service Account
curl -X POST $BASE_URL/api/v1/integrations/guruinc_234234/gcp/setup \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"credential": "{\"type\":\"service_account\",...}"}'

# Check integration statuses
curl $BASE_URL/api/v1/integrations/guruinc_234234 \
  -H "X-API-Key: $ORG_API_KEY"
```

#### Step 5: Run Pipelines

```bash
# Run GCP Billing pipeline
curl -X POST $BASE_URL/api/v1/pipelines/run/guruinc_234234/gcp/cost/billing \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-25"}'

# Run OpenAI Usage & Cost pipeline
curl -X POST $BASE_URL/api/v1/pipelines/run/guruinc_234234/openai/usage_cost \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2025-11-25", "end_date": "2025-11-25"}'
```

---

## Deployment

```bash
# Deploy via gcloud (Cloud Run)
gcloud run deploy convergence-pipeline-{stage|prod} --source .

# Test health
curl https://convergence-pipeline-{env}-{project-id}.us-central1.run.app/health
```

### Environments

| Environment | URL |
|-------------|-----|
| Stage | `https://convergence-pipeline-stage-526075321773.us-central1.run.app` |
| Prod | `https://convergence-pipeline-prod-820784027009.us-central1.run.app` |

### Production Deployment Checklist

Before deploying to production:

- [ ] `ENVIRONMENT=production` is set
- [ ] `CA_ROOT_API_KEY` is set to a secure, unique value (min 32 chars)
- [ ] `DISABLE_AUTH=false` (or not set, defaults to false)
- [ ] `RATE_LIMIT_ENABLED=true` (or not set, defaults to true)
- [ ] `CORS_ORIGINS` is configured for your frontend domains
- [ ] KMS encryption is configured for credential storage
- [ ] Cloud Run service account has necessary IAM permissions

See `SECURITY.md` for detailed security configuration requirements.

---

## Verified Processor & Config Mapping

**Last verified: 2025-11-29**

| Processor | Config Path | Status |
|-----------|-------------|--------|
| `setup.initial.onetime_bootstrap` | `configs/setup/bootstrap/` | ✓ Verified |
| `setup.organizations.dryrun` | N/A (processor only) | ✓ Verified |
| `setup.organizations.onboarding` | `configs/setup/organizations/onboarding/` | ✓ Verified |
| `openai.usage` | `configs/openai/usage_cost.yml` | ✓ Verified |
| `openai.cost` | `configs/openai/usage_cost.yml` | ✓ Verified |
| `openai.subscriptions` | `configs/openai/subscriptions.yml` | ✓ Verified |
| `openai.seed_csv` | `configs/openai/seed/data/` | ✓ Verified |
| `anthropic.usage` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `anthropic.cost` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `gcp.bq_etl` | `configs/gcp/bq_etl/` | ✓ Verified |
| `notify_systems.email_notification` | `configs/notify_systems/email_notification/` | ✓ Verified |

### Bootstrap Schema Files (14 tables)

All schemas located in: `configs/setup/bootstrap/schemas/`

```
org_api_keys.json
org_audit_logs.json
org_cost_tracking.json
org_integration_credentials.json
org_kms_keys.json
org_meta_dq_results.json
org_meta_pipeline_runs.json
org_meta_step_logs.json
org_pipeline_configs.json
org_pipeline_execution_queue.json
org_profiles.json
org_scheduled_pipeline_runs.json
org_subscriptions.json
org_usage_quotas.json
```

**Note:** These 14 tables are created in the central `organizations` dataset during bootstrap.

### Bootstrap View Definitions

BigQuery views located in: `configs/setup/bootstrap/views/`

```
org_consolidated_view.sql    # Consolidated view of organization data
pipeline_logs_view.sql        # Pipeline execution logs view
step_logs_view.sql            # Step-level logs view
```

These SQL views are created during bootstrap to provide convenient access to joined/aggregated data.
