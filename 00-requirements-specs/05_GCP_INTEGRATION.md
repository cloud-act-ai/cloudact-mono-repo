# GCP Integration Requirements

## Overview

Google Cloud Platform (GCP) integration for CloudAct enables multi-tenant cost data extraction from customer billing exports, resource inventory tracking, and Vertex AI usage monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GCP Integration Flow                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Frontend (3000)           API Service (8000)          Pipeline (8001)      │
│  ─────────────────         ─────────────────           ──────────────       │
│                                                                             │
│  Upload SA JSON ────────▶ Validate + KMS Encrypt ────▶ Store Credentials   │
│  Configure Tables ──────▶ Update Metadata ───────────▶ Store in BQ         │
│                                                                             │
│  Run Pipeline ──────────▶ Quota Check + Validate ────▶ Execute Pipeline    │
│                                                        ├── Decrypt SA       │
│                                                        ├── Auth to BQ       │
│                                                        ├── Extract Data     │
│                                                        └── Write to CloudAct│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Provider Configuration

| Property | Value |
|----------|-------|
| Provider Key | `GCP_SA` |
| Credential Type | `SERVICE_ACCOUNT_JSON` |
| Required Fields | `type`, `project_id`, `private_key`, `client_email` |
| Expected Type | `service_account` |
| Rate Limit | 100 req/min |
| Max Retries | 3 |
| Retry Backoff | 2 seconds |

## Credential Requirements

### Service Account JSON
```json
{
  "type": "service_account",
  "project_id": "customer-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "cloudact-sa@customer-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### Required IAM Roles
| Role | Purpose |
|------|---------|
| `roles/bigquery.dataViewer` | Read billing export data |
| `roles/bigquery.jobUser` | Execute BigQuery queries |
| `roles/billing.viewer` | Access billing account metadata (optional) |

## Billing Export Tables

GCP provides several billing export table types. Configure these in **Settings → Integrations → GCP → Billing Export Tables**.

### Table Types

| Table | Format | Purpose |
|-------|--------|---------|
| `billing_export_table` | `gcp_billing_export_v1_*` | Standard billing data with cost, usage, credits |
| `detailed_export_table` | `gcp_billing_export_resource_v1_*` | Resource-level data with additional granularity |
| `pricing_export_table` | `cloud_pricing_export` | Pricing catalog for cost optimization |
| `committed_use_discount_table` | CUD export | Commitment utilization analysis |

### Table Path Format
```
project-id.dataset_name.table_name
```

Example: `my-project.billing_dataset.gcp_billing_export_v1_01ECB7_6EE0BA_7357F1`

## Metadata Schema

```python
class GcpBillingAccount:
    """Additional billing account configuration"""
    name: str                          # Account name/label
    billing_export_table: str          # Standard export (REQUIRED)
    detailed_export_table: str         # Resource-level export
    pricing_export_table: str          # Pricing catalog
    committed_use_discount_table: str  # CUD data

class GcpMetadata:
    # Required
    project_id: str           # GCP project ID (6-30 chars)
    client_email: str         # Service account email

    # Primary Billing Export Tables
    billing_export_table: str           # Standard export (REQUIRED for cost data)
    detailed_export_table: str          # Resource-level export
    pricing_export_table: str           # Pricing catalog
    committed_use_discount_table: str   # CUD data

    # Multi-Billing Account Support (Enterprise)
    additional_billing_accounts: List[GcpBillingAccount]  # Up to 10 additional accounts

    # Configuration
    region: str               # Default GCP region
    environment: str          # Environment tag (dev, staging, prod)
    notes: str                # User notes
```

## Pipelines

### Cost Pipelines

| Pipeline | Config | Schedule | Destination |
|----------|--------|----------|-------------|
| GCP Billing | `cloud/gcp/cost/billing.yml` | Daily 04:00 UTC | `cloud_gcp_billing_raw_daily` |
| GCP FOCUS Convert | `cloud/gcp/cost/focus_convert.yml` | Daily 06:30 UTC | `cost_data_standard_1_3` |

### API Pipelines

| Pipeline | Config | Purpose | Destination |
|----------|--------|---------|-------------|
| Billing Accounts | `cloud/gcp/api/billing_accounts.yml` | Billing metadata | `gcp_billing_accounts_raw` |
| Compute Instances | `cloud/gcp/api/compute_instances.yml` | VM inventory | `gcp_compute_instances_raw` |
| Storage Buckets | `cloud/gcp/api/storage_buckets.yml` | Storage inventory | `gcp_storage_buckets_raw` |
| IAM Service Accounts | `cloud/gcp/api/iam_service_accounts.yml` | IAM inventory | `gcp_iam_service_accounts_raw` |

### GenAI Pipelines

| Pipeline | Config | Purpose | Status |
|----------|--------|---------|--------|
| Vertex AI GSU | `genai/commitment/gcp_vertex.yml` | GSU commitment usage | Implemented |
| GCP GPU/TPU | `genai/infrastructure/gcp_gpu.yml` | GPU infrastructure | Implemented |

## Processors

| Processor | ps_type | Purpose |
|-----------|---------|---------|
| ExternalBqExtractor | `cloud.gcp.external_bq_extractor` | Extract from customer BQ |
| GcpApiExtractor | `gcp.api_extractor` | Extract from GCP REST APIs |
| GCPAuthenticator | Internal | Authentication + client factory |
| ValidateGcpIntegration | `integrations.validate_gcp` | Credential validation |
| GCPVertexAdapter | Internal | Vertex AI usage extraction |

## Security

### Credential Storage
- KMS encrypted with GCP Cloud KMS
- Stored in `org_integration_credentials` table
- Decrypted only when needed (5-minute TTL)

### Validation
- Format validation (JSON structure, required fields)
- Service account status check via IAM API
- BigQuery access test
- Billing API access test (optional)

### Audit Logging
- All credential operations logged
- Error messages sanitized
- Metadata keys filtered via allowlist

## Data Flow

### Billing Pipeline Flow
```
1. Pipeline triggered (POST /api/v1/pipelines/run/{org}/gcp/cost/billing)
2. Quota check + validation (API Service)
3. KMS decrypt credentials (Pipeline Service)
4. GCPAuthenticator creates BigQuery client with customer SA
5. Query customer's billing export table
6. Write to CloudAct's BigQuery ({org_slug}_{env}.cloud_gcp_billing_raw_daily)
7. Inject x_* lineage fields
```

### x_* Lineage Fields
| Field | Purpose |
|-------|---------|
| `x_pipeline_id` | Pipeline template name |
| `x_credential_id` | Credential used |
| `x_pipeline_run_date` | Data date |
| `x_run_id` | Execution UUID |
| `x_ingested_at` | Write timestamp |

## Schema

### cloud_gcp_billing_raw_daily
```json
{
  "billing_account_id": "STRING",
  "service_id": "STRING",
  "service_description": "STRING",
  "sku_id": "STRING",
  "sku_description": "STRING",
  "usage_start_time": "TIMESTAMP",
  "usage_end_time": "TIMESTAMP",
  "project_id": "STRING",
  "project_name": "STRING",
  "project_number": "INT64",
  "location_location": "STRING",
  "location_region": "STRING",
  "location_zone": "STRING",
  "resource_name": "STRING",
  "resource_global_name": "STRING",
  "cost": "FLOAT64",
  "currency": "STRING",
  "currency_conversion_rate": "FLOAT64",
  "usage_amount": "FLOAT64",
  "usage_unit": "STRING",
  "usage_amount_in_pricing_units": "FLOAT64",
  "usage_pricing_unit": "STRING",
  "cost_type": "STRING",
  "credits_total": "FLOAT64",
  "cost_at_list": "FLOAT64",
  "invoice_month": "STRING",
  "labels_json": "STRING",
  "system_labels_json": "STRING",
  "ingestion_date": "DATE",
  "org_slug": "STRING",
  "x_pipeline_id": "STRING",
  "x_credential_id": "STRING",
  "x_pipeline_run_date": "DATE",
  "x_run_id": "STRING",
  "x_ingested_at": "TIMESTAMP"
}
```

### Table Configuration
- **Partitioning**: `ingestion_date` (DAY, 730-day retention)
- **Clustering**: `billing_account_id`, `service_id`, `project_id`, `location_region`

## Gaps & Known Issues

### Critical
| ID | Issue | Impact | Status |
|----|-------|--------|--------|
| GCP-001 | ~~Vertex AI adapter returns empty data~~ | ~~No Vertex AI cost tracking~~ | **FIXED** |
| GCP-002 | ~~No billing export table pre-validation~~ | ~~Runtime failures if table doesn't exist~~ | **FIXED** |
| GCP-003 | ~~Single billing account per org~~ | ~~Enterprise orgs need multi-account~~ | **FIXED** |

### Medium
| ID | Issue | Impact | Status |
|----|-------|--------|--------|
| GCP-004 | ~~Token refresh race condition~~ | ~~Potential auth failures under load~~ | **FIXED** |
| GCP-005 | ~~No GCP project quota check~~ | ~~Pipeline may fail on quota exceeded~~ | **FIXED** |
| GCP-006 | ~~Missing Storage billing pipeline~~ | ~~No Cloud Storage cost tracking~~ | **FIXED** |
| GCP-007 | No SA key rotation detection | N/A - Not needed per user | Closed |
| GCP-008 | ~~Pagination limit too high (10000)~~ | ~~Quota waste~~ | **FIXED** (now 1000) |

### Low
| ID | Issue | Impact | Status |
|----|-------|--------|--------|
| GCP-009 | ~~No region enforcement~~ | ~~Region confusion possible~~ | **FIXED** |
| GCP-010 | ~~Query timeout logging incomplete~~ | ~~Debugging difficulty~~ | **FIXED** |

## API Endpoints

### Setup
```bash
POST /api/v1/integrations/{org_slug}/gcp/setup
Content-Type: application/json
X-API-Key: {org_api_key}

{
  "credential": "{service_account_json}",
  "credential_name": "GCP SA (my-project)",
  "metadata": {
    "billing_export_table": "project.dataset.gcp_billing_export_v1_*",
    "detailed_export_table": "project.dataset.gcp_billing_export_resource_v1_*",
    "pricing_export_table": "project.dataset.cloud_pricing_export",
    "committed_use_discount_table": "project.dataset.cud_export"
  }
}
```

### Validate
```bash
POST /api/v1/integrations/{org_slug}/gcp/validate
X-API-Key: {org_api_key}
```

### Update Metadata
```bash
PUT /api/v1/integrations/{org_slug}/gcp/metadata
Content-Type: application/json
X-API-Key: {org_api_key}

{
  "metadata": {
    "billing_export_table": "project.dataset.table",
    "detailed_export_table": "project.dataset.table"
  },
  "skip_validation": true
}
```

### Run Pipeline
```bash
POST /api/v1/pipelines/run/{org_slug}/gcp/cost/billing
X-API-Key: {org_api_key}

{
  "date": "2026-01-18"
}
```

## Testing

### E2E Tests
- `01-fronted-system/tests/e2e/gcp-integration.spec.ts`

### Unit Tests
- `03-data-pipeline-service/tests/processors/gcp/test_authenticator.py`
- `02-api-service/tests/test_03_integrations.py`

### Test Fixtures
```python
def fake_gcp_sa_json():
    return {
        "type": "service_account",
        "project_id": "test-project",
        "private_key": "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
        "client_email": "test@test-project.iam.gserviceaccount.com"
    }
```

## File Locations

### Frontend
| File | Purpose |
|------|---------|
| `app/[orgSlug]/integrations/cloud-providers/gcp/page.tsx` | GCP setup UI |
| `actions/integrations.ts` | Server actions |
| `lib/api/backend.ts` | API client |

### API Service
| File | Purpose |
|------|---------|
| `src/app/routers/integrations.py` | Integration endpoints |
| `src/lib/integrations/metadata_schemas.py` | Metadata validation |
| `src/core/processors/integrations/kms_store.py` | Credential storage |
| `src/core/processors/integrations/kms_decrypt.py` | Credential retrieval |
| `src/core/processors/gcp/authenticator.py` | Authentication |

### Pipeline Service
| File | Purpose |
|------|---------|
| `configs/cloud/gcp/cost/billing.yml` | Billing pipeline |
| `configs/cloud/gcp/cost/schemas/billing_cost.json` | Schema template |
| `src/core/processors/cloud/gcp/external_bq_extractor.py` | BQ extractor |
| `src/core/processors/cloud/gcp/gcp_api_extractor.py` | API extractor |
| `src/core/processors/cloud/gcp/authenticator.py` | Authentication |

---
**Version**: 1.0.0
**Last Updated**: 2026-01-19
