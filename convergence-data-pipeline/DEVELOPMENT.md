# Development Guide - Convergence Data Pipeline

**Version**: 2.0.0 | **Last Updated**: 2025-11-19 | **Status**: Production Ready

Complete development guide for building, testing, and debugging the multi-tenant data pipeline backend.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Local Development Setup](#2-local-development-setup)
3. [Pipeline Configuration](#3-pipeline-configuration)
4. [Testing](#4-testing)
5. [Troubleshooting](#5-troubleshooting)

---

## 🏗️ Core Architecture Philosophy

### ⚠️ CRITICAL: This is NOT a Real-Time API

**Convergence is a Pipeline-as-Code System** - ALL operations are scheduled jobs, NOT real-time requests.

### Pipeline Execution Model

**Scheduler-Driven Architecture**:
- **Primary Execution**: Cloud Scheduler checks `tenant_scheduled_pipeline_runs` table for due pipelines
- **Authentication**: Scheduler uses **Admin API Key** to trigger pipeline runs
- **Manual Triggers**: Tenants (users) can trigger pipelines manually from frontend by passing:
  - `X-API-Key` (tenant API key)
  - Pipeline configuration details
  - Execution parameters

### Everything is Pipeline-as-Code

**ALL operations are pipelines** managed via `configs/`, `ps_templates/`, and `processors/`:

| Operation | Type | Pipeline Config | Processor |
|-----------|------|-----------------|-----------|
| **Bootstrap** | System setup | `configs/system/dataset_types.yml` | `src/core/processors/setup/initial/onetime_bootstrap_processor.py` |
| **Tenant Onboarding** | Tenant creation | `configs/tenant/onboarding.yml` | `src/core/processors/setup/tenants/onboarding.py` |
| **Cost Pipeline** | Provider data | `ps_templates/gcp/cost/cost_export.yml` | `src/core/processors/providers/gcp/cost_processor.py` |
| **Billing Pipeline** | Provider data | `ps_templates/gcp/billing/billing_export.yml` | `src/core/processors/providers/gcp/billing_processor.py` |
| **KMS Management** | Security | `ps_templates/gcp/kms/manage_kms_keys.yml` | `src/core/processors/security/kms_processor.py` |

### Core Components (Heart of the System)

**DO NOT DEVIATE FROM THIS ARCHITECTURE**:

1. **`configs/`** - Pipeline configuration files (YAML)
   - System configs: `configs/system/*.yml`
   - Tenant configs: `configs/tenant/*.yml`
   - Provider configs: `configs/providers/{gcp,aws,azure}/*.yml`

2. **`ps_templates/`** - Pipeline step templates (YAML)
   - GCP pipelines: `ps_templates/gcp/{cost,billing,kms}/`
   - AWS pipelines: `ps_templates/aws/`
   - Azure pipelines: `ps_templates/azure/`
   - Custom pipelines: `ps_templates/custom/`

3. **`src/core/processors/`** - Pipeline execution logic (Python)
   - Setup processors: `processors/setup/{initial,tenants}/`
   - Provider processors: `processors/providers/{gcp,aws,azure}/`
   - Security processors: `processors/security/`
   - Custom processors: `processors/custom/`

### Development Guidelines

**When adding new functionality**:
1. ✅ **DO**: Create a new processor in `src/core/processors/`
2. ✅ **DO**: Define pipeline config in `configs/`
3. ✅ **DO**: Add step templates in `ps_templates/`
4. ❌ **DON'T**: Add real-time API endpoints for data processing
5. ❌ **DON'T**: Bypass the pipeline execution model
6. ❌ **DON'T**: Add custom logic outside processors

**Example - Adding New Provider Pipeline**:
```yaml
# 1. Config: configs/providers/custom/new_provider.yml
pipeline_name: "custom_provider_pipeline"
schedule: "0 2 * * *"  # Daily at 2 AM
processor: "custom.new_provider_processor"

# 2. Template: ps_templates/custom/new_provider.yml
steps:
  - name: "extract_data"
    type: "extract"
  - name: "transform_data"
    type: "transform"
  - name: "load_data"
    type: "load"

# 3. Processor: src/core/processors/custom/new_provider_processor.py
class NewProviderProcessor(BaseProcessor):
    def execute(self):
        # Implementation
        pass
```

---

## 1. System Architecture

### 1.1 Overview

Enterprise backend service for executing multi-cloud data pipelines (GCP, AWS, Azure) with complete tenant isolation.

**Key Components**:
- **Runtime**: Cloud Run (FastAPI + Python 3.11)
- **Storage**: BigQuery (data + metadata)
- **Triggers**: Cloud Scheduler (automatic) OR API calls (manual)
- **Authentication**: API key (SHA256 hashed, KMS encrypted)

**What This Service Does**:
- Execute data transformation pipelines per tenant
- Enforce subscription quotas and rate limits
- Log all pipeline executions with audit trails
- Isolate tenant data in separate BigQuery datasets

### 1.2 Two-Dataset Architecture

**CRITICAL CONCEPT**: The system uses TWO separate datasets for each tenant.

#### Central Tenants Dataset (`tenants`)

**Purpose**: Centralized tenant management, auth, and quotas (shared across all tenants)

**Management Tables** (11 total):
```
tenants.tenant_profiles              # Company details, status, plan
tenants.tenant_api_keys              # SHA256-hashed API keys (KMS encrypted)
tenants.tenant_subscriptions         # Plan limits (daily/monthly/concurrent)
tenants.tenant_usage_quotas          # Real-time quota tracking
tenants.tenant_cloud_credentials     # KMS-encrypted provider credentials
tenants.tenant_provider_configs      # Pipeline settings per provider/domain
tenants.tenant_pipeline_configs      # Scheduled pipeline configurations (cron)
tenants.scheduled_pipeline_runs      # Track scheduled executions
tenants.pipeline_execution_queue     # Active queue for scheduled pipelines
tenants.tenant_pipeline_runs         # Centralized pipeline execution logs
tenants.tenant_step_logs             # Step execution logs (centralized)
tenants.tenant_dq_results            # Data quality results (centralized)
```

**Access Pattern**: Every API request authenticates against this dataset.

#### Per-Tenant Datasets (`{tenant_id}`)

**Purpose**: Isolated operational data per tenant

**Tables**:
```
{tenant_id}.tenant_comprehensive_view    # View showing all pipeline details (filters central tables)
{tenant_id}.onboarding_validation_test   # Validation table created during onboarding
{tenant_id}.gcp_cost_billing             # GCP billing data (example)
{tenant_id}.aws_cost_cur                 # AWS Cost and Usage Reports (example)
{tenant_id}.azure_cost_exports           # Azure cost exports (example)
```

**Isolation**: No cross-tenant queries possible (dataset-level separation)

**Important**: ALL metadata tables (`tenant_*`) are in the CENTRAL `tenants` dataset. Each tenant gets a comprehensive VIEW in their own dataset that queries the central tables.

### 1.3 Configuration-Driven Pipelines

**ALL pipelines are configuration-driven using YAML files.** There is no hardcoded pipeline logic.

#### Configuration Structure

```
/configs/                                # All pipeline configurations
  ├── gcp/
  │   ├── cost/
  │   │   └── billing.yml                # GCP cost extraction config
  │   └── security/
  │       └── iam_audit.yml
  ├── aws/
  │   ├── cost/
  │   │   └── cur.yml                    # AWS CUR extraction config
  │   └── security/
  ├── setup/
  │   ├── bootstrap_system.yml           # One-time bootstrap config
  │   └── tenants/onboarding.yml         # Tenant onboarding config
  └── azure/

/ps_templates/                           # Processor schema templates
  ├── gcp/cost/
  │   ├── config.yml                     # Processor config
  │   ├── README.md                      # Documentation
  │   └── schemas/
  │       └── billing_output.json
  └── setup/initial/
      ├── config.yml
      └── schemas/                       # 11 JSON schema files
```

#### Pipeline Execution Model

```
API Request → Load YAML Config → Execute Processors → Store Results

Example:
  POST /api/v1/pipelines/run/acme_corp/gcp/cost/cost_billing
    ↓
  Load: /configs/gcp/cost/cost_billing.yml
    ↓
  Parse steps array
    ↓
  For each step:
    - Extract ps_type (e.g., "gcp.bq_etl")
    - Load ps_templates/{provider}/{processor}/config.yml
    - Validate step parameters
    - Execute processor with step configuration
    - Log to metadata tables
    ↓
  Write results to BigQuery dataset: {tenant_id}
```

### 1.4 Processor System (ps_type)

The `ps_type` field in each pipeline step connects YAML configuration to actual processor code.

**Pattern**: `{provider}.{processor_name}`

**Examples**:
- `gcp.bq_etl` → `src/core/processors/gcp/bq_etl.py`
- `notify_systems.email_notification` → `src/core/processors/notify_systems/email_notification.py`
- `aws.s3_data_loader` → `src/core/processors/aws/s3_data_loader.py`

#### Available Processors

| ps_type | Purpose | Required Parameters |
|---------|---------|---------------------|
| `gcp.bq_etl` | BigQuery extraction/transformation | `source.query`, `destination.bq_project_id`, `destination.dataset_type`, `destination.table` |
| `aws.s3_data_loader` | Load S3 data to BigQuery | `source.s3_bucket`, `source.s3_key`, `destination.*` |
| `notify_systems.email_notification` | Send email notifications | `to_emails`, `trigger` |
| `notify_systems.slack_notification` | Send Slack notifications | `slack_webhook_url` or `slack_channel`, `trigger` |
| `setup.initial` | Bootstrap system (one-time) | None (auto-configured) |
| `setup.tenants.onboarding` | Onboard new tenants | Tenant details via API |

### 1.5 Execution Patterns

#### Pattern 1: Real-Time API Sync (Manual)

**Trigger**: User clicks "Sync Now" button in dashboard

```
POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/billing
  ↓
[Auth: Verify API key + subscription + quota]
  ↓
[Load: configs/gcp/cost/billing.yml]
  ↓
[Execute: Async background task (non-blocking)]
  ↓
[Response: Immediate with status=RUNNING]
  ↓
[Async: Pipeline executes and logs to metadata tables]
  ↓
[Client polls: GET /api/v1/pipelines/{pipeline_logging_id}/status]
```

**Characteristics**:
- User-initiated
- Immediate response (<100ms)
- Audit trail includes user_id
- Subject to quota limits

#### Pattern 2: Offline Scheduler Sync (Automatic)

**Trigger**: Cloud Scheduler hourly job

**Architecture**: Queue-based with three scheduled jobs

**Job 1**: Pipeline Trigger (Hourly at :00)
```
Cloud Scheduler → POST /api/v1/scheduler/trigger
  ↓
Query tenants.tenant_pipeline_configs WHERE is_active=TRUE AND next_run_time <= NOW()
  ↓
For each due pipeline:
  - INSERT INTO tenants.scheduled_pipeline_runs (state=PENDING)
  - INSERT INTO tenants.pipeline_execution_queue (state=QUEUED)
  - UPDATE tenant_pipeline_configs SET next_run_time (from cron)
```

**Job 2**: Queue Processor (Every 5 minutes)
```
Cloud Scheduler → POST /api/v1/scheduler/process-queue
  ↓
Get one QUEUED pipeline (ORDER BY priority, scheduled_time)
  ↓
Execute AsyncPipelineExecutor (user_id = NULL)
  ↓
On success/failure:
  - Mark scheduled_pipeline_runs as COMPLETED/FAILED
  - Remove from pipeline_execution_queue (or re-queue for retry)
```

**Job 3**: Daily Quota Reset (Daily at midnight UTC)
```
Cloud Scheduler → POST /api/v1/scheduler/reset-daily-quotas
  ↓
UPDATE tenants.tenant_usage_quotas SET pipelines_run_today=0
  ↓
DELETE records older than 90 days
```

### 1.6 Authentication Flow

```
1. Client Request:
   - Header: X-API-Key: {api_key}
   - Header: X-User-ID: {user_uuid} (optional)

2. Backend Processing:
   - Hash API key: tenant_api_key_hash = SHA256(api_key)
   - Lookup tenant:
     SELECT tenant_id, scopes, expires_at
     FROM tenants.tenant_api_keys
     WHERE tenant_api_key_hash = ? AND is_active = TRUE

3. Extract tenant_id from result

4. Validate subscription:
   - Check tenants.tenant_subscriptions.status = ACTIVE
   - Check trial_end_date, subscription_end_date

5. Validate quota:
   - Check tenants.tenant_usage_quotas (daily/monthly/concurrent limits)

6. Execute with context:
   - tenant_id: For dataset routing
   - user_id: For audit logging
```

---

## 2. Local Development Setup

### 2.1 Prerequisites

**Required**:
- Python 3.11+
- Docker & Docker Compose
- GCP Service Account with permissions:
  - BigQuery Data Editor
  - BigQuery Job User
  - Cloud KMS Encrypter/Decrypter

**Optional**:
- Google Cloud SDK (`gcloud`)
- BigQuery CLI (`bq`)

### 2.2 Installation (Local Python)

```bash
# Clone repository
git clone <repo-url>
cd cloudact-backend-systems/convergence-data-pipeline

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your GCP project details
nano .env
```

**Required Environment Variables**:
```bash
# .env file
GCP_PROJECT_ID=gac-prod-471220
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
ADMIN_API_KEY=your-admin-key-here
BIGQUERY_LOCATION=US
API_PORT=8000
LOG_LEVEL=INFO
```

### 2.3 Docker Development

#### Build and Start Container

```bash
# Build Docker image
docker-compose build

# Start service in detached mode
docker-compose up -d

# Check logs
docker-compose logs -f convergence-api

# Stop service
docker-compose down
```

#### Docker Environment Configuration

**Update docker-compose.yml volumes**:
```yaml
volumes:
  - /full/path/to/gcp-credentials.json:/app/gcp-credentials.json:ro
  - ./logs:/app/logs

environment:
  - GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-credentials.json
  - GCP_PROJECT_ID=gac-prod-471220
  - ADMIN_API_KEY=admin-test-key-123
```

### 2.4 Running Locally

#### Start API Server

```bash
# Activate virtual environment
source venv/bin/activate

# Start server
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Server will be available at: http://localhost:8000
```

#### Verify Server is Running

```bash
# Health check
curl http://localhost:8000/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   "environment": "development"
# }
```

#### Bootstrap System (One-Time)

```bash
# Generate admin key
export ADMIN_API_KEY=$(python3 scripts/generate_admin_key.py --no-prompt)

# Bootstrap (creates central tenants dataset + 11 tables)
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "force_recreate_dataset": false,
    "force_recreate_tables": false
  }'
```

#### Test Tenant Onboarding

```bash
# Onboard a test tenant
curl -X POST http://localhost:8000/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test_company_123",
    "company_name": "Test Company",
    "admin_email": "admin@testcompany.com",
    "subscription_plan": "PROFESSIONAL"
  }'

# Response includes API key - SAVE IT!
# {
#   "tenant_id": "test_company_123",
#   "api_key": "test_company_123_api_xxxxxxxxxxxx",
#   "subscription_plan": "PROFESSIONAL",
#   "dataset_created": true,
#   ...
# }
```

### 2.5 Environment Configuration

**Development (.env)**:
```bash
GCP_PROJECT_ID=gac-prod-471220
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
ADMIN_API_KEY=admin-dev-key
BIGQUERY_LOCATION=US
API_PORT=8000
LOG_LEVEL=DEBUG
DISABLE_AUTH=false  # Set to true for easier local testing
```

**Staging (.env.staging)**:
```bash
GCP_PROJECT_ID=gac-stage-471220
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-credentials.json
ADMIN_API_KEY=${SECRET_ADMIN_KEY}
BIGQUERY_LOCATION=US
API_PORT=8080
LOG_LEVEL=INFO
DISABLE_AUTH=false
GCP_KMS_KEY_NAME=projects/gac-stage-471220/locations/us-central1/keyRings/convergence-keyring-stage/cryptoKeys/api-key-encryption
```

**Production (.env.production)**:
```bash
GCP_PROJECT_ID=gac-prod-471220
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-credentials.json
ADMIN_API_KEY=${SECRET_ADMIN_KEY}
BIGQUERY_LOCATION=US
API_PORT=8080
LOG_LEVEL=WARNING
DISABLE_AUTH=false
GCP_KMS_KEY_NAME=projects/gac-prod-471220/locations/us-central1/keyRings/convergence-keyring-prod/cryptoKeys/api-key-encryption
```

### 2.6 Debugging Tips

**View Logs**:
```bash
# Local development
tail -f logs/convergence-api.log

# Docker
docker-compose logs -f convergence-api

# Filter for errors
docker-compose logs convergence-api | grep ERROR
```

**Access Container Shell**:
```bash
docker-compose exec convergence-api bash

# Inside container:
python3
>>> from src.core.bigquery.client import BigQueryClient
>>> client = BigQueryClient()
>>> client.query("SELECT 1")
```

**Check BigQuery Access**:
```bash
# List datasets
bq ls --project_id=gac-prod-471220

# List tables in tenants dataset
bq ls gac-prod-471220:tenants

# Query table
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) FROM \`gac-prod-471220.tenants.tenant_profiles\`"
```

---

## 3. Pipeline Configuration

### 3.1 YAML Schema Reference

#### Required Root Fields

```yaml
pipeline_id: "unique_pipeline_id"  # REQUIRED - Must be unique
description: "Pipeline description"  # REQUIRED - What this pipeline does

# Optional pipeline-level variables
variables:
  source_billing_table: "project.dataset.table"
  destination_dataset_type: "gcp_silver_cost"
  admin_email: "admin@example.com"

# Steps array (REQUIRED)
steps:
  - step_id: "step_name"           # REQUIRED - Must be unique within pipeline
    name: "Human Readable Name"    # OPTIONAL
    description: "What this step does"  # OPTIONAL
    ps_type: "gcp.bq_etl"          # REQUIRED - Processor type
    timeout_minutes: 10            # OPTIONAL - Default varies by type
```

**CRITICAL**:
- Do NOT use nested `pipeline:` object
- Fields must be at root level
- Use `step_id` NOT `id`

### 3.2 Common Mistakes & Fixes

#### Mistake #1: Nested `pipeline` Object

**WRONG**:
```yaml
pipeline:  # DON'T DO THIS!
  id: "my_pipeline"
  name: "My Pipeline"
```

**CORRECT**:
```yaml
pipeline_id: "my_pipeline"  # At root level
description: "My Pipeline - Description"
```

#### Mistake #2: Using `id` Instead of `step_id`

**WRONG**:
```yaml
steps:
  - id: "extract_data"  # WRONG FIELD NAME!
```

**CORRECT**:
```yaml
steps:
  - step_id: "extract_data"  # CORRECT!
```

#### Mistake #3: Wrong Destination Fields

**WRONG**:
```yaml
destination:
  dataset_id: "dataset"       # Should be dataset_type
  table_id: "table"           # Should be table
  write_disposition: "WRITE_APPEND"  # Should be write_mode
```

**CORRECT**:
```yaml
destination:
  bq_project_id: "project"
  dataset_type: "dataset"     # CORRECT
  table: "table"              # CORRECT
  write_mode: "append"        # CORRECT (lowercase)
```

#### Mistake #4: Missing Required Fields

**Error**: "Field required [type=missing]"

**Solution**: Ensure ALL required fields are present:
```yaml
destination:
  bq_project_id: "{project_id}"    # REQUIRED
  dataset_type: "{tenant_id}"      # REQUIRED
  table: "table_name"              # REQUIRED
  write_mode: "append"             # OPTIONAL (defaults vary)
```

### 3.3 Working Examples

#### Example 1: Simple BigQuery ETL Pipeline

```yaml
pipeline_id: "tenant_cost_extraction"
description: "Extract tenant cost data from GCP billing"

# Pipeline-level variables (accessible in all steps)
variables:
  source_table: "gac-prod-471220.billing_export.gcp_billing"
  admin_email: "admin@company.com"

steps:
  # Step 1: Extract billing data
  - step_id: "extract_billing"
    name: "Extract GCP Billing Data"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 20

    source:
      bq_project_id: "gac-prod-471220"
      query: |
        SELECT
          billing_account_id,
          service.description AS service_name,
          cost,
          usage_start_time,
          DATE(usage_start_time) AS usage_date
        FROM `{source_table}`
        WHERE DATE(usage_start_time) = '{date}'
          AND project.id = '{tenant_id}'

    destination:
      bq_project_id: "gac-prod-471220"
      dataset_type: "{tenant_id}"
      table: "gcp_cost_daily"
      write_mode: "append"
      table_config:
        time_partitioning:
          field: "usage_date"
          type: "DAY"
        clustering_fields:
          - "billing_account_id"
          - "service_name"

  # Step 2: Send notification on failure
  - step_id: "notify_on_failure"
    name: "Email Admin on Failure"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"

    to_emails:
      - "{admin_email}"
    subject_template: "[ALERT] Cost extraction failed for {tenant_id}"
    body_template: |
      Pipeline {pipeline_id} failed for tenant {tenant_id}.
      Check logs at: {tenant_id}.tenant_step_logs
```

#### Example 2: Dry Run Validation Pipeline

```yaml
pipeline_id: "dryrun_validation"
description: "Validate infrastructure setup and permissions"

steps:
  - step_id: "test_basic_operations"
    name: "Test Basic Data Operations"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 5

    source:
      query: |
        SELECT
          'Dry run successful' as message,
          CURRENT_TIMESTAMP() as timestamp,
          '{tenant_id}' as tenant_id

    destination:
      bq_project_id: "{project_id}"
      dataset_type: "{tenant_id}"
      table: "onboarding_validation_test"
      write_mode: "append"

    retry_policy:
      max_retries: 1
      retry_delay_seconds: 5
```

### 3.4 Field Reference

#### Source Configuration (BigQuery)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `bq_project_id` | No | string | Source project (defaults to main project) |
| `query` | Yes | string | SQL query to execute |

#### Destination Configuration (BigQuery)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `bq_project_id` | Yes | string | Target project ID |
| `dataset_type` | Yes | string | Target dataset (supports variables like `{tenant_id}`) |
| `table` | Yes | string | Target table name |
| `write_mode` | No | string | `append`, `truncate`, or `write_empty` (default: append) |
| `schema_template` | No | string | Schema template to use |
| `table_config` | No | object | Table partitioning/clustering |

#### Retry Policy

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `max_retries` | No | integer | 3 | Maximum retry attempts |
| `retry_delay_seconds` | No | integer | 5 | Delay between retries |

### 3.5 Variable Substitution

Variables can be used in queries and configuration using `{variable_name}` syntax.

**Available Variables**:
- `{tenant_id}` - Tenant identifier
- `{pipeline_id}` - Pipeline identifier
- `{date}` - Execution date (from parameters)
- `{project_id}` - GCP project ID
- Custom variables from `variables:` section
- Runtime parameters passed via API

**Example**:
```yaml
variables:
  source_table: "project.dataset.billing"

steps:
  - step_id: "extract"
    source:
      query: |
        SELECT * FROM `{source_table}`
        WHERE tenant_id = '{tenant_id}'
          AND date = '{date}'
```

### 3.6 Creating New Pipelines

**Steps**:

1. Create YAML config file:
   ```bash
   nano configs/gcp/cost/new_pipeline.yml
   ```

2. Define pipeline structure:
   ```yaml
   pipeline_id: "new_pipeline"
   description: "Description of what this does"

   steps:
     - step_id: "step1"
       ps_type: "gcp.bq_etl"
       # ... configuration
   ```

3. Test locally:
   ```bash
   # Validate YAML syntax
   python3 -c "import yaml; yaml.safe_load(open('configs/gcp/cost/new_pipeline.yml'))"

   # Run pipeline
   curl -X POST http://localhost:8000/api/v1/pipelines/run/test_tenant/gcp/cost/new_pipeline \
     -H "X-API-Key: $API_KEY" \
     -d '{"date": "2025-11-19"}'
   ```

4. Check logs:
   ```bash
   # Query execution logs
   bq query --use_legacy_sql=false \
     "SELECT * FROM \`gac-prod-471220.tenants.tenant_pipeline_runs\`
      WHERE pipeline_id LIKE '%new_pipeline%'
      ORDER BY start_time DESC
      LIMIT 10"
   ```

---

## 4. Testing

### 4.1 Test Suites Overview

The system has **30 test cases** across three environments:

| Suite | Environment | Tests | Purpose |
|-------|-------------|-------|---------|
| Local | Development | 10 | Functional tests for development |
| Staging | Staging | 10 | Integration and performance tests |
| Production | Production | 10 | Non-destructive health checks |

### 4.2 Local Test Suite

**Purpose**: Verify core functionality in local development environment

**Prerequisites**:
```bash
export ADMIN_API_KEY='your-admin-key'
export API_URL='http://localhost:8000'
```

**Test Cases**:

| # | Test Name | Description | Pass Criteria |
|---|-----------|-------------|---------------|
| 1 | Health Check | Verify service is running | 200 OK with "healthy" status |
| 2 | Bootstrap System | Initialize central dataset and tables | Creates all 11 management tables |
| 3 | Create Tenant | Create new tenant with datasets | Tenant created with BigQuery dataset |
| 4 | Get Tenant Info | Retrieve tenant details | Returns tenant metadata |
| 5 | Generate Tenant API Key | Create API key for tenant | API key generated (KMS timeout OK in local) |
| 6 | Invalid Admin Key Rejected | Security test for admin endpoints | 403 Forbidden |
| 7 | Missing Admin Key Rejected | Security test for missing auth | 422/403 error |
| 8 | API Versioning | Verify v1 API prefix | /api/v1/health responds |
| 9 | Rate Limiting Headers | Check rate limiting is active | Headers present or success |
| 10 | Schema Consistency | Verify database schema | Re-bootstrap finds existing tables |

**Run Local Tests**:
```bash
# Make scripts executable (first time only)
chmod +x tests/*.sh

# Generate admin key
export ADMIN_API_KEY=$(python3 scripts/generate_admin_key.py --no-prompt)

# Run tests
./tests/local_test_suite.sh
```

**Expected Output**:
```
================================================================================
LOCAL TEST SUITE - Convergence Data Pipeline
================================================================================

Test 1/10: Health Check... ✓ PASSED
Test 2/10: Bootstrap System... ✓ PASSED
Test 3/10: Create Tenant... ✓ PASSED
...

================================================================================
TEST RESULTS
================================================================================
Total Tests:  10
Passed:       10
Failed:       0
Success Rate: 100%
================================================================================
✓ ALL TESTS PASSED
```

### 4.3 Docker Testing

**Quick Start**:
```bash
# Build and start
docker-compose up -d

# Run automated tests
./docker-test.sh
```

**Manual Testing**:

```bash
# Health check
curl http://localhost:8080/health

# Bootstrap
curl -X POST http://localhost:8080/admin/bootstrap \
  -H "X-Admin-Key: admin-test-key-123" \
  -H "Content-Type: application/json" \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'

# Onboard tenant
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "docker_test_123",
    "company_name": "Docker Test Co",
    "admin_email": "admin@dockertest.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Docker Commands**:
```bash
# View logs
docker-compose logs -f convergence-api

# Execute shell in container
docker-compose exec convergence-api bash

# Stop and clean up
docker-compose down -v
```

### 4.4 Staging Test Suite

**Purpose**: Validate deployment and integration in staging environment

**Prerequisites**:
```bash
export STAGING_URL='https://convergence-api-staging.example.com'
export ADMIN_API_KEY='your-staging-admin-key'
```

**Test Cases** (10 tests):
- HTTPS/TLS Certificate validation
- Service health & environment check
- KMS integration testing
- Multi-tenant isolation verification
- Rate limiting validation
- BigQuery dataset access
- Logging & monitoring
- Performance (response time < 2s)
- Error handling
- End-to-end workflow

**Run Staging Tests**:
```bash
./tests/staging_test_suite.sh
```

### 4.5 Production Test Suite

**Purpose**: Non-destructive health monitoring for production

**IMPORTANT**: These tests are **read-only** and safe for production.

**Prerequisites**:
```bash
export PROD_URL='https://api.convergence.example.com'
export ADMIN_API_KEY='your-production-admin-key'
```

**Test Cases** (10 tests):
- Service availability (99.9% SLA)
- HTTPS/TLS security
- Response time SLA (<500ms)
- Admin endpoints protection
- Invalid admin keys rejection
- API versioning
- Error handling (404s)
- CORS configuration
- Rate limiting active
- Environment configuration

**Run Production Tests**:
```bash
./tests/production_test_suite.sh
```

### 4.6 Unit Tests

**Location**: `tests/unit/`

```bash
# Run unit tests with coverage
pytest tests/unit/ -v --cov=src --cov-report=html

# View coverage report
open htmlcov/index.html
```

**Test Structure**:
```
tests/
├── unit/
│   ├── test_processors.py       # Core processor tests
│   ├── test_security.py         # Security utilities
│   └── test_validation.py       # Data validation
├── integration/
│   ├── test_bigquery.py         # BigQuery integration
│   ├── test_kms.py              # KMS integration
│   └── test_multi_tenant.py    # Multi-tenant isolation
└── security/
    ├── test_auth.py             # Authentication
    ├── test_authz.py            # Authorization
    └── test_input_validation.py # Input validation
```

### 4.7 Integration Tests

**Location**: `tests/integration/`

```bash
# Run integration tests
pytest tests/integration/ -v

# Run specific integration test
pytest tests/integration/test_bigquery.py::test_dataset_creation -v
```

### 4.8 Debugging Failed Tests

**Steps**:

1. **Check logs**:
   ```bash
   tail -f logs/convergence-api.log | grep ERROR
   ```

2. **Run individual test**:
   ```bash
   # From test script
   test_5_generate_api_key
   echo $?  # Check exit code (0 = success)
   ```

3. **Verify environment**:
   ```bash
   echo $API_URL
   echo $ADMIN_API_KEY
   curl $API_URL/health
   ```

4. **Check BigQuery permissions**:
   ```bash
   bq ls --project_id=gac-prod-471220
   ```

5. **Test API endpoint directly**:
   ```bash
   curl -v http://localhost:8000/api/v1/health
   ```

---

## 5. Troubleshooting

### 5.1 Common Development Issues

#### Issue: "Connection Refused"

**Cause**: API server not running

**Solution**:
```bash
# Start the server
python3 -m uvicorn src.app.main:app --port 8000

# Or with Docker
docker-compose up -d
```

#### Issue: "Admin Key Invalid"

**Cause**: Wrong or missing ADMIN_API_KEY

**Solution**:
```bash
# Generate new admin key
export ADMIN_API_KEY=$(python3 scripts/generate_admin_key.py --no-prompt)

# Verify it works
curl -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:8000/api/v1/admin/tenants
```

#### Issue: "KMS Timeout"

**Cause**: Network issues or missing KMS permissions

**Solution**:
```bash
# Check KMS permissions
gcloud kms keys get-iam-policy api-key-encryption \
  --location=us-central1 \
  --keyring=convergence-keyring-prod \
  --project=gac-prod-471220

# Grant permissions if needed
gcloud kms keys add-iam-policy-binding api-key-encryption \
  --location=us-central1 \
  --keyring=convergence-keyring-prod \
  --project=gac-prod-471220 \
  --member=serviceAccount:your-sa@project.iam.gserviceaccount.com \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
```

### 5.2 Pipeline Configuration Issues

#### Issue: Variables Not Substituted in SQL

**Symptom**: Query contains literal `{source_billing_table}` instead of actual value

**Cause**: Pipeline-level variables not being passed to processor

**Solution**:
```yaml
# Ensure variables are at pipeline level
pipeline_id: "cost_billing"
description: "Cost billing pipeline"

variables:
  source_table: "project.dataset.table"  # Define here

steps:
  - step_id: "extract"
    source:
      query: |
        SELECT * FROM `{source_table}`  # Will be replaced
```

**Alternative**: Pass as runtime parameter:
```bash
curl -X POST http://localhost:8000/api/v1/pipelines/run/tenant/gcp/cost/billing \
  -d '{
    "date": "2025-11-19",
    "source_table": "project.dataset.table"
  }'
```

#### Issue: "Field required" Validation Error

**Symptom**: Pydantic validation fails with missing field

**Example Error**:
```
Field required [type=missing, input_value=..., input_type=dict]
For further information visit https://errors.pydantic.dev/2.5/v/missing
```

**Solution**: Check exact field path in error and add missing field:
```yaml
# Ensure ALL required fields are present
destination:
  bq_project_id: "gac-prod-471220"     # REQUIRED
  dataset_type: "{tenant_id}"          # REQUIRED
  table: "table_name"                  # REQUIRED
  write_mode: "append"                 # OPTIONAL but recommended
```

#### Issue: "BigQuery to BigQuery step must have 'destination' configuration"

**Cause**: Missing or incorrectly named destination block

**Solution**:
```yaml
steps:
  - step_id: "extract"
    ps_type: "gcp.bq_etl"

    source:
      query: "SELECT 1"

    destination:  # MUST be named "destination" (not "target" or "output")
      bq_project_id: "project"
      dataset_type: "dataset"
      table: "table"
```

### 5.3 BigQuery Issues

#### Issue: Permission Denied Creating Dataset

**Symptom**:
```
403 User does not have bigquery.datasets.create permission
```

**Solution**:
```bash
# Grant required roles to service account
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member=serviceAccount:your-sa@project.iam.gserviceaccount.com \
  --role=roles/bigquery.dataEditor

gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member=serviceAccount:your-sa@project.iam.gserviceaccount.com \
  --role=roles/bigquery.jobUser
```

#### Issue: Table Not Found

**Symptom**:
```
404 Not found: Table gac-prod-471220:tenant.table
```

**Solution**:
```bash
# Check if dataset exists
bq ls gac-prod-471220:tenant

# Check if table exists
bq ls gac-prod-471220:tenant

# If missing, onboard tenant again
curl -X POST http://localhost:8000/api/v1/tenants/onboard \
  -d '{"tenant_id": "tenant", ...}'
```

### 5.4 Docker Issues

#### Issue: Port Already in Use

**Symptom**:
```
Error response from daemon: driver failed programming external connectivity
```

**Solution**:
```bash
# Find process using port 8080
lsof -i :8080

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "8090:8080"
```

#### Issue: GCP Credentials Not Found

**Symptom**:
```
Could not automatically determine credentials
```

**Solution**:
```bash
# Check if credentials file exists
ls -la /path/to/gcp-credentials.json

# Update docker-compose.yml volume mount
volumes:
  - /full/absolute/path/to/gcp-credentials.json:/app/gcp-credentials.json:ro

# Rebuild
docker-compose down
docker-compose up --build -d
```

### 5.5 Debugging Pipelines

#### View Pipeline Execution Logs

```bash
# Query pipeline runs
bq query --use_legacy_sql=false \
  "SELECT
     pipeline_logging_id,
     pipeline_id,
     tenant_id,
     status,
     start_time,
     end_time,
     duration_ms,
     parameters
   FROM \`gac-prod-471220.tenants.tenant_pipeline_runs\`
   WHERE tenant_id = 'your_tenant'
   ORDER BY start_time DESC
   LIMIT 10"
```

#### View Step Logs

```bash
# Query step logs for specific pipeline run
bq query --use_legacy_sql=false \
  "SELECT
     step_log_id,
     step_name,
     status,
     start_time,
     end_time,
     duration_ms,
     error_message
   FROM \`gac-prod-471220.tenants.tenant_step_logs\`
   WHERE pipeline_logging_id = 'your_pipeline_logging_id'
   ORDER BY start_time"
```

#### Test Pipeline Locally

```python
# test_pipeline.py
from src.core.pipeline.executor import PipelineExecutor

# Create executor
executor = PipelineExecutor(
    tenant_id='test_tenant',
    pipeline_id='cost_billing',
    trigger_type='test',
    trigger_by='developer'
)

# Execute
result = executor.execute(parameters={'date': '2025-11-19'})

# Check result
print(f"Status: {result['status']}")
print(f"Duration: {result['duration_ms']}ms")
if result['status'] == 'FAILED':
    print(f"Error: {result['error_message']}")
```

### 5.6 Logging

**Application Logs**:
```bash
# Local development
tail -f logs/convergence-api.log

# Docker
docker-compose logs -f convergence-api

# Filter for specific tenant
docker-compose logs convergence-api | grep "tenant_id=test_tenant"

# Filter for errors
docker-compose logs convergence-api | grep "ERROR"
```

**Structured Log Format**:
```json
{
  "timestamp": "2025-11-19T10:30:00Z",
  "level": "INFO",
  "tenant_id": "test_tenant",
  "pipeline_id": "cost_billing",
  "pipeline_logging_id": "uuid",
  "message": "Pipeline execution started",
  "duration_ms": 0
}
```

---

## Appendix A: Quick Reference

### API Endpoints

```
# Health & Metrics
GET  /health
GET  /health/live
GET  /health/ready
GET  /metrics

# Admin (X-Admin-Key required)
POST /api/v1/admin/bootstrap
POST /api/v1/admin/tenants
POST /api/v1/admin/api-keys

# Tenant Management
POST /api/v1/tenants/onboard
GET  /api/v1/tenants/{tenant_id}

# Pipeline Execution
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}
GET  /api/v1/pipelines/runs/{pipeline_logging_id}

# Scheduler (X-Admin-Key required)
POST /api/v1/scheduler/trigger
POST /api/v1/scheduler/process-queue
POST /api/v1/scheduler/reset-daily-quotas
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_PROJECT_ID` | Yes | - | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | - | Path to service account JSON |
| `ADMIN_API_KEY` | Yes | - | Admin API key |
| `BIGQUERY_LOCATION` | No | `US` | BigQuery dataset location |
| `API_PORT` | No | `8000` | API server port |
| `LOG_LEVEL` | No | `INFO` | Logging level |
| `GCP_KMS_KEY_NAME` | No | - | KMS key for encryption |

### Common Commands

```bash
# Start development server
python3 -m uvicorn src.app.main:app --reload

# Run tests
./tests/local_test_suite.sh

# Build Docker
docker-compose build

# View logs
docker-compose logs -f

# Query BigQuery
bq query --use_legacy_sql=false "SELECT ..."

# Generate admin key
python3 scripts/generate_admin_key.py
```

---

## Appendix B: File Structure

```
convergence-data-pipeline/
├── configs/                      # Pipeline configurations
│   ├── gcp/
│   ├── aws/
│   ├── azure/
│   └── setup/
├── ps_templates/                 # Processor templates
│   ├── gcp/
│   ├── aws/
│   └── setup/
├── src/
│   ├── app/                      # FastAPI application
│   ├── core/
│   │   ├── processors/           # Pipeline processors
│   │   ├── pipeline/             # Pipeline executor
│   │   └── bigquery/             # BigQuery client
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   ├── local_test_suite.sh
│   ├── staging_test_suite.sh
│   └── production_test_suite.sh
├── scripts/
│   ├── generate_admin_key.py
│   └── setup_kms_infrastructure.py
├── docs/                         # Additional documentation
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── README.md
├── DEVELOPMENT.md                # This file
└── CLAUDE.md                     # Project mandates
```

---

**Version**: 2.0.0
**Last Updated**: 2025-11-19
**Status**: Production Ready
**Maintained By**: Platform Engineering Team

For deployment instructions, see: `docs/DEPLOYMENT.md`
For API reference, see: `docs/API.md`
For architecture details, see: `docs/architecture/ARCHITECTURE.md`
