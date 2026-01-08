# Cloud Costs (Multi-Cloud Billing)

**Status**: IMPLEMENTED (v2.1) | **Updated**: 2026-01-01

> GCP, AWS, Azure, OCI billing extraction → FOCUS 1.3. Related: [Integrations](03_INTEGRATIONS.md) | [GenAI Costs](02_GENAI_COSTS.md)

---

## Supported Providers

| Provider | Table | Pipeline |
|----------|-------|----------|
| GCP | `cloud_gcp_billing_raw_daily` | `/api/v1/pipelines/run/{org}/gcp/cost/billing` |
| AWS | `cloud_aws_billing_raw_daily` | `/api/v1/pipelines/run/{org}/aws/cost/billing` |
| Azure | `cloud_azure_billing_raw_daily` | `/api/v1/pipelines/run/{org}/azure/cost/billing` |
| OCI | `cloud_oci_billing_raw_daily` | `/api/v1/pipelines/run/{org}/oci/cost/billing` |

---

## Data Flow

```
Cloud Billing Export → Pipeline Engine → Raw Table → FOCUS 1.3
                           │
                   Decrypt credentials (KMS)
                   Extract from source
                   Add x_* lineage fields
                   Call sp_cloud_1_convert_to_focus
```

---

## Storage

| Table | Purpose |
|-------|---------|
| `cloud_{provider}_billing_raw_daily` | Raw provider billing |
| `cost_data_standard_1_3` | FOCUS 1.3 unified format |
| `org_integration_credentials` | KMS-encrypted credentials |

---

## Key Fields (All Raw Tables)

| Field | Type | Description |
|-------|------|-------------|
| `org_slug` | STRING | Organization |
| `cost` / `unblended_cost` | FLOAT64 | Cost amount |
| `currency` | STRING | Currency code |
| `x_pipeline_id` | STRING | Pipeline template |
| `x_credential_id` | STRING | Credential used |
| `x_run_id` | STRING | Execution UUID |
| `x_ingested_at` | TIMESTAMP | Ingestion time |

---

## Integration Setup

```
POST /api/v1/integrations/{org}/{provider}/setup
├─ Encrypt credentials via KMS
└─ Store in org_integration_credentials

POST /api/v1/integrations/{org}/{provider}/validate
├─ Decrypt credentials
├─ Test billing source access
└─ Update integration status
```

---

## FOCUS 1.3 Conversion

**Stored Procedure:** `sp_cloud_1_convert_to_focus`

| Source Field | FOCUS Field |
|--------------|-------------|
| cost | EffectiveCost |
| usage_start_time | ChargePeriodStart |
| project_id/account_id | SubAccountId |
| service_description | ServiceName |
| region | RegionId |

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/cloud/{provider}/cost/billing.yml` | Pipeline configs |
| `03-data-pipeline-service/configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql` | FOCUS converter |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_*_billing_raw_daily.json` | Schemas |
| `02-api-service/src/core/services/cost_read/service.py` | Cost read service |

---

## Error Handling

| Error | Cause |
|-------|-------|
| "Invalid credential format" | Wrong credential type |
| "Credential lacks permissions" | Missing billing access |
| "Billing export not accessible" | Export not configured |
| "Pipeline quota exceeded" | Daily limit reached |

---

**v2.1** | 2026-01-01
