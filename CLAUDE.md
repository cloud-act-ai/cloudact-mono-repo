# CLAUDE.md

Multi-org cloud cost analytics platform. BigQuery-powered. Two backend services: **api-service** (8000) + **pipeline-service** (8001). Frontend: Next.js with Supabase auth and Stripe.

**Core Principle:** Everything is a pipeline. No raw SQL, no Alembic, no direct DDL.

## PRODUCTION-READY REQUIREMENTS (CRITICAL)

**MANDATORY for all code generation and modifications:**

1. **NO MOCKS OR STUBS** - Never create mock implementations, placeholder code, or TODO stubs unless explicitly requested
2. **NO HALLUCINATED CODE** - Only reference files, functions, and APIs that actually exist in the codebase
3. **WORKING CODE ONLY** - All generated code must be complete, functional, and production-ready
4. **VERIFY BEFORE REFERENCE** - Always read/check files before referencing them in code or documentation
5. **USE EXISTING PATTERNS** - Follow established patterns in the codebase, don't invent new ones
6. **NO NEW DEPENDENCIES** - Don't add new npm/pip packages without explicit approval
7. **ENVIRONMENT FILES** - Each service uses its own environment files:
   - Local development: `{service}/.env.local`
   - Testing: `{service}/.env.test`
   - Production (frontend only): `01-fronted-system/.env.prod`
   - Backend stage/prod: Environment vars injected by `deploy.sh` at deploy time
   - **NEVER use `.env`** - always use the respective environment-specific files

**Before writing code:**
- Read existing files to understand current patterns
- Verify imports and dependencies exist
- Check that referenced APIs/endpoints are real
- Ensure schema matches actual BigQuery tables

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
                             └─ Subscription plans
                             ↓                            ↓
                             BigQuery (Shared)
                             ├─ organizations dataset (21 meta tables)
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

## Pipeline Metadata Fields (x_* fields)

**CRITICAL RULE:** `x_*` fields are for **Pipeline Service (8001) ONLY** - never API Service (8000).

| Field | Purpose | API Service | Pipeline Service |
|-------|---------|-------------|------------------|
| `x_pipeline_id` | Which pipeline wrote data | ❌ NEVER | ✅ REQUIRED |
| `x_credential_id` | Integration credential used | ❌ NEVER | ✅ REQUIRED |
| `x_pipeline_run_date` | Date being processed | ❌ NEVER | ✅ REQUIRED |
| `x_run_id` | Pipeline execution UUID | ❌ NEVER | ✅ REQUIRED |
| `x_ingested_at` | Pipeline write timestamp | ❌ NEVER | ✅ REQUIRED |

**API Service tables (NO x_* fields):**
- `subscription_plans` - CRUD via REST API
- `genai_*_pricing` - Seed/reference data
- `org_hierarchy` - CRUD via REST API
- Any table managed via `/api/v1/*` endpoints

**Pipeline Service tables (MUST have x_* fields):**
- `*_costs_daily` - Pipeline-generated costs
- `*_usage_raw` - Pipeline-ingested usage
- `*_unified` - Pipeline-consolidated data
- `billing_cost` - Cloud cost pipelines

## Documentation

| Component | Path |
|-----------|------|
| Architecture | `00-requirements-specs/00_ARCHITECTURE.md` |
| API Service | `02-api-service/CLAUDE.md` |
| Pipeline Engine | `03-data-pipeline-service/CLAUDE.md` |
| Frontend | `01-fronted-system/CLAUDE.md` |
| **Design System** | `01-fronted-system/CLAUDE.md` → Design System section |
| Security | `03-data-pipeline-service/SECURITY.md` |
| **CI/CD & Deployment** | `04-inra-cicd-automation/CICD/README.md` |

**Feature Docs (00-requirements-specs/):** Internationalization, User Management, Billing, Costs, Pipelines, Integrations, Security, Testing

## Frontend Design Pattern

**Apple Health / Fitness+ Dashboard Pattern** - CloudAct console follows premium bounded-width design:
- `max-w-7xl` (1280px) for all console pages
- Centered layout with `mx-auto`
- 8px spacing grid
- Premium white surfaces with mint accent gradients
- Cards don't stretch on ultra-wide monitors

See `01-fronted-system/CLAUDE.md` → "Layout System" section for complete design tokens.

## API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (21 meta tables)
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
- `POST /api/v1/admin/bootstrap` - Initialize system (21 meta tables)
- `POST /api/v1/organizations/onboard` - Create org + API key + 6 tables
- `POST /api/v1/integrations/{org}/{provider}/setup` - Setup integration
- `GET/POST /api/v1/subscriptions/{org}/providers/*/plans` - Subscription CRUD
- `GET/POST /api/v1/hierarchy/{org}/*` - Org hierarchy CRUD (Dept → Project → Team)

### pipeline-service (8001)
- `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` - Run pipeline
- `POST /api/v1/procedures/sync` - Sync stored procedures

## Quick Reference

```
API Request → configs/ → Processor → BigQuery API
```

**Key Paths:**
- Bootstrap Schemas: `02-api-service/configs/setup/bootstrap/schemas/*.json` (21 tables)
- Pipeline Configs: `03-data-pipeline-service/configs/{provider}/{domain}/*.yml`
- Processors: `03-data-pipeline-service/src/core/processors/`

## Production Security

```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```

## Production Deployment

### Deployment Workflow (CICD)
```bash
cd 04-inra-cicd-automation/CICD

# 1. ALWAYS validate before prod deployment
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod

# 2. Check current version
./releases.sh next

# 3. Deploy to staging first
./release.sh v1.0.0 --deploy --env stage

# 4. Test staging, then deploy to production
./release.sh v1.0.0 --deploy --env prod

# 5. Monitor for 15 minutes
./monitor/watch-all.sh prod 50

# 6. Rollback if issues
./release.sh v0.9.0 --deploy --env prod
```

### Required Secrets (Google Secret Manager)

| Secret Name | Required By | Description |
|-------------|-------------|-------------|
| `ca-root-api-key-{env}` | All services | System root API key |
| `stripe-secret-key-{env}` | Frontend | Stripe secret key (sk_live_*) |
| `stripe-webhook-secret-{env}` | Frontend | Stripe webhook signing secret |
| `supabase-service-role-key-{env}` | Frontend | Supabase service role JWT |

### Environment Configuration

| Environment | GCP Project | Supabase | Stripe |
|-------------|-------------|----------|--------|
| `local` | `cloudact-testing-1` | Test (kwroaccbrxppfiysqlzs) | TEST keys (pk_test_*) |
| `test` | `cloudact-testing-1` | Test (kwroaccbrxppfiysqlzs) | TEST keys (pk_test_*) |
| `stage` | `cloudact-stage` | Test (kwroaccbrxppfiysqlzs) | TEST keys (pk_test_*) |
| `prod` | `cloudact-prod` | Prod (ovfxswhkkshouhsryzaf) | LIVE keys (pk_live_*) |

### Production Stripe Products
| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

### Production URLs
| Service | URL |
|---------|-----|
| Frontend | https://cloudact.ai |
| API Service | https://api.cloudact.ai |
| Pipeline Service | https://pipeline.cloudact.ai |

### Critical Production Notes
1. **Supabase email confirmation:** Must be DISABLED for immediate sign-in after signup
2. **Stripe keys:** Production MUST use LIVE keys (pk_live_*, sk_live_*)
3. **NEXT_PUBLIC_* vars:** Baked at build time - must rebuild to change
4. **Server-side vars:** Set at Cloud Run runtime via Secret Manager

## Development Commands

```bash
# API Service (8000)
cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000 --reload

# Pipeline Service (8001)
cd 03-data-pipeline-service && python3 -m uvicorn src.app.main:app --port 8001 --reload

# Frontend (3000)
cd 01-fronted-system && npm run dev

# Bootstrap BigQuery (creates organizations dataset + 21 tables)
curl -s -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "Content-Type: application/json" -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d @- <<< '{}'

# Supabase migrations (pooler: aws-0-us-west-2.pooler.supabase.com:6543)
cd 01-fronted-system/scripts/supabase_db && ./migrate.sh

# Tests
python -m pytest tests/ -v
npx vitest
```

## Default Test Credentials

**Use these for local development and testing:**

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Organization | Acme Inc |
| Org Slug | `acme_inc_01032026` |

**Usage:** If login fails with these credentials, create a new account via signup with these details.

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
4. **Signup 400 error:** Supabase email confirmation enabled - disable in Supabase Auth settings
5. **Stripe checkout fails:** Missing STRIPE_SECRET_KEY - run `./secrets/setup-secrets.sh prod`
6. **Plans not loading:** Wrong Stripe price IDs - verify LIVE price IDs in .env.production

## Environments & URLs

| Environment | GCP Project | Frontend | API Service | Pipeline Service |
|-------------|-------------|----------|-------------|------------------|
| **Local** | cloudact-testing-1 | `http://localhost:3000` | `http://localhost:8000` | `http://localhost:8001` |
| **Test** | cloudact-testing-1 | - | Cloud Run URL | Cloud Run URL |
| **Stage** | cloudact-stage | `https://cloudact-stage.vercel.app` | Cloud Run URL | Cloud Run URL |
| **Prod** | cloudact-prod | `https://cloudact.ai` | Cloud Run URL + `https://api.cloudact.ai` | Cloud Run URL + `https://pipeline.cloudact.ai` |

**Cloud Run Service Naming:** `cloudact-{service}-{env}-{hash}.us-central1.run.app`

**Custom Domains (Prod only):** `api.cloudact.ai`, `pipeline.cloudact.ai` → mapped via GoDaddy DNS

## Organizational Hierarchy

**Structure:** Org → Department → Project → Team (strict parent-child for cost allocation)

### Standard Hierarchy Configuration

| Level | Code | Name | ID Prefix | Description |
|-------|------|------|-----------|-------------|
| L1 | `department` | Department | `DEPT-` | C-Suite / Executive level |
| L2 | `project` | Project | `PROJ-` | Business Units / Cost Centers |
| L3 | `team` | Team | `TEAM-` | Functions / Teams |

### Entity ID Format
```
{PREFIX}{CODE}
Examples: DEPT-CFO, PROJ-ENGINEERING, TEAM-PLATFORM
```

### Default Template (20 entities)
```
lib/seed/hierarchy_template.csv
├── DEPT-CFO, DEPT-CIO, DEPT-COO, DEPT-BIZ (4 departments)
├── PROJ-BU1, PROJ-CTO, PROJ-ITCOO... (7 projects)
└── TEAM-PLAT, TEAM-ARCH, TEAM-INFRA... (9 teams)
```

### Data Architecture
```
WRITES → organizations.org_hierarchy (central table in bootstrap dataset)
READS  → {org_slug}_prod.x_org_hierarchy (per-org materialized view)
```

- Central table in `organizations` dataset for single source of truth
- Per-org view `x_org_hierarchy` for fast reads (auto-refreshed every 15 min)
- Levels stored in `hierarchy_levels` table (seeded via `/levels/seed` endpoint)

### API Endpoints
```bash
# Seed default levels (DEPT/PROJ/TEAM)
POST /api/v1/hierarchy/{org}/levels/seed

# CRUD operations
GET    /api/v1/hierarchy/{org}           # List entities
GET    /api/v1/hierarchy/{org}/tree      # Tree structure
POST   /api/v1/hierarchy/{org}/entities  # Create entity
PUT    /api/v1/hierarchy/{org}/entities/{id}
DELETE /api/v1/hierarchy/{org}/entities/{id}
```

**Cost Flow:** Subscriptions → Daily Costs → FOCUS 1.3 (with x_hierarchy_* extension fields)

---
**Last Updated:** 2026-01-06
