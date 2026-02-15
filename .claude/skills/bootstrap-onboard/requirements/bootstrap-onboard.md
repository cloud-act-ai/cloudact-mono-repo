# Bootstrap & Onboard - Requirements

## Overview

System bootstrap and organization onboarding for CloudAct. Covers two-phase onboarding (Frontend Supabase/Stripe + Backend BigQuery), the central `organizations` dataset (30 meta tables), per-org datasets (30+ tables), API key management, org sync, and fiscal year configuration.

## Source Specifications

- `01_ORGANIZATION_ONBOARDING.md` (v1.8, 2026-02-08)
- `cloudactinc_customer_onboarding.md` (2026-02-05)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Two-Phase Onboarding                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PHASE 1: Frontend (Supabase + Stripe)                               │
│  ────────────────────────────────────                                │
│  1. Signup (email + password) → Supabase auth.users                  │
│  2. Company info (name, currency, timezone)                          │
│  3. Plan selection (Starter/Professional/Scale)                      │
│  4. Stripe Checkout → Payment                                        │
│  5. Webhook → Supabase organizations table (source of truth)         │
│     org_slug: {company_name}_{base36_timestamp}                      │
│     billing_status, stripe_price_id, stripe_subscription_id stored   │
│                                                                      │
│  PHASE 2: Backend (BigQuery)                                         │
│  ───────────────────────────                                         │
│  POST /api/v1/organizations/onboard (X-CA-Root-Key)                  │
│  ├─ org_profiles (org metadata, fiscal_year_start_month)             │
│  ├─ org_api_keys (SHA256 hashed + KMS encrypted)                     │
│  ├─ org_subscriptions (plan limits — read from Supabase)             │
│  └─ {org_slug}_prod dataset (30+ tables for all org cost data)       │
│                                                                      │
│  Note: No billing sync to BigQuery.                                  │
│  API reads plan limits from Supabase directly.                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-BO-001: Onboarding Workflow

```
1. Login check → Try existing credentials first
2. Signup (if needed) → Email + Password + Company info + Plan selection
3. Stripe Checkout → Payment → Auto-provision (Supabase + BigQuery)
4. Configure fiscal year → Calendar year (Jan 1) default
5. Add subscriptions → SaaS subscriptions (e.g., ChatGPT Plus)
6. Invite team → Team members with roles
7. Verify → Dashboard, billing, team all functional
```

### FR-BO-002: Signup Flow

1. Navigate to `/signup`
2. Fill: email, password, phone, organization name
3. Settings: timezone, currency (`USD`), fiscal year start month
4. Select plan (Starter/Professional/Scale)
5. Complete Stripe Checkout
6. Auto-setup triggers: Supabase auth + Stripe subscription + BigQuery dataset + API key generation

### FR-BO-003: Auto-Provisioning

On successful Stripe checkout, the system automatically:
- Creates Supabase auth user
- Creates Stripe subscription record
- Provisions BigQuery dataset (`{org_slug}_prod`)
- Generates org API key (format: `{org_slug}_api_{random_16_chars}`)

### FR-BO-004: API Endpoints (Port 8000)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/organizations/dryrun` | X-CA-Root-Key | Validate before create |
| POST | `/organizations/onboard` | X-CA-Root-Key | Full onboarding |
| POST | `/organizations/{org}/api-key/rotate` | X-API-Key | Rotate API key |

### FR-BO-005: API Key Standard

| Aspect | Detail |
|--------|--------|
| Format | `{org_slug}_api_{random_16_chars}` (e.g., `acme_corp_api_xK9mN2pL5qR8sT1v`) |
| Storage | SHA256 hash in BigQuery, KMS encrypted for recovery |
| Display | Shown ONCE during onboarding — cannot be retrieved again |
| Rotation | Old key invalidated immediately on rotate |

### FR-BO-006: Org Slug Standard

| Aspect | Detail |
|--------|--------|
| Pattern | `{company_name}_{base36_timestamp}` |
| Validation | `^[a-zA-Z0-9_]{3,50}$` |
| Rules | Alphanumeric + underscores only, NO hyphens |
| Example | `acme_inc_ml01ua8p` (auto-generated at signup) |

### FR-BO-007: Fiscal Year Configuration

Settings → Organization → Fiscal Year. Default: January start (calendar year).

| Value | Fiscal Year | Common Usage |
|-------|-------------|--------------|
| 1 (default) | Jan-Dec | US, most countries |
| 4 | Apr-Mar | India, UK, Japan |
| 7 | Jul-Jun | Australia, New Zealand |
| 10 | Oct-Sep | US Federal Government |

Used in cost rollup queries and dashboard date range defaults. Stored in `org_profiles.fiscal_year_start_month`.

### FR-BO-008: Subscription Management

Add SaaS subscriptions with:
- Provider (e.g., OpenAI)
- Plan name (e.g., ChatGPT Plus)
- Monthly cost
- Billing frequency (monthly/annual)
- Start date
- Status (ongoing/ended)

### FR-BO-009: Team Invitation

Settings → Members → Invite with:
- Email address
- Role (Admin/Collaborator/Read-Only)
- 48-hour token expiry for invite links

### FR-BO-010: Plan Limits

| Plan | Daily Pipelines | Monthly Pipelines | Concurrent | Providers | Seats | Price |
|------|-----------------|-------------------|------------|-----------|-------|-------|
| Starter | 6 | 180 | 20 | 3 | 2 | $19 |
| Professional | 25 | 750 | 20 | 6 | 6 | $69 |
| Scale | 100 | 3000 | 20 | 10 | 11 | $199 |

---

## Data Structures

### Central "organizations" Dataset (27 Meta Tables)

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

Plus: `org_alert_history` (Alert trigger history)

### Per-Org Dataset ({org_slug}_prod) — 30+ Tables

Created during onboarding. Contains all cost and operational data for the org.

#### Subscription Tables

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Provider subscription plans |
| `subscription_plan_costs_daily` | Daily subscription cost records |

#### Unified Cost (FOCUS 1.3)

| Table | Purpose |
|-------|---------|
| `cost_data_standard_1_3` | FOCUS 1.3 unified cost data (all providers) |
| `contract_commitment_1_3` | Contract and commitment data (FOCUS 1.3) |

#### GenAI Tables

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

#### Cloud Billing Tables

| Table | Purpose |
|-------|---------|
| `cloud_gcp_billing_raw_daily` | GCP raw billing data |
| `cloud_aws_billing_raw_daily` | AWS raw billing data |
| `cloud_azure_billing_raw_daily` | Azure raw billing data |
| `cloud_oci_billing_raw_daily` | OCI raw billing data |

#### Schema Management

| Table | Purpose |
|-------|---------|
| `schema_versions` | Tracks schema version per table for migrations |

#### Materialized Views

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

## Cloud Run Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `bootstrap` | Manual | Initialize organizations dataset + 30 meta tables |
| `bootstrap-sync` | Manual | Add new columns to existing meta tables |
| `org-sync-all` | Manual | Sync ALL org datasets (loops through active orgs) |

---

## Non-Functional Requirements

### NFR-BO-001: Verification Checklist

After onboarding, all of the following must be verified:

| Check | Expected |
|-------|----------|
| Login works | Dashboard loads without errors |
| Org name | Correct organization name in header |
| Timezone | Configured timezone displayed |
| Currency | Configured currency (USD) |
| Stripe subscription | Selected plan active with correct price |
| SaaS subscriptions | Added subscriptions visible |
| Team invites | Sent to specified email addresses |

### NFR-BO-002: Environment URLs

| Environment | URL |
|-------------|-----|
| Production | https://cloudact.ai |
| API Docs | https://api.cloudact.ai/docs |
| Local | http://localhost:3000 |

---

## SDLC

### Development Workflow

1. **Schema change** — Edit JSON schema definitions in `02-api-service/configs/setup/` (meta tables) or `03-data-pipeline-service/configs/setup/` (per-org tables)
2. **Local test** — Start API service (`cd 02-api-service && uvicorn src.app.main:app --port 8000 --reload`) and run `curl -X POST http://localhost:8000/api/v1/admin/bootstrap/sync -H "X-CA-Root-Key: $CA_ROOT_API_KEY"` to verify schema sync
3. **Verify status** — `curl http://localhost:8000/api/v1/admin/bootstrap/status -H "X-CA-Root-Key: $CA_ROOT_API_KEY"` to confirm all tables created/updated
4. **Test onboarding** — Run full onboard flow: `curl -X POST http://localhost:8000/api/v1/organizations/onboard -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d '{"org_slug":"test_org_xxx"}'`
5. **PR** — Open pull request with schema changes
6. **Deploy API service** — Merge to main (auto-deploys to stage) or tag for prod
7. **Run Cloud Run Job** — `./run-job.sh stage bootstrap-sync` (stage) or `echo "yes" | ./run-job.sh prod bootstrap-sync` (prod)
8. **Run org-sync-all** — `./run-job.sh stage org-sync-all` to propagate schema to all existing org datasets
9. **Verify** — Check bootstrap status endpoint on deployed environment

### Testing Approach

| Test Type | Tool | Command |
|-----------|------|---------|
| Bootstrap status | curl | `curl /api/v1/admin/bootstrap/status` — verify all 30 meta tables exist |
| Table creation | curl | `curl /api/v1/admin/bootstrap` — verify organizations dataset created |
| Schema sync | curl | `curl /api/v1/admin/bootstrap/sync` — verify new columns added without data loss |
| Org onboarding E2E | Playwright | `npx tsx tests/demo-setup/setup-demo-account.ts` — full signup-to-dashboard |
| API pytest | pytest | `cd 02-api-service && pytest tests/ -k "bootstrap or onboard"` |
| Org sync | curl | `POST /api/v1/procedures/sync` on Pipeline Service — verify non-destructive |

### Deployment / CI/CD Integration

1. **API deploy FIRST** — Schema definitions live in the API service; deploy before running jobs
2. **Run bootstrap-sync job** — Adds new columns/tables to the central `organizations` dataset
3. **Run org-sync-all job** — Propagates schema changes to all per-org `{org_slug}_prod` datasets
4. **Order matters:** API deploy -> bootstrap-sync -> org-sync-all (never reverse)
5. **Stage auto-deploy:** Push to `main` triggers `cloudbuild-stage.yaml`
6. **Prod deploy:** Tag `v*` triggers `cloudbuild-prod.yaml`, then run prod Cloud Run Jobs manually

### Release Cycle

Bootstrap/onboard changes fit into the **API Service release cycle**. Schema additions are non-destructive (add-only), so they can be deployed independently. Breaking schema changes (column renames, type changes) require coordinated release with Pipeline Service.

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/backend-onboarding.ts` | Frontend server action |
| `02-api-service/src/app/routers/organizations.py` | API endpoints |
| `02-api-service/src/core/services/onboarding/` | Onboarding service |
| `05-scheduler-jobs/scripts/run-job.sh` | Cloud Run Job runner |
| `05-scheduler-jobs/src/bootstrap.py` | Bootstrap job entry point |
| `05-scheduler-jobs/src/org_sync_all.py` | Org sync job entry point |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Signup 400 error | Supabase email confirmation enabled | Disable in Supabase Auth settings |
| Stripe checkout fails | Missing STRIPE_SECRET_KEY | Run secrets setup script |
| Login fails after signup | Session not established | Clear cookies, try incognito |
| Subscription not saving | Missing org dataset | Check API Service logs |
| Invite email missing | Email delivery issue | Check spam, verify address, resend |

---

## Post-Onboarding Steps

1. Set up cloud integrations (GCP, AWS, Azure)
2. Configure hierarchy (Departments → Projects → Teams)
3. Add more SaaS subscriptions
4. Run first billing pipeline
5. Invite additional team members

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/stripe-billing` | Billing management (webhooks, products, prices). Checkout triggers onboarding. |
| `/account-setup` | Tests frontend onboarding flows (signup, login, invite). |
| `/bigquery-ops` | BigQuery schema management. Bootstrap creates 30 meta tables. |
| `/pipeline-ops` | Pipeline configs deployed to per-org datasets. |
| `/quota-mgmt` | Plan limits enforced by quota system after onboarding. |
