# CLAUDE.md

Multi-org cloud cost analytics. BigQuery-powered. **api-service** (8000) + **pipeline-service** (8001) + **Frontend** (3000).

**Core:** Everything is a pipeline. No raw SQL, no Alembic.

## Architecture

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Next.js 16 + Supabase     ├─ Bootstrap (21 tables)     ├─ Run pipelines
├─ Stripe Billing            ├─ Org onboarding            ├─ Cost calculation
├─ Quota warnings            ├─ Subscription CRUD         ├─ FOCUS 1.3 conversion
└─ Dashboard UI              ├─ Hierarchy CRUD            └─ Quota reset jobs
                             ├─ Quota enforcement
                             └─ Cost reads (Polars)
                                        ↓
                             BigQuery (organizations + {org_slug}_prod)
```

## Three Cost Types → FOCUS 1.3

| Type | Providers | Pipeline |
|------|-----------|----------|
| **Cloud** | GCP, AWS, Azure, OCI | `cloud/{provider}/cost/billing` |
| **GenAI** | OpenAI, Anthropic, Gemini, Azure OpenAI, AWS Bedrock, GCP Vertex | `genai/payg/*` |
| **SaaS** | Canva, Slack, ChatGPT Plus | `subscription/costs/subscription_cost` |

All → `cost_data_standard_1_3` (FOCUS 1.3 unified)

## Plan Quotas

| Plan | Daily | Monthly | Seats | Providers | Price |
|------|-------|---------|-------|-----------|-------|
| Starter | 6 | 180 | 2 | 3 | $19 |
| Professional | 25 | 750 | 6 | 6 | $69 |
| Scale | 100 | 3000 | 11 | 10 | $199 |

**Tables:** `org_subscriptions` (limits) + `org_usage_quotas` (usage)

## x_* Pipeline Lineage (8001 ONLY)

| Field | Purpose |
|-------|---------|
| `x_pipeline_id` | Pipeline template |
| `x_credential_id` | Credential used |
| `x_run_id` | Execution UUID |
| `x_ingested_at` | Write timestamp |

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
| Email | john@example.com |
| Password | acme1234 |
| Org | acme_inc_01032026 |

## Deployment

```bash
git push origin main           # → Stage
git tag v4.1.0 && git push origin v4.1.0  # → Prod
```

## Docs

| Doc | Path |
|-----|------|
| API Service | `02-api-service/CLAUDE.md` |
| Pipeline Service | `03-data-pipeline-service/CLAUDE.md` |
| Frontend | `01-fronted-system/CLAUDE.md` |
| Specs | `00-requirements-specs/*.md` |

---
**v4.1.0** | 2026-01-15
