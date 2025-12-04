# CloudAct Meta Data Store

## Gist

Multi-org cloud cost analytics platform. BigQuery-powered. Two backend services: **api-service** (frontend API, port 8000) + **pipeline** (ETL engine, port 8001). Frontend: Next.js with Supabase auth and Stripe payments.

**Architecture:** Everything is a pipeline. No SQL files, no Alembic, no direct DDL.

**Full Platform Architecture:** See `ARCHITECTURE.md`

## Service Architecture

```
Frontend (Next.js)           API Service (8000)              Pipeline Engine (8001)
Port 3000                    Frontend-facing API             ETL Execution + Integrations
├─ Supabase Auth             ├─ Bootstrap                    ├─ Run pipelines
├─ Stripe Payments           ├─ Org onboarding               ├─ Process usage data
└─ Dashboard UI              └─ Org management               ├─ Cost calculations
                                                             ├─ Integration setup/validate
                                                             ├─ LLM data CRUD
                                                             └─ Scheduled jobs

                             ↓                               ↓
                             BigQuery (Shared)
                             ├─ organizations dataset (meta tables)
                             └─ {org_slug}_prod datasets (data tables)
```

## DO's and DON'Ts

### DO
- Use configs/ for all schema and pipeline definitions
- Let processors handle all BigQuery operations
- Validate all inputs before processing
- Use API key hierarchy correctly (CA_ROOT_API_KEY vs Org API Key)
- Check subscription status before running pipelines
- Sync billing status from Stripe to BigQuery via webhooks
- Encrypt all credentials using KMS
- Follow naming conventions (snake_case, kebab-case, dot.notation)

### DON'T
- **NEVER use DISABLE_AUTH=true** - Always authenticate properly, even in development
- Never write raw SQL or use Alembic
- Never hardcode schemas in Python code
- Never skip authentication in production
- Never store actual API keys in Supabase (only fingerprints)
- Never call pipeline service directly from frontend
- Never run pipelines for SUSPENDED/CANCELLED orgs
- Never skip input validation or rate limiting
- Never expose CA_ROOT_API_KEY to client-side code

## Documentation

| Component | Documentation | Description |
|-----------|---------------|-------------|
| **Architecture** | `ARCHITECTURE.md` | Complete system architecture, customer lifecycle, data flow |
| **API Service** | `api-service/CLAUDE.md` | Frontend-facing API: bootstrap, onboarding, integrations |
| **Pipeline Engine** | `data-pipeline-service/CLAUDE.md` | Pipeline architecture, processors, configs, scheduled ETL |
| **Frontend** | `fronted-system/CLAUDE.md` | Next.js frontend, Supabase, Stripe, backend integration |
| **Security** | `data-pipeline-service/SECURITY.md` | Production security requirements, API key handling |

## Backend Services Split

The backend is split into two services that share the same BigQuery datasets and auth flow:

| Service | Port | Purpose | Key Endpoints |
|---------|------|---------|---------------|
| **cloudact-api-service** | 8000 | Frontend-facing API layer | `/api/v1/admin/bootstrap`, `/api/v1/organizations/*` |
| **convergence-data-pipeline** | 8001 | Pipeline + Integrations | `/api/v1/pipelines/run/*`, `/api/v1/integrations/*`, scheduled jobs |

**Shared:** Same `CA_ROOT_API_KEY`, same BigQuery datasets, same org API key validation.

**Frontend Integration:** Frontend calls api-service (8000) for bootstrap/onboarding, pipeline-service (8001) for integrations and pipeline execution.

## Production Security

**CRITICAL:** Backend will NOT start in production without proper security configuration.

Required environment variables:
```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="your-secure-key-min-32-chars"
export DISABLE_AUTH="false"
export RATE_LIMIT_ENABLED="true"
```

See `ARCHITECTURE.md` for complete security details.

## Quick Reference

### Core Principle
**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

### Key Paths
- **Bootstrap Schemas**: `api-service/configs/setup/bootstrap/schemas/*.json` (14 tables)
- **Pipeline Configs**: `data-pipeline-service/configs/{provider}/{domain}/*.yml`
- **Processors**: `data-pipeline-service/src/core/processors/{provider}/{domain}.py`

## API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (meta tables)
    │
    └── Creates → Org API Keys (per-organization)
                    │
                    ├── Integrations: POST /api/v1/integrations/{org}/{provider}/setup
                    ├── Pipelines: POST /api/v1/pipelines/run/{org}/...
                    └── Data Access: Query org-specific BigQuery datasets
```

**Key Types:**
| Key | Header | Purpose | Scope |
|-----|--------|---------|-------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, org onboarding | System-wide |
| Org API Key | `X-API-Key` | Integrations, pipelines, data | Per-organization |
| Provider Keys | N/A (stored encrypted) | OpenAI, Anthropic, GCP SA | Per-provider |

### API Endpoints

#### cloudact-api-service (Port 8000) - Bootstrap & Onboarding

**Admin (X-CA-Root-Key)**
- `POST /api/v1/admin/bootstrap` - Initialize system
- `POST /api/v1/organizations/onboard` - Create organization + API key
- `POST /api/v1/organizations/dryrun` - Validate org before onboarding
- `PUT /api/v1/organizations/{org}/subscription` - Update subscription limits

#### convergence-data-pipeline (Port 8001) - Pipelines & Integrations

**Organization (X-API-Key)**
- `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` - Run pipeline
- `POST /api/v1/scheduler/trigger` - Trigger scheduled pipeline
- `GET /api/v1/scheduler/queue` - Get pipeline queue
- `POST /api/v1/integrations/{org}/{provider}/setup` - Setup integration (OpenAI, Anthropic, GCP)
- `POST /api/v1/integrations/{org}/{provider}/validate` - Validate integration
- `GET /api/v1/integrations/{org}` - Get all integrations status
- `GET /api/v1/integrations/{org}/{provider}` - Get specific integration status
- `DELETE /api/v1/integrations/{org}/{provider}` - Delete integration
- `GET /api/v1/integrations/{org}/{provider}/pricing` - List pricing models
- `POST /api/v1/integrations/{org}/{provider}/pricing` - Add pricing model
- `GET /api/v1/integrations/{org}/{provider}/subscriptions` - List subscriptions
- `POST /api/v1/integrations/{org}/{provider}/subscriptions` - Add subscription

### Customer Lifecycle

See `ARCHITECTURE.md` for complete customer journey (signup → onboarding → integrations → pipelines).

### Environments
- **Stage**: `https://convergence-pipeline-stage-526075321773.us-central1.run.app`
- **Prod**: `https://convergence-pipeline-prod-820784027009.us-central1.run.app`

---

## Debugging Quick Reference

### Pipeline Configuration

**Source of Truth:** `data-pipeline-service/configs/`

Pipeline URL structure: `/api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}`

| Pipeline | Provider | Domain | Pipeline | Config Path |
|----------|----------|--------|----------|-------------|
| GCP Billing | `gcp` | `cost` | `billing` | `configs/gcp/cost/billing.yml` |
| OpenAI Usage | `openai` | `cost` | `usage_cost` | `configs/openai/cost/usage_cost.yml` |
| Anthropic Usage | `anthropic` | `` (empty) | `usage_cost` | `configs/anthropic/usage_cost.yml` |

**Important:** Provider and domain values are **lowercase**. Domain matches subfolder structure.

### Get Org API Key

```bash
# From BigQuery (org_api_keys table)
bq query --use_legacy_sql=false "
SELECT api_key, org_slug
FROM \`gac-prod-471220.organizations.org_api_keys\`
WHERE org_slug = 'your_org_slug' AND is_active = true"

# From frontend user metadata (Supabase)
# Keys stored in: user.user_metadata.org_api_keys[org_slug]
```

### Key File Locations

| What | Path |
|------|------|
| **Pipeline configs** | `data-pipeline-service/configs/{provider}/{domain}/*.yml` |
| **Provider registry** | `data-pipeline-service/configs/system/providers.yml` |
| **API Service routers** | `api-service/src/app/routers/*.py` |
| **Pipeline Engine routers** | `data-pipeline-service/src/app/routers/*.py` |
| **Frontend pipeline actions** | `fronted-system/actions/pipelines.ts` |
| **Frontend backend client** | `fronted-system/lib/api/backend.ts` |
| **Frontend env config** | `fronted-system/.env.local` |
| **GCP billing processor** | `data-pipeline-service/src/core/processors/gcp/external_bq_extractor.py` |
| **Bootstrap schemas** | `api-service/configs/setup/bootstrap/schemas/*.json` |

### Test Pipeline Execution (curl)

```bash
# Run GCP billing pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-30"}'

# List available pipelines (no auth)
curl -s http://localhost:8000/api/v1/validator/pipelines | python3 -m json.tool
```

### Start Services Locally

```bash
# API Service (port 8000)
cd api-service
export GOOGLE_APPLICATION_CREDENTIALS="~/.gcp/your-sa.json"
export GCP_PROJECT_ID="gac-prod-471220"
export CA_ROOT_API_KEY="test-ca-root-key-dev"
export ENVIRONMENT="development"
export DISABLE_AUTH="false"
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000

# Pipeline Engine (port 8001)
cd data-pipeline-service
# Same env vars as above
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001

# Frontend (port 3000)
cd fronted-system
npm run dev
```

### Common Debugging Commands

```bash
# Check what's running on ports
lsof -i :8000  # API service
lsof -i :8001  # Pipeline engine
lsof -i :3000  # Frontend

# Kill services on port
pkill -f "uvicorn.*8000"
pkill -f "uvicorn.*8001"

# Check health
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:8001/health | python3 -m json.tool
```

### Debugging Learnings

1. **Pipeline 404 errors**: Check provider/domain match config path. Provider is lowercase (`gcp` not `GCP`), domain matches subfolder (`cost` for `configs/gcp/cost/`).

2. **Frontend calls wrong port**: Frontend should call api-service (8000) for bootstrap/onboarding, pipeline-service (8001) for integrations and execution. Set `PIPELINE_SERVICE_URL=http://localhost:8001` in `.env.local`.

3. **Config not updating**: Pipeline configs are loaded dynamically. Check `configs/system/providers.yml` for provider registry.

4. **Org slug validation**: Backend requires `^[a-zA-Z0-9_]{3,50}$` (underscores only, no hyphens).

5. **API key not found**: Check user.user_metadata.org_api_keys[org_slug] in Supabase, or org_api_keys table in BigQuery.

---

**Last Updated:** 2025-12-02
