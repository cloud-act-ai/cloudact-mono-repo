# Integration Setup - Requirements

## Overview

Provider credential management system supporting 11+ providers across Cloud, GenAI, and SaaS categories. Handles credential upload, KMS encryption, validation, storage, and runtime decryption for pipeline execution.

## Source Specification

- `00-requirements-specs/03_INTEGRATIONS.md` (v1.9, 2026-02-08)
- `00-requirements-specs/05_GCP_INTEGRATION.md` (v2.0, 2026-02-08)

---

## Functional Requirements

### FR-INT-001: Credential Upload and Storage

- Users upload credentials via frontend integration pages
- API validates format against required fields per provider
- Credentials encrypted with GCP KMS AES-256 before storage
- Encrypted blob stored in `org_integration_credentials` BigQuery table

### FR-INT-002: Credential Validation

- Connection test via test API call to provider after upload
- Validation status tracked: `VALID`, `INVALID`, `PENDING`, `EXPIRED`
- Format check + connection test required before accepting credentials

### FR-INT-003: Runtime Decryption

- Credentials decrypted on-demand during pipeline execution
- 5-minute TTL cache for decrypted values
- SHA256 fingerprint (first 8 chars) used for logging -- never log raw credentials

### FR-INT-004: Provider Registry

- Single source of truth: `configs/system/providers.yml`
- Defines types, required fields, rate limits, and validation rules for all providers

### FR-INT-005: CRUD Operations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/integrations/{org}/{provider}/setup` | Encrypt + store credential |
| POST | `/integrations/{org}/{provider}/validate` | Test connection + set validation_status |
| GET | `/integrations/{org}` | List all integrations |
| GET | `/integrations/{org}/{provider}` | Get specific credential metadata |
| PUT | `/integrations/{org}/{provider}` | Update credential |
| DELETE | `/integrations/{org}/{provider}` | Remove integration |

### FR-INT-006: Supported Providers

| Category | Provider | Credential Type |
|----------|----------|-----------------|
| Cloud | GCP | Service Account JSON |
| Cloud | AWS (IAM) | IAM Role ARN |
| Cloud | AWS (Keys) | Access Key + Secret |
| Cloud | Azure | Service Principal JSON |
| Cloud | OCI | API Key |
| GenAI | OpenAI | API Key (`sk-*`) |
| GenAI | Anthropic | API Key (`sk-ant-*`) |
| GenAI | Gemini | API Key |
| GenAI | DeepSeek | API Key |
| SaaS | Canva | Manual entry |
| SaaS | ChatGPT Plus | Manual entry |
| SaaS | Slack | Manual entry |

---

## Non-Functional Requirements

### NFR-INT-001: Security

- GCP KMS AES-256 encryption for all credentials
- Never log raw credential values
- SHA256 fingerprint logging only
- Format validation before encryption
- Connection test before accepting

### NFR-INT-002: Frontend Routes

| Route | Purpose |
|-------|---------|
| `/settings/integrations/cloud` | Cloud provider credential management |
| `/integrations/genai/openai` | OpenAI API key setup |
| `/integrations/genai/anthropic` | Anthropic API key setup |
| `/integrations/genai/gemini` | Gemini API key setup |
| `/integrations/genai/deepseek` | DeepSeek API key setup |
| `/integrations/gcp` | GCP service account setup |
| `/integrations/subscriptions` | SaaS subscription management |

---

## Data Structures

| Table | Purpose |
|-------|---------|
| `org_integration_credentials` | KMS-encrypted credentials + validation_status + metadata |
| `configs/system/providers.yml` | Provider registry (types, required fields, rate limits) |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/integrations.py` | CRUD endpoints |
| `02-api-service/src/lib/integrations/metadata_schemas.py` | Metadata validation per provider |
| `03-data-pipeline-service/configs/system/providers.yml` | Provider registry (single source of truth) |
| `01-fronted-system/actions/integrations.ts` | Frontend server actions |

---

## GCP Integration Details

### FR-GCP-001: Integration Workflow

1. Upload SA JSON via frontend (`/settings/integrations/gcp`)
2. Validate: format check + IAM role verification + BQ access test
3. KMS encrypt and store in `org_integration_credentials` (AES-256)
4. Configure billing tables: Standard, Detailed, Pricing, CUD export tables
5. Run pipeline: decrypt SA, auth to customer BQ, extract billing data
6. Write to `{org_slug}_prod.cloud_gcp_billing_raw_daily`
7. FOCUS convert via `sp_cloud_gcp_convert_to_focus` to `cost_data_standard_1_3`

### FR-GCP-002: Provider Configuration

| Property | Value |
|----------|-------|
| Provider Key | `GCP_SA` |
| Credential Type | `SERVICE_ACCOUNT_JSON` |
| Required Fields | `type`, `project_id`, `private_key`, `client_email` |
| Rate Limit | 100 req/min |
| Max Retries | 3 (2s backoff) |

### FR-GCP-003: Required IAM Roles

| Role | Purpose |
|------|---------|
| `roles/bigquery.dataViewer` | Read billing export data |
| `roles/bigquery.jobUser` | Execute BigQuery queries |
| `roles/billing.viewer` | Billing account metadata (optional) |

### FR-GCP-004: Billing Export Tables

| Table | Format | Purpose |
|-------|--------|---------|
| `billing_export_table` | `gcp_billing_export_v1_*` | Standard billing (REQUIRED) |
| `detailed_export_table` | `gcp_billing_export_resource_v1_*` | Resource-level granularity |
| `pricing_export_table` | `cloud_pricing_export` | Pricing catalog |
| `committed_use_discount_table` | CUD export | Commitment utilization |

Table path format: `project-id.dataset_name.table_name`

Multi-billing: Up to 10 additional billing accounts supported (Enterprise).

### FR-GCP-005: Metadata Fields

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

### FR-GCP-006: GCP Pipelines

#### Cost Pipelines

| Pipeline | Config | Destination |
|----------|--------|-------------|
| GCP Billing | `cloud/gcp/cost/billing.yml` | `cloud_gcp_billing_raw_daily` |
| GCP FOCUS Convert | `cloud/gcp/cost/focus_convert.yml` | `cost_data_standard_1_3` |

#### API Pipelines (Resource Inventory)

| Pipeline | Config | Destination |
|----------|--------|-------------|
| Billing Accounts | `cloud/gcp/api/billing_accounts.yml` | `gcp_billing_accounts_raw` |
| Compute Instances | `cloud/gcp/api/compute_instances.yml` | `gcp_compute_instances_raw` |
| Storage Buckets | `cloud/gcp/api/storage_buckets.yml` | `gcp_storage_buckets_raw` |
| IAM Service Accounts | `cloud/gcp/api/iam_service_accounts.yml` | `gcp_iam_service_accounts_raw` |

#### GenAI Pipelines (Vertex AI / Gemini)

| Pipeline | Config | Destination |
|----------|--------|-------------|
| Vertex AI GSU | `genai/commitment/gcp_vertex.yml` | Commitment data |
| GCP GPU/TPU | `genai/infrastructure/gcp_gpu.yml` | Infrastructure data |
| Vertex AI PAYG | `genai/payg/gcp_vertex.yml` | GenAI usage data |
| Gemini API | `genai/payg/gemini.yml` | Gemini API usage data |

### FR-GCP-007: Processors

| Processor | Purpose |
|-----------|---------|
| ExternalBqExtractor | Extract from customer's BigQuery |
| GcpApiExtractor | Extract from GCP REST APIs |
| GCPAuthenticator | Authentication + client factory |
| ValidateGcpIntegration | Credential validation |
| GCPVertexAdapter | Vertex AI usage extraction |

### NFR-GCP-001: Table Configuration

| Setting | Value |
|---------|-------|
| Partitioning | `ingestion_date` (DAY, 730-day retention) |
| Clustering | `billing_account_id`, `service_id`, `project_id`, `location_region` |
| Pagination | 1000 per page |

### NFR-GCP-002: Security

- KMS AES-256 encryption, decrypted only when needed (5-min TTL)
- Service Account JSON uploaded via frontend, encrypted immediately
- Validation: format check -> IAM status check -> BQ access test
- Audit logging with sanitized error messages
- Allowlist-based metadata key filtering

### GCP Key Files

| Service | File | Purpose |
|---------|------|---------|
| Frontend | `app/[orgSlug]/integrations/cloud-providers/gcp/page.tsx` | GCP setup UI |
| API | `src/app/routers/integrations.py` | Integration endpoints |
| API | `src/lib/integrations/metadata_schemas.py` | Metadata validation |
| Pipeline | `configs/cloud/gcp/cost/billing.yml` | Billing pipeline config |
| Pipeline | `src/core/processors/cloud/gcp/external_bq_extractor.py` | BQ extractor |
| Pipeline | `src/core/processors/cloud/gcp/authenticator.py` | Authentication |
| Pipeline | `src/core/processors/genai/gcp_vertex_adapter.py` | Vertex AI adapter |
