# Cloud Costs (GCP Billing)

**Status**: IMPLEMENTED (v1.5) | **Updated**: 2025-12-04 | **Single Source of Truth**

> GCP billing data extraction, cost tracking, and cloud spend analytics
> NOT SaaS subscriptions (see 02_SAAS_SUBSCRIPTION_COSTS.md)
> NOT LLM API usage (see 02_LLM_API_USAGE_COSTS.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{env}` | Environment suffix | `prod`, `stage`, `local` |
| `{project_id}` | GCP project ID | `gac-prod-471220` |
| `{billing_account_id}` | GCP billing account | `01ABCD-EFGHIJ-KLMNOP` |
| `{service_account}` | GCP service account email | `sa@project.iam.gserviceaccount.com` |

---

## TERMINOLOGY

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Billing Export** | GCP billing data exported to BigQuery | Daily exports | External BigQuery dataset |
| **Cost Entry** | Single line item from billing export | Compute Engine usage | `gcp_billing_costs` table |
| **Service Account** | GCP credential for API access | KMS-encrypted JSON | `org_credentials` |
| **Integration** | Configured GCP provider connection | Active GCP setup | `org_integrations` |
| **Pipeline** | ETL job to extract billing data | `gcp/cost/billing` | Pipeline engine |

---

## Where Data Lives

| Storage | Table/Location | What |
|---------|----------------|------|
| BigQuery (External) | `{billing_dataset}.gcp_billing_export` | Raw GCP billing export |
| BigQuery (Org) | `{org_slug}_{env}.gcp_billing_costs` | Extracted cost data |
| BigQuery (Org) | `{org_slug}_{env}.gcp_billing_summary` | Aggregated summaries |
| BigQuery (Meta) | `organizations.org_integrations` | Integration status |
| BigQuery (Meta) | `organizations.org_credentials` | Encrypted SA key |
| Supabase | `organizations` | Org metadata |

---

## Lifecycle

| Stage | What Happens | Integration Status |
|-------|--------------|-------------------|
| **Onboarding** | Org created, empty tables | N/A |
| **Setup** | User uploads GCP service account | `pending` |
| **Validation** | Test connection to billing export | `validating` |
| **Active** | Ready to run pipelines | `active` |
| **Error** | Validation or pipeline failed | `error` |
| **Disabled** | User disabled integration | `disabled` |

---

## Architecture Flow

### GCP Integration Setup

```
+-----------------------------------------------------------------------------+
|                        GCP INTEGRATION SETUP                                 |
+-----------------------------------------------------------------------------+
|                                                                             |
|  1. USER UPLOADS SERVICE ACCOUNT                                            |
|     +-- Frontend: Settings > Integrations > Cloud Providers                 |
|     +-- POST /api/v1/integrations/{org}/gcp/setup                          |
|                                                                             |
|  2. CREDENTIAL ENCRYPTION                                                   |
|     +-- Service account JSON encrypted via GCP KMS                         |
|     +-- Stored in org_credentials table                                    |
|     +-- Only encrypted blob stored (never plaintext)                       |
|                                                                             |
|  3. VALIDATION                                                              |
|     +-- POST /api/v1/integrations/{org}/gcp/validate                       |
|     +-- Test: Can access billing export dataset?                           |
|     +-- Test: Can query billing tables?                                    |
|     +-- Updates org_integrations.status                                    |
|                                                                             |
|  4. READY FOR PIPELINES                                                     |
|     +-- Integration status = 'active'                                      |
|     +-- Can run billing extraction pipeline                                |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Billing Pipeline Execution

```
+-----------------------------------------------------------------------------+
|                      BILLING PIPELINE EXECUTION                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  Pipeline: POST /api/v1/pipelines/run/{org}/gcp/cost/billing               |
|                                                                             |
|  1. AUTHENTICATION                                                          |
|     +-- Validate X-API-Key header (org API key)                            |
|     +-- Check org subscription status (ACTIVE/TRIAL only)                  |
|     +-- Check pipeline quota (pipelines_per_day_limit)                     |
|                                                                             |
|  2. CREDENTIAL RETRIEVAL                                                    |
|     +-- Fetch encrypted SA from org_credentials                            |
|     +-- Decrypt via KMS                                                    |
|     +-- Create temporary credentials                                       |
|                                                                             |
|  3. DATA EXTRACTION                                                         |
|     +-- Query external billing export dataset                              |
|     +-- Filter by date range (default: last 30 days)                       |
|     +-- Apply service/project filters if specified                         |
|                                                                             |
|  4. TRANSFORMATION                                                          |
|     +-- Normalize cost fields                                              |
|     +-- Calculate daily/monthly aggregations                               |
|     +-- Add org metadata                                                   |
|                                                                             |
|  5. LOAD                                                                    |
|     +-- INSERT into gcp_billing_costs                                      |
|     +-- UPDATE gcp_billing_summary                                         |
|     +-- Log execution to pipeline_runs                                     |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Data Flow

```
Frontend (3000)              API Service (8000)          Pipeline Engine (8001)
     |                              |                              |
     |                              |                              |         BigQuery
     |                              |                              |            |
     |  1. Setup Integration        |                              |            |
     |  (upload SA JSON)            |                              |            |
     |----------------------------->|                              |            |
     |                              |  Encrypt SA via KMS          |            |
     |                              |----------------------------------------------->|
     |                              |  Store in org_credentials    |            |
     |                              |                              |            |
     |  2. Validate Integration     |                              |            |
     |----------------------------->|                              |            |
     |                              |---------------------------->|            |
     |                              |  Decrypt SA, test connection |            |
     |                              |                              |----------->|
     |                              |                              |  Query test|
     |<-----------------------------|<-----------------------------|            |
     |                              |                              |            |
     |  3. Run Pipeline             |                              |            |
     |--------------------------------------------------------------->|         |
     |                              |  X-API-Key validation        |            |
     |                              |                              |----------->|
     |                              |                              | Extract    |
     |                              |                              | Transform  |
     |                              |                              | Load       |
     |<---------------------------------------------------------------|         |
     |                              |  Pipeline result             |            |

Tables:
- org_credentials (BigQuery): Encrypted service account keys
- org_integrations (BigQuery): Integration status per provider
- gcp_billing_costs (BigQuery): Extracted billing line items
- gcp_billing_summary (BigQuery): Aggregated cost summaries

Authentication:
- X-API-Key: Org API key for pipeline execution
- GCP KMS: Credential encryption/decryption
- Service Account: GCP BigQuery access
```

---

## Schema Definitions

### BigQuery: gcp_billing_costs

**File:** `03-data-pipeline-service/configs/gcp/cost/billing.yml`

| Column | Type | Description |
|--------|------|-------------|
| cost_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| billing_account_id | STRING | GCP billing account |
| project_id | STRING | GCP project |
| project_name | STRING | Project display name |
| service_id | STRING | GCP service ID |
| service_description | STRING | Service name |
| sku_id | STRING | SKU identifier |
| sku_description | STRING | SKU name |
| usage_start_time | TIMESTAMP | Usage period start |
| usage_end_time | TIMESTAMP | Usage period end |
| cost | FLOAT | Cost in USD |
| currency | STRING | Currency code |
| credits | FLOAT | Applied credits |
| usage_amount | FLOAT | Usage quantity |
| usage_unit | STRING | Usage unit |
| labels | JSON | Resource labels |
| extracted_at | TIMESTAMP | Pipeline run time |
| invoice_month | STRING | Billing month |

### BigQuery: gcp_billing_summary

| Column | Type | Description |
|--------|------|-------------|
| summary_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| summary_date | DATE | Summary date |
| project_id | STRING | GCP project |
| service_description | STRING | Service name |
| daily_cost | FLOAT | Daily total cost |
| daily_credits | FLOAT | Daily credits |
| net_cost | FLOAT | Cost after credits |
| month_to_date | FLOAT | MTD cost |
| projected_monthly | FLOAT | Projected month cost |
| updated_at | TIMESTAMP | Last update |

### BigQuery: org_credentials

**File:** `02-api-service/configs/setup/bootstrap/schemas/org_credentials.json`

| Column | Type | Description |
|--------|------|-------------|
| credential_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| provider | STRING | Provider (gcp, openai, etc.) |
| credential_type | STRING | Type (service_account, api_key) |
| encrypted_value | BYTES | KMS-encrypted credential |
| key_version | STRING | KMS key version used |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |
| created_by | STRING | User who created |

### BigQuery: org_integrations

**File:** `02-api-service/configs/setup/bootstrap/schemas/org_integrations.json`

| Column | Type | Description |
|--------|------|-------------|
| integration_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| provider | STRING | Provider name |
| status | STRING | pending, active, error, disabled |
| config | JSON | Provider-specific config |
| validated_at | TIMESTAMP | Last validation |
| error_message | STRING | Last error (if any) |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

---

## Frontend Implementation

### Server Actions

**File:** `01-fronted-system/actions/integrations.ts`

#### setupGCPIntegration()

```typescript
async function setupGCPIntegration(
  orgSlug: string,
  serviceAccountJson: string,
  billingDatasetId: string
): Promise<{
  success: boolean,
  integration?: IntegrationInfo,
  error?: string
}>
```

**Features:**
- Validates service account JSON structure
- Calls pipeline service to encrypt and store
- Initiates validation process
- Returns integration status

#### validateGCPIntegration()

```typescript
async function validateGCPIntegration(
  orgSlug: string
): Promise<{
  success: boolean,
  status?: string,
  error?: string
}>
```

#### getIntegrationStatus()

```typescript
async function getIntegrationStatus(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean,
  integration?: IntegrationInfo,
  error?: string
}>
```

### TypeScript Interfaces

```typescript
export interface IntegrationInfo {
  integration_id: string
  org_slug: string
  provider: string
  status: 'pending' | 'active' | 'error' | 'disabled'
  config: Record<string, unknown>
  validated_at?: string
  error_message?: string
  created_at: string
  updated_at: string
}

export interface GCPConfig {
  billing_dataset_id: string
  project_id: string
  billing_account_id?: string
}

export interface GCPBillingCost {
  cost_id: string
  project_id: string
  project_name: string
  service_description: string
  sku_description: string
  cost: number
  credits: number
  net_cost: number
  usage_start_time: string
  usage_end_time: string
  invoice_month: string
}

export interface BillingSummary {
  total_cost: number
  total_credits: number
  net_cost: number
  project_breakdown: ProjectCost[]
  service_breakdown: ServiceCost[]
  daily_trend: DailyCost[]
}
```

### Pages

| Route | Purpose | Data Source |
|-------|---------|-------------|
| `/{org}/settings/integrations/cloud` | GCP setup page | Pipeline Service |
| `/{org}/analytics` | Cost analytics dashboard | Pipeline Service |
| `/{org}/analytics/gcp` | GCP-specific analytics | Pipeline Service |

---

## Pipeline Engine Endpoints

**File:** `03-data-pipeline-service/src/app/routers/integrations.py`

### Integration Setup

```
POST   /api/v1/integrations/{org}/gcp/setup
       -> Upload and encrypt service account
       -> Body: { service_account_json, billing_dataset_id }
       -> Returns: { success, integration_id }

POST   /api/v1/integrations/{org}/gcp/validate
       -> Test GCP connection and billing access
       -> Returns: { success, status, error? }

GET    /api/v1/integrations/{org}
       -> List all integrations for org
       -> Returns: { integrations: IntegrationInfo[] }

GET    /api/v1/integrations/{org}/gcp
       -> Get GCP integration status
       -> Returns: IntegrationInfo

DELETE /api/v1/integrations/{org}/gcp
       -> Remove GCP integration
       -> Deletes credentials and integration record
```

### Pipeline Execution

**File:** `03-data-pipeline-service/src/app/routers/pipelines.py`

```
POST   /api/v1/pipelines/run/{org}/gcp/cost/billing
       -> Extract GCP billing data
       -> Body: { date?, start_date?, end_date?, project_filter? }
       -> Returns: { run_id, status, records_processed }

GET    /api/v1/pipelines/status/{org}/{run_id}
       -> Get pipeline run status
       -> Returns: { status, progress, records, errors? }
```

**Pipeline Config:** `03-data-pipeline-service/configs/gcp/cost/billing.yml`

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| GCP integration setup | Pipeline | routers/integrations.py |
| Credential encryption | Pipeline | services/kms_service.py |
| Integration validation | Pipeline | routers/integrations.py |
| Billing extraction processor | Pipeline | processors/gcp/external_bq_extractor.py |
| Pipeline config | Pipeline | configs/gcp/cost/billing.yml |
| Cloud integrations page | Frontend | app/[orgSlug]/settings/integrations/cloud/page.tsx |
| Integration actions | Frontend | actions/integrations.ts |
| Analytics dashboard | Frontend | app/[orgSlug]/analytics/page.tsx |

### NOT IMPLEMENTED

| Component | Notes |
|-----------|-------|
| AWS Cost Explorer | Future cloud provider |
| Azure Cost Management | Future cloud provider |
| Multi-project aggregation | Single project support only |
| Cost anomaly detection | Planned for v2.0 |
| Budget alerts | Future enhancement |
| Cost allocation tags | Future enhancement |

---

## Business Logic

### Cost Calculations

**Daily Rate Normalization:**
```python
# Billing data is hourly, normalize to daily
daily_cost = sum(hourly_costs for date)
net_cost = daily_cost - daily_credits
```

**Month-to-Date:**
```python
mtd_cost = sum(net_cost for days in current_month)
```

**Projections:**
```python
days_in_month = calendar.monthrange(year, month)[1]
days_elapsed = current_day
projected_monthly = (mtd_cost / days_elapsed) * days_in_month
```

### Pipeline Quotas

Pipeline execution is rate-limited by subscription plan:

| Plan | Pipelines/Day |
|------|---------------|
| Starter | 6 |
| Professional | 20 |
| Scale | 50+ |

---

## Error Handling

| Scenario | Error Message |
|----------|---------------|
| Invalid SA JSON | "Invalid service account JSON format" |
| SA missing permissions | "Service account lacks BigQuery permissions" |
| Billing dataset not found | "Billing export dataset not accessible" |
| Pipeline quota exceeded | "Daily pipeline limit reached" |
| KMS decryption failed | "Failed to decrypt credentials" |
| Integration not active | "GCP integration not active" |

---

## Test Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/tests/test_02_gcp_integration.py` | GCP integration tests |
| `03-data-pipeline-service/tests/test_03_billing_pipeline.py` | Billing pipeline tests |
| `01-fronted-system/tests/06-cloud-integrations.test.ts` | Frontend integration tests |

---

## File References

### Pipeline Engine Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/src/app/routers/integrations.py` | Integration CRUD endpoints |
| `03-data-pipeline-service/src/app/routers/pipelines.py` | Pipeline execution endpoints |
| `03-data-pipeline-service/src/core/processors/gcp/external_bq_extractor.py` | Billing extraction processor |
| `03-data-pipeline-service/src/services/kms_service.py` | GCP KMS encryption |
| `03-data-pipeline-service/configs/gcp/cost/billing.yml` | Pipeline configuration |

### API Service Files

| File | Purpose |
|------|---------|
| `02-api-service/configs/setup/bootstrap/schemas/org_credentials.json` | Credentials schema |
| `02-api-service/configs/setup/bootstrap/schemas/org_integrations.json` | Integrations schema |

### Frontend Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/integrations.ts` | Integration server actions |
| `01-fronted-system/actions/pipelines.ts` | Pipeline execution actions |
| `01-fronted-system/app/[orgSlug]/settings/integrations/cloud/page.tsx` | Cloud setup page |
| `01-fronted-system/app/[orgSlug]/analytics/page.tsx` | Cost analytics dashboard |

---

**Version**: 1.5 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
