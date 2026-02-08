# CloudAct Architecture

**v4.3** | 2026-02-05

> Multi-tenant GenAI + Cloud cost analytics platform

---

## System Overview

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Next.js 16                ├─ Bootstrap (21 tables)     ├─ Run pipelines
├─ Supabase Auth             ├─ Org onboarding            ├─ Cost calculation
├─ Stripe Billing            ├─ Hierarchy CRUD            ├─ FOCUS 1.3 conversion
├─ Quota warnings            ├─ Quota enforcement         └─ BigQuery writes
└─ Dashboard UI              └─ Cost reads (Polars)
        │                               ↓
        ↓                    BigQuery (organizations + {org_slug}_prod)
Supabase (Source of Truth)
├─ organizations (billing, plans, limits)
├─ organization_members (seats)
└─ plan_change_audit (Stripe history)

Scheduler Jobs (Cloud Run Jobs — API-first)
├─ supabase_migrate.py       # DB migrations (BEFORE frontend deploy)
├─ bootstrap_smart.py        # Smart bootstrap: fresh or sync (AFTER API deploy)
├─ org_sync_all.py           # Sync ALL org datasets (AFTER bootstrap)
├─ quota_reset_daily.py      # 00:00 UTC daily
├─ quota_reset_monthly.py    # 00:05 UTC 1st of month
├─ stale_cleanup.py          # 02:00 UTC daily (safety net)
├─ alerts_daily.py           # 08:00 UTC daily
└─ quota_cleanup.py          # 01:00 UTC daily
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
- **Row filtering:** `WHERE org_slug = @org_slug` on all shared tables
- **API key scoping:** Each org has a unique key, SHA256 hashed in storage
- **Org slug format:** `{company_name}_{base36_timestamp}` (auto-generated)
- **Validation:** `^[a-zA-Z0-9_]{3,50}$` (alphanumeric + underscores only)

---

## Three Cost Types → FOCUS 1.3

| Type | Providers | Flow |
|------|-----------|------|
| **Cloud** | GCP, AWS, Azure, OCI | Billing export → Raw → FOCUS |
| **GenAI** | OpenAI, Anthropic, Gemini, Azure OpenAI, AWS Bedrock, GCP Vertex | Usage API → Raw → FOCUS |
| **SaaS** | Canva, Slack, ChatGPT Plus | Manual → Calculate → FOCUS |

All → `cost_data_standard_1_3` (FOCUS 1.3 unified table)

---

## Environments

| Env | GCP Project | Frontend | API |
|-----|-------------|----------|-----|
| local/test/stage | cloudact-testing-1 | localhost:3000 | localhost:8000/8001 |
| prod | cloudact-prod | cloudact.ai | api.cloudact.ai / pipeline.cloudact.ai |

**Supabase:** stage → `kwroaccbrxppfiysqlzs` | prod → `ovfxswhkkshouhsryzaf`

---

## Deployment Workflow

```
Developer → git push main → Cloud Build (cloudbuild-stage.yaml) → Stage (3 Cloud Run services)
Developer → git tag v* → Cloud Build (cloudbuild-prod.yaml) → Prod (3 Cloud Run services)
```

| Service | Port | CPU | Memory |
|---------|------|-----|--------|
| frontend | 3000 | 2 | 8Gi |
| api-service | 8000 | 2 | 8Gi |
| pipeline-service | 8001 | 2 | 8Gi |

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
