# CLAUDE.md

Multi-org cloud cost analytics. BigQuery-powered. **api-service** (8000) + **pipeline-service** (8001) + **Frontend** (3000).

**Core:** Everything is a pipeline. No raw SQL, no Alembic.

## Architecture

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Next.js 16 + Supabase     ├─ Bootstrap (21 tables)     ├─ Run pipelines
├─ Stripe Billing            ├─ Org onboarding            ├─ Cost calculation
├─ Quota warnings            ├─ Subscription CRUD         ├─ FOCUS 1.3 conversion
└─ Dashboard UI              ├─ Hierarchy CRUD            └─ BigQuery writes
        │                    ├─ Quota enforcement
        │                    └─ Cost reads (Polars)
        ↓                               ↓
Supabase (Auth + Quotas)     BigQuery (organizations + {org_slug}_prod)
├─ organizations             └─ org_subscriptions, cost_data, etc.
└─ org_quotas (usage)

Scheduler Jobs (Cloud Run Jobs)
├─ bootstrap.py              # Initial system setup
├─ org_sync_all.py           # Sync ALL org datasets
├─ quota_reset_daily.py      # 00:00 UTC daily
├─ quota_reset_monthly.py    # 00:05 UTC 1st of month
├─ stale_cleanup.py          # 02:00 UTC daily (safety net, self-healing handles most)
└─ quota_cleanup.py          # 01:00 UTC daily
```

## Three Cost Types → FOCUS 1.3

| Type | Providers | Pipeline |
|------|-----------|----------|
| **Cloud** | GCP, AWS, Azure, OCI | `cloud/{provider}/cost/billing` |
| **GenAI** | OpenAI, Anthropic, Gemini, DeepSeek, Azure OpenAI, AWS Bedrock, GCP Vertex | `genai/payg/*` |
| **SaaS** | Canva, Slack, ChatGPT Plus | `subscription/costs/subscription_cost` |

All → `cost_data_standard_1_3` (FOCUS 1.3 unified)

## Plan Quotas

| Plan | Daily | Monthly | Concurrent | Seats | Providers | Price |
|------|-------|---------|------------|-------|-----------|-------|
| Starter | 6 | 180 | 1 | 2 | 3 | $19 |
| Professional | 25 | 750 | 2 | 6 | 6 | $69 |
| Scale | 100 | 3000 | 5 | 11 | 10 | $199 |

**Supabase Tables:** `organizations` (limits) + `org_quotas` (usage tracking)
**BigQuery Tables:** `org_subscriptions` (plan metadata) + `org_usage_quotas` (historical)

## x_* Pipeline Lineage (8001 ONLY)

| Field | Purpose |
|-------|---------|
| `x_org_slug` | Organization identifier (multi-tenant row isolation) |
| `x_pipeline_id` | Pipeline template |
| `x_credential_id` | Credential used |
| `x_pipeline_run_date` | Data date (idempotency key) |
| `x_run_id` | Execution UUID |
| `x_ingested_at` | Write timestamp |
| `x_ingestion_date` | Partition key |

**Rule:** API (8000) = NO x_* fields. Pipeline (8001) = MUST have x_* fields.

## API Keys

| Key | Header | Use |
|-----|--------|-----|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, onboarding |
| Org API Key | `X-API-Key` | All org operations |

## Key Endpoints

```bash
# API Service (8000)
POST /api/v1/admin/bootstrap
POST /api/v1/organizations/onboard
POST /api/v1/integrations/{org}/{provider}/setup
POST /api/v1/subscriptions/{org}/providers/{p}/plans
GET  /api/v1/hierarchy/{org}/tree
GET  /api/v1/organizations/{org}/quota

# Pipeline Service (8001)
POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
POST /api/v1/procedures/sync
```

## Hierarchy

```
Org → Department (DEPT-*) → Project (PROJ-*) → Team (TEAM-*)
WRITES → organizations.org_hierarchy | READS → {org}_prod.x_org_hierarchy
```

## Development

```bash
cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000 --reload
cd 03-data-pipeline-service && python3 -m uvicorn src.app.main:app --port 8001 --reload
cd 01-fronted-system && npm run dev
```

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

## Test Credentials

| Field | Value |
|-------|-------|
| Email | demo@cloudact.ai |
| Password | Demo1234 |
| Company | Acme Inc |
| Org Pattern | `acme_inc_{timestamp}` (auto-generated from company + base36 timestamp) |

**Note:** Org slug is dynamically generated during signup as `{company_name}_{timestamp}`. Example: `acme_inc_ml01ua8p` where `ml01ua8p` is the base36 timestamp at signup time.

## Deployment

### Quick Deploy

```bash
# Stage (automatic on push to main)
git push origin main

# Production (via git tag)
git tag v4.1.9 && git push origin v4.1.9
```

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CloudAct Deployment Flow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Developer                    Cloud Build                    Cloud Run     │
│   ─────────                    ───────────                    ─────────     │
│                                                                             │
│   git push main ──────────────▶ cloudbuild-stage.yaml ──────▶ Stage Env    │
│                                  (Auto-trigger)               (3 services)  │
│                                                                             │
│   git tag v* ─────────────────▶ cloudbuild-prod.yaml ───────▶ Prod Env     │
│   git push origin v*            (Auto-trigger)               (3 services)  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Manual Deploy Scripts (Test/Dev ONLY)

> **WARNING:** Do NOT use manual scripts for production. Use git tags to trigger Cloud Build.

```bash
cd 04-inra-cicd-automation/CICD

# Test environment only
./quick/deploy-test.sh           # All services to test

# Check version info
./releases.sh next               # Check next version
```

### Pre-Deployment Checklist

```bash
# 1. Validate secrets
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod

# 2. Check health after deploy
./quick/status.sh prod

# 3. Monitor logs
./monitor/watch-all.sh prod 50
```

### Cloud Run Services

| Service | Port | CPU | Memory | URL (Prod) |
|---------|------|-----|--------|------------|
| frontend | 3000 | 2 | 8Gi | cloudact.ai |
| api-service | 8000 | 2 | 8Gi | api.cloudact.ai |
| pipeline-service | 8001 | 2 | 8Gi | pipeline.cloudact.ai |

### Secrets (GCP Secret Manager)

| Secret | Service | Description |
|--------|---------|-------------|
| `ca-root-api-key-{env}` | All | System root API key |
| `stripe-secret-key-{env}` | Frontend | Stripe secret (sk_live_*) |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook (whsec_*) |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role JWT |

## Supabase Migrations

```bash
cd 01-fronted-system/scripts/supabase_db

# Check status
./migrate.sh --status              # Local (default)
./migrate.sh --status --stage      # Stage
./migrate.sh --status --prod       # Production

# Run migrations
./migrate.sh                       # Local
./migrate.sh --stage               # Stage
./migrate.sh --prod                # Production
./migrate.sh --yes --prod          # Production (skip confirmation)
```

**Requires:** `SUPABASE_ACCESS_TOKEN` in env files (same token for all environments)

| Environment | Supabase Project |
|-------------|------------------|
| local/stage | `kwroaccbrxppfiysqlzs` |
| prod | `ovfxswhkkshouhsryzaf` |

## Claude Configuration

| Resource | Count | Location |
|----------|-------|----------|
| Skills | 22 | `.claude/skills/{name}/SKILL.md` |
| Commands | 16 | `.claude/commands/{name}.md` |
| Hooks | 10 | `.claude/hookify.*.local.md` |
| Summary | - | `.claude/SUMMARY.md` |

### Key Skills
`/restart` `/health-check` `/env-setup` `/infra-cicd` `/bigquery-ops` `/integration-setup` `/pipeline-ops` `/cost-analysis` `/frontend-dev` `/api-dev`

### Key Hooks (Enforced)
- **org-slug-isolation** - Multi-tenant isolation via org_slug
- **pipeline-metadata-fields** - x_* fields = Pipeline Service only
- **encryption-flow** - GCP KMS for all credentials
- **session-completion-checklist** - Tests/docs before close

## Scheduler Jobs (Cloud Run Jobs)

All scheduled operations run as Cloud Run Jobs from `05-scheduler-jobs/`.

```bash
cd 05-scheduler-jobs

# Create all jobs (first time per environment)
./scripts/create-all-jobs.sh prod

# Run manual jobs
./scripts/run-job.sh prod bootstrap
./scripts/run-job.sh prod org-sync-all

# List jobs
./scripts/list-jobs.sh prod
```

| Job | Schedule | Purpose |
|-----|----------|---------|
| `bootstrap` | Manual | Initialize organizations dataset + 21 meta tables |
| `bootstrap-sync` | Manual | Add new columns to existing meta tables |
| `org-sync-all` | Manual | Sync ALL org datasets (loops through active orgs) |
| `quota-reset-daily` | 00:00 UTC | Reset daily pipeline counters |
| `quota-cleanup` | 01:00 UTC | Delete quota records >90 days |
| `stale-cleanup` | 02:00 UTC | Fix stuck concurrent counters (safety net) |
| `alerts-daily` | 08:00 UTC | Process cost alerts for all orgs |
| `quota-reset-monthly` | 00:05 1st | Reset monthly pipeline counters |

> **Note:** Stale cleanup moved to daily (self-healing handles most cases at validation time).
> **Note:** Billing sync jobs removed (subscription data consolidated to Supabase).

## Docs

| Doc | Path |
|-----|------|
| API Service | `02-api-service/CLAUDE.md` |
| Pipeline Service | `03-data-pipeline-service/CLAUDE.md` |
| Frontend | `01-fronted-system/CLAUDE.md` |
| Scheduler Jobs | `05-scheduler-jobs/CLAUDE.md` |
| Claude Config | `.claude/SUMMARY.md` |
| Specs | `00-requirements-specs/*.md` |

---

## OpenClaw Context

This codebase is managed by **OpenClaw**, an AI agent framework that provides persistent memory, identity, and operational context for Claude.

### OpenClaw Identity Files (Reference These)

| File | Purpose | Location |
|------|---------|----------|
| `IDENTITY.md` | Agent name, persona, avatar | `~/.openclaw/workspace/` |
| `SOUL.md` | Core values, operational philosophy | `~/.openclaw/workspace/` |
| `MEMORY.md` | Long-term curated memory (Rama, CloudAct, lessons) | `~/.openclaw/workspace/` |
| `USER.md` | Human operator info (Rama Surasani) | `~/.openclaw/workspace/` |
| `CONTEXT.md` | Knowledge index, doc pointers | `~/.openclaw/workspace/` |
| `HEARTBEAT.md` | Periodic check-in tasks | `~/.openclaw/workspace/` |
| `AGENTS.md` | Workspace rules, memory management | `~/.openclaw/workspace/` |

### Context Flow for Jobs

When running scheduler jobs, the execution context should include:
1. **Who is running**: OpenClaw (Claude agent for CloudAct)
2. **Why**: Part of CloudAct operations (bootstrap, migrations, sync)
3. **Context source**: Reference `~/.openclaw/workspace/` files for identity/memory

### Access Restrictions

**DO NOT access:**
- `/Users/gurukallam/` - Off-limits (user privacy boundary)

---
**v4.3.0** | 2026-02-04
