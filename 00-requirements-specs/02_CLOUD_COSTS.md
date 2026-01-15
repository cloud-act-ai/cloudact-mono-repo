# Cloud Costs

**v2.1** | 2026-01-15

> GCP, AWS, Azure, OCI billing → FOCUS 1.3

---

## Providers

| Provider | Table | Pipeline |
|----------|-------|----------|
| GCP | `cloud_gcp_billing_raw_daily` | `/pipelines/run/{org}/gcp/cost/billing` |
| AWS | `cloud_aws_billing_raw_daily` | `/pipelines/run/{org}/aws/cost/billing` |
| Azure | `cloud_azure_billing_raw_daily` | `/pipelines/run/{org}/azure/cost/billing` |
| OCI | `cloud_oci_billing_raw_daily` | `/pipelines/run/{org}/oci/cost/billing` |

All → `cost_data_standard_1_3` (FOCUS 1.3)

---

## Data Flow

```
Cloud Billing Export → Pipeline (decrypt KMS) → Raw Table → sp_cloud_1_convert_to_focus → FOCUS
```

---

## x_* Lineage Fields

All cloud tables include: `x_pipeline_id`, `x_credential_id`, `x_run_id`, `x_ingested_at`

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/cloud/{provider}/cost/billing.yml` | Configs |
| `03-data-pipeline-service/configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql` | FOCUS |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_*.json` | Schemas |
