# CLAUDE.md

Multi-org cloud cost analytics platform. BigQuery-powered. Two backend services: **api-service** (8000) + **pipeline-service** (8001). Frontend: Next.js with Supabase auth and Stripe.

**Core Principle:** Everything is a pipeline. No raw SQL, no Alembic, no direct DDL.

## Folder Structure

```
cloudact-mono-repo/
├── 00-requirements-specs/        # Feature docs, architecture specs
├── 01-fronted-system/            # Next.js frontend (Port 3000)
├── 02-api-service/               # FastAPI backend API (Port 8000)
├── 03-data-pipeline-service/     # Pipeline engine (Port 8001)
└── 04-inra-cicd-automation/      # Infrastructure & CI/CD
```

## Service Architecture

```
Frontend (3000)              API Service (8000)           Pipeline Engine (8001)
├─ Supabase Auth             ├─ Bootstrap                 ├─ Run pipelines
├─ Stripe Payments           ├─ Org onboarding            ├─ Process usage data
└─ Dashboard UI              ├─ Integration setup         └─ Scheduled jobs
                             └─ SaaS subscription plans
                             ↓                            ↓
                             BigQuery (Shared)
                             ├─ organizations dataset (14 meta tables)
                             └─ {org_slug}_prod datasets
```

## DO's and DON'Ts

### DO
- Use configs/ for schema and pipeline definitions
- Validate inputs before processing
- Use API key hierarchy (CA_ROOT_API_KEY vs Org API Key)
- Encrypt credentials using KMS

### DON'T
- **NEVER use DISABLE_AUTH=true**
- Never write raw SQL or use Alembic
- Never skip authentication
- Never expose CA_ROOT_API_KEY to client-side

## Documentation

| Component | Path |
|-----------|------|
| Architecture | `00-requirements-specs/00_ARCHITECTURE.md` |
| API Service | `02-api-service/CLAUDE.md` |
| Pipeline Engine | `03-data-pipeline-service/CLAUDE.md` |
| Frontend | `01-fronted-system/CLAUDE.md` |
| Security | `03-data-pipeline-service/SECURITY.md` |

**Feature Docs (00-requirements-specs/):** Internationalization, User Management, Billing, Costs, Pipelines, Integrations, Security, Testing

## API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (14 meta tables)
    │
    └── Creates → Org API Keys (per-organization)
                    ├── Integrations: POST /api/v1/integrations/{org}/{provider}/setup
                    ├── Pipelines: POST /api/v1/pipelines/run/{org}/...
                    └── Data Access: Query org-specific BigQuery datasets
```

| Key | Header | Purpose |
|-----|--------|---------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, org onboarding |
| Org API Key | `X-API-Key` | Integrations, pipelines |

## Key Endpoints

### api-service (8000)
- `POST /api/v1/admin/bootstrap` - Initialize system (15 meta tables)
- `POST /api/v1/organizations/onboard` - Create org + API key + 6 tables
- `POST /api/v1/integrations/{org}/{provider}/setup` - Setup integration
- `GET/POST /api/v1/subscriptions/{org}/providers/*/plans` - SaaS CRUD
- `GET/POST /api/v1/hierarchy/{org}/*` - Org hierarchy CRUD (Dept → Project → Team)

### pipeline-service (8001)
- `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` - Run pipeline
- `POST /api/v1/procedures/sync` - Sync stored procedures

## Quick Reference

```
API Request → configs/ → Processor → BigQuery API
```

**Key Paths:**
- Bootstrap Schemas: `02-api-service/configs/setup/bootstrap/schemas/*.json`
- Pipeline Configs: `03-data-pipeline-service/configs/{provider}/{domain}/*.yml`
- Processors: `03-data-pipeline-service/src/core/processors/`

## Production Security

```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```

## Development Commands

```bash
# API Service (8000)
cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000 --reload

# Pipeline Service (8001)
cd 03-data-pipeline-service && python3 -m uvicorn src.app.main:app --port 8001 --reload

# Frontend (3000)
cd 01-fronted-system && npm run dev

# Tests
python -m pytest tests/ -v
npx vitest
```

## Common Debugging

```bash
# Health checks
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:8001/health | python3 -m json.tool

# Kill services
pkill -f "uvicorn.*8000"
pkill -f "uvicorn.*8001"
```

**Common Issues:**
1. **Pipeline 404:** Provider lowercase (`gcp` not `GCP`), domain matches subfolder
2. **Frontend wrong port:** api-service (8000) for ALL except pipeline runs (8001)
3. **Org slug validation:** `^[a-zA-Z0-9_]{3,50}$` (underscores only)

## Environments
- **Stage:** `https://convergence-pipeline-stage-526075321773.us-central1.run.app`
- **Prod:** `https://convergence-pipeline-prod-820784027009.us-central1.run.app`

## Organizational Hierarchy

**Structure:** Org → Department → Project → Team (strict parent-child for cost allocation)

**Tables per org:**
- `org_hierarchy` - All hierarchy entities with version history
- Subscription plans include `hierarchy_dept_id/name`, `hierarchy_project_id/name`, `hierarchy_team_id/name`

**Cost Flow:** Subscriptions → Daily Costs → FOCUS 1.3 (with hierarchy extension fields)

---
**Last Updated:** 2025-12-26
