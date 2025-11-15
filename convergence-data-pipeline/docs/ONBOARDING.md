# Customer Onboarding Guide

## Overview
This guide walks through the complete customer onboarding process for the Convergence Data Pipeline platform.

## Prerequisites
- FastAPI server running on `http://localhost:8080`
- Valid API endpoint access
- curl or HTTP client installed

## Onboarding Process

### Step 1: Onboard a New Customer

**Endpoint**: `POST /api/v1/customers/onboard`

**Request Format**:
```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "<TENANT_ID>"}'
```

**Tenant ID Format**:
- Alphanumeric with underscores only
- Length: 3-50 characters
- Example: `acmeinc_23xv2`, `techcorp_99zx4`

**Response**:
```json
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
  "dataset_created": true,
  "tables_created": [
    "api_keys",
    "cloud_credentials",
    "pipeline_runs",
    "step_logs",
    "dq_results"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Customer acmeinc_23xv2 onboarded successfully..."
}
```

**IMPORTANT**: Save the `api_key` immediately! It will only be shown once.

### Step 2: What Gets Created

During onboarding, the system automatically creates:

1. **BigQuery Dataset**: `{tenant_id}`
   - Single dataset containing all tenant data
   - Replaces old multi-dataset architecture

2. **Metadata Tables** (in `{tenant_id}` dataset):
   - `api_keys` - Encrypted API keys for authentication
   - `cloud_credentials` - Encrypted cloud provider credentials
   - `pipeline_runs` - Pipeline execution history
   - `step_logs` - Detailed step-by-step execution logs
   - `dq_results` - Data quality validation results

3. **API Key**:
   - Format: `{tenant_id}_api_{random_16_chars}`
   - Triple-layer security:
     - SHA256 hash for fast lookup
     - KMS encryption for storage
     - Show-once pattern (only returned during onboarding)

4. **Dryrun Pipeline**:
   - Validates infrastructure setup
   - Runs from `configs/gcp/example/dryrun.yml`
   - Ensures BigQuery connectivity

### Step 3: Using Your API Key

All pipeline operations require authentication using the `X-API-Key` header:

```bash
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}" \
  -H "X-API-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

## Example Onboarding Workflows

### Onboard 5 Customers

```bash
# Customer 1: Acme Inc
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "acmeinc_23xv2"}' | jq '.'

# Customer 2: TechCorp
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "techcorp_99zx4"}' | jq '.'

# Customer 3: DataSystems
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "datasystems_45abc"}' | jq '.'

# Customer 4: CloudWorks
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "cloudworks_78def"}' | jq '.'

# Customer 5: ByteFactory
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "bytefactory_12ghi"}' | jq '.'
```

### Verify Onboarding

Check that datasets were created in BigQuery:

```bash
bq ls --project_id=gac-prod-471220 | grep -E "(acmeinc|techcorp|datasystems|cloudworks|bytefactory)"
```

Check tables in each dataset:

```bash
bq ls --project_id=gac-prod-471220 acmeinc_23xv2
bq ls --project_id=gac-prod-471220 techcorp_99zx4
bq ls --project_id=gac-prod-471220 datasystems_45abc
bq ls --project_id=gac-prod-471220 cloudworks_78def
bq ls --project_id=gac-prod-471220 bytefactory_12ghi
```

## Architecture Overview

### Single-Dataset-Per-Tenant Model

**OLD Architecture** (deprecated):
```
acme1281_metadata
acme1281_raw_gcp
acme1281_raw_openai
acme1281_silver_cost
```

**NEW Architecture**:
```
acmeinc_23xv2/
├── api_keys
├── cloud_credentials
├── pipeline_runs
├── step_logs
├── dq_results
└── {pipeline-specific tables}
```

### Template-Based Pipeline Configuration

All tenants share the same pipeline templates:
- `configs/gcp/cost/bill-sample-export-template.yml`
- `configs/gcp/example/dryrun.yml`
- `configs/customer/onboarding-template.yml`

Templates use variable placeholders:
- `{tenant_id}` - Tenant identifier
- `{provider}` - Cloud provider (gcp, aws, openai, anthropic)
- `{domain}` - Service domain (cost, usage, billing)
- `{template_name}` - Template filename without extension
- `{pipeline_id}` - Auto-generated: `{tenant_id}-{provider}-{domain}-{template_name}`

## Security Features

### API Key Protection
1. **SHA256 Hash** - Fast lookup without decryption
2. **KMS Encryption** - Encrypted storage in BigQuery
3. **Show Once** - API key only returned during onboarding

### Tenant Isolation
- Each tenant has separate dataset
- API endpoints validate tenant_id matches authenticated user
- Cross-tenant access blocked with HTTP 403

### Credential Encryption
- All sensitive credentials encrypted via Google Cloud KMS
- API keys, GCP service accounts, OpenAI keys, etc.
- Decrypt only when needed for pipeline execution

## Troubleshooting

### Error: Tenant ID already exists
The tenant_id must be unique. Choose a different identifier.

### Error: KMS encryption failed
For development: The system will fall back to plain storage (NOT FOR PRODUCTION).
For production: Ensure GCP KMS is properly configured in `.env`:
```bash
GCP_KMS_KEY_NAME=projects/{project}/locations/us-central1/keyRings/convergence-keyring/cryptoKeys/convergence-encryption-key
```

### Error: Dryrun pipeline failed
This is non-critical during onboarding. The core infrastructure (dataset, tables, API key) is still created successfully. The dryrun pipeline validates connectivity and can fail if templates are missing.

### Error: Permission denied
Ensure your GCP service account has the following permissions:
- `bigquery.datasets.create`
- `bigquery.tables.create`
- `bigquery.tables.updateData`
- `cloudkms.cryptoKeyVersions.useToEncrypt`
- `cloudkms.cryptoKeyVersions.useToDecrypt`

## Next Steps

After onboarding:

1. **Run Pipelines**: Use the templated pipeline execution API
   ```bash
   POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}
   ```

2. **Monitor Execution**: Check pipeline_runs table
   ```sql
   SELECT * FROM `{tenant_id}.pipeline_runs`
   ORDER BY created_at DESC LIMIT 10
   ```

3. **Review Logs**: Check step_logs table
   ```sql
   SELECT * FROM `{tenant_id}.step_logs`
   WHERE pipeline_logging_id = '{uuid}'
   ORDER BY step_number
   ```

4. **Verify Data Quality**: Check dq_results table
   ```sql
   SELECT * FROM `{tenant_id}.dq_results`
   WHERE status = 'FAILED'
   ```

## Support

For issues or questions:
- Check logs in `pipeline_runs` and `step_logs` tables
- Review IMPLEMENTATION_SUMMARY.md for architecture details
- Review ARCHITECTURE_REDESIGN.md for design decisions

---

**Generated**: November 2025
**Version**: 1.0
**Status**: Production Ready
