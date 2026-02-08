# GCP Integration

**v1.1** | 2026-02-05

> GCP billing exports, resource inventory, and Vertex AI monitoring

---

## Integration Workflow

```
1. Upload SA JSON → Frontend integration page
2. Validate → Format check + IAM role verification + BQ access test
3. KMS encrypt → Store in org_integration_credentials
4. Configure billing tables → Standard, Detailed, Pricing, CUD export tables
5. Run pipeline → Decrypt SA → Auth to customer BQ → Extract billing data
6. Write to CloudAct → {org_slug}_prod.cloud_gcp_billing_raw_daily
7. FOCUS convert → sp_cloud_1_convert_to_focus → cost_data_standard_1_3
```

---

## Provider Configuration

| Property | Value |
|----------|-------|
| Provider Key | `GCP_SA` |
| Credential Type | `SERVICE_ACCOUNT_JSON` |
| Required Fields | `type`, `project_id`, `private_key`, `client_email` |
| Rate Limit | 100 req/min |
| Max Retries | 3 (2s backoff) |

---

## Required IAM Roles

| Role | Purpose |
|------|---------|
| `roles/bigquery.dataViewer` | Read billing export data |
| `roles/bigquery.jobUser` | Execute BigQuery queries |
| `roles/billing.viewer` | Billing account metadata (optional) |

---

## Billing Export Tables

Configure in **Settings → Integrations → GCP → Billing Export Tables**.

| Table | Format | Purpose |
|-------|--------|---------|
| `billing_export_table` | `gcp_billing_export_v1_*` | Standard billing (REQUIRED) |
| `detailed_export_table` | `gcp_billing_export_resource_v1_*` | Resource-level granularity |
| `pricing_export_table` | `cloud_pricing_export` | Pricing catalog |
| `committed_use_discount_table` | CUD export | Commitment utilization |

**Table path format:** `project-id.dataset_name.table_name`

**Multi-billing:** Up to 10 additional billing accounts supported (Enterprise).

---

## Metadata Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `project_id` | Yes | GCP project ID (6-30 chars) |
| `client_email` | Yes | Service account email |
| `billing_export_table` | Yes | Standard billing export path |
| `detailed_export_table` | No | Resource-level export path |
| `pricing_export_table` | No | Pricing catalog path |
| `committed_use_discount_table` | No | CUD data path |
| `additional_billing_accounts` | No | Up to 10 extra accounts |
| `region` | No | Default GCP region |

---

## Pipelines

### Cost Pipelines

| Pipeline | Config | Destination |
|----------|--------|-------------|
| GCP Billing | `cloud/gcp/cost/billing.yml` | `cloud_gcp_billing_raw_daily` |
| GCP FOCUS Convert | `cloud/gcp/cost/focus_convert.yml` | `cost_data_standard_1_3` |

### API Pipelines (Resource Inventory)

| Pipeline | Config | Destination |
|----------|--------|-------------|
| Billing Accounts | `cloud/gcp/api/billing_accounts.yml` | `gcp_billing_accounts_raw` |
| Compute Instances | `cloud/gcp/api/compute_instances.yml` | `gcp_compute_instances_raw` |
| Storage Buckets | `cloud/gcp/api/storage_buckets.yml` | `gcp_storage_buckets_raw` |
| IAM Service Accounts | `cloud/gcp/api/iam_service_accounts.yml` | `gcp_iam_service_accounts_raw` |

### GenAI Pipelines

| Pipeline | Config | Destination |
|----------|--------|-------------|
| Vertex AI GSU | `genai/commitment/gcp_vertex.yml` | Commitment data |
| GCP GPU/TPU | `genai/infrastructure/gcp_gpu.yml` | Infrastructure data |

---

## Processors

| Processor | Purpose |
|-----------|---------|
| ExternalBqExtractor | Extract from customer's BigQuery |
| GcpApiExtractor | Extract from GCP REST APIs |
| GCPAuthenticator | Authentication + client factory |
| ValidateGcpIntegration | Credential validation |
| GCPVertexAdapter | Vertex AI usage extraction |

---

## Security Standards

| Standard | Implementation |
|----------|----------------|
| KMS encryption | GCP Cloud KMS, decrypted only when needed (5-min TTL) |
| Validation | Format check → IAM status check → BQ access test |
| Audit logging | All operations logged, error messages sanitized |
| Metadata filtering | Allowlist-based key filtering |

---

## Table Configuration

| Setting | Value |
|---------|-------|
| Partitioning | `ingestion_date` (DAY, 730-day retention) |
| Clustering | `billing_account_id`, `service_id`, `project_id`, `location_region` |
| Pagination | 1000 per page |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/integrations/{org}/gcp/setup` | Upload SA + store encrypted |
| POST | `/integrations/{org}/gcp/validate` | Test connection |
| PUT | `/integrations/{org}/gcp/metadata` | Update billing table config |
| POST | `/pipelines/run/{org}/gcp/cost/billing` | Run billing pipeline |

---

## Key Files

| Service | File | Purpose |
|---------|------|---------|
| Frontend | `app/[orgSlug]/integrations/cloud-providers/gcp/page.tsx` | GCP setup UI |
| API | `src/app/routers/integrations.py` | Integration endpoints |
| API | `src/lib/integrations/metadata_schemas.py` | Metadata validation |
| Pipeline | `configs/cloud/gcp/cost/billing.yml` | Billing pipeline config |
| Pipeline | `src/core/processors/cloud/gcp/external_bq_extractor.py` | BQ extractor |
| Pipeline | `src/core/processors/cloud/gcp/authenticator.py` | Authentication |
