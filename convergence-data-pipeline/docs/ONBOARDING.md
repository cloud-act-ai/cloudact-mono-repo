# Customer Onboarding Guide

## Overview

This guide provides practical steps to onboard customers to the Convergence Data Pipeline platform. It focuses on API usage with clear curl examples and real workflows.

## Prerequisites

- Convergence Data Pipeline running (locally or deployed)
- API endpoint URL (e.g., `http://localhost:8080` for local)
- `curl` installed (or any HTTP client)
- GCP project with BigQuery enabled
- Valid GCP service account credentials (for the application)

## Quick Start

### 1. Initialize the System (One-Time Setup)

Initialize BigQuery metadata tables before onboarding customers:

```bash
# Set your GCP project ID
export GCP_PROJECT_ID="your-gcp-project-id"

# Initialize metadata tables
python scripts/init_metadata_tables.py

# Expected output:
# ✓ BigQuery client initialized
# Created/verified metadata dataset: your-gcp-project-id.metadata
# Created/verified table: your-gcp-project-id.metadata.api_keys
# Created/verified table: your-gcp-project-id.metadata.pipeline_runs
# Created/verified table: your-gcp-project-id.metadata.dq_results
```

### 2. Create Your First Tenant

Create the tenant directory structure and credentials:

```bash
# Set tenant ID (alphanumeric + underscores, 3-50 chars)
export TENANT_ID="acme_corp_001"

# Create directory structure
mkdir -p configs/${TENANT_ID}/{secrets,schemas,sources,pipelines}

# Create a test secret file (example: OpenAI API key)
echo "sk-test-openai-key-12345" > configs/${TENANT_ID}/secrets/openai_api_key.txt
chmod 600 configs/${TENANT_ID}/secrets/openai_api_key.txt
```

### 3. Generate an API Key

Insert an API key into the metadata table:

```bash
# Generate API key hash (SHA256)
API_KEY="acme_corp_001_api_test12345"
API_KEY_HASH=$(echo -n "${API_KEY}" | sha256sum | cut -d' ' -f1)

# Insert into BigQuery
bq query --use_legacy_sql=false \
  "INSERT INTO \`${GCP_PROJECT_ID}.metadata.api_keys\`
   (api_key_hash, tenant_id, created_at, created_by, is_active, description)
   VALUES(
     '${API_KEY_HASH}',
     '${TENANT_ID}',
     CURRENT_TIMESTAMP(),
     'admin@company.com',
     TRUE,
     'Initial API key for ${TENANT_ID}'
   )"

echo "API Key: ${API_KEY}"
```

**IMPORTANT**: Save the API key immediately! You cannot retrieve it later.

### 4. Create BigQuery Datasets

Create tenant-specific BigQuery datasets:

```bash
# Create main tenant dataset
bq mk --project_id=${GCP_PROJECT_ID} \
  --description="Data for ${TENANT_ID}" \
  --location=US \
  ${TENANT_ID}

# Create a sample table for raw data
bq mk --project_id=${GCP_PROJECT_ID} \
  --table \
  --time_partitioning_field ingestion_date \
  --clustering_fields tenant_id,pipeline_id \
  ${TENANT_ID}.raw_data \
  << EOF
tenant_id:STRING,
pipeline_id:STRING,
data:JSON,
ingestion_date:DATE,
created_at:TIMESTAMP
EOF

echo "Datasets created for ${TENANT_ID}"
```

## API Workflows

### Health Check

Verify the API is running:

```bash
curl -X GET "http://localhost:8080/health"

# Response:
# {"status":"ok","timestamp":"2025-11-15T10:30:45Z"}
```

### List Pipeline Runs

Get execution history for a tenant:

```bash
API_KEY="acme_corp_001_api_test12345"

curl -X GET "http://localhost:8080/api/v1/pipelines/runs" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json"

# Response:
# {
#   "runs": [
#     {
#       "run_id": "uuid-1234",
#       "pipeline_id": "acme_corp_001-gcp-cost-export",
#       "status": "SUCCESS",
#       "started_at": "2025-11-15T09:00:00Z",
#       "completed_at": "2025-11-15T09:15:30Z",
#       "duration_ms": 930000
#     }
#   ],
#   "total": 1
# }
```

### Get Run Details

Check the status and logs of a specific pipeline run:

```bash
API_KEY="acme_corp_001_api_test12345"
RUN_ID="uuid-1234"

curl -X GET "http://localhost:8080/api/v1/pipelines/runs/${RUN_ID}" \
  -H "X-API-Key: ${API_KEY}"

# Response includes:
# {
#   "run_id": "uuid-1234",
#   "pipeline_id": "acme_corp_001-gcp-cost-export",
#   "status": "SUCCESS",
#   "steps": [
#     {"step_number": 1, "step_type": "ingest", "status": "SUCCESS", "duration_ms": 5000},
#     {"step_number": 2, "step_type": "dq", "status": "SUCCESS", "duration_ms": 2000},
#     {"step_number": 3, "step_type": "transform", "status": "SUCCESS", "duration_ms": 1500}
#   ],
#   "metrics": {
#     "rows_ingested": 15000,
#     "rows_transformed": 14950,
#     "quality_passed": true
#   }
# }
```

### Run a Pipeline

Trigger a pipeline execution:

```bash
API_KEY="acme_corp_001_api_test12345"

curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/acme_corp_001/gcp/cost/export" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "date_range": "last_7_days",
      "exclude_non_billable": true
    }
  }'

# Response:
# {
#   "run_id": "uuid-5678",
#   "pipeline_id": "acme_corp_001-gcp-cost-export",
#   "status": "QUEUED",
#   "message": "Pipeline execution queued"
# }
```

### Cancel a Pipeline Run

Stop an in-progress execution:

```bash
API_KEY="acme_corp_001_api_test12345"
RUN_ID="uuid-5678"

curl -X DELETE \
  "http://localhost:8080/api/v1/pipelines/runs/${RUN_ID}" \
  -H "X-API-Key: ${API_KEY}"

# Response:
# {
#   "run_id": "uuid-5678",
#   "status": "CANCELLED",
#   "message": "Pipeline run cancelled"
# }
```

## Onboarding Multiple Customers

Use a script to onboard multiple tenants:

```bash
#!/bin/bash
# onboard-customers.sh

GCP_PROJECT_ID="your-project-id"

# List of customers
CUSTOMERS=(
  "acme_corp_001"
  "techcorp_002"
  "datasys_003"
  "cloudworks_004"
)

for TENANT_ID in "${CUSTOMERS[@]}"; do
  echo "Onboarding ${TENANT_ID}..."

  # Create directory structure
  mkdir -p configs/${TENANT_ID}/{secrets,schemas,sources,pipelines}

  # Create placeholder secrets
  echo "placeholder" > configs/${TENANT_ID}/secrets/placeholder.txt
  chmod 600 configs/${TENANT_ID}/secrets/placeholder.txt

  # Create BigQuery dataset
  bq mk --project_id=${GCP_PROJECT_ID} \
    --description="Data for ${TENANT_ID}" \
    --location=US \
    ${TENANT_ID} 2>/dev/null || true

  echo "✓ Onboarded ${TENANT_ID}"
done

echo "All customers onboarded!"
```

Run it:

```bash
chmod +x onboard-customers.sh
./onboard-customers.sh
```

## Verification

### Verify Datasets Created

```bash
bq ls --project_id=${GCP_PROJECT_ID} | grep acme_corp
```

### Check API Key

Query the metadata table:

```bash
bq query --use_legacy_sql=false \
  "SELECT tenant_id, created_at, is_active FROM \`${GCP_PROJECT_ID}.metadata.api_keys\`
   WHERE tenant_id = '${TENANT_ID}'"
```

### Monitor Pipeline Executions

Check what's running:

```bash
bq query --use_legacy_sql=false \
  "SELECT
     run_id,
     pipeline_id,
     status,
     created_at,
     updated_at
   FROM \`${GCP_PROJECT_ID}.metadata.pipeline_runs\`
   WHERE tenant_id = '${TENANT_ID}'
   ORDER BY created_at DESC
   LIMIT 10"
```

## Current Architecture

The Convergence Data Pipeline follows a **single-dataset-per-tenant** model:

```
BigQuery Project (gac-prod-471220)
├── metadata/
│   ├── api_keys         - Tenant API keys (SHA256 hashed)
│   ├── pipeline_runs    - Execution history
│   ├── step_logs        - Detailed step execution logs
│   └── dq_results       - Data quality results
│
├── acme_corp_001/       - Tenant dataset
│   ├── raw_data         - Raw ingested data
│   ├── transformed_data - Processed data
│   └── metrics          - KPI tables
│
└── techcorp_002/        - Another tenant dataset
    ├── raw_data
    ├── transformed_data
    └── metrics
```

**Key Design Principles**:
- **Tenant Isolation**: Each tenant has a dedicated BigQuery dataset
- **Shared Metadata**: All tenants use the same `metadata` dataset for API keys and audit trails
- **Scalability**: BigQuery handles petabyte-scale data natively
- **Security**: API keys are SHA256 hashed; sensitive data encrypted at rest

For more details, see IMPLEMENTATION_STATUS.md.

## Troubleshooting

### Issue: Authentication Failed

**Error**: `HTTP 401 Unauthorized`

**Cause**: Missing or invalid API key

**Solution**:
```bash
# Verify API key is in the request header
curl -X GET "http://localhost:8080/api/v1/pipelines/runs" \
  -H "X-API-Key: YOUR_API_KEY_HERE"

# Check the API key exists in BigQuery
bq query "SELECT * FROM \`${GCP_PROJECT_ID}.metadata.api_keys\` LIMIT 5"
```

### Issue: Tenant Not Found

**Error**: `HTTP 404 Tenant not found`

**Cause**: Tenant doesn't exist in BigQuery or dataset is missing

**Solution**:
```bash
# Verify tenant dataset exists
bq ls --project_id=${GCP_PROJECT_ID} | grep ${TENANT_ID}

# Create the dataset if missing
bq mk --project_id=${GCP_PROJECT_ID} \
  --description="Data for ${TENANT_ID}" \
  --location=US \
  ${TENANT_ID}
```

### Issue: Permission Denied

**Error**: `HTTP 403 Permission denied`

**Cause**: GCP service account lacks required permissions

**Solution**:

Ensure the service account has these roles:
- `roles/bigquery.dataEditor` - Create and modify datasets/tables
- `roles/bigquery.jobUser` - Run queries
- `roles/cloudkms.cryptoKeyEncrypterDecrypter` - Encrypt/decrypt secrets (optional)

Grant permissions:
```bash
# Replace PROJECT_ID and SERVICE_ACCOUNT_EMAIL
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:SERVICE_ACCOUNT_EMAIL \
  --role=roles/bigquery.dataEditor
```

### Issue: Pipeline Execution Failed

**Error**: `HTTP 500 Internal server error`

**Cause**: Pipeline execution failed in a worker

**Solution**:

1. Get the run ID from the response
2. Check the step logs:

```bash
RUN_ID="uuid-from-error"

bq query --use_legacy_sql=false \
  "SELECT
     step_number,
     step_type,
     status,
     error_message,
     created_at
   FROM \`${GCP_PROJECT_ID}.metadata.step_logs\`
   WHERE run_id = '${RUN_ID}'
   ORDER BY step_number"
```

3. Check application logs (if running locally):

```bash
# Check application logs
tail -f /var/log/convergence/app.log

# Look for the run_id in logs
grep ${RUN_ID} /var/log/convergence/app.log
```

### Issue: Slow API Responses

**Symptom**: API endpoints responding slowly (> 5 seconds)

**Solution**:

1. Check BigQuery query performance:

```bash
# Check if queries are running
bq ls -j --max_results=10

# Check a specific job
bq show -j JOB_ID
```

2. Verify network connectivity:

```bash
# Test BigQuery connectivity
bq query "SELECT 1 as test" --use_legacy_sql=false
```

3. Check application metrics:

```bash
# If using OpenTelemetry/Cloud Trace
gcloud trace list --limit=10
```

## Next Steps

1. **Create Pipeline Configurations**: Define pipelines in `configs/{tenant_id}/pipelines/`
2. **Set Up Data Sources**: Configure source connectors in `configs/{tenant_id}/sources/`
3. **Add Data Quality Rules**: Define validation rules in `configs/{tenant_id}/dq_rules/`
4. **Run Your First Pipeline**: Use the API to trigger an execution
5. **Monitor and Iterate**: Check logs and metrics; adjust configurations as needed

## Reference

- **QUICK_START.md** - Getting the application running
- **IMPLEMENTATION_STATUS.md** - Architecture and implementation details
- **pipeline-configuration.md** - How to define pipelines
- **metadata-schema.md** - BigQuery table schemas
- **ENVIRONMENT_VARIABLES.md** - Configuration options

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review application logs in the `metadata.step_logs` table
3. Check metadata.pipeline_runs for execution history
4. Contact the platform team with run IDs and timestamps

---

**Last Updated**: November 2025
**Version**: 2.0
**Status**: Production Ready
