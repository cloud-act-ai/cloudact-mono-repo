# CLAUDE.md - Convergence Data Pipeline

## Core Principle

**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

**Single Source of Truth:** All configs, schemas, and pipeline definitions live in `configs/`

---

## MUST FOLLOW: Authentication Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TWO API KEY TYPES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ADMIN API KEY (X-Admin-Key header)                             │
│  ─────────────────────────────────                              │
│  Source: Environment variable ADMIN_API_KEY                     │
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
│  Key: ADMIN_API_KEY (X-Admin-Key header)                        │
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

## MUST FOLLOW: New Organization Onboarding Flow

### Prerequisites (Environment Variables)

```bash
# REQUIRED - Set these BEFORE running anything
export GCP_PROJECT_ID="gac-prod-471220"
export ADMIN_API_KEY="your-secure-admin-key"    # Any secure string YOU choose
export ENVIRONMENT="production"                  # development|staging|production
export KMS_KEY_NAME="projects/{project}/locations/{loc}/keyRings/{ring}/cryptoKeys/{key}"

# OPTIONAL
export DISABLE_AUTH="false"                      # true = skip auth (local dev only)
export BIGQUERY_LOCATION="US"
```

---

### Step 1: Bootstrap (ONE-TIME per environment)

**Run ONCE when setting up a new environment. Skip if already done.**

```bash
curl -X POST $BASE_URL/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
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
  -H "X-Admin-Key: $ADMIN_API_KEY" \
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
  -H "X-Admin-Key: $ADMIN_API_KEY" \
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
curl -X POST $BASE_URL/api/v1/pipelines/run/guruinc_234234/gcp/cost/cost_billing \
  -H "X-API-Key: guruinc_234234_api_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-25"}'
```

| Field | Value |
|-------|-------|
| Config | `configs/gcp/cost/cost_billing.yml` |
| Processor | `gcp.bq_etl` |
| Extracts | GCP billing data for specified date |
| Loads to | `guruinc_234234_{env}.billing_cost_daily` |

---

## Unified Config Structure (Single Source of Truth)

**NO separate `ps_templates/` - everything in `configs/`**

```
configs/                                    # SINGLE SOURCE OF TRUTH
├── setup/                                  # System setup pipelines
│   ├── bootstrap/
│   │   ├── pipeline.yml                    # Bootstrap pipeline config
│   │   ├── config.yml                      # Table definitions (partitioning, clustering)
│   │   └── schemas/                        # JSON schemas (11 tables)
│   │       ├── org_profiles.json
│   │       ├── org_api_keys.json
│   │       ├── org_subscriptions.json
│   │       ├── org_usage_quotas.json
│   │       ├── org_cloud_credentials.json
│   │       ├── org_pipeline_configs.json
│   │       ├── org_scheduled_pipeline_runs.json
│   │       ├── org_pipeline_execution_queue.json
│   │       ├── org_meta_pipeline_runs.json
│   │       ├── org_meta_step_logs.json
│   │       └── org_meta_dq_results.json
│   └── organizations/
│       ├── onboarding/
│       │   ├── pipeline.yml                # Onboarding pipeline
│       │   ├── config.yml
│       │   └── schema.json
│       └── dryrun/
│           └── pipeline.yml                # Dry-run validation
├── gcp/
│   ├── cost/
│   │   └── cost_billing.yml                # Cost billing pipeline
│   └── bq_etl/
│       └── schema_template.json            # BQ ETL schema templates
├── aws/
│   └── s3_data_loader/
│       └── config.yml
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

| Type | Config | Processor | Auth | Purpose |
|------|--------|-----------|------|---------|
| Bootstrap | `configs/setup/bootstrap/pipeline.yml` | `setup.initial.onetime_bootstrap` | Admin | Create central dataset + 11 tables |
| Dry-run | `configs/setup/organizations/dryrun/pipeline.yml` | `setup.organizations.dryrun` | Admin | Validate before onboarding |
| Onboarding | `configs/setup/organizations/onboarding/pipeline.yml` | `setup.organizations.onboarding` | Admin | Create org + API key + dataset |
| Cost Billing | `configs/gcp/cost/cost_billing.yml` | `gcp.bq_etl` | Org Key | Extract GCP billing data |
| Email Notify | (step in pipeline) | `notify_systems.email_notification` | - | Send pipeline notifications |

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
├── org_profiles              # Organization metadata
├── org_api_keys              # API keys (SHA256 hash + KMS encrypted)
├── org_subscriptions         # Subscription tiers (STARTER, PROFESSIONAL, SCALE)
├── org_usage_quotas          # Usage limits per org
├── org_cloud_credentials     # Cloud provider credentials (KMS encrypted)
├── org_pipeline_configs      # Pipeline configurations
├── org_scheduled_pipeline_runs
├── org_pipeline_execution_queue
├── org_meta_pipeline_runs    # Execution logs
├── org_meta_step_logs        # Step-level logs
└── org_meta_dq_results       # Data quality results

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
│   │   └── pipelines.py               # POST /api/v1/pipelines/run/...
│   └── dependencies/
│       └── auth.py                    # verify_admin_key(), get_current_org()
├── src/core/processors/               # ⭐ PROCESSORS - Heart of the system
│   ├── setup/initial/                 #    Bootstrap processor
│   ├── setup/organizations/           #    Onboarding + dryrun processors
│   ├── gcp/bq_etl.py                  #    BigQuery ETL engine
│   └── notify_systems/                #    Email notification engine
└── configs/                           # ⭐ SINGLE SOURCE OF TRUTH
    ├── setup/bootstrap/               #    Bootstrap pipeline + schemas
    ├── setup/organizations/           #    Onboarding + dryrun pipelines
    ├── gcp/cost/                      #    GCP cost pipelines
    └── gcp/bq_etl/                    #    BQ ETL schema templates
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

## Testing Locally

```bash
cd convergence-data-pipeline
pip install -r requirements.txt

export GCP_PROJECT_ID="gac-prod-471220"
export ADMIN_API_KEY="test-admin-key"
export DISABLE_AUTH="true"

python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000

# Health check
curl http://localhost:8000/health
```

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
│   │       ├── org_cloud_credentials.json
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
export ADMIN_API_KEY="test-admin-key"
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
