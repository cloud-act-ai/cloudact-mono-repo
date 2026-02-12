# Cost Analysis - Requirements

## Overview

Cloud cost ingestion and FOCUS 1.3 conversion for GCP, AWS, Azure, and OCI billing data. Each provider's raw billing data is extracted via encrypted credentials, written to provider-specific raw tables, then converted to the unified `cost_data_standard_1_3` schema via per-provider stored procedures.

## Source Specification

`00-requirements-specs/02_CLOUD_COSTS.md` (v2.3, 2026-02-08)

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

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/cloud/{provider}/cost/billing.yml` | Pipeline configs |
| `03-data-pipeline-service/configs/system/procedures/cloud/sp_cloud_{provider}_convert_to_focus.sql` | FOCUS conversion procedures |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cloud_*.json` | Table schemas |
