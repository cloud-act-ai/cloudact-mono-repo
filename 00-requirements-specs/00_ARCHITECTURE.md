# CloudAct Architecture

**v4.3** | 2026-02-08

> Multi-tenant GenAI + Cloud + SaaS cost analytics platform. BigQuery-powered.

---

## System Overview

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Next.js 16                ├─ 16 routers, 150+ endpoints├─ Run pipelines (YAML)
├─ Supabase Auth             ├─ Bootstrap (21 tables)     ├─ Step-based execution
├─ Stripe Billing            ├─ Org onboarding            ├─ Stored procedures
├─ Quota warnings            ├─ Subscription CRUD         ├─ FOCUS 1.3 conversion
└─ Dashboard UI              ├─ Hierarchy CRUD            └─ BigQuery writes
        │                    ├─ Quota enforcement
        ↓                    ├─ Notifications & Alerts
Supabase (Source of Truth)   └─ Cost reads (Polars + Cache)
├─ organizations                         ↓
├─ organization_members      BigQuery (organizations + {org_slug}_prod)
├─ org_quotas                └─ 21 central + 30+ per-org tables
└─ plan_change_audit

Scheduler Jobs (Cloud Run Jobs)
├─ supabase_migrate.py       # DB migrations (BEFORE frontend deploy)
├─ bootstrap_smart.py        # Smart bootstrap: fresh or sync (AFTER API deploy)
├─ org_sync_all.py           # Sync ALL org datasets (AFTER bootstrap)
├─ quota_reset_daily.py      # 00:00 UTC daily
├─ quota_reset_monthly.py    # 00:05 UTC 1st of month
├─ quota_cleanup.py          # 01:00 UTC daily (delete >90 days)
├─ stale_cleanup.py          # 02:00 UTC daily (safety net)
└─ alerts_daily.py           # 08:00 UTC daily
```

**Note:** Billing sync jobs removed — all subscription data consolidated to Supabase. No Stripe → BigQuery sync.

---

## End-to-End Workflow

```
1. Signup → Supabase Auth + Profile
2. Subscribe → Stripe Checkout → Webhook → Supabase org record
3. Backend Onboard → BigQuery dataset ({org_slug}_prod) + API key
4. Setup Integrations → KMS encrypted credentials stored
5. Run Pipelines → Cost data ingested → FOCUS 1.3 conversion
6. Dashboard → Polars reads from BigQuery → Cached analytics
```

---

## API Service — 16 Routers (Port 8000)

| # | Router | Endpoint Prefix | Purpose |
|---|--------|-----------------|---------|
| 1 | Admin | `/api/v1/admin/*` | Bootstrap, sync, API key management |
| 2 | Organizations | `/api/v1/organizations/*` | Onboard, profile, locale, API key rotate |
| 3 | Integrations | `/api/v1/integrations/{org}/{provider}/*` | Setup, validate, credentials CRUD |
| 4 | Quota | `/api/v1/organizations/{org}/quota` | Quota status |
| 5 | Costs | `/api/v1/costs/{org}/*` | Summary, by-provider, by-service, trend, trend-granular, subscriptions, cloud, genai, total, cache stats/invalidate |
| 6 | GenAI Pricing | `/api/v1/integrations/{org}/{provider}/pricing` | Model pricing CRUD, subscriptions CRUD, bulk update, reset |
| 7 | GenAI | `/api/v1/genai/{org}/*` | Pricing by flow, usage, costs, cost summary, seed defaults |
| 8 | Hierarchy | `/api/v1/hierarchy/{org}/*` | Levels CRUD, Entities CRUD, tree, move, ancestors/descendants, import/export CSV |
| 9 | Subscription Plans | `/api/v1/subscriptions/{org}/providers/*` | Enable/disable providers, plans CRUD, toggle, reset |
| 10 | Notifications | `/api/v1/{org}/notifications/*` | Channels (email/slack/webhook), Rules (pause/resume/test), Summaries (daily/weekly/monthly), History, Scheduled Alerts, Org Alerts |
| 11 | Cost Alerts | `/api/v1/{org}/*` | Alert CRUD, enable/disable, bulk, presets |
| 12 | Pipeline Logs | `/api/v1/pipelines/{org}/runs` | Run history, steps, retry, download, transitions |
| 13 | Pipeline Validator | `/api/v1/validator/*` | List pipelines, validate config, complete validation |
| 14 | Pipelines Proxy | (proxy) | Proxies to Pipeline Service (8001) for trigger/run |
| 15 | OpenAI Data | (legacy) | Legacy OpenAI-specific pricing (migrated to genai_pricing) |
| 16 | Health | `/health` | Health check endpoint |

---

## Pipeline Service (Port 8001)

- Pipeline execution engine with YAML-based configs
- Step-based execution with dependency resolution
- All writes include `x_*` pipeline lineage fields

### Stored Procedures

| Domain | Procedure | Purpose |
|--------|-----------|---------|
| GenAI | `sp_genai_1_consolidate_usage_daily` | Aggregate raw usage to daily |
| GenAI | `sp_genai_2_consolidate_costs_daily` | Calculate daily costs from pricing |
| GenAI | `sp_genai_3_convert_to_focus` | Convert to FOCUS 1.3 |
| Subscription | `sp_subscription_2_calculate_daily_costs` | Calculate daily subscription costs |
| Subscription | `sp_subscription_3_convert_to_focus` | Convert to FOCUS 1.3 |
| Cloud | `sp_cloud_{provider}_convert_to_focus` | Per-provider FOCUS 1.3 conversion |

All procedures use the 5-field `x_hierarchy_*` model. Procedure sync endpoint keeps BigQuery in sync.

---

## Data Flow

```
Raw Data → Pipeline Configs (YAML) → Processors → Stored Procedures
    → BigQuery Tables → FOCUS 1.3 Unified (cost_data_standard_1_3)
    → Cost Read Service (Polars + Cache) → API → Frontend
```

---

## Three Cost Types → FOCUS 1.3

| Type | Providers | Flow |
|------|-----------|------|
| **Cloud** | GCP, AWS, Azure, OCI | Billing export → Raw → FOCUS |
| **GenAI** | OpenAI, Anthropic, Gemini, DeepSeek, Azure OpenAI, AWS Bedrock, GCP Vertex | Usage API → Raw → FOCUS |
| **SaaS** | Canva, Slack, ChatGPT Plus | Manual → Calculate → FOCUS |

All → `cost_data_standard_1_3` (FOCUS 1.3 unified table)

---

## BigQuery Schema

### Bootstrap Tables (21 central tables in `organizations` dataset)

| Category | Tables |
|----------|--------|
| Core | `org_profiles`, `org_api_keys`, `org_subscriptions`, `org_usage_quotas`, `org_integration_credentials`, `org_hierarchy`, `org_audit_logs` |
| Pipeline | `org_meta_pipeline_runs`, `org_meta_step_logs`, `org_meta_state_transitions`, `org_meta_dq_results`, `org_pipeline_configs`, `org_pipeline_execution_queue` |
| Notifications | `org_notification_channels`, `org_notification_rules`, `org_notification_summaries`, `org_notification_history` |
| Other | `org_cost_tracking`, `org_idempotency_keys`, `org_scheduled_pipeline_runs`, `org_scheduled_alerts`, `org_alert_history` |

### Per-Org Tables (30+ in `{org_slug}_prod` dataset)

| Category | Tables |
|----------|--------|
| Cost | `cost_data_standard_1_3`, `contract_commitment_1_3` |
| Subscription | `subscription_plans`, `subscription_plan_costs_daily` |
| GenAI PAYG | `genai_payg_pricing`, `genai_payg_usage_raw`, `genai_payg_costs_daily` |
| GenAI Commitment | `genai_commitment_pricing`, `genai_commitment_usage_raw`, `genai_commitment_costs_daily` |
| GenAI Infrastructure | `genai_infrastructure_pricing`, `genai_infrastructure_usage_raw`, `genai_infrastructure_costs_daily` |
| GenAI Unified | `genai_costs_daily_unified`, `genai_usage_daily_unified` |
| Cloud | `cloud_gcp_billing_raw_daily`, `cloud_aws_billing_raw_daily`, `cloud_azure_billing_raw_daily`, `cloud_oci_billing_raw_daily` |
| Other | `schema_versions` |

### Per-Org Materialized Views

`x_pipeline_exec_logs`, `x_all_notifications`, `x_notification_stats`, `x_org_hierarchy`

---

## Data Storage Split

| Data | Storage | Reason |
|------|---------|--------|
| Users, Auth | Supabase | Built-in auth, RLS |
| Org metadata | Supabase | Fast UI queries |
| Billing/Subscriptions | Supabase (source of truth) | Stripe webhooks → Supabase directly |
| Quota limits | Supabase → API reads | Plan limits from `organizations` table |
| API keys | BigQuery (hashed) | SHA256 hashed, KMS recovery |
| Credentials | BigQuery (KMS) | AES-256 encrypted at rest |
| Cost data | BigQuery | Analytics at scale |
| Quota usage | BigQuery | `org_usage_quotas` daily/monthly tracking |

---

## Multi-Tenancy Standards

- **Dataset isolation:** `{org_slug}_prod` per org (separate BigQuery dataset)
- **Row filtering:** `WHERE x_org_slug = @org_slug` on all per-org cost tables
- **API key scoping:** Each org has a unique key, SHA256 hashed in storage
- **Org slug format:** `{company_name}_{base36_timestamp}` (auto-generated)
- **Validation:** `^[a-zA-Z0-9_]{3,50}$` (alphanumeric + underscores only)

---

## x_* Pipeline Lineage (Port 8001 Only)

### Core Lineage (REQUIRED on all pipeline tables)

| Field | Type | Purpose |
|-------|------|---------|
| `x_org_slug` | STRING | Organization identifier (multi-tenant row isolation) |
| `x_pipeline_id` | STRING | Pipeline template name |
| `x_credential_id` | STRING | Credential used (multi-account isolation) |
| `x_pipeline_run_date` | DATE | Data date being processed (idempotency key) |
| `x_run_id` | STRING | Execution UUID |
| `x_ingested_at` | TIMESTAMP | Write timestamp |
| `x_ingestion_date` | DATE | Partition key |

### Provider-Specific

| Field | Type | Tables |
|-------|------|--------|
| `x_cloud_provider` | STRING | Cloud billing tables |
| `x_cloud_account_id` | STRING | Cloud billing tables |
| `x_genai_provider` | STRING | GenAI tables |
| `x_genai_account_id` | STRING | GenAI tables |

### Hierarchy (5-field, NULLABLE)

`x_hierarchy_entity_id`, `x_hierarchy_entity_name`, `x_hierarchy_level_code`, `x_hierarchy_path`, `x_hierarchy_path_names`

**Rule:** API (8000) = NO x_* fields. Pipeline (8001) = MUST have x_* fields.

**Composite key for idempotent writes:** `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` — ensures pipeline re-runs replace their own data with multi-account isolation.

---

## Hierarchy

```
Org → Department (DEPT-*) → Project (PROJ-*) → Team (TEAM-*)
WRITES → organizations.org_hierarchy | READS → {org}_prod.x_org_hierarchy
```

---

## Plan Quotas

| Plan | Daily | Monthly | Concurrent | Seats | Providers | Price |
|------|-------|---------|------------|-------|-----------|-------|
| Starter | 6 | 180 | 20 | 2 | 3 | $19 |
| Professional | 25 | 750 | 20 | 6 | 6 | $69 |
| Scale | 100 | 3000 | 20 | 11 | 10 | $199 |

**Supabase Tables:** `organizations` (limits) + `org_quotas` (usage tracking)
**BigQuery Tables:** `org_subscriptions` (plan metadata) + `org_usage_quotas` (historical)

---

## Scheduler Jobs (Cloud Run Jobs)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `supabase-migrate` | Manual (before deploy) | Supabase DB migrations |
| `bootstrap` | Manual (after API deploy) | Smart bootstrap: fresh or sync 21 meta tables |
| `org-sync-all` | Manual (after bootstrap) | Sync ALL org datasets |
| `quota-reset-daily` | 00:00 UTC daily | Reset daily pipeline counters |
| `quota-cleanup` | 01:00 UTC daily | Delete quota records >90 days |
| `stale-cleanup` | 02:00 UTC daily | Fix stuck concurrent counters (safety net) |
| `alerts-daily` | 08:00 UTC daily | Process cost alerts for all orgs |
| `quota-reset-monthly` | 00:05 UTC 1st | Reset monthly pipeline counters |

---

## Frontend Pages

### Application Pages

| Area | Routes |
|------|--------|
| Auth | `/login`, `/signup`, `/onboarding/billing` |
| Dashboard | `/{orgSlug}/dashboard` (cost overview) |
| Costs | `/{orgSlug}/costs/cloud`, `/costs/genai`, `/costs/subscriptions` |
| Settings | `organization`, `personal`, `hierarchy`, `invite`, `quota-usage`, `billing`, `billing/plans`, `security`, `danger`, `onboarding` |
| Integrations | `cloud`, `genai` (openai/anthropic/gemini/deepseek), `gcp`, `subscriptions` |

### Landing Pages (32)

home, pricing, features, about, contact, demo, docs, careers, community, compliance, cookies, help, integrations, investors, learning-paths, and more

---

## Environments

| Env | GCP Project | Supabase | Stripe |
|-----|-------------|----------|--------|
| local/test/stage | cloudact-testing-1 | kwroaccbrxppfiysqlzs | TEST |
| prod | cloudact-prod | ovfxswhkkshouhsryzaf | LIVE |

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | cloudact.ai |
| API | api.cloudact.ai |
| Pipeline | pipeline.cloudact.ai |

## Production Stripe

| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

---

## Deployment

```
Developer → git push main → Cloud Build (cloudbuild-stage.yaml) → Stage (3 Cloud Run services)
Developer → git tag v* → Cloud Build (cloudbuild-prod.yaml) → Prod (3 Cloud Run services)
```

| Service | Port | CPU | Memory |
|---------|------|-----|--------|
| frontend | 3000 | 2 | 8Gi |
| api-service | 8000 | 2 | 8Gi |
| pipeline-service | 8001 | 2 | 8Gi |

Secrets managed via GCP Secret Manager: `ca-root-api-key-{env}`, `stripe-secret-key-{env}`, `stripe-webhook-secret-{env}`, `supabase-service-role-key-{env}`

---

## Security Standards

- **CA_ROOT_API_KEY** (`X-CA-Root-Key`): System admin — bootstrap, onboarding
- **Org API Key** (`X-API-Key`): Per-org operations — all CRUD, pipeline runs
- **KMS**: All credentials encrypted at rest (GCP Cloud KMS AES-256)
- **DISABLE_AUTH**: MUST be `false` in production
- **API keys**: SHA256 hashed in BigQuery, shown ONCE during onboarding

---

## Documentation Index

| Doc | Path |
|-----|------|
| API Service | `02-api-service/CLAUDE.md` |
| Pipeline Service | `03-data-pipeline-service/CLAUDE.md` |
| Frontend | `01-fronted-system/CLAUDE.md` |
| Scheduler Jobs | `05-scheduler-jobs/CLAUDE.md` |
| CI/CD | `04-inra-cicd-automation/CICD/` |
| Specs | `00-requirements-specs/*.md` |
| Claude Config | `.claude/SUMMARY.md` |
