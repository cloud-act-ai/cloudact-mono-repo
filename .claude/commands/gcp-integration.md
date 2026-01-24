# /gcp-integration - GCP Integration Operations

Manage GCP Service Account integrations, billing export tables, cost pipelines, and FOCUS 1.3 conversion.

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

## GCP Billing → FOCUS 1.3 Conversion

### Data Flow

```
GCP Billing Export → External BQ Query → cloud_gcp_billing_raw_daily → sp_cloud_1_convert_to_focus → cost_data_standard_1_3
```

### Key Files

| Type | Path |
|------|------|
| Pipeline Config | `03-data-pipeline-service/configs/cloud/gcp/cost/billing.yml` |
| Schema | `03-data-pipeline-service/configs/cloud/gcp/cost/schemas/billing_cost.json` |
| FOCUS Converter | `03-data-pipeline-service/configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql` |
| Extractor | `03-data-pipeline-service/src/core/processors/cloud/gcp/external_bq_extractor.py` |

### GCP → FOCUS 1.3 Field Mappings

| FOCUS Field | GCP Source | Description |
|-------------|------------|-------------|
| `BilledCost` | `cost` | Gross cost before credits |
| `EffectiveCost` | `cost + credits_total` | Net cost after credits (credits are negative) |
| `ListCost` | `list_cost` OR `cost` (fallback) | Full retail price |
| `ContractedCost` | `cost` | Cost at negotiated rate |
| `ConsumedQuantity` | `usage_amount` | Raw usage amount |
| `ConsumedUnit` | `usage_unit` | Usage unit (second, byte, byte-seconds, requests) |
| `PricingQuantity` | `usage_amount_in_pricing_units` | Usage in pricing units |
| `PricingUnit` | `usage_pricing_unit` | Pricing unit (vCPU-second, gibibyte month, etc.) |
| `ChargeCategory` | `cost_type` | 'Usage', 'Credit', 'Tax', 'Adjustment' |
| `ChargeClass` | Derived | 'Correction' for credits, NULL otherwise |
| `SubAccountId` | `project_id` | GCP Project ID |
| `ServiceName` | `service_description` | e.g., "Cloud Run", "BigQuery" |
| `ServiceCategory` | Derived from service | Compute, Storage, Database, Networking, AI/ML |

### GCP Credit Handling

GCP credits have:
- `cost_type = 'credit'` (or similar)
- Negative `cost` value
- `credits_total` field (sum of credit amounts)
- `credits_json` field (detailed credit breakdown)

**Demo data pattern:**
```json
{
  "cost": -5.50,
  "cost_type": "credit",
  "credits_total": -5.50,
  "credits_json": "[{\"name\": \"Sustained use discount\", \"amount\": -5.50}]"
}
```

### GCP Usage Metrics Priority

When displaying usage in the UI, use this priority order:
1. **Time-based**: seconds, vCPU-second, build-minute
2. **Byte-based**: byte, gibibyte, tebibyte
3. **Request-based**: requests, queries
4. **Byte-seconds**: byte-seconds, gibibyte month

### GCP Billing Schema (Key Fields)

```json
{
  "billing_account_id": "STRING, REQUIRED",
  "project_id": "STRING, REQUIRED",
  "project_name": "STRING",
  "service_id": "STRING",
  "service_description": "STRING",
  "sku_id": "STRING",
  "sku_description": "STRING",
  "usage_start_time": "TIMESTAMP, REQUIRED",
  "usage_end_time": "TIMESTAMP, REQUIRED",
  "cost": "FLOAT64, REQUIRED",
  "currency": "STRING",
  "cost_type": "STRING",
  "credits_total": "FLOAT64",
  "credits_json": "STRING",
  "usage_amount": "FLOAT64",
  "usage_unit": "STRING",
  "usage_amount_in_pricing_units": "FLOAT64",
  "usage_pricing_unit": "STRING",
  "list_cost": "FLOAT64",
  "labels_json": "STRING",
  "resource_name": "STRING",
  "resource_global_name": "STRING"
}
```

### 5-Field Hierarchy Model

GCP billing integrates with the hierarchy system via tag lookups:

```sql
-- In sp_cloud_1_convert_to_focus (GCP section)
LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
  -- GCP labels (case-insensitive)
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.cost_center'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.CostCenter'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.team'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.Team'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.department'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.Department'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.entity_id')
)
```

**Result fields in cost_data_standard_1_3:**
- `x_hierarchy_entity_id` - TEAM-PLAT
- `x_hierarchy_entity_name` - Platform Team
- `x_hierarchy_level_code` - team
- `x_hierarchy_path` - /DEPT-CTO/PROJ-ENG/TEAM-PLAT
- `x_hierarchy_path_names` - CTO > Engineering > Platform

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
# Default (yesterday's data)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing" \
  -H "X-API-Key: {org_api_key}"

# Specific date range
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing?start_date=2026-01-01&end_date=2026-01-22" \
  -H "X-API-Key: {org_api_key}"
```

**Pipeline steps:**
1. `decrypt_credentials` - Decrypt GCP SA from KMS
2. `delete_existing_data` - Remove existing data for date range (idempotent)
3. `extract_billing` - Query GCP billing export table
4. `convert_to_focus` - Run `sp_cloud_1_convert_to_focus` procedure

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

# 4. Check FOCUS data
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as rows, SUM(BilledCost) as total_billed, SUM(EffectiveCost) as total_effective
   FROM \`{org_slug}_prod.cost_data_standard_1_3\`
   WHERE x_cloud_provider = 'gcp'"
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
| FOCUS Convert | `cloud/gcp/cost/focus_convert.yml` | `cost_data_standard_1_3` |
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
| Pipeline | `configs/cloud/gcp/cost/schemas/billing_cost.json` | Raw billing schema |
| Pipeline | `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql` | FOCUS converter |
| Pipeline | `src/core/processors/cloud/gcp/external_bq_extractor.py` | BQ extractor |
| Pipeline | `src/core/processors/cloud/gcp/gcp_api_extractor.py` | API extractor |
| Pipeline | `src/core/processors/cloud/gcp/authenticator.py` | Authentication |

## Stored Procedure Sync

**After modifying `sp_cloud_1_convert_to_focus.sql`, sync to BigQuery:**

```bash
# Force sync all procedures
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: {root_key}" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

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
| GCP-011 | Usage display shows wrong units | **FIXED** - Priority: time > bytes > requests |
| GCP-012 | Credits not showing in FOCUS | **FIXED** - ChargeCategory + ChargeClass mapping |

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
| `cloud_gcp_billing_raw_daily` | Org dataset | Raw GCP billing data |
| `cost_data_standard_1_3` | Org dataset | FOCUS 1.3 unified costs |
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

| Issue | Cause | Solution |
|-------|-------|----------|
| "billing_export_table is not configured" | Missing metadata | Settings → Integrations → GCP → Add billing table |
| "Billing export table not found" | Wrong table path | Verify `project.dataset.table` format |
| "Permission denied: bigquery.tables.getData" | Missing role | Grant `roles/bigquery.dataViewer` to SA |
| "Credential validation failed" | SA disabled/rotated | Re-upload SA JSON |
| "Pipeline times out" | Large table | Use date range filter |
| "Query execution failed" | Quota/permissions | Check BigQuery job quota |
| "Column X not present" | Schema mismatch | Sync stored procedures with `{"force": true}` |
| Credits not showing | Wrong ChargeCategory | Check `cost_type` field mapping |
| Hierarchy not resolving | Missing tags | Add `cost_center` label to GCP resources |
