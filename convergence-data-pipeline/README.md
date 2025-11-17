# Convergence Data Pipeline

> **Multi-tenant SaaS platform for GCP billing and cost data processing**

## What This Platform Does

**Two Core Workflows:**
1. **Customer Onboarding** - Provision isolated infrastructure for new customers
2. **Pipeline Execution** - Run automated data processing pipelines for customers

---

## 1- Customer Onboarding Flow

### What Happens When You Onboard a Customer?

```
Step 1: API Request
  ↓
Step 2: Create BigQuery Dataset
  ↓
Step 3: Create Metadata Tables
  ↓
Step 4: Generate & Encrypt API Key
  ↓
Step 5: Run Validation Pipeline
  ↓
Step 6: Return API Key
```

### 1-1. Trigger Customer Onboarding

**Endpoint:** `POST /api/v1/customers/onboard`

```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acmeinc_23xv2"
  }'
```

**Request Parameters:**
- `tenant_id` (required) - Unique customer identifier (alphanumeric + underscore, 3-50 chars)
- `force_recreate_dataset` (optional) - Delete and recreate dataset (⚠️ DESTRUCTIVE)
- `force_recreate_tables` (optional) - Delete and recreate tables (⚠️ DESTRUCTIVE)

### 1-2. What Gets Created

**1-2-1. BigQuery Dataset**
```
Project: gac-prod-471220
Dataset: acmeinc_23xv2
Location: US
Labels: tenant=acmeinc_23xv2
```

**1-2-2. Metadata Tables** (5 tables created in dataset)
```
acmeinc_23xv2.api_keys             # Encrypted API keys
acmeinc_23xv2.cloud_credentials    # Cloud provider credentials
acmeinc_23xv2.pipeline_runs        # Pipeline execution tracking
acmeinc_23xv2.step_logs            # Step-by-step execution logs
acmeinc_23xv2.dq_results           # Data quality validation results
```

**1-2-3. API Key Generation**
```
Format: {tenant_id}_api_{random_16_chars}
Example: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt

Security:
  ├─ SHA256 hash → Stored for fast lookup
  ├─ KMS encryption → Encrypted storage in BigQuery
  └─ Show once → Returned only during onboarding
```

**1-2-4. Validation Pipeline**
```
Pipeline: configs/gcp/example/dryrun.yml
Purpose: Verify infrastructure setup
Result: SUCCESS or FAILED
```

### 1-3. Onboarding Response

```json
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
  "dataset_created": true,
  "tables_created": [
    "api_keys",
    "cloud_credentials",
    "pipeline_runs",
    "step_logs",
    "dq_results"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Customer acmeinc_23xv2 onboarded successfully. Save your API key - it will only be shown once!"
}
```

**⚠️ CRITICAL:** Save the `api_key` immediately! It's shown only once.

### 1-4. Verify Onboarding

**1-4-1. Check Dataset Created**
```bash
bq ls --project_id=gac-prod-471220 | grep acmeinc_23xv2
```

**1-4-2. Check Tables Created**
```bash
bq ls --project_id=gac-prod-471220 acmeinc_23xv2
```

Expected output:
```
api_keys
cloud_credentials
pipeline_runs
step_logs
dq_results
```

**1-4-3. Query API Key**
```sql
SELECT
  tenant_id,
  created_at,
  is_active
FROM `gac-prod-471220.acmeinc_23xv2.api_keys`
LIMIT 1;
```

### 1-5. Onboarding Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ONBOARDING REQUEST                       │
│  POST /api/v1/customers/onboard                             │
│  {"tenant_id": "acmeinc_23xv2"}                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 1: CREATE DATASET                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ BigQuery Client API Call                             │   │
│  │ dataset_id: acmeinc_23xv2                            │   │
│  │ location: US                                          │   │
│  │ labels: {tenant: acmeinc_23xv2}                      │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/core/engine/bq_client.py                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: CREATE METADATA TABLES                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Load schemas from:                                    │   │
│  │   templates/customer/onboarding/schemas/x_meta_api_keys.json             │   │
│  │   templates/customer/onboarding/schemas/x_meta_cloud_credentials.json    │   │
│  │   templates/customer/onboarding/schemas/x_meta_pipeline_runs.json        │   │
│  │   templates/customer/onboarding/schemas/x_meta_step_logs.json            │   │
│  │   templates/customer/onboarding/schemas/x_meta_dq_results.json           │   │
│  │   templates/customer/onboarding/schemas/x_meta_tenants.json              │   │
│  │                                                       │   │
│  │ Create tables with:                                   │   │
│  │   - Partitioning (time-based)                        │   │
│  │   - Clustering (query optimization)                  │   │
│  │   - JSON types (flexible metadata)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/core/metadata/initializer.py                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: GENERATE API KEY                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Generate: {tenant_id}_api_{random_16_chars}          │   │
│  │ Hash: SHA256(api_key) → api_key_hash                 │   │
│  │ Encrypt: KMS.encrypt(api_key) → encrypted_api_key    │   │
│  │ Store: INSERT INTO acmeinc_23xv2.api_keys            │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/core/security/kms_encryption.py                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: RUN VALIDATION PIPELINE                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Load: configs/gcp/example/dryrun.yml                 │   │
│  │ Execute: Dummy pipeline to test infrastructure       │   │
│  │ Verify: Dataset accessible, tables writeable         │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/app/routers/pipelines.py                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5: RETURN RESPONSE                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ {                                                     │   │
│  │   "tenant_id": "acmeinc_23xv2",                      │   │
│  │   "api_key": "acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",  │   │
│  │   "dataset_created": true,                           │   │
│  │   "tables_created": [...],                           │   │
│  │   "dryrun_status": "SUCCESS"                         │   │
│  │ }                                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/app/routers/customers.py                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2- Pipeline Execution Flow

### What Happens When You Run a Pipeline?

```
Step 1: API Request with Authentication
  ↓
Step 2: Authenticate & Extract Tenant
  ↓
Step 3: Load Pipeline Template
  ↓
Step 4: Resolve Template Variables
  ↓
Step 5: Create Pipeline Run Record
  ↓
Step 6: Execute Pipeline Steps
  ↓
Step 7: Update Pipeline Status
  ↓
Step 8: Return Pipeline Logging ID
```

### 2-1. Trigger Pipeline Execution

**Endpoint:** `POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}`

```bash
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/bill-sample-export-template" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-15",
    "trigger_by": "user@example.com"
  }'
```

**URL Path Parameters:**
- `tenant_id` - Customer identifier (e.g., `acmeinc_23xv2`)
- `provider` - Cloud provider (e.g., `gcp`, `aws`, `openai`)
- `domain` - Service domain (e.g., `cost`, `usage`, `billing`)
- `template_name` - Template filename without `.yml` (e.g., `bill-sample-export-template`)

**Request Headers:**
- `X-API-Key` (required) - Customer's API key from onboarding
- `Content-Type: application/json`

**Request Body:**
- `date` (optional) - Date parameter for pipeline
- `trigger_by` (optional) - Who/what triggered the pipeline
- *Any other parameters* - Passed to template as variables

### 2-2. Authentication Process

**2-2-1. Extract API Key**
```
Header: X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt
```

**2-2-2. Hash API Key**
```
SHA256(api_key) → api_key_hash
```

**2-2-3. Query BigQuery**
```sql
SELECT tenant_id, is_active
FROM `gac-prod-471220.acmeinc_23xv2.api_keys`
WHERE api_key_hash = SHA256('acmeinc_23xv2_api_xK9mPqWz7LnR4vYt')
  AND is_active = TRUE
```

**2-2-4. Validate Tenant**
```
Extracted tenant_id: acmeinc_23xv2
URL tenant_id: acmeinc_23xv2
Match? YES → Allow
Match? NO → HTTP 403 Forbidden
```

**File:** `src/app/dependencies/auth.py`

### 2-3. Template Resolution

**2-3-1. Locate Template File**
```
Path: configs/{provider}/{domain}/{template_name}.yml
Example: configs/gcp/cost/bill-sample-export-template.yml
```

**2-3-2. Load Template YAML**
```yaml
pipeline_id: "{pipeline_id}"
description: "GCP billing export for {tenant_id}"
source:
  project_id: "gac-prod-471220"
  dataset: "{tenant_id}"
  query: "SELECT * FROM billing WHERE date = '{date}'"
destination:
  dataset: "{tenant_id}"
  table: "billing_export_{date}"
```

**2-3-3. Build Variable Context**
```json
{
  "tenant_id": "acmeinc_23xv2",
  "provider": "gcp",
  "domain": "cost",
  "template_name": "bill-sample-export-template",
  "pipeline_id": "acmeinc_23xv2-gcp-cost-bill-sample-export-template",
  "date": "2025-11-15"
}
```

**2-3-4. Replace Variables**
```yaml
pipeline_id: "acmeinc_23xv2-gcp-cost-bill-sample-export-template"
description: "GCP billing export for acmeinc_23xv2"
source:
  project_id: "gac-prod-471220"
  dataset: "acmeinc_23xv2"
  query: "SELECT * FROM billing WHERE date = '2025-11-15'"
destination:
  dataset: "acmeinc_23xv2"
  table: "billing_export_2025-11-15"
```

**File:** `src/core/pipeline/template_resolver.py`

### 2-4. Pipeline Execution

**2-4-1. Create Pipeline Run Record**
```sql
INSERT INTO `gac-prod-471220.acmeinc_23xv2.pipeline_runs` (
  pipeline_logging_id,
  pipeline_id,
  tenant_id,
  status,
  trigger_type,
  trigger_by,
  start_time,
  parameters
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',  -- UUID
  'acmeinc_23xv2-gcp-cost-bill-sample-export-template',
  'acmeinc_23xv2',
  'PENDING',
  'api',
  'user@example.com',
  CURRENT_TIMESTAMP(),
  JSON '{"date": "2025-11-15"}'
);
```

**2-4-2. Execute Pipeline Steps** (Sequential)
```
For each step in pipeline:
  1. Update step_logs: status = RUNNING
  2. Execute step logic (query, transform, DQ check)
  3. Track: rows_processed, duration_ms
  4. Update step_logs: status = COMPLETE/FAILED
  5. If failed and on_failure=stop → Stop pipeline
```

**2-4-3. Update Pipeline Run Status**
```sql
UPDATE `gac-prod-471220.acmeinc_23xv2.pipeline_runs`
SET
  status = 'COMPLETE',
  end_time = CURRENT_TIMESTAMP(),
  duration_ms = TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), start_time, MILLISECOND)
WHERE pipeline_logging_id = '550e8400-e29b-41d4-a716-446655440000';
```

**File:** `src/app/routers/pipelines.py`

### 2-5. Execution Response

```json
{
  "pipeline_logging_id": "550e8400-e29b-41d4-a716-446655440000",
  "pipeline_id": "acmeinc_23xv2-gcp-cost-bill-sample-export-template",
  "status": "PENDING",
  "message": "Templated pipeline triggered successfully",
  "parameters": {
    "date": "2025-11-15",
    "trigger_by": "user@example.com"
  }
}
```

**⚠️ Save `pipeline_logging_id`** to track execution!

### 2-6. Pipeline Status Tracking

**2-6-1. Check Status**

```bash
curl -X GET \
  "http://localhost:8080/api/v1/pipelines/runs/550e8400-e29b-41d4-a716-446655440000" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

**Response:**
```json
{
  "pipeline_logging_id": "550e8400-e29b-41d4-a716-446655440000",
  "pipeline_id": "acmeinc_23xv2-gcp-cost-bill-sample-export-template",
  "tenant_id": "acmeinc_23xv2",
  "status": "COMPLETE",
  "trigger_type": "api",
  "trigger_by": "user@example.com",
  "start_time": "2025-11-15T10:00:00Z",
  "end_time": "2025-11-15T10:05:30Z",
  "duration_ms": 330000,
  "parameters": {
    "date": "2025-11-15"
  },
  "error_message": null
}
```

**2-6-2. Status Values**
- `PENDING` - Queued for execution
- `RUNNING` - Currently executing
- `COMPLETE` - Successfully completed
- `FAILED` - Execution failed (check error_message)

**2-6-3. Query Step Details**
```sql
SELECT
  step_name,
  step_type,
  status,
  start_time,
  end_time,
  duration_ms,
  rows_processed,
  error_message
FROM `gac-prod-471220.acmeinc_23xv2.step_logs`
WHERE pipeline_logging_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY step_index;
```

### 2-7. Pipeline Execution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PIPELINE REQUEST                         │
│  POST /api/v1/pipelines/run/{tenant}/{provider}/{domain}/   │
│                                   {template}                 │
│  Headers: X-API-Key                                          │
│  Body: {"date": "2025-11-15"}                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 1: AUTHENTICATION                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Extract: X-API-Key header                            │   │
│  │ Hash: SHA256(api_key)                                │   │
│  │ Query: {tenant_id}.api_keys table                    │   │
│  │ Verify: tenant_id matches URL path                   │   │
│  │ Result: TenantContext(tenant_id='acmeinc_23xv2')    │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/app/dependencies/auth.py                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: LOAD TEMPLATE                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Path: configs/gcp/cost/bill-sample-export-template   │   │
│  │       .yml                                            │   │
│  │ Read: YAML file content                               │   │
│  │ Parse: YAML → Python dict                            │   │
│  │ Validate: Pydantic model validation                  │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/core/abstractor/config_loader.py                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: RESOLVE VARIABLES                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Variables:                                            │   │
│  │   {tenant_id} → acmeinc_23xv2                        │   │
│  │   {provider} → gcp                                   │   │
│  │   {domain} → cost                                    │   │
│  │   {template_name} → bill-sample-export-template      │   │
│  │   {pipeline_id} → acmeinc_23xv2-gcp-cost-bill-...    │   │
│  │   {date} → 2025-11-15                                │   │
│  │                                                       │   │
│  │ Replace: All occurrences in template recursively     │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/core/pipeline/template_resolver.py               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: CREATE PIPELINE RUN RECORD                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Generate: pipeline_logging_id (UUID)                 │   │
│  │ Status: PENDING                                       │   │
│  │ Table: acmeinc_23xv2.pipeline_runs                   │   │
│  │ Columns:                                              │   │
│  │   - pipeline_logging_id                              │   │
│  │   - pipeline_id                                       │   │
│  │   - tenant_id                                         │   │
│  │   - status (PENDING)                                 │   │
│  │   - trigger_type (api)                               │   │
│  │   - start_time (CURRENT_TIMESTAMP)                   │   │
│  │   - parameters (JSON)                                │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/core/engine/bq_client.py                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5: EXECUTE PIPELINE STEPS                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ For each step in pipeline.steps:                     │   │
│  │                                                       │   │
│  │   Step 5-1: Log step start                           │   │
│  │   INSERT INTO acmeinc_23xv2.step_logs                │   │
│  │   (step_name, status='RUNNING', start_time)          │   │
│  │                                                       │   │
│  │   Step 5-2: Execute step                             │   │
│  │   - BigQuery query                                    │   │
│  │   - Data transformation                              │   │
│  │   - API call                                          │   │
│  │   - Data quality check                               │   │
│  │                                                       │   │
│  │   Step 5-3: Track metrics                            │   │
│  │   - rows_processed                                    │   │
│  │   - bytes_processed                                   │   │
│  │   - duration_ms                                       │   │
│  │                                                       │   │
│  │   Step 5-4: Update step status                       │   │
│  │   UPDATE acmeinc_23xv2.step_logs                     │   │
│  │   SET status='COMPLETE', end_time, metrics           │   │
│  │                                                       │   │
│  │   Step 5-5: Handle failures                          │   │
│  │   IF status='FAILED' AND on_failure='stop':          │   │
│  │     STOP pipeline execution                          │   │
│  └──────────────────────────────────────────────────────┘   │
│  Files: src/core/workers/pipeline_task.py                   │
│         src/core/workers/ingest_task.py                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 6: UPDATE PIPELINE STATUS                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ UPDATE acmeinc_23xv2.pipeline_runs                   │   │
│  │ SET                                                   │   │
│  │   status = 'COMPLETE' (or 'FAILED'),                │   │
│  │   end_time = CURRENT_TIMESTAMP(),                    │   │
│  │   duration_ms = TIMESTAMP_DIFF(...)                  │   │
│  │ WHERE pipeline_logging_id = '550e8400-...'           │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/core/engine/bq_client.py                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 7: RETURN RESPONSE                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ {                                                     │   │
│  │   "pipeline_logging_id": "550e8400-...",             │   │
│  │   "pipeline_id": "acmeinc_23xv2-gcp-cost-...",       │   │
│  │   "status": "PENDING",                               │   │
│  │   "message": "Pipeline triggered successfully"       │   │
│  │ }                                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│  File: src/app/routers/pipelines.py                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete Customer Journey

### Scenario: Onboard and Run Pipeline for ACME Inc

**Step 1: Onboard Customer**
```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "acmeinc_23xv2"}'
```
**Result:** API Key = `acmeinc_23xv2_api_xK9mPqWz7LnR4vYt` (save it!)

**Step 2: Run Pipeline**
```bash
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/bill-sample-export-template" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-15"}'
```
**Result:** Pipeline Logging ID = `550e8400-e29b-41d4-a716-446655440000` (save it!)

**Step 3: Check Status**
```bash
curl -X GET \
  "http://localhost:8080/api/v1/pipelines/runs/550e8400-e29b-41d4-a716-446655440000" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```
**Result:** Status = `COMPLETE`

**Step 4: Query Results**
```sql
SELECT *
FROM `gac-prod-471220.acmeinc_23xv2.billing_export_2025-11-15`
LIMIT 100;
```

---

## Data Architecture

### BigQuery Dataset Structure (Per Customer)

```
gac-prod-471220/
│
├── acmeinc_23xv2/                           (Customer 1)
│   ├── api_keys                             (API keys - KMS encrypted)
│   ├── cloud_credentials                    (Cloud credentials - KMS encrypted)
│   ├── pipeline_runs                        (Pipeline execution metadata)
│   ├── step_logs                            (Step-by-step execution logs)
│   ├── dq_results                           (Data quality results)
│   ├── gcp_billing_export_2025-11-15       (Pipeline output - date partitioned)
│   ├── gcp_billing_export_2025-11-14       (Pipeline output - date partitioned)
│   └── gcp_usage_analytics                  (Pipeline output)
│
├── techcorp_99zx4/                          (Customer 2)
│   ├── api_keys
│   ├── cloud_credentials
│   ├── pipeline_runs
│   ├── step_logs
│   ├── dq_results
│   └── ... (customer 2's data)
│
└── bytefactory_12ghi/                       (Customer 3)
    └── ... (customer 3's data)
```

**Key Principles:**
1. **Complete Isolation** - Each customer has their own dataset
2. **Same Structure** - All customers have identical metadata tables
3. **Scalable** - No cross-tenant queries, independent scaling

---

## Security Model

### 1- API Key Security (Three Layers)

**Layer 1: SHA256 Hash (Lookup)**
```
API Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt
  ↓
SHA256 Hash: a3f2b...9c7d
  ↓
Stored in: api_keys.api_key_hash
Purpose: Fast lookup without decryption
```

**Layer 2: KMS Encryption (Storage)**
```
API Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt
  ↓
KMS Encrypt: Google Cloud KMS
  ↓
Ciphertext: <encrypted_bytes>
  ↓
Stored in: api_keys.encrypted_api_key
Purpose: Encrypted storage in BigQuery
```

**Layer 3: Show Once (Delivery)**
```
API Key returned: ONLY during onboarding
Cannot retrieve: API key after onboarding
Must regenerate: If lost
```

### 2- Tenant Isolation

**Dataset-Level Isolation:**
- Each customer → Separate BigQuery dataset
- No shared tables between customers
- Queries scoped to customer's dataset

**API Validation:**
```
Request: /pipelines/run/techcorp_99zx4/...
API Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt
         ↓
Extract tenant from API key: acmeinc_23xv2
Compare with URL tenant: techcorp_99zx4
Match? NO
         ↓
HTTP 403 Forbidden: "API key does not belong to tenant"
```

---

## Monitoring & Troubleshooting

### Monitor Pipeline Execution

**Query Recent Runs:**
```sql
SELECT
  pipeline_logging_id,
  pipeline_id,
  status,
  start_time,
  end_time,
  TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds,
  error_message
FROM `gac-prod-471220.acmeinc_23xv2.pipeline_runs`
WHERE start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
ORDER BY start_time DESC;
```

**Query Failed Pipelines:**
```sql
SELECT
  pipeline_logging_id,
  pipeline_id,
  error_message,
  parameters
FROM `gac-prod-471220.acmeinc_23xv2.pipeline_runs`
WHERE status = 'FAILED'
  AND start_time >= CURRENT_DATE()
ORDER BY start_time DESC;
```

**Query Step Details:**
```sql
SELECT
  sl.step_name,
  sl.step_type,
  sl.status,
  sl.duration_ms,
  sl.rows_processed,
  sl.error_message
FROM `gac-prod-471220.acmeinc_23xv2.step_logs` sl
JOIN `gac-prod-471220.acmeinc_23xv2.pipeline_runs` pr
  ON sl.pipeline_logging_id = pr.pipeline_logging_id
WHERE pr.pipeline_id = 'acmeinc_23xv2-gcp-cost-bill-sample-export-template'
  AND pr.start_time >= CURRENT_DATE()
ORDER BY sl.step_index;
```

### Common Issues

**Issue 1: Authentication Failed**
```
Error: 401 Unauthorized

Solution:
1. Check API key is correct
2. Query: SELECT * FROM {tenant_id}.api_keys WHERE api_key_hash = SHA256('{key}')
3. Verify is_active = TRUE
4. If not found → Re-onboard customer
```

**Issue 2: Permission Denied**
```
Error: BigQuery permission denied

Solution:
1. Check service account permissions
2. Required roles:
   - roles/bigquery.dataEditor
   - roles/bigquery.jobUser
3. Grant: gcloud projects add-iam-policy-binding ...
```

**Issue 3: Pipeline Stuck in PENDING**
```
Error: Status never changes from PENDING

Solution:
1. Check Cloud Run logs for errors
2. Verify pipeline template exists
3. Check if workers are running
4. Query step_logs for error details
```

---

## Quick Start

### Prerequisites
```bash
# Required
Python 3.11+
GCP project with BigQuery enabled
Service account with BigQuery permissions
```

### Setup (5 minutes)
```bash
# 1. Install
git clone <repo>
cd convergence-data-pipeline
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Configure
export GOOGLE_APPLICATION_CREDENTIALS="~/.gcp/service-account.json"
export GCP_PROJECT_ID="gac-prod-471220"
export BIGQUERY_LOCATION="US"

# 3. Start
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080
```

### Test
```bash
# Health check
curl http://localhost:8080/health

# Onboard customer
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "test_customer"}'
```

---

## 📚 Documentation

**📖 [Complete Documentation Index](docs/INDEX.md)** - Master documentation hub

### Quick Access

**Getting Started:**
- **[Quick Start Guide](docs/guides/QUICK_START.md)** - Get up and running in 15 minutes
- **[Onboarding Guide](docs/guides/ONBOARDING.md)** - Enterprise multi-tenant onboarding
- **[Deployment Guide](docs/guides/DEPLOYMENT_GUIDE.md)** - Production deployment

**Notifications (NEW! 🔔):**
- **[Notification System](docs/notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md)** - Complete notification system
- **[Integration Guide](docs/notifications/INTEGRATION_GUIDE.md)** - Integrate into your pipelines
- **[Configuration](docs/notifications/CONFIGURATION.md)** - Email & Slack setup

**Architecture & Implementation:**
- **[Multi-Tenancy Design](docs/implementation/MULTI_TENANCY_DESIGN.md)** - Multi-tenant architecture
- **[Implementation Summary](docs/implementation/IMPLEMENTATION_SUMMARY.md)** - Step-by-step guide
- **[Technical Implementation](docs/implementation/TECHNICAL_IMPLEMENTATION.md)** - Detailed technical docs

**Reference:**
- **[API Reference](docs/reference/API_REFERENCE.md)** - Complete API documentation
- **[Environment Variables](docs/reference/ENVIRONMENT_VARIABLES.md)** - All environment variables
- **[Pipeline Configuration](docs/reference/pipeline-configuration.md)** - Pipeline YAML structure
- **[Metadata Schema](docs/reference/metadata-schema.md)** - BigQuery metadata tables
- **[Rate Limiting](docs/reference/RATE_LIMITING.md)** - Rate limiting guide

**Security:**
- **[Secrets Management](docs/security/README_SECRETS.md)** - Secure secrets handling
- **[KMS Encryption](docs/security/KMS_ENCRYPTION.md)** - Google Cloud KMS integration

---

## Technology Stack

- **API:** FastAPI (Python 3.11+)
- **Data Warehouse:** Google BigQuery
- **Encryption:** Google Cloud KMS
- **Authentication:** SHA256 + API Keys
- **Configuration:** YAML + Pydantic
- **Deployment:** Cloud Run (Docker)

---

## Version

- **Version:** 1.0.0
- **Last Updated:** 2025-11-15
- **Maintained By:** Data Engineering Team
