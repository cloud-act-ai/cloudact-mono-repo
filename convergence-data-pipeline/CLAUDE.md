# Backend: Convergence Data Pipeline

## Gist

Pipeline execution engine for ETL jobs. Port 8001. Runs scheduled pipelines, processes usage data, calculates costs.

**Bootstrap/Onboarding:** Handled by `cloudact-api-service` (port 8000) - NOT this service.

**Full Platform Architecture:** `../../ARCHITECTURE.md`

**Security Documentation:** `SECURITY.md`

## Pipeline Flow

```
API Request (X-API-Key)
    │
    ├─ POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
    │   │
    │   ├─ Validate subscription status (ACTIVE or TRIAL)
    │   ├─ Load config: configs/{provider}/{domain}/{pipeline}.yml
    │   ├─ Decrypt credentials from BigQuery (KMS)
    │   ├─ Execute processor: src/core/processors/{provider}/{domain}.py
    │   │   └─ Extract → Transform → Load to BigQuery
    │   └─ Log to org_meta_pipeline_runs
    │
    └─ Scheduled Jobs (Cloud Scheduler)
        └─ Daily/Monthly: Run pipelines for all orgs
```

## DO's and DON'Ts

### DO
- Run scheduled pipelines (daily GCP billing, OpenAI usage)
- Execute ad-hoc pipeline runs via API
- Process usage data and calculate costs
- Decrypt credentials from BigQuery using KMS
- Validate subscription status before execution
- Load all schemas from configs/
- Log execution to org_meta_pipeline_runs
- Use processors for ALL BigQuery operations

### DON'T
- **NEVER use DISABLE_AUTH=true** - Always authenticate properly, even in development
- Never handle bootstrap or org onboarding (use cloudact-api-service port 8000)
- Never create organizations or API keys (use cloudact-api-service port 8000)
- Never setup integrations (use cloudact-api-service port 8000)
- Never write raw SQL or use Alembic
- Never hardcode schemas in Python
- Never run pipelines for SUSPENDED/CANCELLED orgs
- Never skip credential decryption
- Never execute without valid org API key

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
- Subscription status checked before pipeline execution

---

## API Architecture

### Key Types

| Key | Header | Used For | Scope |
|-----|--------|----------|-------|
| Org API Key | `X-API-Key` | Pipelines, Data | Per-organization operations |

**Note:** Bootstrap and onboarding handled by `cloudact-api-service` (port 8000).

### Authentication Flow

```
Org API Key (created by cloudact-api-service)
    │
    ├── Run Pipelines: POST /api/v1/pipelines/run/{org}/...
    └── Query Data: org-specific BigQuery datasets
```

### API Endpoints

#### Organization Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Run specific pipeline |

**Note:** Integration management endpoints (setup, validate, delete) are handled by `cloudact-api-service` (port 8000).

**Note:** LLM data management endpoints (pricing, subscriptions) are handled by `cloudact-api-service` (port 8000).

---

## Customer Lifecycle

**Note:** Bootstrap and onboarding handled by `cloudact-api-service` (port 8000).

### Frontend ↔ Backend Flow

```
Frontend (Supabase)                    cloudact-api-service (8000)          convergence-pipeline (8001)
─────────────────                      ───────────────────────────          ───────────────────────
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
9. Save status to Supabase             (returns validation_status)
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
**Handled by cloudact-api-service (port 8000):**
- Frontend calls: `POST /api/v1/organizations/onboard`
- Backend creates: org_profile, org_api_key (hashed + KMS), org_subscription, dataset
- Returns: `{ api_key: "org_xxx_api_xxxxxxxx" }` (SHOWN ONCE!)
- Frontend saves to Supabase: `backend_onboarded: true`, `backend_api_key_fingerprint: "xxxx"`
- **NEVER stores actual API key**

#### Phase 3: Integrations Setup
**Handled by cloudact-api-service (port 8000):**

User adds LLM/Cloud provider credentials via frontend UI:
- `POST /integrations/{org}/openai/setup`
- `POST /integrations/{org}/anthropic/setup`
- `POST /integrations/{org}/gcp/setup`

Backend validates, KMS encrypts, stores credentials. Returns validation status.
Frontend saves status reference (not credentials) to Supabase.

#### Phase 4: Pipeline Execution

**Handled by convergence-data-pipeline (port 8001):**

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

**Note:** `configs/setup/` removed - bootstrap/onboarding configs now in `cloudact-api-service`.

### Processors (Execution Engines)

Processors are the **execution engines** that do the actual work:
- Read configuration from `configs/`
- Execute business logic (BigQuery operations, validations, notifications)
- Return structured results for logging

```
src/core/processors/
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

**Note:** `setup/` processors removed - bootstrap/onboarding now in `cloudact-api-service`.

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

**1. BigQuery ETL Processor (`gcp.bq_etl`)**
- File: `src/core/processors/gcp/bq_etl.py`
- Extract-Transform-Load for BigQuery
- Loads schema templates from `configs/gcp/bq_etl/schema_template.json`

**2. Integration Processors**
- `kms_store.py` - Encrypt & store credentials via KMS
- `kms_decrypt.py` - Decrypt credentials for pipeline use
- `validate_*.py` - Provider-specific credential validation

**3. Email Notification Processor (`notify_systems.email_notification`)**
- File: `src/core/processors/notify_systems/email_notification.py`
- Send email notifications for pipeline events
- Triggers: on_failure, on_success, on_completion, always

**Note:** Bootstrap, dry-run, and onboarding processors moved to `cloudact-api-service`.

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

**Note:** System pipelines (bootstrap, onboarding) moved to `cloudact-api-service` (port 8000).

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

**Note:** Central dataset and 14 meta tables created by `cloudact-api-service` bootstrap.

---

## Project Structure

```
convergence-data-pipeline/
├── src/app/
│   ├── main.py                        # FastAPI entry
│   ├── config.py                      # Settings (env vars)
│   ├── routers/
│   │   ├── pipelines.py               # POST /api/v1/pipelines/run/...
│   │   └── scheduler.py               # Scheduled pipeline execution
│   ├── models/
│   │   └── openai_data_models.py      # Pydantic models for OpenAI CRUD
│   └── dependencies/
│       └── auth.py                    # get_current_org()
├── src/core/processors/               # PROCESSORS - Heart of the system
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

**Note:** Removed from this service (now in `cloudact-api-service`):
- `routers/admin.py` - Bootstrap endpoint
- `routers/organizations.py` - Onboarding endpoints
- `routers/integrations.py` - Integration management endpoints
- `routers/openai_data.py` - OpenAI pricing/subscriptions CRUD
- `routers/llm_data.py` - LLM data management endpoints
- `src/core/processors/setup/` - Bootstrap and onboarding processors
- `configs/setup/` - Bootstrap and onboarding configs

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

### Running Pipelines

**Note:** Organization onboarding and integration setup handled by `cloudact-api-service` (port 8000).

Once organization is onboarded and integrations are set up, you can run pipelines:

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

### Getting Customer API Keys for Local Development

To run pipelines locally for a specific customer, you need their decrypted API key. Customer API keys are stored encrypted with KMS in BigQuery.

**Step 1: Query the encrypted API key from BigQuery**

```sql
SELECT
    org_slug,
    encrypted_api_key
FROM `gac-prod-471220.organizations.org_api_keys`
WHERE org_slug = 'your_org_slug'
  AND is_active = TRUE
```

**Step 2: Decrypt using Python script**

```python
from google.cloud import kms_v1
import base64

# KMS key for decryption
KMS_KEY = "projects/gac-prod-471220/locations/us-central1/keyRings/convergence-keyring-prod/cryptoKeys/api-key-encryption"

def decrypt_api_key(encrypted_base64: str) -> str:
    """Decrypt a KMS-encrypted API key."""
    client = kms_v1.KeyManagementServiceClient()
    ciphertext = base64.b64decode(encrypted_base64)
    response = client.decrypt(
        request={"name": KMS_KEY, "ciphertext": ciphertext}
    )
    return response.plaintext.decode("utf-8")

# Usage:
# decrypted_key = decrypt_api_key("BASE64_ENCRYPTED_STRING_FROM_BQ")
# print(f"API Key: {decrypted_key}")
```

**Step 3: Use the decrypted key in pipeline requests**

```bash
export ORG_API_KEY="decrypted_key_here"
curl -X POST http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-29"}'
```

**Security Notes:**
- Never commit decrypted API keys to version control
- Use environment variables for local testing
- Customer API keys grant full access to that org's pipeline operations

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

**Last verified: 2025-11-30**

| Processor | Config Path | Status |
|-----------|-------------|--------|
| `openai.usage` | `configs/openai/usage_cost.yml` | ✓ Verified |
| `openai.cost` | `configs/openai/usage_cost.yml` | ✓ Verified |
| `openai.subscriptions` | `configs/openai/subscriptions.yml` | ✓ Verified |
| `openai.seed_csv` | `configs/openai/seed/data/` | ✓ Verified |
| `anthropic.usage` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `anthropic.cost` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `gcp.bq_etl` | `configs/gcp/bq_etl/` | ✓ Verified |
| `notify_systems.email_notification` | `configs/notify_systems/email_notification/` | ✓ Verified |

**Note:** Bootstrap, onboarding, and integration processors moved to `cloudact-api-service`.
