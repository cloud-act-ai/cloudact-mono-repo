# Bootstrap & Onboarding System

Complete guide for system initialization, organization onboarding, and incremental schema evolution.

## Overview

The CloudAct platform uses a **two-dataset architecture**:

1. **Central `organizations` dataset** - Shared metadata (profiles, API keys, subscriptions, hierarchy)
2. **Per-org `{org_slug}_prod` datasets** - Organization-specific data (costs, usage) + materialized views

## Quick Reference

### Check System Status

```bash
# Bootstrap status (central dataset)
curl -X GET "http://localhost:8000/api/v1/admin/bootstrap/status" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Organization status
curl -X GET "http://localhost:8000/api/v1/organizations/{org_slug}/status" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

### Initial Setup

```bash
# 1. Bootstrap (one-time, creates 20 central tables)
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# 2. Onboard organization
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
```

### Sync (Add Missing Tables/Columns)

```bash
# Sync bootstrap tables
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sync_missing_tables": true, "sync_missing_columns": true}'

# Sync organization dataset
curl -X POST "http://localhost:8000/api/v1/organizations/{org_slug}/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sync_missing_tables": true, "sync_missing_columns": true, "recreate_views": true}'
```

---

## Endpoints Reference

### Bootstrap Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/bootstrap` | POST | Initial bootstrap (creates dataset + 20 tables) |
| `/api/v1/admin/bootstrap/status` | GET | Check sync status |
| `/api/v1/admin/bootstrap/sync` | POST | Non-destructive sync (add missing tables/columns) |

### Organization Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/organizations/dryrun` | POST | Validate before onboarding |
| `/api/v1/organizations/onboard` | POST | Create organization |
| `/api/v1/organizations/{org}/status` | GET | Check org dataset sync status |
| `/api/v1/organizations/{org}/sync` | POST | Non-destructive sync |

---

## Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `SYNCED` | All tables/columns present | None |
| `OUT_OF_SYNC` | Missing tables or columns | Run `/sync` |
| `NOT_BOOTSTRAPPED` | Central dataset missing | Run `/bootstrap` |
| `PROFILE_ONLY` | Org profile exists, dataset deleted | Run `/organizations/{org}/sync` |
| `NOT_FOUND` | Organization doesn't exist | Run `/organizations/onboard` |

---

## Incremental Schema Evolution

### Philosophy

**Only ADD, never DELETE. No data loss, ever.**

- New columns → Added via `ALTER TABLE ADD COLUMN`
- New tables → Created from schema JSON
- Removed columns → Stay in BigQuery as "extra" (harmless)
- No Alembic, no raw SQL, no migrations

### Workflow

1. **Add column to schema JSON**
   ```json
   // configs/setup/bootstrap/schemas/org_profiles.json
   {
     "name": "new_column",
     "type": "STRING",
     "mode": "NULLABLE",
     "description": "New column description"
   }
   ```

2. **Check status**
   ```bash
   curl GET /api/v1/admin/bootstrap/status
   # Returns: OUT_OF_SYNC with missing_columns: ["new_column"]
   ```

3. **Sync to apply**
   ```bash
   curl POST /api/v1/admin/bootstrap/sync \
     -d '{"sync_missing_tables": true, "sync_missing_columns": true}'
   # Returns: columns_added: {"org_profiles": ["new_column"]}
   ```

4. **Verify**
   ```bash
   curl GET /api/v1/admin/bootstrap/status
   # Returns: SYNCED
   ```

### Adding a New Table

1. **Create schema JSON**
   ```bash
   # configs/setup/bootstrap/schemas/new_table.json
   ```

2. **Add to config.yml**
   ```yaml
   # configs/setup/bootstrap/config.yml
   tables:
     new_table:
       description: "New table description"
       partition:
         type: "DAY"
         field: "created_at"
       clustering: ["org_slug"]
   ```

3. **Sync**
   ```bash
   curl POST /api/v1/admin/bootstrap/sync \
     -d '{"sync_missing_tables": true}'
   ```

---

## Bootstrap Tables (20)

| Table | Purpose |
|-------|---------|
| `org_profiles` | Organization metadata + i18n settings |
| `org_api_keys` | API key hashes (KMS encrypted) |
| `org_subscriptions` | Subscription plans and limits |
| `org_usage_quotas` | Daily/monthly usage tracking |
| `org_integration_credentials` | Provider credentials (encrypted) |
| `org_pipeline_configs` | Pipeline configurations |
| `org_scheduled_pipeline_runs` | Scheduled job definitions |
| `org_pipeline_execution_queue` | Execution queue |
| `org_meta_pipeline_runs` | Pipeline execution logs |
| `org_meta_step_logs` | Step-level execution logs |
| `org_meta_state_transitions` | State change history |
| `org_meta_dq_results` | Data quality results |
| `org_audit_logs` | Audit trail (SOC2/HIPAA) |
| `org_cost_tracking` | Usage metering for billing |
| `org_idempotency_keys` | Duplicate request prevention |
| `org_notification_channels` | Email/Slack/Webhook config |
| `org_notification_rules` | Alert rule definitions |
| `org_notification_summaries` | Scheduled digest config |
| `org_notification_history` | Notification delivery log |
| `org_hierarchy` | Dept → Project → Team structure for cost allocation |

---

## Organization Tables

Created per-org in `{org_slug}_prod` dataset:

| Table | Purpose |
|-------|---------|
| `subscription_plans` | SaaS subscription definitions |
| `subscription_plan_costs_daily` | Daily amortized costs |
| `cost_data_standard_1_3` | FOCUS 1.3 unified cost data |
| `contract_commitment_1_3` | Reserved capacity tracking |
| `genai_payg_*` | PAYG usage/pricing/costs |
| `genai_commitment_*` | PTU/GSU usage/pricing/costs |
| `genai_infrastructure_*` | GPU infrastructure costs |
| `genai_*_unified` | Consolidated GenAI data |
| `cloud_*_billing_raw_daily` | Cloud provider raw billing |

## Organization Materialized Views

Created per-org in `{org_slug}_prod` dataset during onboarding:

| View | Source | Purpose |
|------|--------|---------|
| `x_pipeline_exec_logs` | `org_meta_pipeline_runs` | Pre-filtered pipeline logs |
| `x_all_notifications` | `org_notification_history` | Consolidated notification history |
| `x_notification_stats` | `org_notification_history` | Pre-computed notification stats |
| `x_org_hierarchy` | `organizations.org_hierarchy` | **Org-filtered hierarchy for fast reads** |

### x_org_hierarchy View Architecture

```
WRITES → organizations.org_hierarchy (central table)
READS  → {org_slug}_prod.x_org_hierarchy (per-org view)
```

**Benefits:**
- Single source of truth in central dataset
- Per-org view for fast queries without org_slug filter
- Auto-refreshed every 15 minutes
- Clustered for fast hierarchy lookups
- Multi-tenancy isolation at view level

**Read Pattern:**
1. Try `x_org_hierarchy` view first (preferred)
2. Fall back to central table if view doesn't exist
3. Throw error if both fail (no silent failures)

---

## Re-bootstrapping Scenarios

### Scenario 1: Org Dataset Deleted

```bash
# Check status
curl GET /api/v1/organizations/acme_corp/status
# Returns: PROFILE_ONLY (dataset deleted but profile exists)

# Recreate dataset and all tables
curl POST /api/v1/organizations/acme_corp/sync \
  -d '{"sync_missing_tables": true, "recreate_views": true}'
```

### Scenario 2: New Columns Added to Schema

```bash
# Check status
curl GET /api/v1/admin/bootstrap/status
# Returns: OUT_OF_SYNC with missing_columns

# Add columns without data loss
curl POST /api/v1/admin/bootstrap/sync \
  -d '{"sync_missing_columns": true}'
```

### Scenario 3: Fresh Environment

```bash
# 1. Bootstrap central dataset
curl POST /api/v1/admin/bootstrap

# 2. Onboard each organization
curl POST /api/v1/organizations/onboard -d '{...}'
```

---

## Troubleshooting

### "Organizations dataset does not exist"

Run bootstrap first:
```bash
curl POST /api/v1/admin/bootstrap -H "X-CA-Root-Key: $KEY"
```

### "Organization already exists" (409)

Use `regenerate_api_key_if_exists: true` to resync:
```bash
curl POST /api/v1/organizations/onboard \
  -d '{"org_slug": "acme", ..., "regenerate_api_key_if_exists": true}'
```

### "extra_columns" in status

This is normal - columns exist in BigQuery but not in schema JSON.
They're harmless and don't need action.

### Schema sync not working

Ensure:
1. Schema JSON file exists in `configs/setup/*/schemas/`
2. For new tables, entry exists in `config.yml`
3. Column types are valid BigQuery types

---

## Best Practices

1. **Always check status first** before running sync
2. **Never use `force_recreate_*` flags** - they delete data
3. **Test schema changes** on dev/test orgs first
4. **Keep extra columns** - don't try to remove them
5. **Use sync endpoints** for all schema evolution
6. **Monitor for OUT_OF_SYNC** after deployments

---

*Last Updated: 2026-01-01*
