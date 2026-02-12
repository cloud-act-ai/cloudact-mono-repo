# CloudAct

Multi-org cloud cost analytics platform. BigQuery-powered with FOCUS 1.3 compliance.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CloudAct Architecture                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │   API Service   │     │Pipeline Service │
│   (Port 3000)   │────▶│   (Port 8000)   │────▶│   (Port 8001)   │
│    Next.js 16   │     │    FastAPI      │     │    FastAPI      │
│  + Supabase     │     │  + 16 Routers   │     │  + Processors   │
│  + Stripe       │     │  + Quota        │     │  + FOCUS 1.3    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │  Chat Backend   │              │
         │              │  (Port 8002)    │              │
         │              │  FastAPI + ADK  │              │
         │              │  Multi-agent AI │              │
         │              └────────┬────────┘              │
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────────────────────────────┐
         │              │              BigQuery                   │
         └─────────────▶│  organizations (21 meta tables)         │
                        │  {org_slug}_prod (30+ per-org tables)   │
                        │  cost_data_standard_1_3 (FOCUS)         │
                        └─────────────────────────────────────────┘

External Services:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Supabase     │     │     Stripe      │     │   GCP KMS       │
│ (Auth + Quotas) │     │   (Billing)     │     │  (Encryption)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘

Scheduler Jobs (Cloud Run Jobs):
┌─────────────────────────────────────────────────────────────────┐
│  bootstrap | org-sync-all | quota-reset | stale-cleanup | alerts │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Frontend (Port 3000)
cd 01-fronted-system && npm run dev

# API Service (Port 8000)
cd 02-api-service && source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8000 --reload

# Pipeline Service (Port 8001)
cd 03-data-pipeline-service && source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8001 --reload

# Chat Backend (Port 8002)
cd 07-org-chat-backend && source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8002 --reload
```

## Cost Types → FOCUS 1.3

| Type | Providers | Pipeline |
|------|-----------|----------|
| **Cloud** | GCP, AWS, Azure, OCI | `cloud/{provider}/cost/billing` |
| **GenAI** | OpenAI, Anthropic, Gemini, DeepSeek, Azure OpenAI, AWS Bedrock, GCP Vertex | `genai/payg/*` |
| **SaaS** | Canva, Slack, ChatGPT Plus | `subscription/costs/subscription_cost` |

All cost data converts to `cost_data_standard_1_3` (FOCUS 1.3 unified format).

## Deployment

### Automatic (Cloud Build Triggers)

| Trigger | Event | Target |
|---------|-------|--------|
| Stage | Push to `main` | cloudact-testing-1 |
| Production | Tag `v*` | cloudact-prod |

### Deploy Commands

```bash
# Stage (automatic)
git push origin main

# Production
git tag v4.4.0 && git push origin v4.4.0

# Manual deploy scripts
cd 04-inra-cicd-automation/CICD
./quick/deploy-prod.sh
```

### Pre-Deploy Checklist

```bash
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
./quick/status.sh prod           # Health check
./monitor/watch-all.sh prod 50   # Watch logs
```

### Release Workflow (Cloud Run Jobs)

```bash
cd 05-scheduler-jobs/scripts

# 1. BEFORE frontend deploy - Supabase migrations
./run-job.sh prod migrate

# 2. AFTER API deploy - Bootstrap (smart: fresh or sync)
echo "yes" | ./run-job.sh prod bootstrap

# 3. AFTER bootstrap - Sync all org datasets
echo "yes" | ./run-job.sh prod org-sync-all
```

## Environments

| Env | GCP Project | Frontend | API | Supabase | Stripe |
|-----|-------------|----------|-----|----------|--------|
| local | cloudact-testing-1 | localhost:3000 | localhost:8000 | Test | TEST |
| stage | cloudact-testing-1 | Cloud Run | Cloud Run | Test | TEST |
| prod | cloudact-prod | cloudact.ai | api.cloudact.ai | Prod | LIVE |

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://cloudact.ai |
| API Service | https://api.cloudact.ai |
| Pipeline Service | https://pipeline.cloudact.ai |
| Chat Backend | https://chat.cloudact.ai |

## Infrastructure

### Cloud Run Services

| Service | Port | CPU | Memory | Min/Max Instances |
|---------|------|-----|--------|-------------------|
| frontend | 3000 | 2 | 8Gi | 2/20 |
| api-service | 8000 | 2 | 8Gi | 2/10 |
| pipeline-service | 8001 | 2 | 8Gi | 2/10 |
| chat-backend | 8002 | 2 | 8Gi | 2/10 |

### Scheduler Jobs (Cloud Run Jobs)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `bootstrap` | Manual | Initialize BigQuery + 21 meta tables |
| `org-sync-all` | Manual | Sync all org datasets |
| `migrate` | Manual | Supabase DB migrations |
| `quota-reset` | 00:00 UTC daily | Reset daily pipeline quotas |
| `quota-cleanup` | 01:00 UTC daily | Delete quota records >90 days |
| `stale-cleanup` | 02:00 UTC daily | Safety net for stuck concurrent counters |
| `alerts` | 08:00 UTC daily | Process cost alerts for all orgs |
| `quota-monthly` | 00:05 UTC 1st | Reset monthly pipeline quotas |

### Secrets (GCP Secret Manager)

| Secret | Service | Description |
|--------|---------|-------------|
| `ca-root-api-key-{env}` | All | System root API key |
| `stripe-secret-key-{env}` | Frontend | Stripe secret key |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role |
| `supabase-access-token-{env}` | Jobs | Supabase Management API token |

### Service Accounts

| Environment | Service Account |
|-------------|-----------------|
| test | `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` |
| prod | `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` |
| jobs | `cloudact-jobs@{project}.iam.gserviceaccount.com` |

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Main project guide - architecture, API keys, endpoints |
| [Frontend Guide](01-fronted-system/CLAUDE.md) | Next.js frontend, design system, auth |
| [API Service Guide](02-api-service/CLAUDE.md) | FastAPI backend, bootstrap, quota |
| [Pipeline Guide](03-data-pipeline-service/CLAUDE.md) | Pipeline engine, processors, FOCUS 1.3 |
| [Chat Backend Guide](07-org-chat-backend/CLAUDE.md) | AI Chat, Google ADK agents, BYOK |
| [Scheduler Jobs](05-scheduler-jobs/CLAUDE.md) | Cloud Run Jobs, release workflow |
| [CI/CD Guide](04-inra-cicd-automation/CICD/README.md) | Deployment, triggers, environments |
| Skill Requirements | Feature specs organized by skill in `.claude/skills/{name}/requirements/` |

## Project Structure

```
cloudact-mono-repo/
├── .claude/skills/               # Skills with requirements docs
├── 01-fronted-system/            # Next.js frontend (Port 3000)
│   ├── app/                      # Next.js app router
│   ├── actions/                  # Server actions
│   ├── components/               # React components
│   ├── contexts/                 # React context (cost-data, org-providers)
│   └── lib/                      # Utilities
├── 02-api-service/               # FastAPI API (Port 8000)
│   ├── src/app/routers/          # 16 API routers (150+ endpoints)
│   ├── src/core/services/        # Business logic (Polars reads, CRUD)
│   └── configs/                  # Bootstrap schemas, providers
├── 03-data-pipeline-service/     # Pipeline engine (Port 8001)
│   ├── src/core/processors/      # ETL processors
│   ├── configs/                  # Pipeline configs + stored procedures
│   └── src/core/notifications/   # Alert system
├── 04-inra-cicd-automation/      # Infrastructure & CI/CD
│   ├── CICD/                     # Deploy scripts, triggers
│   └── gcp-setup/                # GCP provisioning
├── 05-scheduler-jobs/            # Cloud Run Jobs
│   ├── scripts/                  # Job management (run, create, list)
│   └── jobs/                     # Job scripts (manual, daily, monthly)
└── 07-org-chat-backend/          # AI Chat Backend (Port 8002)
    ├── src/core/agents/          # ADK agents (orchestrator, cost, usage, alert)
    ├── src/core/tools/           # BigQuery MCP tools
    └── src/core/sessions/        # BigQuery session store
```

## Plan Quotas

| Plan | Daily | Monthly | Concurrent | Seats | Providers | Price |
|------|-------|---------|------------|-------|-----------|-------|
| Starter | 6 | 180 | 20 | 2 | 3 | $19/mo |
| Professional | 25 | 750 | 20 | 6 | 6 | $69/mo |
| Scale | 100 | 3000 | 20 | 11 | 10 | $199/mo |

**Quota Storage:** Supabase (`organizations` for limits, `org_quotas` for usage tracking).

## Production Stripe Price IDs

| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

---
**v4.4.0** | 2026-02-11
