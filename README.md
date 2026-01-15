# CloudAct

Multi-org cloud cost analytics platform. BigQuery-powered. Three services: Frontend (Next.js), API Service (FastAPI), Pipeline Engine (FastAPI).

## Quick Start

```bash
# Frontend (Port 3000)
cd 01-fronted-system && npm run dev

# API Service (Port 8000)
cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000 --reload

# Pipeline Service (Port 8001)
cd 03-data-pipeline-service && python3 -m uvicorn src.app.main:app --port 8001 --reload
```

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Main project guide - architecture, API keys, endpoints |
| [Architecture](00-requirements-specs/00_ARCHITECTURE.md) | System architecture and data flow |
| [Frontend Guide](01-fronted-system/CLAUDE.md) | Next.js frontend, design system, auth |
| [API Service Guide](02-api-service/CLAUDE.md) | FastAPI backend, bootstrap, services |
| [Pipeline Guide](03-data-pipeline-service/CLAUDE.md) | Pipeline engine, processors, configs |
| [CI/CD Guide](04-inra-cicd-automation/CICD/README.md) | Deployment, triggers, environments |

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

## Structure

```
cloudact-mono-repo/
├── 00-requirements-specs/    # Feature specifications
├── 01-fronted-system/        # Next.js frontend (Port 3000)
├── 02-api-service/           # FastAPI API (Port 8000)
├── 03-data-pipeline-service/ # Pipeline engine (Port 8001)
└── 04-inra-cicd-automation/  # Infrastructure & CI/CD
```

## Environments

| Env | Frontend | API |
|-----|----------|-----|
| Local | localhost:3000 | localhost:8000 |
| Stage | cloudact-stage.vercel.app | Cloud Run |
| Prod | cloudact.ai | api.cloudact.ai |

## Current Version

**v4.1.0** - Production deployed 2026-01-15
