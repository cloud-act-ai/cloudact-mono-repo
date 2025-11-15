# Architecture Redesign - Single Dataset Per Tenant

## Overview
Redesigning from multi-dataset-per-tenant to single-dataset-per-tenant architecture with templated pipelines.

## Key Changes

### 1. Dataset Architecture
**OLD**: Multiple datasets per tenant
- `{tenant_id}_metadata`
- `{tenant_id}_raw_gcp`
- `{tenant_id}_raw_openai`
- `{tenant_id}_silver_cost`

**NEW**: Single dataset per tenant
- `{tenant_id}` (e.g., `acmeinc_23xv2`)
  - Contains ALL tables: metadata, pipeline data, credentials

### 2. Pipeline Naming Convention
**OLD**: Static pipeline names in YAML
- `pipeline_id: gcp_billing_export`

**NEW**: Dynamic pipeline names from template
- Pattern: `{tenant_id}-{provider}-{domain}-{template_name}`
- Example: `acmeinc_23xv2-gcp-cost-bill-sample-export-template`

### 3. Config Directory Structure
```
configs/
├── gcp/
│   ├── cost/
│   │   └── bill-sample-export-template.yml    # Template for all tenants
│   └── example/
│       └── dryrun.yml                          # Onboarding test pipeline
└── customer/
    └── onboarding-template.yml                 # Customer onboarding config
```

### 4. API Endpoints

#### Customer Onboarding
```bash
POST /api/v1/customers/onboard
{
  "tenant_id": "acmeinc_23xv2"
}

Response:
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_abc123def456",
  "dataset_created": true,
  "tables_created": ["pipeline_runs", "step_logs", "dq_results", "api_keys", "cloud_credentials"],
  "dryrun_status": "SUCCESS"
}
```

#### Pipeline Execution
```bash
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}
Headers: X-API-Key: {api_key}

# Example:
POST /api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/bill-sample-export-template
Headers: X-API-Key: acmeinc_23xv2_api_abc123def456
{
  "trigger_by": "user@example.com",
  "date": "2025-11-15"
}
```

### 5. Credential Storage (Encrypted in BigQuery)

#### Table: `{tenant_id}.api_keys`
```sql
CREATE TABLE {tenant_id}.api_keys (
  api_key_id STRING NOT NULL,
  api_key_hash STRING NOT NULL,      -- SHA256 for lookup
  encrypted_api_key BYTES NOT NULL,  -- KMS encrypted
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
)
```

#### Table: `{tenant_id}.cloud_credentials`
```sql
CREATE TABLE {tenant_id}.cloud_credentials (
  credential_id STRING NOT NULL,
  provider STRING NOT NULL,          -- 'gcp', 'openai', 'anthropic', 'aws'
  credential_type STRING NOT NULL,   -- 'service_account', 'api_key'
  encrypted_value BYTES NOT NULL,    -- KMS encrypted JSON
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
)
```

### 6. Template Variables
Templates support these placeholders:
- `{tenant_id}` - Tenant identifier
- `{provider}` - Cloud provider (gcp, aws, openai, anthropic)
- `{domain}` - Service domain (cost, usage, billing)
- `{template_name}` - Template filename without extension
- `{pipeline_id}` - Auto-generated: `{tenant_id}-{provider}-{domain}-{template_name}`

## Implementation Tasks

### Phase 1: Core Infrastructure
1. Create KMS encryption/decryption utilities
2. Update config templates
3. Modify metadata initializer for single-dataset

### Phase 2: API Layer
4. Create customer onboarding endpoint
5. Update pipeline execution endpoint
6. Update authentication to use encrypted API keys

### Phase 3: Testing
7. Test onboarding with 2 customers
8. Test pipeline execution with API keys
9. Verify encryption/decryption

## Migration Path
- No backward compatibility
- Delete old multi-dataset configs
- Use common templates for all tenants
