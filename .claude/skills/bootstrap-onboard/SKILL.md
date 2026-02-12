---
name: bootstrap-onboard
description: |
  System bootstrap and organization onboarding for CloudAct. Initialize meta tables, create orgs, setup datasets.
  Use when: initializing a new CloudAct deployment, onboarding new organizations, syncing schema changes,
  re-bootstrapping after dataset deletion, or debugging onboarding issues.
---

# Bootstrap & Onboarding

## Overview

CloudAct uses a two-phase initialization: system bootstrap (20 meta tables) and org onboarding (20+ org tables + 4 materialized views).

**Key Principle: Only ADD, never DELETE. Incremental schema evolution without data loss.**

## Quick Commands

```bash
# Check bootstrap status
curl GET /api/v1/admin/bootstrap/status -H "X-CA-Root-Key: $KEY"

# Check org status
curl GET /api/v1/organizations/{org}/status -H "X-CA-Root-Key: $KEY"

# Sync missing tables/columns (non-destructive)
curl POST /api/v1/admin/bootstrap/sync -d '{"sync_missing_tables":true,"sync_missing_columns":true}'
curl POST /api/v1/organizations/{org}/sync -d '{"sync_missing_tables":true,"sync_missing_columns":true}'
```

## Key Locations

- **Bootstrap Schemas:** `02-api-service/configs/setup/bootstrap/schemas/*.json`
- **Bootstrap Config:** `02-api-service/configs/setup/bootstrap/config.yml`
- **Onboarding Schemas:** `02-api-service/configs/setup/organizations/onboarding/schemas/*.json`
- **Bootstrap Router:** `02-api-service/src/app/routers/admin.py`
- **Org Router:** `02-api-service/src/app/routers/organizations.py`
- **Documentation:** `02-api-service/docs/BOOTSTRAP_ONBOARDING.md`

## API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (20 tables)
    │
    ├── Bootstrap Status/Sync: GET/POST /api/v1/admin/bootstrap/status|sync
    │   └── Check sync status, add missing tables/columns
    │
    └── Creates → Org API Keys (per-organization)
                    ├── Integrations
                    ├── Pipelines
                    └── Data Access
```

## Phase 1: System Bootstrap

### 20 Meta Tables (organizations dataset)

| # | Table | Purpose |
|---|-------|---------|
| 1 | org_profiles | Organization metadata + i18n |
| 2 | org_api_keys | API key hashes (KMS encrypted) |
| 3 | org_subscriptions | Subscription plans and limits |
| 4 | org_usage_quotas | Daily/monthly usage tracking |
| 5 | org_integration_credentials | Encrypted provider creds |
| 6 | org_pipeline_configs | Pipeline configurations |
| 7 | org_scheduled_pipeline_runs | Scheduled job definitions |
| 8 | org_pipeline_execution_queue | Execution queue |
| 9 | org_meta_pipeline_runs | Pipeline execution logs |
| 10 | org_meta_step_logs | Step-level execution logs |
| 11 | org_meta_state_transitions | State change history |
| 12 | org_meta_dq_results | Data quality results |
| 13 | org_audit_logs | Audit trail (SOC2/HIPAA) |
| 14 | org_cost_tracking | Usage metering for billing |
| 15 | org_idempotency_keys | Duplicate request prevention |
| 16 | org_notification_channels | Email/Slack/Webhook config |
| 17 | org_notification_rules | Alert rule definitions |
| 18 | org_notification_summaries | Scheduled digest config |
| 19 | org_notification_history | Notification delivery log |
| 20 | org_hierarchy | Dept/Project/Team for cost allocation |

### Bootstrap Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/bootstrap` | POST | Initial bootstrap (one-time) |
| `/api/v1/admin/bootstrap/status` | GET | Check sync status |
| `/api/v1/admin/bootstrap/sync` | POST | Non-destructive sync |

### Bootstrap API

```bash
# Initial bootstrap (one-time)
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Check status
curl -X GET "http://localhost:8000/api/v1/admin/bootstrap/status" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Sync missing tables/columns
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sync_missing_tables": true, "sync_missing_columns": true}'
```

## Phase 2: Organization Onboarding

### Org-Specific Tables ({org_slug}_prod dataset)

| Category | Tables |
|----------|--------|
| SaaS | `subscription_plans`, `subscription_plan_costs_daily` |
| FOCUS 1.3 | `cost_data_standard_1_3`, `contract_commitment_1_3` |
| GenAI PAYG | `genai_payg_pricing`, `genai_payg_usage_raw`, `genai_payg_costs_daily` |
| GenAI Commitment | `genai_commitment_pricing`, `genai_commitment_usage_raw`, `genai_commitment_costs_daily` |
| GenAI Infra | `genai_infrastructure_pricing`, `genai_infrastructure_usage_raw`, `genai_infrastructure_costs_daily` |
| GenAI Unified | `genai_usage_daily_unified`, `genai_costs_daily_unified` |
| Cloud Billing | `cloud_gcp_billing_raw_daily`, `cloud_aws_billing_raw_daily`, `cloud_azure_billing_raw_daily`, `cloud_oci_billing_raw_daily` |

### Org-Specific Materialized Views

| View | Source | Purpose |
|------|--------|---------|
| `x_pipeline_exec_logs` | `org_meta_pipeline_runs` | Pre-filtered pipeline logs |
| `x_all_notifications` | `org_notification_history` | Consolidated notification history |
| `x_notification_stats` | `org_notification_history` | Pre-computed notification stats |
| `x_org_hierarchy` | `organizations.org_hierarchy` | **Org-filtered hierarchy for fast reads** |

**x_org_hierarchy Architecture:**
```
WRITES → organizations.org_hierarchy (central table)
READS  → {org_slug}_prod.x_org_hierarchy (per-org view, pre-filtered)
```
- Auto-refreshed every 15 minutes
- Fallback to central table if view doesn't exist
- Throws error if both view and central table fail (no silent failures)

### Organization Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/organizations/dryrun` | POST | Validate before onboarding |
| `/api/v1/organizations/onboard` | POST | Create organization |
| `/api/v1/organizations/{org}/status` | GET | Check dataset sync status |
| `/api/v1/organizations/{org}/sync` | POST | Non-destructive sync |

### Onboarding API

```bash
# Dry-run validation
curl -X POST "http://localhost:8000/api/v1/organizations/dryrun" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "acme_corp",
    "company_name": "Acme Corporation",
    "admin_email": "admin@acme.com",
    "subscription_plan": "STARTER"
  }'

# Onboard organization
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "acme_corp",
    "company_name": "Acme Corporation",
    "admin_email": "admin@acme.com",
    "subscription_plan": "STARTER",
    "default_currency": "USD",
    "default_timezone": "America/New_York"
  }'

# Check org status
curl -X GET "http://localhost:8000/api/v1/organizations/acme_corp/status" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Sync org dataset (recreate if deleted)
curl -X POST "http://localhost:8000/api/v1/organizations/acme_corp/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sync_missing_tables": true, "sync_missing_columns": true, "recreate_views": true}'
```

## Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `SYNCED` | All tables/columns match config | None needed |
| `OUT_OF_SYNC` + `missing_columns` | New columns in config | Run `/sync` |
| `OUT_OF_SYNC` + `extra_columns` | Old columns in BigQuery | **Ignore** - harmless |
| `NOT_BOOTSTRAPPED` | Central dataset missing | Run `/bootstrap` |
| `PROFILE_ONLY` | Org dataset deleted | Run `/organizations/{org}/sync` |
| `NOT_FOUND` | Organization doesn't exist | Run `/organizations/onboard` |

## Incremental Schema Evolution

### Adding a New Column

1. Edit schema JSON: `configs/setup/bootstrap/schemas/{table}.json`
2. Check status: `GET /admin/bootstrap/status`
3. Sync: `POST /admin/bootstrap/sync {"sync_missing_columns": true}`

### Adding a New Table

1. Create schema JSON file
2. Add entry to `config.yml`
3. Sync: `POST /admin/bootstrap/sync {"sync_missing_tables": true}`

### Removing a Column

1. Remove from schema JSON
2. Column stays in BigQuery as "extra" (harmless)
3. No action needed

**NEVER use `force_recreate_*` flags - they delete all data.**

## Re-bootstrapping Scenarios

### Org Dataset Deleted

```bash
# Check status - returns PROFILE_ONLY
curl GET /api/v1/organizations/acme_corp/status

# Recreate dataset and all tables
curl POST /api/v1/organizations/acme_corp/sync \
  -d '{"sync_missing_tables": true, "recreate_views": true}'
```

### Schema Changes After Deployment

```bash
# Check what changed
curl GET /api/v1/admin/bootstrap/status

# Apply changes
curl POST /api/v1/admin/bootstrap/sync \
  -d '{"sync_missing_tables": true, "sync_missing_columns": true}'
```

## Environments

| Environment | GCP Project | API Service |
|-------------|-------------|-------------|
| Local | `cloudact-testing-1` | `http://localhost:8000` |
| Test | `cloudact-testing-1` | Cloud Run URL |
| Stage | `cloudact-stage` | Cloud Run URL |
| Prod | `cloudact-prod` | `https://api.cloudact.ai` |

## Instructions

### 1. Initialize New Deployment

```bash
# Set environment
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"

# Start API service
cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000

# Run bootstrap
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

### 2. Onboard New Organization

```bash
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "new_org",
    "company_name": "New Organization",
    "admin_email": "admin@neworg.com",
    "subscription_plan": "STARTER",
    "default_currency": "USD"
  }'
```

### 3. Verify Status

```bash
# Bootstrap status
curl GET /api/v1/admin/bootstrap/status -H "X-CA-Root-Key: $KEY"

# Org status
curl GET /api/v1/organizations/{org}/status -H "X-CA-Root-Key: $KEY"
```

### 4. Apply Schema Changes

```bash
# After modifying schema JSON files
curl POST /api/v1/admin/bootstrap/sync \
  -H "X-CA-Root-Key: $KEY" \
  -d '{"sync_missing_tables": true, "sync_missing_columns": true}'
```

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
│   ├── config.yml          # Table configs (partitioning, clustering)
│   └── schemas/             # 20 schema JSON files
│       ├── org_profiles.json
│       ├── org_api_keys.json
│       ├── org_hierarchy.json
│       └── ... (17 more)
└── organizations/
    └── onboarding/
        ├── config.yml
        └── schemas/         # 20+ schema JSON files
            ├── cost_data_standard_1_3.json
            ├── genai_payg_pricing.json
            └── ... (18 more)
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Auth error | Check X-CA-Root-Key header |
| Permission denied | Verify BigQuery IAM roles |
| Dataset exists | Already bootstrapped - check status |
| OUT_OF_SYNC | Run `/sync` to add missing tables/columns |
| PROFILE_ONLY | Org dataset deleted - run `/organizations/{org}/sync` |
| extra_columns | Normal - old columns in BQ, ignore |

## Example Prompts

```
# Bootstrap
"Initialize a new CloudAct deployment"
"Check bootstrap sync status"
"Sync bootstrap tables after schema change"

# Onboarding
"Onboard a new organization called acme_eu"
"Create org with EUR currency"
"Setup org with India fiscal year (April start)"

# Status & Sync
"Check if org dataset is in sync"
"Org dataset was deleted, how to recreate?"
"Added new column to schema, how to apply?"

# Troubleshooting
"Bootstrap shows OUT_OF_SYNC"
"Org status shows PROFILE_ONLY"
"What are extra_columns in status?"
```

## Source Specifications

Requirements consolidated from:
- `01_ORGANIZATION_ONBOARDING.md` (v1.8, 2026-02-08)
- `cloudactinc_customer_onboarding.md` (2026-02-05)

## Related Skills

- `bigquery-ops` - BigQuery operations
- `security-audit` - Security verification
- `integration-setup` - Post-onboarding setup
- `hierarchy-ops` - Org hierarchy management
