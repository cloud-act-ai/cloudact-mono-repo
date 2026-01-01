# Cloud Costs (Multi-Cloud Billing)

**Status**: IMPLEMENTED (v2.0) | **Updated**: 2026-01-01 | **Single Source of Truth**

> Multi-cloud billing data extraction (GCP, AWS, Azure, OCI), cost tracking, and cloud spend analytics
> NOT SaaS subscriptions (see 02_SAAS_SUBSCRIPTION_COSTS.md)
> NOT LLM API usage (see 02_LLM_API_USAGE_COSTS.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{env}` | Environment suffix | `prod`, `stage`, `local` |
| `{provider}` | Cloud provider | `gcp`, `aws`, `azure`, `oci` |
| `{project_id}` | GCP project ID | `your-gcp-project-id` |
| `{billing_account_id}` | Cloud billing account | `01ABCD-EFGHIJ-KLMNOP` |

---

## TERMINOLOGY

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Billing Export** | Cloud billing data exported to storage | Daily exports | External BigQuery/S3 |
| **Cost Entry** | Single line item from billing export | Compute usage | `cloud_{provider}_billing_raw_daily` |
| **FOCUS 1.3** | FinOps Open Cost & Usage Specification | Unified format | `cost_data_standard_1_3` |
| **Integration** | Configured cloud provider connection | Active GCP setup | `org_integration_credentials` |
| **Pipeline** | ETL job to extract billing data | `gcp/cost/billing` | Pipeline engine |

---

## Supported Cloud Providers

| Provider | Table Name | Partition Field | Status |
|----------|------------|-----------------|--------|
| **GCP** | `cloud_gcp_billing_raw_daily` | `usage_start_time` | Implemented |
| **AWS** | `cloud_aws_billing_raw_daily` | `usage_date` | Implemented |
| **Azure** | `cloud_azure_billing_raw_daily` | `usage_date` | Implemented |
| **OCI** | `cloud_oci_billing_raw_daily` | `usage_date` | Implemented |

---

## Where Data Lives

| Storage | Table/Location | What |
|---------|----------------|------|
| BigQuery (Org) | `{org_slug}_{env}.cloud_gcp_billing_raw_daily` | Raw GCP billing data |
| BigQuery (Org) | `{org_slug}_{env}.cloud_aws_billing_raw_daily` | Raw AWS CUR data |
| BigQuery (Org) | `{org_slug}_{env}.cloud_azure_billing_raw_daily` | Raw Azure billing data |
| BigQuery (Org) | `{org_slug}_{env}.cloud_oci_billing_raw_daily` | Raw OCI billing data |
| BigQuery (Org) | `{org_slug}_{env}.cost_data_standard_1_3` | FOCUS 1.3 unified costs |
| BigQuery (Meta) | `organizations.org_integration_credentials` | Encrypted credentials |
| BigQuery (Meta) | `organizations.org_profiles` | Org metadata |

---

## Table Naming Convention

All cloud billing tables follow the pattern: **`cloud_{provider}_billing_raw_daily`**

```
cloud_gcp_billing_raw_daily     # Google Cloud Platform
cloud_aws_billing_raw_daily     # Amazon Web Services
cloud_azure_billing_raw_daily   # Microsoft Azure
cloud_oci_billing_raw_daily     # Oracle Cloud Infrastructure
```

This naming convention:
- Starts with `cloud_` prefix for domain identification
- Includes provider name for clarity
- Ends with `_raw_daily` to indicate raw data at daily granularity
- Matches other domain patterns: `genai_*`, `saas_*`

---

## Lifecycle

| Stage | What Happens | Integration Status |
|-------|--------------|-------------------|
| **Onboarding** | Org created, empty tables | N/A |
| **Setup** | User uploads cloud credentials | `pending` |
| **Validation** | Test connection to billing source | `validating` |
| **Active** | Ready to run pipelines | `active` |
| **Error** | Validation or pipeline failed | `error` |
| **Disabled** | User disabled integration | `disabled` |

---

## Architecture Flow

### Cloud Integration Setup

```
+-----------------------------------------------------------------------------+
|                      CLOUD INTEGRATION SETUP                                 |
+-----------------------------------------------------------------------------+
|                                                                             |
|  1. USER UPLOADS CREDENTIALS                                                |
|     +-- Frontend: Settings > Integrations > Cloud Providers                 |
|     +-- POST /api/v1/integrations/{org}/{provider}/setup                   |
|     +-- Providers: gcp, aws, azure, oci                                    |
|                                                                             |
|  2. CREDENTIAL ENCRYPTION                                                   |
|     +-- Credentials encrypted via GCP KMS                                  |
|     +-- Stored in org_integration_credentials table                        |
|     +-- Only encrypted blob stored (never plaintext)                       |
|                                                                             |
|  3. VALIDATION                                                              |
|     +-- POST /api/v1/integrations/{org}/{provider}/validate                |
|     +-- Test: Can access billing export/CUR?                               |
|     +-- Test: Can query billing tables?                                    |
|     +-- Updates integration status                                         |
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
|  Pipeline: POST /api/v1/pipelines/run/{org}/{provider}/cost/billing        |
|                                                                             |
|  1. AUTHENTICATION                                                          |
|     +-- Validate X-API-Key header (org API key)                            |
|     +-- Check org subscription status (ACTIVE/TRIAL only)                  |
|     +-- Check pipeline quota (pipelines_per_day_limit)                     |
|                                                                             |
|  2. CREDENTIAL RETRIEVAL                                                    |
|     +-- Fetch encrypted credentials from org_integration_credentials       |
|     +-- Decrypt via KMS                                                    |
|     +-- Create temporary credentials                                       |
|                                                                             |
|  3. DATA EXTRACTION                                                         |
|     +-- GCP: Query BigQuery billing export                                 |
|     +-- AWS: Read S3 CUR files                                             |
|     +-- Azure: Query Cost Management API                                   |
|     +-- OCI: Query Cost Analysis API                                       |
|                                                                             |
|  4. TRANSFORMATION                                                          |
|     +-- Normalize cost fields                                              |
|     +-- Add x_* pipeline lineage fields                                    |
|     +-- Add org metadata (org_slug, provider)                              |
|                                                                             |
|  5. LOAD                                                                    |
|     +-- INSERT into cloud_{provider}_billing_raw_daily                     |
|     +-- CALL sp_convert_cloud_costs_to_focus_1_3 (stored procedure)        |
|     +-- Log execution to org_meta_pipeline_runs                            |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### FOCUS 1.3 Conversion

```
+-----------------------------------------------------------------------------+
|                      FOCUS 1.3 CONVERSION                                    |
+-----------------------------------------------------------------------------+
|                                                                             |
|  Stored Procedure: sp_convert_cloud_costs_to_focus_1_3                     |
|                                                                             |
|  INPUT:                                                                     |
|     +-- p_project_id: GCP Project ID                                       |
|     +-- p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')            |
|     +-- p_cost_date: Date to convert costs for                             |
|     +-- p_provider: 'gcp', 'aws', 'azure', 'oci', or 'all'                |
|                                                                             |
|  PROCESS:                                                                   |
|     +-- Read from cloud_{provider}_billing_raw_daily                       |
|     +-- Map provider-specific fields to FOCUS 1.3 columns                  |
|     +-- Set x_source_system = 'cloud_{provider}_billing_raw_daily'          |
|     +-- Add pipeline lineage (x_pipeline_id, x_run_id, etc.)              |
|                                                                             |
|  OUTPUT:                                                                    |
|     +-- INSERT into cost_data_standard_1_3                                 |
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
     |  (upload credentials)        |                              |            |
     |----------------------------->|                              |            |
     |                              |  Encrypt via KMS             |            |
     |                              |----------------------------------------------->|
     |                              |  Store in org_integration_credentials    |
     |                              |                              |            |
     |  2. Validate Integration     |                              |            |
     |----------------------------->|                              |            |
     |                              |---------------------------->|            |
     |                              |  Decrypt, test connection   |            |
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
     |                              |                              |----------->|
     |                              |                              | CALL sp_convert_cloud_costs_to_focus_1_3
     |<---------------------------------------------------------------|         |
     |                              |  Pipeline result             |            |

Tables:
- org_integration_credentials (BigQuery): Encrypted cloud credentials
- cloud_gcp_billing_raw_daily (BigQuery): GCP billing line items
- cloud_aws_billing_raw_daily (BigQuery): AWS CUR line items
- cloud_azure_billing_raw_daily (BigQuery): Azure billing line items
- cloud_oci_billing_raw_daily (BigQuery): OCI billing line items
- cost_data_standard_1_3 (BigQuery): FOCUS 1.3 unified costs

Authentication:
- X-API-Key: Org API key for pipeline execution
- GCP KMS: Credential encryption/decryption
- Provider credentials: Cloud billing access
```

---

## Schema Definitions

### BigQuery: cloud_gcp_billing_raw_daily

**Schema File:** `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_gcp_billing_raw_daily.json`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| billing_account_id | STRING | REQUIRED | GCP billing account identifier |
| service_id | STRING | NULLABLE | GCP service identifier |
| service_description | STRING | NULLABLE | Human-readable service name |
| sku_id | STRING | NULLABLE | SKU identifier |
| sku_description | STRING | NULLABLE | SKU description |
| usage_start_time | TIMESTAMP | REQUIRED | Usage period start |
| usage_end_time | TIMESTAMP | REQUIRED | Usage period end |
| project_id | STRING | NULLABLE | GCP project ID |
| project_name | STRING | NULLABLE | Project display name |
| location_location | STRING | NULLABLE | Resource location |
| location_region | STRING | NULLABLE | Geographic region |
| cost | FLOAT64 | REQUIRED | Total cost in billing currency |
| currency | STRING | NULLABLE | Billing currency code |
| usage_amount | FLOAT64 | NULLABLE | Usage quantity |
| usage_unit | STRING | NULLABLE | Unit of measurement |
| credits_total | FLOAT64 | NULLABLE | Total credits applied |
| org_slug | STRING | REQUIRED | Organization identifier |
| x_pipeline_id | STRING | REQUIRED | Pipeline template name |
| x_credential_id | STRING | REQUIRED | Credential ID used |
| x_pipeline_run_date | DATE | REQUIRED | Date being processed |
| x_run_id | STRING | REQUIRED | Pipeline run UUID |
| x_ingested_at | TIMESTAMP | REQUIRED | Ingestion timestamp |

### BigQuery: cloud_aws_billing_raw_daily

**Schema File:** `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_aws_billing_raw_daily.json`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| usage_date | DATE | REQUIRED | Date of usage (partition key) |
| org_slug | STRING | REQUIRED | Organization identifier |
| linked_account_id | STRING | REQUIRED | AWS Account ID |
| linked_account_name | STRING | NULLABLE | AWS Account name |
| service_code | STRING | NULLABLE | AWS service code |
| product_name | STRING | NULLABLE | Human-readable product name |
| usage_type | STRING | NULLABLE | Usage type |
| region | STRING | NULLABLE | AWS region |
| resource_id | STRING | NULLABLE | AWS resource ARN/ID |
| unblended_cost | FLOAT64 | REQUIRED | Unblended cost |
| blended_cost | FLOAT64 | NULLABLE | Blended cost |
| amortized_cost | FLOAT64 | NULLABLE | Amortized cost |
| reservation_arn | STRING | NULLABLE | Reserved Instance ARN |
| savings_plan_arn | STRING | NULLABLE | Savings Plan ARN |
| x_pipeline_id | STRING | REQUIRED | Pipeline template name |
| x_credential_id | STRING | REQUIRED | Credential ID used |
| x_pipeline_run_date | DATE | REQUIRED | Date being processed |
| x_run_id | STRING | REQUIRED | Pipeline run UUID |
| x_ingested_at | TIMESTAMP | REQUIRED | Ingestion timestamp |

### BigQuery: cloud_azure_billing_raw_daily

**Schema File:** `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_azure_billing_raw_daily.json`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| usage_date | DATE | REQUIRED | Date of usage (partition key) |
| org_slug | STRING | REQUIRED | Organization identifier |
| subscription_id | STRING | REQUIRED | Azure subscription ID |
| subscription_name | STRING | NULLABLE | Subscription display name |
| resource_group | STRING | NULLABLE | Resource group name |
| service_name | STRING | NULLABLE | Azure service name |
| meter_category | STRING | NULLABLE | Meter category |
| resource_location | STRING | NULLABLE | Azure region |
| cost_in_billing_currency | FLOAT64 | REQUIRED | Cost in billing currency |
| billing_currency | STRING | NULLABLE | Currency code |
| pricing_model | STRING | NULLABLE | OnDemand, Reservation, etc. |
| reservation_id | STRING | NULLABLE | Reserved Instance ID |
| x_pipeline_id | STRING | REQUIRED | Pipeline template name |
| x_credential_id | STRING | REQUIRED | Credential ID used |
| x_pipeline_run_date | DATE | REQUIRED | Date being processed |
| x_run_id | STRING | REQUIRED | Pipeline run UUID |
| x_ingested_at | TIMESTAMP | REQUIRED | Ingestion timestamp |

### BigQuery: cloud_oci_billing_raw_daily

**Schema File:** `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_oci_billing_raw_daily.json`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| usage_date | DATE | REQUIRED | Date of usage (partition key) |
| org_slug | STRING | REQUIRED | Organization identifier |
| tenancy_id | STRING | REQUIRED | OCI tenancy OCID |
| compartment_id | STRING | NULLABLE | Compartment OCID |
| service_name | STRING | NULLABLE | OCI service name |
| region | STRING | NULLABLE | OCI region |
| cost | FLOAT64 | REQUIRED | Cost amount |
| currency | STRING | NULLABLE | Currency code |
| usage_quantity | FLOAT64 | NULLABLE | Usage quantity |
| x_pipeline_id | STRING | REQUIRED | Pipeline template name |
| x_credential_id | STRING | REQUIRED | Credential ID used |
| x_pipeline_run_date | DATE | REQUIRED | Date being processed |
| x_run_id | STRING | REQUIRED | Pipeline run UUID |
| x_ingested_at | TIMESTAMP | REQUIRED | Ingestion timestamp |

### BigQuery: cost_data_standard_1_3 (FOCUS 1.3)

**Schema File:** `02-api-service/configs/setup/organizations/onboarding/schemas/cost_data_standard_1_3.json`

Unified cost format following FinOps FOCUS 1.3 specification:

| Column | Type | Description |
|--------|------|-------------|
| ChargePeriodStart | TIMESTAMP | Charge period start |
| ChargePeriodEnd | TIMESTAMP | Charge period end |
| BillingPeriodStart | TIMESTAMP | Billing period start |
| BillingPeriodEnd | TIMESTAMP | Billing period end |
| InvoiceIssuerName | STRING | Invoice issuer (e.g., 'Google Cloud Platform') |
| ServiceProviderName | STRING | Service provider name |
| ServiceCategory | STRING | Compute, Storage, Database, etc. |
| ServiceName | STRING | Service name |
| ResourceId | STRING | Resource identifier |
| ResourceName | STRING | Resource display name |
| RegionId | STRING | Region identifier |
| EffectiveCost | NUMERIC | Effective cost |
| BilledCost | NUMERIC | Billed cost |
| ListCost | NUMERIC | List price cost |
| BillingCurrency | STRING | Currency code |
| SubAccountId | STRING | Sub-account/project ID |
| SubAccountName | STRING | Sub-account/project name |
| x_source_system | STRING | Source: 'cloud_gcp_billing_raw_daily', etc. |
| x_cloud_provider | STRING | Provider: 'gcp', 'aws', 'azure', 'oci' |
| x_pipeline_id | STRING | Pipeline template name |
| x_run_id | STRING | Pipeline run UUID |

---

## Pipeline Configuration

### GCP Billing Pipeline

**Config:** `03-data-pipeline-service/configs/cloud/gcp/cost/billing.yml`

```yaml
pipeline_id: "{org_slug}-gcp-billing"
name: "GCP Billing Sync"
schedule: "0 4 * * *"  # Daily at 04:00 UTC

steps:
  - step_id: "extract_billing"
    ps_type: "gcp.external_bq_extractor"
    destination:
      table: "cloud_gcp_billing_raw_daily"
      partition_field: "usage_start_time"
      clustering_fields: [billing_account_id, service_id, project_id]
```

### AWS Billing Pipeline

**Config:** `03-data-pipeline-service/configs/cloud/aws/cost/billing.yml`

```yaml
pipeline_id: "{org_slug}-aws-billing"
name: "AWS Billing Sync"
schedule: "0 5 * * *"  # Daily at 05:00 UTC

steps:
  - step_id: "extract_cur"
    ps_type: "cloud.aws.cur_extractor"
    destination:
      table: "cloud_aws_billing_raw_daily"
      partition_field: "usage_date"
      clustering_fields: [linked_account_id, service_code]
```

### Azure Billing Pipeline

**Config:** `03-data-pipeline-service/configs/cloud/azure/cost/billing.yml`

```yaml
pipeline_id: "{org_slug}-azure-billing"
name: "Azure Billing Sync"

steps:
  - step_id: "extract_costs"
    ps_type: "cloud.azure.cost_extractor"
    destination:
      table: "cloud_azure_billing_raw_daily"
      partition_field: "usage_date"
      clustering_fields: [subscription_id, service_name]
```

### OCI Billing Pipeline

**Config:** `03-data-pipeline-service/configs/cloud/oci/cost/billing.yml`

```yaml
pipeline_id: "{org_slug}-oci-billing"
name: "OCI Billing Sync"

steps:
  - step_id: "extract_costs"
    ps_type: "cloud.oci.cost_extractor"
    destination:
      table: "cloud_oci_billing_raw_daily"
      partition_field: "usage_date"
      clustering_fields: [tenancy_id, service_name]
```

---

## Stored Procedure: sp_convert_cloud_costs_to_focus_1_3

**Location:** `03-data-pipeline-service/configs/system/procedures/cloud/sp_convert_cloud_costs_to_focus_1_3.sql`

Converts raw cloud billing data to FOCUS 1.3 format.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| p_project_id | STRING | GCP Project ID |
| p_dataset_id | STRING | Customer dataset (e.g., 'acme_corp_prod') |
| p_cost_date | DATE | Date to convert costs for |
| p_provider | STRING | 'gcp', 'aws', 'azure', 'oci', or 'all' |
| p_pipeline_id | STRING | Pipeline ID for lineage |
| p_credential_id | STRING | Credential ID for lineage |
| p_run_id | STRING | Run UUID for lineage |

### Source Tables Mapping

| Provider | Source Table | x_source_system Value |
|----------|--------------|---------------------|
| GCP | `cloud_gcp_billing_raw_daily` | `cloud_gcp_billing_raw_daily` |
| AWS | `cloud_aws_billing_raw_daily` | `cloud_aws_billing_raw_daily` |
| Azure | `cloud_azure_billing_raw_daily` | `cloud_azure_billing_raw_daily` |
| OCI | `cloud_oci_billing_raw_daily` | `cloud_oci_billing_raw_daily` |

---

## API Endpoints

### Integration Setup

```
POST   /api/v1/integrations/{org}/{provider}/setup
       -> Upload and encrypt cloud credentials
       -> Providers: gcp, aws, azure, oci
       -> Body: { credentials, config }
       -> Returns: { success, credential_id }

POST   /api/v1/integrations/{org}/{provider}/validate
       -> Test cloud connection and billing access
       -> Returns: { success, status, error? }

GET    /api/v1/integrations/{org}
       -> List all integrations for org
       -> Returns: { integrations: [] }

DELETE /api/v1/integrations/{org}/{provider}
       -> Remove cloud integration
       -> Deletes credentials and integration record
```

### Pipeline Execution

```
POST   /api/v1/pipelines/run/{org}/gcp/cost/billing
POST   /api/v1/pipelines/run/{org}/aws/cost/billing
POST   /api/v1/pipelines/run/{org}/azure/cost/billing
POST   /api/v1/pipelines/run/{org}/oci/cost/billing
       -> Extract cloud billing data
       -> Body: { date?, start_date?, end_date? }
       -> Returns: { run_id, status, records_processed }

GET    /api/v1/pipelines/status/{org}/{run_id}
       -> Get pipeline run status
       -> Returns: { status, progress, records, errors? }
```

### Cost Analytics (API Service)

```
GET    /api/v1/costs/{org}/cloud
       -> Get cloud costs summary
       -> Query params: period, provider, start_date, end_date

GET    /api/v1/costs/{org}/summary
       -> Get unified cost summary (all sources)
       -> Query params: period, comparison_type
```

---

## Implementation Status

### Completed

| Component | Service | Status |
|-----------|---------|--------|
| GCP integration setup | API/Pipeline | ✅ |
| AWS integration setup | API/Pipeline | ✅ |
| Azure integration setup | API/Pipeline | ✅ |
| OCI integration setup | API/Pipeline | ✅ |
| Credential encryption (KMS) | Pipeline | ✅ |
| GCP billing extraction | Pipeline | ✅ |
| AWS CUR extraction | Pipeline | ✅ |
| Azure Cost Management extraction | Pipeline | ✅ |
| OCI Cost Analysis extraction | Pipeline | ✅ |
| FOCUS 1.3 conversion (stored procedure) | Pipeline | ✅ |
| Cloud cost read service (Polars) | API | ✅ |
| Cloud integrations page | Frontend | ✅ |
| Cost analytics dashboard | Frontend | ✅ |

---

## Business Logic

### Cost Calculations

**Daily Rate Normalization:**
```python
# Billing data normalized to daily
daily_cost = sum(costs for date)
net_cost = daily_cost - credits
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
| Invalid credentials | "Invalid credential format" |
| Missing permissions | "Credential lacks required permissions" |
| Billing source not found | "Billing export/CUR not accessible" |
| Pipeline quota exceeded | "Daily pipeline limit reached" |
| KMS decryption failed | "Failed to decrypt credentials" |
| Integration not active | "Cloud integration not active" |

---

## File References

### Pipeline Engine Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/cloud/gcp/cost/billing.yml` | GCP pipeline config |
| `03-data-pipeline-service/configs/cloud/aws/cost/billing.yml` | AWS pipeline config |
| `03-data-pipeline-service/configs/cloud/azure/cost/billing.yml` | Azure pipeline config |
| `03-data-pipeline-service/configs/cloud/oci/cost/billing.yml` | OCI pipeline config |
| `03-data-pipeline-service/configs/system/procedures/cloud/sp_convert_cloud_costs_to_focus_1_3.sql` | FOCUS conversion |

### API Service Files

| File | Purpose |
|------|---------|
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_gcp_billing_raw_daily.json` | GCP schema |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_aws_billing_raw_daily.json` | AWS schema |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_azure_billing_raw_daily.json` | Azure schema |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_oci_billing_raw_daily.json` | OCI schema |
| `02-api-service/src/core/services/cost_read/service.py` | Cost read service |

### Frontend Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/integrations.ts` | Integration server actions |
| `01-fronted-system/actions/pipelines.ts` | Pipeline execution actions |
| `01-fronted-system/app/[orgSlug]/settings/integrations/cloud/page.tsx` | Cloud setup page |
| `01-fronted-system/app/[orgSlug]/analytics/page.tsx` | Cost analytics dashboard |

---

**Version**: 2.0 | **Updated**: 2026-01-01 | **Policy**: Single source of truth - no duplicate docs
