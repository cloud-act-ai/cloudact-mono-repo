# /gcp-integration - GCP Integration Operations

Manage GCP Service Account integrations, billing export tables, and cost pipelines.

## Prerequisites

**Required:** `/integration-setup` - Understand the credential architecture first.

All credentials are stored in BigQuery only (single source of truth). See `/integration-setup` for:
- Data architecture diagram
- How to debug credential issues
- Common troubleshooting patterns

## Usage

```
/gcp-integration <action> [org_slug] [options]
```

## Actions

### Setup Integration
```
/gcp-integration setup <org_slug>           # Guide through GCP SA setup
/gcp-integration setup <org_slug> --file <path>  # Setup with SA JSON file
```

### Configure Billing Tables
```
/gcp-integration tables <org_slug>          # List configured tables
/gcp-integration tables <org_slug> --add    # Add billing export tables
/gcp-integration tables <org_slug> --add-account  # Add additional billing account (enterprise)
```

### Validate
```
/gcp-integration validate <org_slug>        # Validate GCP credentials
/gcp-integration validate <org_slug> --full # Full validation with table check
```

### Run Pipelines
```
/gcp-integration run-billing <org_slug>     # Run billing pipeline
/gcp-integration run-billing <org_slug> --date 2026-01-18
/gcp-integration run-api <org_slug> --type storage    # Run storage inventory
/gcp-integration run-api <org_slug> --type iam        # Run IAM inventory
/gcp-integration run-api <org_slug> --type compute    # Run compute inventory
```

### Debug
```
/gcp-integration debug <org_slug>           # Show integration status
/gcp-integration debug <org_slug> --logs    # Show recent pipeline logs
```

---

## Reference Documentation

See `/00-requirements-specs/05_GCP_INTEGRATION.md` for complete documentation including:
- Architecture and data flow
- Metadata schema (with multi-billing account support)
- Pipeline configurations
- Known gaps and issues

## Instructions

When user runs `/gcp-integration`, follow these patterns:

### Action: setup

**Step 1: Check existing integration**
```bash
curl -X GET "http://localhost:8000/api/v1/integrations/{org_slug}/status" \
  -H "X-API-Key: {org_api_key}"
```

**Step 2: Guide user through SA creation**
1. Create Service Account in GCP Console
2. Grant required roles:
   - `roles/bigquery.dataViewer`
   - `roles/bigquery.jobUser`
   - `roles/billing.viewer` (optional)
3. Download JSON key
4. Upload via frontend or API

**Step 3: Setup via API**
```bash
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/gcp/setup" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: {org_api_key}" \
  -d '{
    "credential": "{sa_json_content}",
    "credential_name": "GCP SA ({project_id})"
  }'
```

### Action: tables

**List configured tables:**
```bash
curl -X GET "http://localhost:8000/api/v1/integrations/{org_slug}/status" \
  -H "X-API-Key: {org_api_key}" | jq '.integrations.GCP_SA.metadata'
```

**Update billing tables (primary account):**
```bash
curl -X PUT "http://localhost:8000/api/v1/integrations/{org_slug}/gcp/metadata" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: {org_api_key}" \
  -d '{
    "metadata": {
      "billing_export_table": "project.dataset.gcp_billing_export_v1_*",
      "detailed_export_table": "project.dataset.gcp_billing_export_resource_v1_*",
      "pricing_export_table": "project.dataset.cloud_pricing_export",
      "committed_use_discount_table": "project.dataset.cud_export"
    },
    "skip_validation": true
  }'
```

**Add additional billing accounts (enterprise):**
```bash
curl -X PUT "http://localhost:8000/api/v1/integrations/{org_slug}/gcp/metadata" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: {org_api_key}" \
  -d '{
    "metadata": {
      "billing_export_table": "project.dataset.gcp_billing_export_v1_*",
      "additional_billing_accounts": [
        {
          "name": "Production",
          "billing_export_table": "prod-project.billing.gcp_billing_export_v1_*",
          "detailed_export_table": "prod-project.billing.gcp_billing_export_resource_v1_*"
        },
        {
          "name": "Development",
          "billing_export_table": "dev-project.billing.gcp_billing_export_v1_*"
        }
      ]
    },
    "skip_validation": true
  }'
```

### Action: validate

**Validate credentials:**
```bash
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/gcp/validate" \
  -H "X-API-Key: {org_api_key}"
```

### Action: run-billing

**Run billing pipeline:**
```bash
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: {org_api_key}" \
  -d '{"date": "2026-01-18"}'
```

### Action: run-api

**Run API inventory pipelines:**
```bash
# Storage buckets
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/api/storage_buckets" \
  -H "X-API-Key: {org_api_key}"

# IAM service accounts
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/api/iam_service_accounts" \
  -H "X-API-Key: {org_api_key}"

# Compute instances
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/api/compute_instances" \
  -H "X-API-Key: {org_api_key}"

# Billing accounts
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/api/billing_accounts" \
  -H "X-API-Key: {org_api_key}"
```

### Action: debug

**Check integration status:**
```bash
# 1. Get integration status
curl -X GET "http://localhost:8000/api/v1/integrations/{org_slug}/status" \
  -H "X-API-Key: {org_api_key}"

# 2. Check recent pipeline runs
bq query --use_legacy_sql=false \
  "SELECT pipeline_id, status, started_at, completed_at, error_message
   FROM \`organizations.org_meta_pipeline_runs\`
   WHERE org_slug = '{org_slug}' AND pipeline_id LIKE '%gcp%'
   ORDER BY started_at DESC LIMIT 10"

# 3. Check billing data
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as rows, MIN(usage_start_time) as min_date, MAX(usage_start_time) as max_date
   FROM \`{org_slug}_prod.cloud_gcp_billing_raw_daily\`"
```

## Billing Export Table Types

| Table | GCP Table Pattern | Purpose |
|-------|-------------------|---------|
| `billing_export_table` | `gcp_billing_export_v1_*` | Standard cost data (REQUIRED) |
| `detailed_export_table` | `gcp_billing_export_resource_v1_*` | Resource-level details |
| `pricing_export_table` | `cloud_pricing_export` | Pricing catalog |
| `committed_use_discount_table` | CUD export | Commitment analysis |

## Multi-Billing Account Support

Enterprise organizations can configure up to 10 additional billing accounts. Each additional account can have:
- `name`: Account name/label (e.g., "Production", "Development")
- `billing_export_table`: Standard billing export (REQUIRED)
- `detailed_export_table`: Resource-level export
- `pricing_export_table`: Pricing catalog
- `committed_use_discount_table`: CUD data

Configure via UI: Settings → Integrations → GCP → Billing Export Tables → Add Account

## Available Pipelines

| Pipeline | Config | Destination |
|----------|--------|-------------|
| Billing | `cloud/gcp/cost/billing.yml` | `cloud_gcp_billing_raw_daily` |
| Storage Buckets | `cloud/gcp/api/storage_buckets.yml` | `gcp_storage_buckets_raw` |
| IAM Service Accounts | `cloud/gcp/api/iam_service_accounts.yml` | `gcp_iam_service_accounts_raw` |
| Compute Instances | `cloud/gcp/api/compute_instances.yml` | `gcp_compute_instances_raw` |
| Billing Accounts | `cloud/gcp/api/billing_accounts.yml` | `gcp_billing_accounts_raw` |

## Key Files

| Service | File | Purpose |
|---------|------|---------|
| Frontend | `app/[orgSlug]/integrations/cloud-providers/gcp/page.tsx` | Setup UI |
| API | `src/app/routers/integrations.py` | Endpoints |
| API | `src/lib/integrations/metadata_schemas.py` | Metadata validation |
| Pipeline | `configs/cloud/gcp/cost/billing.yml` | Billing pipeline config |
| Pipeline | `src/core/processors/cloud/gcp/external_bq_extractor.py` | BQ extractor |
| Pipeline | `src/core/processors/cloud/gcp/gcp_api_extractor.py` | API extractor |
| Pipeline | `src/core/processors/cloud/gcp/authenticator.py` | Authentication |

## Issue Status

| ID | Issue | Status |
|----|-------|--------|
| GCP-001 | Vertex AI adapter returns empty data | **FIXED** - Full implementation |
| GCP-002 | No billing export table pre-validation | **FIXED** - Table existence check |
| GCP-003 | Single billing account per org | **FIXED** - Multi-account support |
| GCP-004 | Token refresh race condition | **FIXED** - asyncio.Lock added |
| GCP-005 | No GCP project quota check | **FIXED** - Quota pre-check + error handling |
| GCP-006 | Missing Storage billing pipeline | **FIXED** - Pipeline created |
| GCP-007 | No SA key rotation detection | N/A (not needed) |
| GCP-008 | Pagination limit too high (10000) | **FIXED** - Reduced to 1000 |
| GCP-009 | No region enforcement | **FIXED** - Region format validation |
| GCP-010 | Query timeout logging incomplete | **FIXED** - Enhanced job logging |

## Data Architecture

### Single Source of Truth: BigQuery

Integration credentials are stored ONLY in BigQuery. The frontend reads via API.

```
Frontend ──▶ API (8000) ──▶ BigQuery (org_integration_credentials)
```

**No Supabase caching** - Previously, integration status was cached in Supabase's
`cloud_provider_integrations` table, causing sync issues. This was removed.

### Key Tables

| Table | Location | Purpose |
|-------|----------|---------|
| `org_integration_credentials` | BigQuery | Source of truth for credentials |
| `organizations` | Supabase | User auth only (NOT integration status) |

### Debug Data Sync Issues

**Check BigQuery credential status:**
```bash
bq query --use_legacy_sql=false --project_id=cloudact-testing-1 "
SELECT credential_id, validation_status, last_validated_at, is_active
FROM organizations.org_integration_credentials
WHERE org_slug = '{org_slug}' AND provider = 'GCP_SA'
ORDER BY created_at DESC LIMIT 5
"
```

**Fix duplicate active credentials:**
```bash
# Keep only the latest credential active
bq query --use_legacy_sql=false --project_id=cloudact-testing-1 "
UPDATE organizations.org_integration_credentials
SET is_active = FALSE
WHERE org_slug = '{org_slug}'
  AND provider = 'GCP_SA'
  AND credential_id != '{latest_credential_id}'
  AND is_active = TRUE
"
```

---

## Troubleshooting

**"billing_export_table is not configured"**
- Go to Settings → Integrations → GCP → Billing Export Tables
- Add the fully qualified table path: `project.dataset.table_name`

**"Billing export table not found"**
- Verify the table exists in BigQuery Console
- Check the table path format: `project.dataset.table`
- Ensure the SA has `roles/bigquery.dataViewer` access

**"Permission denied: bigquery.tables.getData"**
- Grant `roles/bigquery.dataViewer` to the Service Account
- Verify the SA has access to the billing export dataset

**"Credential validation failed"**
- Check if SA is disabled in IAM Console
- Verify private key hasn't been rotated
- Re-upload the SA JSON

**"Pipeline times out"**
- Check billing export table size
- Consider filtering by date range
- Default timeout is 10 minutes (600s)

**"Query execution failed"**
- Check BigQuery job quota
- Verify dataset/table permissions
- Review error in pipeline logs
