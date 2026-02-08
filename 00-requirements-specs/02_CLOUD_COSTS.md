# Cloud Costs

**v2.2** | 2026-02-05

> GCP, AWS, Azure, OCI billing → FOCUS 1.3

---

## Ingestion Workflow

```
1. Customer enables billing export in cloud provider console
2. CloudAct integration stores encrypted credentials (KMS)
3. Pipeline triggered → Decrypt credentials → Auth to customer's BQ/S3/etc.
4. Extract billing data → Write to {org_slug}_prod.cloud_{provider}_billing_raw_daily
5. Stored procedure → sp_cloud_1_convert_to_focus → cost_data_standard_1_3
6. Dashboard reads unified FOCUS 1.3 data via Polars + cache
```

---

## Providers

| Provider | Raw Table | Pipeline Endpoint |
|----------|-----------|-------------------|
| GCP | `cloud_gcp_billing_raw_daily` | `/pipelines/run/{org}/gcp/cost/billing` |
| AWS | `cloud_aws_billing_raw_daily` | `/pipelines/run/{org}/aws/cost/billing` |
| Azure | `cloud_azure_billing_raw_daily` | `/pipelines/run/{org}/azure/cost/billing` |
| OCI | `cloud_oci_billing_raw_daily` | `/pipelines/run/{org}/oci/cost/billing` |

All → `cost_data_standard_1_3` (FOCUS 1.3 unified)

---

## Integration Standards

| Standard | Implementation |
|----------|----------------|
| Credential storage | GCP KMS AES-256 encrypted, 5-min TTL on decrypt |
| Table partitioning | `ingestion_date` (DAY, 730-day retention) |
| Table clustering | `billing_account_id`, `service_id`, `project_id`, `location_region` |
| Lineage tracking | All rows tagged with `x_pipeline_id`, `x_credential_id`, `x_run_id`, `x_ingested_at` |
| FOCUS conversion | `sp_cloud_1_convert_to_focus` stored procedure |

---

## x_* Lineage Fields

All cloud tables include: `x_pipeline_id`, `x_credential_id`, `x_run_id`, `x_ingested_at`, `x_pipeline_run_date`

**Rule:** x_* fields are Pipeline Service (8001) only — never set by API Service (8000).

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/cloud/{provider}/cost/billing.yml` | Pipeline configs |
| `03-data-pipeline-service/configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql` | FOCUS conversion |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_*.json` | Table schemas |
