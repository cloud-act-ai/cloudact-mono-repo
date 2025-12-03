# Backend: Convergence Data Pipeline

## Gist

Pipeline execution engine for ETL jobs. Port 8001. Runs scheduled pipelines, processes usage data, calculates costs. Also handles integration management and LLM data CRUD.

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
- Manage integrations (setup, validate, delete)
- Handle LLM data CRUD (pricing, subscriptions)

### DON'T
- **NEVER use DISABLE_AUTH=true in production** - Always authenticate properly
- Never handle bootstrap or org onboarding (use cloudact-api-service port 8000)
- Never create organizations or API keys (use cloudact-api-service port 8000)
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
| Org API Key | `X-API-Key` | Pipelines, Integrations, LLM Data | Per-organization operations |

**Note:** Bootstrap and onboarding handled by `cloudact-api-service` (port 8000).

### Authentication Flow

```
Org API Key (created by cloudact-api-service)
    │
    ├── Run Pipelines: POST /api/v1/pipelines/run/{org}/...
    ├── Manage Integrations: POST /api/v1/integrations/{org}/...
    ├── LLM Data CRUD: GET/POST /api/v1/integrations/{org}/{provider}/pricing
    └── Query Data: org-specific BigQuery datasets
```

### API Endpoints

#### Routers Registered in main.py

| Router | Tag | Prefix | Purpose |
|--------|-----|--------|---------|
| `pipelines.py` | Pipelines | `/api/v1` | Pipeline execution and monitoring |
| `scheduler.py` | Scheduler | `/api/v1` | Pipeline scheduling and cron jobs |
| `integrations.py` | Integrations | `/api/v1` | Provider credential management |
| `llm_data.py` | LLM Data | `/api/v1` | Pricing and subscription CRUD |

**Note:** `openai_data.py` exists but is NOT registered in main.py (legacy/unused).

#### Pipeline Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Run specific pipeline |

#### Scheduler Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/scheduler/trigger` | Trigger scheduled pipeline |
| GET | `/api/v1/scheduler/queue` | Get pipeline queue |
| POST | `/api/v1/scheduler/queue/process` | Process queued pipelines |

#### Integration Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/integrations/{org_slug}/{provider}/setup` | Setup provider integration |
| POST | `/api/v1/integrations/{org_slug}/{provider}/validate` | Validate credentials |
| GET | `/api/v1/integrations/{org_slug}` | Get all integration statuses |
| GET | `/api/v1/integrations/{org_slug}/{provider}` | Get specific integration |
| DELETE | `/api/v1/integrations/{org_slug}/{provider}` | Delete integration |

#### LLM Data Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/integrations/{org_slug}/{provider}/pricing` | List pricing models |
| POST | `/api/v1/integrations/{org_slug}/{provider}/pricing` | Add pricing model |
| GET | `/api/v1/integrations/{org_slug}/{provider}/subscriptions` | List subscriptions |
| POST | `/api/v1/integrations/{org_slug}/{provider}/subscriptions` | Add subscription |

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
7. User adds credentials                                                   8. POST /integrations/{org}/{provider}/setup
   (via integration pages)                                                    Validate → KMS encrypt → Store
                                                                           ◄────────────────
9. Save status to Supabase                                                 (returns validation_status)
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

**Actual config structure (verified 2025-12-02):**

```
configs/
├── anthropic/
│   └── usage_cost.yml                      # Daily: extract usage → transform cost
├── openai/
│   ├── cost/
│   │   ├── cost_calculation.yml            # Cost calculation pipeline
│   │   ├── cost_extract.yml                # Cost extraction pipeline
│   │   └── usage_cost.yml                  # Combined usage + cost pipeline
│   └── subscriptions.yml                   # Monthly: subscription data
├── gcp/
│   └── cost/
│       ├── billing.yml                     # GCP billing pipeline
│       └── schemas/
│           └── billing_cost.json           # BQ table schema
├── example/
│   ├── finance/
│   │   └── subscription_costs_transform.yml
│   └── usage/
│       └── example_elt_pipeline.yml
├── notify_systems/
│   ├── email_notification/
│   │   └── config.yml
│   └── slack_notification/
│       └── config.yml
└── system/
    ├── dataset_types.yml                   # Dataset type definitions
    └── providers.yml                       # Provider registry (IMPORTANT)
```

**Key Config: `providers.yml`** - Single source of truth for all provider configurations including:
- LLM providers: OPENAI, ANTHROPIC, CLAUDE
- Cloud providers: GCP_SA
- Data table configurations
- API URLs, auth headers, validation models
- Provider aliases

### Processors (Execution Engines)

Processors are the **execution engines** that do the actual work:
- Read configuration from `configs/`
- Execute business logic (BigQuery operations, validations, notifications)
- Return structured results for logging

**Actual processor structure (verified 2025-12-02):**

```
src/core/processors/
├── openai/
│   ├── authenticator.py                    # OpenAI API authentication
│   ├── usage.py                            # Extract usage data (ps_type: openai.usage)
│   ├── cost.py                             # Calculate costs (ps_type: openai.cost)
│   ├── subscriptions.py                    # Subscription management
│   ├── seed_csv.py                         # Seed pricing from CSV (ps_type: openai.seed_csv)
│   └── validation.py                       # Validate OpenAI credentials
├── anthropic/
│   ├── authenticator.py                    # Anthropic API authentication
│   ├── usage.py                            # Extract usage data (ps_type: anthropic.usage)
│   ├── cost.py                             # Calculate costs (ps_type: anthropic.cost)
│   └── validation.py                       # Validate Anthropic credentials
├── gcp/
│   ├── authenticator.py                    # GCP authentication (shared OAuth2)
│   ├── external_bq_extractor.py            # BigQuery ETL (ps_type: gcp.bq_etl)
│   ├── gcp_api_extractor.py                # GCP REST API extraction (ps_type: gcp.api_extractor)
│   └── validation.py                       # Validate GCP credentials
├── generic/
│   ├── api_extractor.py                    # Generic API extraction (ps_type: generic.api_extractor)
│   └── local_bq_transformer.py             # Local BQ transformation (ps_type: generic.local_bq_transformer)
├── integrations/
│   ├── kms_store.py                        # Encrypt & store credentials
│   ├── kms_decrypt.py                      # Decrypt credentials for use
│   ├── validate_openai.py                  # Validate OpenAI API key
│   ├── validate_claude.py                  # Validate Claude/Anthropic key
│   └── validate_gcp.py                     # Validate GCP Service Account
└── notify_systems/
    └── email_notification.py               # Email notifications
```

#### Processor Execution Flow

```
API Request
     │
     ▼
┌─────────────────┐
│  Pipeline YAML  │  configs/{provider}/{domain}/{pipeline}.yml
│  + Schemas      │  configs/{provider}/{domain}/schemas/*.json
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pipeline       │  src/core/pipeline/async_executor.py
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

**1. GCP BigQuery Extractor (`gcp.bq_etl`)**
- File: `src/core/processors/gcp/external_bq_extractor.py`
- Extract data from external BigQuery sources
- Loads schema from `configs/gcp/cost/schemas/billing_cost.json`

**2. GCP API Extractor (`gcp.api_extractor`)**
- File: `src/core/processors/gcp/gcp_api_extractor.py`
- Extract data from any GCP REST API (Billing, Compute, Monitoring, IAM, etc.)
- Uses shared `GCPAuthenticator` for OAuth2 Service Account auth
- GCP `nextPageToken` pagination pattern
- ELT pattern: stores raw JSON, transform via SQL
- See: `docs/GCP_API_EXTRACTOR.md`

**3. Generic Processors**
- `generic.api_extractor` - Generic API data extraction
- `generic.local_bq_transformer` - Local BigQuery transformations

**4. Integration Processors**
- `kms_store.py` - Encrypt & store credentials via KMS
- `kms_decrypt.py` - Decrypt credentials for pipeline use
- `validate_*.py` - Provider-specific credential validation

**4. Email Notification Processor (`notify_systems.email_notification`)**
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

3. **Create config folder with pipeline YAML:**
   ```
   configs/{provider}/{domain}/
   ├── {pipeline_name}.yml     # Pipeline configuration
   └── schemas/                # JSON schemas (if needed)
       └── my_table.json
   ```

4. **Update this documentation!**

### Pipeline Types

#### LLM Provider Pipelines (Daily/Monthly)

| Config | Schedule | Processors | Output Tables |
|--------|----------|------------|---------------|
| `openai/cost/usage_cost.yml` | Daily | `openai.usage` → `openai.cost` | `openai_usage_daily_raw`, `openai_cost_daily` |
| `openai/subscriptions.yml` | Monthly | `openai.subscriptions` | `openai_subscriptions_monthly` |
| `anthropic/usage_cost.yml` | Daily | `anthropic.usage` → `anthropic.cost` | `anthropic_usage_daily_raw`, `anthropic_cost_daily` |

#### Cloud Provider Pipelines

| Config | Schedule | Processor | Output Tables |
|--------|----------|-----------|---------------|
| `gcp/cost/billing.yml` | Daily | `gcp.bq_etl` | `gcp_billing_daily_raw` |
| `gcp/api/billing_accounts.yml` | Daily | `gcp.api_extractor` | `gcp_billing_accounts_raw` |

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

**Actual structure (verified 2025-12-02):**

```
convergence-data-pipeline/
├── src/app/
│   ├── main.py                        # FastAPI entry point
│   ├── config.py                      # Settings (env vars)
│   ├── routers/
│   │   ├── pipelines.py               # POST /api/v1/pipelines/run/...
│   │   ├── scheduler.py               # Scheduled pipeline execution
│   │   ├── integrations.py            # Integration setup/validate
│   │   ├── llm_data.py                # LLM pricing/subscriptions CRUD
│   │   └── openai_data.py             # (NOT REGISTERED - legacy)
│   ├── models/
│   │   ├── openai_data_models.py      # Pydantic models for OpenAI CRUD
│   │   └── org_models.py              # Organization models
│   ├── dependencies/
│   │   ├── auth.py                    # get_current_org(), AuthMetricsAggregator
│   │   └── rate_limit_decorator.py    # Rate limiting
│   └── middleware/
│       ├── validation.py              # Input validation
│       ├── audit_logging.py           # Audit trail
│       └── scope_enforcement.py       # Authorization scopes
├── src/core/
│   ├── processors/                    # PROCESSORS - Heart of the system
│   │   ├── openai/                    # OpenAI processors
│   │   ├── anthropic/                 # Anthropic processors
│   │   ├── gcp/                       # GCP processors
│   │   ├── generic/                   # Generic processors
│   │   ├── integrations/              # Integration processors
│   │   └── notify_systems/            # Notification processors
│   ├── abstractor/                    # Config loading
│   │   ├── config_loader.py
│   │   └── models.py
│   ├── engine/                        # BigQuery & API clients
│   │   ├── bq_client.py
│   │   ├── org_bq_client.py
│   │   ├── api_connector.py
│   │   └── polars_processor.py
│   ├── pipeline/                      # Pipeline execution
│   │   └── async_executor.py          # AsyncPipelineExecutor
│   ├── security/                      # KMS encryption
│   │   ├── kms_encryption.py
│   │   └── org_kms_encryption.py
│   ├── scheduler/                     # Scheduled execution
│   │   ├── queue_manager.py
│   │   ├── retry_manager.py
│   │   └── state_manager.py
│   ├── notifications/                 # Email/Slack
│   ├── observability/                 # Metrics
│   ├── metadata/                      # Execution logging
│   ├── providers/                     # Provider registry
│   ├── pubsub/                        # Pub/Sub integration
│   └── utils/                         # Utilities
└── configs/                           # SINGLE SOURCE OF TRUTH
    ├── openai/                        # OpenAI configs
    │   ├── cost/
    │   │   ├── cost_calculation.yml
    │   │   ├── cost_extract.yml
    │   │   └── usage_cost.yml
    │   └── subscriptions.yml
    ├── anthropic/                     # Anthropic configs
    │   └── usage_cost.yml
    ├── gcp/                           # GCP configs
    │   └── cost/
    │       ├── billing.yml
    │       └── schemas/
    │           └── billing_cost.json
    ├── example/                       # Example pipelines
    ├── notify_systems/                # Notification configs
    └── system/                        # System configs
        ├── dataset_types.yml
        └── providers.yml              # Provider registry
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

python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001

# Health check
curl http://localhost:8001/health
```

### Running Pipelines

**Note:** Organization onboarding handled by `cloudact-api-service` (port 8000).

Once organization is onboarded, you can set up integrations and run pipelines:

```bash
# Setup integration (via this service)
curl -X POST http://localhost:8001/api/v1/integrations/{org_slug}/openai/setup \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"api_key": "sk-..."}'

# Run GCP Billing pipeline
curl -X POST http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-25"}'

# Run OpenAI Usage & Cost pipeline
curl -X POST http://localhost:8001/api/v1/pipelines/run/{org_slug}/openai/cost/usage_cost \
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

## Environment Variables

| Variable | Default | Purpose | Production Requirement |
|----------|---------|---------|------------------------|
| `GCP_PROJECT_ID` | local-dev-project | GCP project for BigQuery | Required |
| `CA_ROOT_API_KEY` | None | Root API key for admin ops | Required (min 32 chars) |
| `DISABLE_AUTH` | false | Disable auth (dev only) | MUST be false |
| `ENVIRONMENT` | development | Runtime environment | development/staging/production |
| `RATE_LIMIT_ENABLED` | true | Enable rate limiting | MUST be true |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | 100 | Per-org limit | Configurable |
| `RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE` | 10000 | Global limit | Configurable |
| `KMS_KEY_NAME` | None | Full GCP KMS key path | Required in production |
| `API_SERVICE_URL` | http://localhost:8000 | cloudact-api-service URL | Set for your environment |

---

## Generic API Extractor (ELT Pattern)

The Generic API Extractor implements an ELT (Extract-Load-Transform) pattern for any REST API.

**Full Documentation:** `docs/API_EXTRACTOR.md`

### Architecture: Stream & Batch

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    API EXTRACTOR FLOW                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   REST API                                                               │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────┐                                                │
│   │ 1. Resolve Auth     │  Credential sources (priority order):          │
│   │    (KMS Decrypt)    │  1. context["secrets"][provider]               │
│   └─────────┬───────────┘  2. org_integration_credentials → KMS decrypt  │
│             │              3. direct secret_key                          │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 2. Fetch Page       │  Pagination types:                             │
│   │    (Generator)      │  - cursor: token from response                 │
│   └─────────┬───────────┘  - offset: page * limit                        │
│             │              - page: page number                           │
│             │              - link: next URL from response/header         │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 3. Yield Rows       │  Memory-safe: doesn't hold all data            │
│   │    (Stream)         │                                                │
│   └─────────┬───────────┘                                                │
│             │                                                            │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 4. Accumulate Batch │  Default: 1000 rows per batch                  │
│   │    (Buffer)         │                                                │
│   └─────────┬───────────┘                                                │
│             │                                                            │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 5. Insert to BQ     │  Smart insert:                                 │
│   │    (Batch/Stream)   │  - <100 rows: streaming insert (idempotent)   │
│   └─────────┬───────────┘  - ≥100 rows: batch load (efficient)          │
│             │                                                            │
│             ▼                                                            │
│        REPEAT until                                                      │
│        no more pages                                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Memory Safe** | Only holds ~1000 rows in memory at a time |
| **Resilient** | Partial data saved - if fails at row 9000, rows 1-8000 are in BQ |
| **Idempotent** | Uses insertId for deduplication (streaming inserts) |
| **Auth Integration** | Uses existing `org_integration_credentials` via KMS |
| **Rate Limiting** | Configurable RPS, auto-retry on 429 with exponential backoff |

### Usage Example

```yaml
# configs/vendor/users_extract.yml
pipeline_id: vendor-users-extract
steps:
  - step: "extract_users"
    processor: "generic.api_extractor"
    config:
      url: "https://api.vendor.com/v1/users"
      method: "GET"
      auth:
        type: "bearer"
        provider: "VENDOR_API"    # Looks up in org_integration_credentials
      pagination:
        type: "cursor"
        param: "after"
        response_path: "meta.next_cursor"
        limit: 100
      data_path: "data"
      destination:
        table: "vendor_users_raw"
        batch_size: 1000
      rate_limit:
        requests_per_second: 10
        retry_on_429: true
```

### Authentication Types

| Type | Header/Param | Use Case |
|------|--------------|----------|
| `bearer` | `Authorization: Bearer {token}` | OAuth2, API tokens |
| `header` | `X-API-Key: {key}` | Custom header auth |
| `query` | `?api_key={key}` | Query param auth |
| `basic` | `Authorization: Basic {base64}` | Basic auth |

### Credential Resolution

```
1. context["secrets"][provider]           ← From prior kms_decrypt step
2. org_integration_credentials → decrypt  ← Direct BQ query + KMS
3. context["secrets"][secret_key]         ← Direct key reference
```

---

## Verified Processor & Config Mapping

**Last verified: 2025-12-02**

| Processor | ps_type | Config Path | Status |
|-----------|---------|-------------|--------|
| `openai/usage.py` | `openai.usage` | `configs/openai/cost/usage_cost.yml` | ✓ Verified |
| `openai/cost.py` | `openai.cost` | `configs/openai/cost/usage_cost.yml` | ✓ Verified |
| `openai/subscriptions.py` | `openai.subscriptions` | `configs/openai/subscriptions.yml` | ✓ Verified |
| `openai/seed_csv.py` | `openai.seed_csv` | N/A (programmatic) | ✓ Verified |
| `anthropic/usage.py` | `anthropic.usage` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `anthropic/cost.py` | `anthropic.cost` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `gcp/external_bq_extractor.py` | `gcp.bq_etl` | `configs/gcp/cost/billing.yml` | ✓ Verified |
| `gcp/gcp_api_extractor.py` | `gcp.api_extractor` | `configs/gcp/api/billing_accounts.yml` | ✓ Verified |
| `generic/api_extractor.py` | `generic.api_extractor` | Any API pipeline | ✓ Verified |
| `generic/local_bq_transformer.py` | `generic.local_bq_transformer` | SQL transformations | ✓ Verified |
| `notify_systems/email_notification.py` | `notify_systems.email_notification` | `configs/notify_systems/email_notification/` | ✓ Verified |

---

## Core Infrastructure

| Module | Path | Purpose |
|--------|------|---------|
| **abstractor** | `src/core/abstractor/` | Config loading and models |
| **engine** | `src/core/engine/` | BigQuery client, API connector, Polars processor |
| **pipeline** | `src/core/pipeline/` | AsyncPipelineExecutor |
| **security** | `src/core/security/` | KMS encryption |
| **scheduler** | `src/core/scheduler/` | Queue, retry, state management |
| **notifications** | `src/core/notifications/` | Email/Slack providers |
| **observability** | `src/core/observability/` | Prometheus metrics |
| **metadata** | `src/core/metadata/` | MetadataLogger for audit trails |
| **providers** | `src/core/providers/` | Provider registry and validation |
| **pubsub** | `src/core/pubsub/` | Pub/Sub publisher and worker |
| **utils** | `src/core/utils/` | Logging, rate limiting, checkpoint management |

---

**Last Updated:** 2025-12-02
**Version:** 2.2
