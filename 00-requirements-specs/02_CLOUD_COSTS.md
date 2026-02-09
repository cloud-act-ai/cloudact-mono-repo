# Cloud Costs

**v2.3** | 2026-02-08

> GCP, AWS, Azure, OCI billing → FOCUS 1.3

---

## Ingestion Workflow

```
1. Customer enables billing export in cloud provider console
2. CloudAct integration stores encrypted credentials (KMS)
3. Pipeline triggered → Decrypt credentials → Auth to customer's BQ/S3/etc.
4. Extract billing data → Write to {org_slug}_prod.cloud_{provider}_billing_raw_daily
5. Stored procedure → sp_cloud_{provider}_convert_to_focus → cost_data_standard_1_3
6. Dashboard reads unified FOCUS 1.3 data via Polars + cache
```

---

## Providers

| Provider | Raw Table | Pipeline Endpoint | FOCUS Procedure |
|----------|-----------|-------------------|-----------------|
| GCP | `cloud_gcp_billing_raw_daily` | `/pipelines/run/{org}/gcp/cost/billing` | `sp_cloud_gcp_convert_to_focus` |
| AWS | `cloud_aws_billing_raw_daily` | `/pipelines/run/{org}/aws/cost/billing` | `sp_cloud_aws_convert_to_focus` |
| Azure | `cloud_azure_billing_raw_daily` | `/pipelines/run/{org}/azure/cost/billing` | `sp_cloud_azure_convert_to_focus` |
| OCI | `cloud_oci_billing_raw_daily` | `/pipelines/run/{org}/oci/cost/billing` | `sp_cloud_oci_convert_to_focus` |

All → `cost_data_standard_1_3` (FOCUS 1.3 unified)

---

## FOCUS Conversion

Each cloud provider has a dedicated stored procedure for FOCUS conversion:

| Procedure | Source | Output |
|-----------|--------|--------|
| `sp_cloud_gcp_convert_to_focus` | `cloud_gcp_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_aws_convert_to_focus` | `cloud_aws_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_azure_convert_to_focus` | `cloud_azure_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_oci_convert_to_focus` | `cloud_oci_billing_raw_daily` | `cost_data_standard_1_3` |

Stored procedures live in the `organizations` dataset and operate on per-org datasets.

---

## Hierarchy Model (5-field)

All cloud cost tables carry the 5-field hierarchy model:

| Field | Description |
|-------|-------------|
| `x_hierarchy_entity_id` | Entity identifier (e.g., `DEPT-001`, `PROJ-042`) |
| `x_hierarchy_entity_name` | Human-readable entity name |
| `x_hierarchy_level_code` | Level in hierarchy (`DEPT`, `PROJ`, `TEAM`) |
| `x_hierarchy_path` | Full path of IDs (`/ORG/DEPT-001/PROJ-042`) |
| `x_hierarchy_path_names` | Full path of names (`/Acme/Engineering/Backend`) |

---

## Integration Standards

| Standard | Implementation |
|----------|----------------|
| Credential storage | GCP KMS AES-256 encrypted, 5-min TTL on decrypt |
| Table partitioning | `ingestion_date` (DAY, 730-day retention) |
| Table clustering | `billing_account_id`, `service_id`, `project_id`, `location_region` |
| Lineage tracking | All rows tagged with `x_pipeline_id`, `x_credential_id`, `x_run_id`, `x_ingested_at` |
| FOCUS conversion | Per-provider stored procedure: `sp_cloud_{provider}_convert_to_focus` |

---

## x_* Lineage Fields

All cloud tables include:

| Field | Type | Purpose |
|-------|------|---------|
| `x_org_slug` | STRING | Multi-tenant row isolation |
| `x_pipeline_id` | STRING | Pipeline template |
| `x_credential_id` | STRING | Credential used |
| `x_pipeline_run_date` | DATE | Data date (idempotency key) |
| `x_run_id` | STRING | Execution UUID |
| `x_ingested_at` | TIMESTAMP | Write timestamp |
| `x_ingestion_date` | DATE | Partition key |
| `x_cloud_provider` | STRING | Provider code (GCP, AWS, AZURE, OCI) |
| `x_cloud_account_id` | STRING | Cloud account/billing ID |

**Composite key:** `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` for idempotent writes.

**Rule:** x_* fields are Pipeline Service (8001) only — never set by API Service (8000).

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/cloud/{provider}/cost/billing.yml` | Pipeline configs (GCP, AWS, Azure, OCI) |
| `03-data-pipeline-service/configs/system/procedures/cloud/sp_cloud_{provider}_convert_to_focus.sql` | Per-provider FOCUS conversion |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_*.json` | Table schemas |
