# Infrastructure & CI/CD - Requirements

## Overview

Architecture and infrastructure requirements for the CloudAct multi-tenant GenAI + Cloud + SaaS cost analytics platform. Covers system topology, deployment, data storage, security, and operational standards.

## Source Specification

`00_ARCHITECTURE.md` (v4.3 | 2026-02-08)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CloudAct Infrastructure & Deployment                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE (cloudact-testing-1)              PROD (cloudact-prod)               │
│  ─────────────────────────               ──────────────────────             │
│                                                                             │
│  git push main ──▶ Cloud Build           git tag v* ──▶ Cloud Build        │
│                    cloudbuild-stage.yaml                cloudbuild-prod.yaml │
│                         │                                   │               │
│                         ▼                                   ▼               │
│              ┌──────────────────┐                ┌──────────────────┐       │
│              │   Build & Deploy │                │   Build & Deploy │       │
│              │   3 Services     │                │   3 Services     │       │
│              └────────┬─────────┘                └────────┬─────────┘       │
│                       │                                   │                 │
│           ┌───────────┼───────────┐          ┌───────────┼───────────┐     │
│           ▼           ▼           ▼          ▼           ▼           ▼     │
│      Frontend    API Service  Pipeline  Frontend    API Service  Pipeline  │
│      :3000       :8000        :8001     :3000       :8000        :8001    │
│                                                                             │
│  Shared Infrastructure:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  GCP Secret Manager    Cloud Scheduler    BigQuery    Supabase     │   │
│  │  (API keys, Stripe,    (quota resets,     (cost data, (auth, orgs, │   │
│  │   webhook secrets)      alerts, cleanup)   schemas)    billing)    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Cloud Run Jobs (05-scheduler-jobs/):                                       │
│  ┌──────────────┬──────────────┬──────────────┬───────────────────────┐   │
│  │ bootstrap    │ org-sync-all │ quota-reset  │ alerts-daily          │   │
│  │ (manual)     │ (manual)     │ (00:00 UTC)  │ (08:00 UTC)          │   │
│  └──────────────┴──────────────┴──────────────┴───────────────────────┘   │
│                                                                             │
│  Health Check Flow:                                                         │
│  Deploy ──▶ /health on each service ──▶ Pass = live ──▶ Fail = rollback    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-ARCH-001: Three-Service Architecture

The system MUST operate as three independently deployable Cloud Run services:

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | Next.js 16 + Supabase Auth + Stripe Billing + Dashboard UI |
| API Service | 8000 | 16 routers, 150+ endpoints, Bootstrap, CRUD, Cost reads |
| Pipeline Service | 8001 | YAML pipeline execution, stored procedures, FOCUS 1.3 conversion |

### FR-ARCH-002: End-to-End Workflow

The platform MUST support the following sequential flow:
1. Signup via Supabase Auth + Profile creation
2. Stripe Checkout subscription, webhook triggers Supabase org record
3. Backend onboarding creates BigQuery dataset (`{org_slug}_prod`) + API key
4. Integration setup with KMS-encrypted credentials
5. Pipeline execution ingests cost data and converts to FOCUS 1.3
6. Dashboard reads via Polars from BigQuery with caching

### FR-ARCH-003: API Service Routers

The API Service (8000) MUST expose 16 routers:
- Admin, Organizations, Integrations, Quota, Costs, GenAI Pricing, GenAI, Hierarchy, Subscription Plans, Notifications, Cost Alerts, Pipeline Logs, Pipeline Validator, Pipelines Proxy, OpenAI Data (legacy), Health

### FR-ARCH-004: Pipeline Service Stored Procedures

The Pipeline Service (8001) MUST support stored procedures for:
- GenAI: consolidate usage daily, consolidate costs daily, convert to FOCUS 1.3
- Subscription: calculate daily costs, convert to FOCUS 1.3
- Cloud: per-provider FOCUS 1.3 conversion (`sp_cloud_{provider}_convert_to_focus`)

### FR-ARCH-005: Three Cost Types to FOCUS 1.3

All cost data MUST be unified into `cost_data_standard_1_3` (FOCUS 1.3):

| Type | Providers | Flow |
|------|-----------|------|
| Cloud | GCP, AWS, Azure, OCI | Billing export -> Raw -> FOCUS |
| GenAI | OpenAI, Anthropic, Gemini, DeepSeek, Azure OpenAI, AWS Bedrock, GCP Vertex | Usage API -> Raw -> FOCUS |
| SaaS | Canva, Slack, ChatGPT Plus | Manual -> Calculate -> FOCUS |

### FR-ARCH-006: BigQuery Schema

- **27 central tables** in `organizations` dataset (Core, Pipeline, Notifications, Other)
- **30+ per-org tables** in `{org_slug}_prod` dataset (Cost, Subscription, GenAI PAYG/Commitment/Infrastructure, Cloud, schema_versions)
- **4 materialized views** per org: `x_pipeline_exec_logs`, `x_all_notifications`, `x_notification_stats`, `x_org_hierarchy`

### FR-ARCH-007: Data Storage Split

| Data | Storage | Reason |
|------|---------|--------|
| Users, Auth | Supabase | Built-in auth, RLS |
| Org metadata | Supabase | Fast UI queries |
| Billing/Subscriptions | Supabase (source of truth) | Stripe webhooks direct |
| Quota limits | Supabase | Plan limits from `organizations` table |
| API keys | BigQuery (SHA256 hashed) | KMS recovery |
| Credentials | BigQuery (KMS AES-256) | Encrypted at rest |
| Cost data | BigQuery | Analytics at scale |
| Quota usage | BigQuery | `org_usage_quotas` daily/monthly tracking |

### FR-ARCH-008: Plan Quotas

| Plan | Daily | Monthly | Concurrent | Seats | Providers | Price |
|------|-------|---------|------------|-------|-----------|-------|
| Starter | 6 | 180 | 20 | 2 | 3 | $19 |
| Professional | 25 | 750 | 20 | 6 | 6 | $69 |
| Scale | 100 | 3000 | 20 | 11 | 10 | $199 |

### FR-ARCH-009: Scheduler Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| supabase-migrate | Manual (before deploy) | Supabase DB migrations |
| bootstrap | Manual (after API deploy) | Smart bootstrap: fresh or sync 30 meta tables |
| org-sync-all | Manual (after bootstrap) | Sync ALL org datasets |
| quota-reset-daily | 00:00 UTC daily | Reset daily pipeline counters |
| quota-cleanup | 01:00 UTC daily | Delete quota records >90 days |
| stale-cleanup | 02:00 UTC daily | Fix stuck concurrent counters |
| alerts-daily | 08:00 UTC daily | Process cost alerts for all orgs |
| quota-reset-monthly | 00:05 UTC 1st | Reset monthly pipeline counters |

### FR-ARCH-010: Frontend Pages

- Auth: `/login`, `/signup`, `/onboarding/billing`
- Dashboard: `/{orgSlug}/dashboard`
- Costs: `/{orgSlug}/costs/cloud`, `/costs/genai`, `/costs/subscriptions`
- Settings: organization, personal, hierarchy, invite, quota-usage, billing, billing/plans, security, danger, onboarding
- Integrations: cloud, genai (openai/anthropic/gemini/deepseek), gcp, subscriptions
- 32 landing pages

---

## Non-Functional Requirements

### NFR-ARCH-001: Multi-Tenancy Isolation

- Dataset isolation: `{org_slug}_prod` per org (separate BigQuery dataset)
- Row filtering: `WHERE x_org_slug = @org_slug` on all per-org cost tables
- API key scoping: each org has unique key, SHA256 hashed
- Org slug format: `{company_name}_{base36_timestamp}` (auto-generated)
- Validation: `^[a-zA-Z0-9_]{3,50}$` (alphanumeric + underscores only)

### NFR-ARCH-002: Pipeline Lineage (x_* Fields)

All pipeline tables MUST include core lineage fields:
- `x_org_slug` (STRING) - Organization identifier
- `x_pipeline_id` (STRING) - Pipeline template name
- `x_credential_id` (STRING) - Credential used
- `x_pipeline_run_date` (DATE) - Idempotency key
- `x_run_id` (STRING) - Execution UUID
- `x_ingested_at` (TIMESTAMP) - Write timestamp
- `x_ingestion_date` (DATE) - Partition key

Provider-specific: `x_cloud_provider`, `x_cloud_account_id`, `x_genai_provider`, `x_genai_account_id`

Hierarchy (nullable): `x_hierarchy_entity_id`, `x_hierarchy_entity_name`, `x_hierarchy_level_code`, `x_hierarchy_path`, `x_hierarchy_path_names`

**Rule:** API (8000) = NO x_* fields. Pipeline (8001) = MUST have x_* fields.

**Composite idempotency key:** `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)`

### NFR-ARCH-003: Security Standards

- `CA_ROOT_API_KEY` (`X-CA-Root-Key`): System admin for bootstrap, onboarding
- Org API Key (`X-API-Key`): Per-org operations
- KMS: All credentials encrypted at rest (GCP Cloud KMS AES-256)
- `DISABLE_AUTH`: MUST be `false` in production
- API keys: SHA256 hashed in BigQuery, shown ONCE during onboarding

### NFR-ARCH-004: Deployment

- Stage: `git push origin main` triggers `cloudbuild-stage.yaml`
- Production: `git tag v*` triggers `cloudbuild-prod.yaml`
- All services: 2 CPU, 8Gi memory
- Secrets via GCP Secret Manager

### NFR-ARCH-005: Environment Isolation

| Env | GCP Project | Supabase | Stripe |
|-----|-------------|----------|--------|
| local/test/stage | cloudact-testing-1 | kwroaccbrxppfiysqlzs | TEST |
| prod | cloudact-prod | ovfxswhkkshouhsryzaf | LIVE |

### NFR-ARCH-006: Production URLs

| Service | URL |
|---------|-----|
| Frontend | cloudact.ai |
| API | api.cloudact.ai |
| Pipeline | pipeline.cloudact.ai |

---

## SDLC

### Development Workflow

```
Feature branch ──▶ PR ──▶ Code review ──▶ Merge to main
                                               │
                                               ▼
                                    Auto-deploy STAGE
                                    (cloudbuild-stage.yaml)
                                               │
                                               ▼
                                    Manual verification
                                    (health checks, smoke tests)
                                               │
                                               ▼
                                    git tag v* ──▶ Auto-deploy PROD
                                                   (cloudbuild-prod.yaml)
```

### Testing Approach

| Type | Tool | Coverage |
|------|------|----------|
| Health checks | `./quick/status.sh {env}` | All 3 services respond on /health |
| Secrets validation | `./secrets/validate-env.sh {env} {service}` | All required secrets present in GCP Secret Manager |
| Rollback readiness | Cloud Run revisions | Previous revision available for instant traffic switch |
| Log monitoring | `./monitor/watch-all.sh {env} 50` | Real-time log tailing for all services |
| Pre-deploy | `./secrets/verify-secrets.sh {env}` | Cross-check secrets exist before deploy |

### Deployment / CI/CD

- **Stage**: Automatic on `git push origin main`. Cloud Build runs `cloudbuild-stage.yaml`.
- **Production**: Triggered by `git tag v*` push. Cloud Build runs `cloudbuild-prod.yaml`.
- **Pre-deploy order**: Supabase migrate -> deploy services -> bootstrap -> org-sync-all
- **Rollback**: Cloud Run maintains previous revisions; traffic can be switched instantly.
- **Secrets**: All secrets stored in GCP Secret Manager, injected at deploy time. Never in code.
- **Manual deploy scripts**: Available in `04-inra-cicd-automation/CICD/quick/` for test/dev only. Never for prod.
