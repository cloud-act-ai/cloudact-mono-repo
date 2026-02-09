# Organization Onboarding

**v1.8** | 2026-02-08

> Org creation → BigQuery dataset → API key

---

## Two-Phase Workflow

```
PHASE 1: Frontend (Supabase + Stripe)
1. Signup (email + password) → Supabase auth.users
2. Company info (name, currency, timezone)
3. Plan selection (Starter/Professional/Scale)
4. Stripe Checkout → Payment
5. Webhook → Supabase organizations table (source of truth for billing)
   org_slug: {company_name}_{base36_timestamp}
   billing_status, stripe_price_id, stripe_subscription_id stored here

PHASE 2: Backend (BigQuery)
POST /api/v1/organizations/onboard (X-CA-Root-Key)
├─ org_profiles (org metadata, includes fiscal_year_start_month)
├─ org_api_keys (SHA256 hashed + KMS encrypted)
├─ org_subscriptions (plan limits — read from Supabase)
└─ {org_slug}_prod dataset (30+ tables for all org cost data)
```

**Note:** No billing sync to BigQuery. API reads plan limits from Supabase directly.

---

## API Endpoints (Port 8000)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/organizations/dryrun` | X-CA-Root-Key | Validate before create |
| POST | `/organizations/onboard` | X-CA-Root-Key | Full onboarding |
| POST | `/organizations/{org}/api-key/rotate` | X-API-Key | Rotate API key |

---

## API Key Standard

- **Format:** `{org_slug}_api_{random_16_chars}` (e.g., `acme_corp_api_xK9mN2pL5qR8sT1v`)
- **Storage:** SHA256 hash in BigQuery, KMS encrypted for recovery
- **Display:** Shown ONCE during onboarding — cannot be retrieved again
- **Rotation:** Old key invalidated immediately on rotate

---

## Plan Limits

| Plan | Daily Pipelines | Monthly Pipelines | Concurrent | Providers | Seats | Price |
|------|-----------------|-------------------|------------|-----------|-------|-------|
| Starter | 6 | 180 | 20 | 3 | 2 | $19 |
| Professional | 25 | 750 | 20 | 6 | 6 | $69 |
| Scale | 100 | 3000 | 20 | 10 | 11 | $199 |

---

## Org Slug Standard

- **Pattern:** `{company_name}_{base36_timestamp}`
- **Validation:** `^[a-zA-Z0-9_]{3,50}$`
- **Rules:** Alphanumeric + underscores only, NO hyphens
- **Example:** `acme_inc_ml01ua8p` (auto-generated at signup)

---

## Central "organizations" Dataset (21 Tables)

The shared dataset holds cross-org metadata. Created during bootstrap.

| Table | Purpose |
|-------|---------|
| `org_profiles` | Org metadata (name, slug, currency, timezone, fiscal_year_start_month) |
| `org_api_keys` | API key hashes + KMS encrypted copies |
| `org_subscriptions` | Plan limits and subscription state |
| `org_usage_quotas` | Historical quota usage records |
| `org_integration_credentials` | Encrypted provider credentials |
| `org_hierarchy` | Hierarchy entities (central write store) |
| `org_audit_logs` | Audit trail for org operations |
| `org_meta_pipeline_runs` | Pipeline run metadata |
| `org_meta_step_logs` | Pipeline step-level logs |
| `org_meta_state_transitions` | Pipeline state machine transitions |
| `org_meta_dq_results` | Data quality check results |
| `org_pipeline_configs` | Pipeline configuration records |
| `org_pipeline_execution_queue` | Queued pipeline executions |
| `org_notification_channels` | Notification channel config (email, Slack, etc.) |
| `org_notification_rules` | Alert rules and thresholds |
| `org_notification_summaries` | Aggregated notification summaries |
| `org_notification_history` | Notification delivery history |
| `org_cost_tracking` | Internal cost tracking |
| `org_idempotency_keys` | Idempotency for retries |
| `org_scheduled_pipeline_runs` | Scheduled pipeline run configs |
| `org_scheduled_alerts` | Scheduled alert configs |
| `org_alert_history` | Alert trigger history |

---

## Per-Org Dataset ({org_slug}_prod) — 30+ Tables

Created during onboarding. Contains all cost and operational data for the org.

### Subscription Tables

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Provider subscription plans |
| `subscription_plan_costs_daily` | Daily subscription cost records |

### Unified Cost (FOCUS 1.3)

| Table | Purpose |
|-------|---------|
| `cost_data_standard_1_3` | FOCUS 1.3 unified cost data (all providers) |
| `contract_commitment_1_3` | Contract and commitment data (FOCUS 1.3) |

### GenAI Tables

| Table | Purpose |
|-------|---------|
| `genai_payg_pricing` | Pay-as-you-go pricing catalogs |
| `genai_payg_usage_raw` | Raw PAYG usage records |
| `genai_payg_costs_daily` | Calculated PAYG daily costs |
| `genai_commitment_pricing` | Commitment/reserved pricing |
| `genai_commitment_usage_raw` | Raw commitment usage records |
| `genai_commitment_costs_daily` | Calculated commitment daily costs |
| `genai_infrastructure_pricing` | Infrastructure (GPU/TPU) pricing |
| `genai_infrastructure_usage_raw` | Raw infrastructure usage records |
| `genai_infrastructure_costs_daily` | Calculated infrastructure daily costs |
| `genai_costs_daily_unified` | Unified GenAI costs (all pricing models) |
| `genai_usage_daily_unified` | Unified GenAI usage (all pricing models) |

### Cloud Billing Tables

| Table | Purpose |
|-------|---------|
| `cloud_gcp_billing_raw_daily` | GCP raw billing data |
| `cloud_aws_billing_raw_daily` | AWS raw billing data |
| `cloud_azure_billing_raw_daily` | Azure raw billing data |
| `cloud_oci_billing_raw_daily` | OCI raw billing data |

### Schema Management

| Table | Purpose |
|-------|---------|
| `schema_versions` | Tracks schema version per table for migrations |

### Materialized Views

| View | Purpose |
|------|---------|
| `x_pipeline_exec_logs` | Pipeline execution logs (joined runs + steps) |
| `x_all_notifications` | Unified notification view |
| `x_notification_stats` | Notification statistics aggregation |
| `x_org_hierarchy` | Hierarchy read view (refreshed every 15min) |

---

## Org Sync (Non-Destructive)

Org sync ensures per-org datasets stay up to date without data loss.

```
POST /api/v1/procedures/sync (Pipeline Service, port 8001)
├─ Adds missing tables (new tables from schema updates)
├─ Adds missing columns (new fields to existing tables)
├─ Recreates materialized views (always rebuilt fresh)
└─ NEVER deletes data or drops columns
```

**Scheduler:** `org-sync-all` Cloud Run Job loops through all active orgs.

---

## Fiscal Year Settings

The `org_profiles` table includes `fiscal_year_start_month` for fiscal calendar support.

| Value | Fiscal Year | Common Usage |
|-------|-------------|--------------|
| 1 (default) | Jan-Dec | US, most countries |
| 4 | Apr-Mar | India, UK, Japan |
| 7 | Jul-Jun | Australia, New Zealand |
| 10 | Oct-Sep | US Federal Government |

Used in cost rollup queries and dashboard date range defaults.

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/backend-onboarding.ts` | Frontend server action |
| `02-api-service/src/app/routers/organizations.py` | API endpoints |
| `02-api-service/src/core/services/onboarding/` | Onboarding service |
