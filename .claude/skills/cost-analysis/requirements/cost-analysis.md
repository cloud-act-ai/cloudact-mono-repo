# Cost Analysis - Requirements

## Overview

Cloud cost ingestion and FOCUS 1.3 conversion for GCP, AWS, Azure, and OCI billing data. Each provider's raw billing data is extracted via encrypted credentials, written to provider-specific raw tables, then converted to the unified `cost_data_standard_1_3` schema via per-provider stored procedures.

## Source Specification

`02_CLOUD_COSTS.md` (v2.3, 2026-02-08)

---

## Architecture

```
                        Cloud Providers (Raw Billing Exports)
                ┌──────────┬──────────┬──────────┬──────────┐
                │   GCP    │   AWS    │  Azure   │   OCI    │
                └────┬─────┴────┬─────┴────┬─────┴────┬─────┘
                     │          │          │          │
          ┌──────────▼──────────▼──────────▼──────────▼──────────┐
          │        Pipeline Service (8001)                        │
          │  Encrypted credentials (GCP KMS AES-256, 5-min TTL)  │
          │  Idempotent writes (org + pipeline + cred + date)    │
          │  x_* lineage fields on every row                     │
          └──────────┬──────────┬──────────┬──────────┬──────────┘
                     │          │          │          │
                     ▼          ▼          ▼          ▼
          ┌─────────────────────────────────────────────────────┐
          │  BigQuery: {org_slug}_prod                          │
          │  ┌─────────────────────────────────────────────┐    │
          │  │ cloud_gcp_billing_raw_daily                  │    │
          │  │ cloud_aws_billing_raw_daily                  │    │
          │  │ cloud_azure_billing_raw_daily                │    │
          │  │ cloud_oci_billing_raw_daily                  │    │
          │  └──────────────────┬────────────────────────────┘    │
          │                     │ sp_cloud_{provider}_convert     │
          │                     ▼ _to_focus (per provider)        │
          │  ┌─────────────────────────────────────────────┐    │
          │  │ cost_data_standard_1_3  (FOCUS 1.3 unified) │    │
          │  └──────────────────┬────────────────────────────┘    │
          └─────────────────────┼─────────────────────────────────┘
                                │
          ┌─────────────────────▼─────────────────────────────────┐
          │  API Service (8000)                                   │
          │  Polars engine + LRU cache (100 entries, midnight TTL)│
          │  GET /costs/{org}/cloud, /total, /by-provider, etc.  │
          └─────────────────────┬─────────────────────────────────┘
                                │
          ┌─────────────────────▼─────────────────────────────────┐
          │  Frontend (3000)                                      │
          │  Server Actions → Dashboard pages                    │
          │  /{org}/cost-dashboards/cloud-costs                  │
          └───────────────────────────────────────────────────────┘
```

**Convergence into FOCUS 1.3:** Cloud costs join GenAI and Subscription costs in the same `cost_data_standard_1_3` table. Each provider has its own stored procedure (`sp_cloud_{provider}_convert_to_focus`) that maps provider-specific billing fields to the unified FOCUS 1.3 schema.

---

## Functional Requirements

### FR-01: Multi-Provider Ingestion

- Support 4 cloud providers: GCP, AWS, Azure, OCI
- Each provider has a dedicated raw table: `cloud_{provider}_billing_raw_daily`
- Pipeline endpoints: `POST /pipelines/run/{org}/{provider}/cost/billing`

### FR-02: Credential Management

- Customer enables billing export in their cloud provider console
- CloudAct integration stores encrypted credentials via GCP KMS (AES-256)
- 5-minute TTL on credential decryption
- Pipeline decrypts credentials at runtime to authenticate against customer's BQ/S3/etc.

### FR-03: FOCUS 1.3 Conversion

- Each provider has a dedicated stored procedure: `sp_cloud_{provider}_convert_to_focus`
- All stored procedures live in the `organizations` dataset, operate on per-org datasets
- Output: unified `cost_data_standard_1_3` table

| Provider | Procedure | Source Table |
|----------|-----------|-------------|
| GCP | `sp_cloud_gcp_convert_to_focus` | `cloud_gcp_billing_raw_daily` |
| AWS | `sp_cloud_aws_convert_to_focus` | `cloud_aws_billing_raw_daily` |
| Azure | `sp_cloud_azure_convert_to_focus` | `cloud_azure_billing_raw_daily` |
| OCI | `sp_cloud_oci_convert_to_focus` | `cloud_oci_billing_raw_daily` |

### FR-04: Hierarchy Allocation (5-Field Model)

All cloud cost tables carry the 5-field hierarchy model:

| Field | Description |
|-------|-------------|
| `x_hierarchy_entity_id` | Entity identifier (e.g., `DEPT-001`, `PROJ-042`) |
| `x_hierarchy_entity_name` | Human-readable entity name |
| `x_hierarchy_level_code` | Level: `DEPT`, `PROJ`, `TEAM` |
| `x_hierarchy_path` | Full path of IDs (`/ORG/DEPT-001/PROJ-042`) |
| `x_hierarchy_path_names` | Full path of names (`/Acme/Engineering/Backend`) |

### FR-05: Pipeline Lineage (x_* Fields)

All cloud tables include lineage metadata:

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

### FR-06: Idempotent Writes

- Composite key: `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)`
- Prevents duplicate data on pipeline re-runs

---

## Non-Functional Requirements

### NFR-01: Table Partitioning

- Partition column: `ingestion_date` (DAY granularity)
- Retention: 730 days

### NFR-02: Table Clustering

- Clustering columns: `billing_account_id`, `service_id`, `project_id`, `location_region`

### NFR-03: Security Boundary

- x_* fields are Pipeline Service (8001) only -- never set by API Service (8000)
- All credentials encrypted with GCP KMS AES-256

### NFR-04: Data Reads

- Dashboard reads unified FOCUS 1.3 data via Polars engine with LRU cache

---

## SDLC

### Development Workflow

1. **Add/modify provider pipeline** -- Edit pipeline config in `03-data-pipeline-service/configs/cloud/{provider}/cost/billing.yml`
2. **Update FOCUS conversion** -- Edit stored procedure in `configs/system/procedures/cloud/sp_cloud_{provider}_convert_to_focus.sql`
3. **Update table schema** (if needed) -- Edit JSON schema in `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_*.json`, then run `bootstrap-sync` + `org-sync-all`
4. **Test locally** -- Run pipeline against test org, verify data in BigQuery
5. **Deploy** -- Push to `main` (stage) or tag `v*` (prod) via Cloud Build

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| Pipeline logic | pytest | Unit tests for extraction, transformation, idempotency |
| FOCUS conversion | pytest + BigQuery | Verify stored procedure output matches FOCUS 1.3 schema |
| API cost reads | pytest | Polars-based cost read service, cache behavior |
| Frontend helpers | Vitest | Cost formatting, date-range calculations, filters |
| End-to-end | Playwright | Dashboard loads, cost data renders, filters work |
| Demo validation | Demo scripts | Load demo data (Dec 2025 - Jan 2026), verify totals |

### Deployment / CI/CD Integration

- **Stage:** Automatic on `git push origin main` via `cloudbuild-stage.yaml`
- **Production:** Triggered by `git tag v*` via `cloudbuild-prod.yaml`
- **Post-deploy:** Run `bootstrap-sync` then `org-sync-all` if schema changed
- **Validation:** Check `/costs/{org}/cloud` endpoint returns expected data

### Release Cycle Position

Cost analysis pipelines are upstream of all dashboard and analytics features. Schema or procedure changes must be deployed (API + Pipeline) before frontend changes that depend on new fields.

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/cloud/{provider}/cost/billing.yml` | Pipeline configs |
| `03-data-pipeline-service/configs/system/procedures/cloud/sp_cloud_{provider}_convert_to_focus.sql` | FOCUS conversion procedures |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_*.json` | Table schemas |
