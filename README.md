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
│  + Supabase     │     │  + Bootstrap    │     │  + Processors   │
│  + Stripe       │     │  + Quota        │     │  + FOCUS 1.3    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────────────────────────────┐
         │              │              BigQuery                   │
         └─────────────▶│  organizations (21 meta tables)         │
                        │  {org_slug}_prod (per-org data)         │
                        │  cost_data_standard_1_3 (FOCUS)         │
                        └─────────────────────────────────────────┘

External Services:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Supabase     │     │     Stripe      │     │   GCP KMS       │
│  (Auth + Users) │     │   (Billing)     │     │  (Encryption)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Quick Start

```bash
# Frontend (Port 3000)
cd 01-fronted-system && npm run dev

# API Service (Port 8000)
cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000 --reload

# Pipeline Service (Port 8001)
cd 03-data-pipeline-service && python3 -m uvicorn src.app.main:app --port 8001 --reload
```

## Cost Types → FOCUS 1.3

| Type | Providers | Pipeline |
|------|-----------|----------|
| **Cloud** | GCP, AWS, Azure, OCI | `cloud/{provider}/cost/billing` |
| **GenAI** | OpenAI, Anthropic, Gemini, Azure OpenAI, AWS Bedrock, GCP Vertex | `genai/payg/*` |
| **SaaS** | Canva, Slack, ChatGPT Plus | `subscription/costs/subscription_cost` |

All cost data converts to `cost_data_standard_1_3` (FOCUS 1.3 unified format).

## Deployment

### Automatic (Cloud Build Triggers)

| Trigger | Event | Target |
|---------|-------|--------|
| Stage | Push to `main` | cloudact-stage |
| Production | Tag `v*` | cloudact-prod |

### Deploy Commands

```bash
# Stage (automatic)
git push origin main

# Production
git tag v4.1.9 && git push origin v4.1.9

# Manual deploy scripts
cd 04-inra-cicd-automation/CICD
./quick/deploy-prod.sh           # All services
./release.sh v4.2.0 --deploy --env prod
```

### Pre-Deploy Checklist

```bash
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
./quick/status.sh prod           # Health check
./monitor/watch-all.sh prod 50   # Watch logs
```

## Environments

| Env | GCP Project | Frontend | API | Supabase | Stripe |
|-----|-------------|----------|-----|----------|--------|
| local | cloudact-testing-1 | localhost:3000 | localhost:8000 | Test | TEST |
| stage | cloudact-stage | Cloud Run | Cloud Run | Test | TEST |
| prod | cloudact-prod | cloudact.ai | api.cloudact.ai | Prod | LIVE |

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://cloudact.ai |
| API Service | https://api.cloudact.ai |
| Pipeline Service | https://pipeline.cloudact.ai |

## Infrastructure

### Cloud Run Services

| Service | Port | CPU | Memory | Min/Max Instances |
|---------|------|-----|--------|-------------------|
| frontend | 3000 | 2 | 8Gi | 2/20 |
| api-service | 8000 | 2 | 8Gi | 2/10 |
| pipeline-service | 8001 | 2 | 8Gi | 2/10 |

### Secrets (GCP Secret Manager)

| Secret | Service | Description |
|--------|---------|-------------|
| `ca-root-api-key-{env}` | All | System root API key |
| `stripe-secret-key-{env}` | Frontend | Stripe secret key |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role |

### Service Accounts

| Environment | Service Account |
|-------------|-----------------|
| test | `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` |
| stage | `cloudact-stage@cloudact-stage.iam.gserviceaccount.com` |
| prod | `cloudact-prod@cloudact-prod.iam.gserviceaccount.com` |

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Main project guide - architecture, API keys, endpoints |
| [Frontend Guide](01-fronted-system/CLAUDE.md) | Next.js frontend, design system, auth |
| [API Service Guide](02-api-service/CLAUDE.md) | FastAPI backend, bootstrap, quota |
| [Pipeline Guide](03-data-pipeline-service/CLAUDE.md) | Pipeline engine, processors, FOCUS 1.3 |
| [CI/CD Guide](04-inra-cicd-automation/CICD/README.md) | Deployment, triggers, environments |
| [Architecture Spec](00-requirements-specs/00_ARCHITECTURE.md) | System architecture and data flow |

## Feature Specs

| Feature | Document |
|---------|----------|
| Billing & Stripe | [01_BILLING_STRIPE.md](00-requirements-specs/01_BILLING_STRIPE.md) |
| Organization Hierarchy | [01_HIERARCHY.md](00-requirements-specs/01_HIERARCHY.md) |
| Cloud Costs | [02_CLOUD_COSTS.md](00-requirements-specs/02_CLOUD_COSTS.md) |
| GenAI Costs | [02_GENAI_COSTS.md](00-requirements-specs/02_GENAI_COSTS.md) |
| SaaS Subscriptions | [02_SAAS_SUBSCRIPTION_COSTS.md](00-requirements-specs/02_SAAS_SUBSCRIPTION_COSTS.md) |
| Integrations | [03_INTEGRATIONS.md](00-requirements-specs/03_INTEGRATIONS.md) |
| Dashboard Analytics | [03_DASHBOARD_ANALYTICS.md](00-requirements-specs/03_DASHBOARD_ANALYTICS.md) |
| Security | [05_SECURITY.md](00-requirements-specs/05_SECURITY.md) |

## Project Structure

```
cloudact-mono-repo/
├── 00-requirements-specs/        # Feature specifications
├── 01-fronted-system/            # Next.js frontend (Port 3000)
│   ├── app/                      # Next.js app router
│   ├── actions/                  # Server actions
│   ├── components/               # React components
│   └── lib/                      # Utilities
├── 02-api-service/               # FastAPI API (Port 8000)
│   ├── src/app/routers/          # API endpoints
│   ├── src/core/services/        # Business logic
│   └── configs/                  # Bootstrap schemas
├── 03-data-pipeline-service/     # Pipeline engine (Port 8001)
│   ├── src/core/processors/      # ETL processors
│   ├── configs/                  # Pipeline configs
│   └── src/core/notifications/   # Alert system
└── 04-inra-cicd-automation/      # Infrastructure & CI/CD
    ├── CICD/                     # Deploy scripts
    ├── gcp-setup/                # GCP provisioning
    ├── cron-jobs/                # Scheduled tasks
    └── load-demo-data/           # Demo data loading
```

## Plan Quotas

| Plan | Daily | Monthly | Seats | Providers | Price |
|------|-------|---------|-------|-----------|-------|
| Starter | 6 | 180 | 2 | 3 | $19/mo |
| Professional | 25 | 750 | 6 | 6 | $69/mo |
| Scale | 100 | 3000 | 11 | 10 | $199/mo |

## Production Stripe Price IDs

| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

---
**v4.1.9** | 2026-01-18
