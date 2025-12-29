---
name: bootstrap-onboard
description: |
  System bootstrap and organization onboarding for CloudAct. Initialize meta tables, create orgs, setup datasets.
  Use when: initializing a new CloudAct deployment, onboarding new organizations, understanding the bootstrap process,
  or debugging onboarding issues.
---

# Bootstrap & Onboarding

## Overview
CloudAct uses a two-phase initialization: system bootstrap (14 meta tables) and org onboarding (6 org tables).

## Key Locations
- **Bootstrap Schemas:** `02-api-service/configs/setup/bootstrap/schemas/*.json`
- **Onboarding Schemas:** `02-api-service/configs/setup/organizations/onboarding/schemas/*.json`
- **Bootstrap Router:** `02-api-service/src/app/routers/admin.py`
- **Org Router:** `02-api-service/src/app/routers/organizations.py`

## API Key Hierarchy
```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization
    │
    └── Creates → Org API Keys (per-organization)
                    ├── Integrations
                    ├── Pipelines
                    └── Data Access
```

## Phase 1: System Bootstrap

### 14 Meta Tables (organizations dataset)
| # | Table | Purpose |
|---|-------|---------|
| 1 | profiles | User profiles and settings |
| 2 | api_keys | API key management |
| 3 | subscription_plans | SaaS plan registry |
| 4 | quotas | Usage quotas per org |
| 5 | integration_credentials | Encrypted provider creds |
| 6 | pipeline_runs | Pipeline execution history |
| 7 | dq_results | Data quality results |
| 8 | audit_logs | Audit trail |
| 9 | pipeline_configs | Pipeline definitions |
| 10 | scheduled_runs | Scheduled job configs |
| 11 | execution_queue | Job queue |
| 12 | cost_tracking | Cost metrics |
| 13 | state_transitions | Workflow states |
| 14 | idempotency_keys | Dedup keys |

### Bootstrap API
```bash
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: {CA_ROOT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "force": false,
    "skip_existing": true
  }'
```

### Bootstrap Response
```json
{
  "status": "success",
  "tables_created": 14,
  "dataset": "organizations",
  "details": [
    {"table": "profiles", "status": "created"},
    {"table": "api_keys", "status": "created"},
    ...
  ]
}
```

## Phase 2: Organization Onboarding

### 6 Org-Specific Tables ({org_slug}_prod dataset)
| # | Table | Purpose |
|---|-------|---------|
| 1 | cost_data_standard_1_3 | FOCUS 1.3 cost data |
| 2 | contract_commitment_1_3 | Contract commitments |
| 3 | saas_subscription_plans | SaaS subscriptions |
| 4 | saas_subscription_plan_costs_daily | Daily costs |
| 5 | org_hierarchy | Org structure |
| 6 | llm_model_pricing | LLM pricing data |

### Onboarding API
```bash
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: {CA_ROOT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "acme_corp",
    "org_name": "Acme Corporation",
    "currency": "USD",
    "timezone": "America/New_York",
    "fiscal_year_start": 1,
    "admin_email": "admin@acme.com"
  }'
```

### Onboarding Response
```json
{
  "status": "success",
  "org_slug": "acme_corp",
  "dataset": "acme_corp_prod",
  "api_key": "ca_org_...",
  "tables_created": 6,
  "profile_created": true
}
```

## Environments

| Environment | GCP Project | API Service |
|-------------|-------------|-------------|
| Local | `cloudact-testing-1` | `http://localhost:8000` |
| Test | `cloudact-testing-1` | Cloud Run URL |
| Stage | `cloudact-stage` | Cloud Run URL |
| Prod | `cloudact-prod` | Cloud Run URL or `https://api.cloudact.ai` |

> **Note:** Get actual Cloud Run URLs via: `gcloud run services describe cloudact-api-service-{env} --region=us-central1 --format="value(status.url)"`

## Instructions

### 1. Initialize New Deployment
```bash
# Step 1: Set environment
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export GOOGLE_CLOUD_PROJECT="cloudact-testing-1"  # or cloudact-stage/cloudact-prod

# Step 2: Start API service (local)
cd 02-api-service
python3 -m uvicorn src.app.main:app --port 8000

# Step 3: Run bootstrap
# Local
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Production (via custom domain)
curl -X POST "https://api.cloudact.ai/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

### 2. Onboard New Organization
```bash
# Create organization
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "new_org",
    "org_name": "New Organization",
    "currency": "USD"
  }'
```

### 3. Verify Bootstrap
```bash
# Check dataset exists
bq ls organizations

# Check tables exist
bq ls organizations | grep -E "(profiles|api_keys|...)"
```

### 4. Verify Org Onboarding
```bash
# Check org dataset
bq ls {org_slug}_prod

# Check org tables
bq show {org_slug}_prod.cost_data_standard_1_3
```

### 5. Debug Failed Bootstrap
1. Check BigQuery permissions
2. Verify CA_ROOT_API_KEY is set
3. Check schema JSON files exist
4. Review API logs for errors

## Org Slug Validation
```
Pattern: ^[a-zA-Z0-9_]{3,50}$
- 3-50 characters
- Letters, numbers, underscores only
- No hyphens, spaces, or special chars
```

## Configuration Files
```
02-api-service/configs/setup/
├── bootstrap/
│   └── schemas/
│       ├── profiles.json
│       ├── api_keys.json
│       ├── subscription_plans.json
│       └── ... (14 files)
└── organizations/
    └── onboarding/
        └── schemas/
            ├── cost_data_standard_1_3.json
            ├── contract_commitment_1_3.json
            ├── saas_subscription_plans.json
            ├── saas_subscription_plan_costs_daily.json
            ├── org_hierarchy.json
            └── llm_model_pricing.json
```

## Validation Checklist
- [ ] CA_ROOT_API_KEY is secure (min 32 chars)
- [ ] BigQuery project configured
- [ ] Service account has BigQuery Admin role
- [ ] All 14 schema files present
- [ ] All 6 onboarding schemas present
- [ ] Org slug follows naming pattern

## Common Issues
| Issue | Solution |
|-------|----------|
| Auth error | Check X-CA-Root-Key header |
| Permission denied | Verify BigQuery IAM roles |
| Dataset exists | Use force=true to recreate |
| Schema error | Validate JSON syntax |

## Example Prompts

```
# Bootstrap
"Initialize a new CloudAct deployment"
"Run bootstrap to create meta tables"
"What tables does bootstrap create?"

# Onboarding
"Onboard a new organization called acme_eu"
"Create org with EUR currency"
"Setup org with India fiscal year"

# Verification
"Verify bootstrap completed successfully"
"Check if all 14 meta tables exist"
"Confirm org dataset was created"

# Troubleshooting
"Bootstrap failed with permission error"
"Org onboarding stuck at table creation"

# Understanding
"What's the difference between bootstrap and onboarding?"
"Which tables are org-specific vs shared?"
```

## Related Skills
- `bigquery-ops` - BigQuery operations
- `security-audit` - Security verification
- `integration-setup` - Post-onboarding setup
