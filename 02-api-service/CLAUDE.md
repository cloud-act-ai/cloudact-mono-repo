# API Service (Port 8000)

Frontend-facing API. Handles bootstrap, onboarding, integrations, subscriptions, hierarchy, quota enforcement, cost reads, notifications, alerts. Does NOT run pipelines (8001).

## Production Requirements

1. **NO MOCKS** - Production-ready code only
2. **VERIFY FIRST** - Read files before referencing
3. **ENV FILES** - Use `.env.local` (never `.env`)

## Development

```bash
cd 02-api-service
source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8000 --reload
python -m pytest tests/ -v
```

## Routers (16)

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| Admin | `/api/v1/admin/*` | Bootstrap, sync, quota resets, alert processing |
| Organizations | `/api/v1/organizations/*` | Onboarding, locale, subscription, repair |
| Integrations | `/api/v1/integrations/*` | Credential setup/validate (11+ providers) |
| GenAI Pricing | `/api/v1/integrations/{org}/{provider}/pricing` | Model pricing & subscription CRUD |
| GenAI | `/api/v1/genai/*` | GenAI usage, costs, pricing overrides |
| Subscriptions | `/api/v1/subscriptions/*` | SaaS subscription plan CRUD |
| Hierarchy | `/api/v1/hierarchy/*` | N-level hierarchy CRUD, import/export |
| Costs | `/api/v1/costs/*` | Polars-powered cost reads + cache |
| Quota | `/api/v1/organizations/{org}/quota` | Quota usage & limits |
| Notifications | `/api/v1/{org}/notifications/*` | Channels, rules, summaries, history |
| Cost Alerts | `/api/v1/{org}/cost-alerts/*` | Alert CRUD, presets, bulk ops |
| Pipeline Logs | `/api/v1/pipelines/{org}/runs` | Execution logs, steps, transitions |
| Pipeline Validator | `/api/v1/validator/*` | Validate config, check quota |
| Pipelines Proxy | `/api/v1/pipelines/*` | Proxy to Pipeline Service (8001) |
| OpenAI Data | `/api/v1/integrations/{org}/openai/*` | Legacy OpenAI pricing (migrated to GenAI Pricing) |
| Health | `/health` | Liveness, readiness, version |

## Bootstrap Tables (27)

| Category | Tables |
|----------|--------|
| Core | `org_profiles`, `org_api_keys`, `org_subscriptions`, `org_usage_quotas`, `org_integration_credentials`, `org_hierarchy`, `org_audit_logs` |
| Pipeline | `org_meta_pipeline_runs`, `org_meta_step_logs`, `org_meta_state_transitions`, `org_meta_dq_results`, `org_pipeline_configs`, `org_pipeline_execution_queue` |
| Notifications | `org_notification_channels`, `org_notification_rules`, `org_notification_summaries`, `org_notification_history`, `org_scheduled_alerts`, `org_alert_history` |
| Other | `org_cost_tracking`, `org_idempotency_keys` |

**Schemas:** `configs/setup/bootstrap/schemas/*.json`

## Quota Enforcement

**This service enforces all quotas before pipeline execution.**

**Quota source:** Supabase (`organizations` for limits, `org_quotas` for usage tracking).

```python
# Atomic check-and-reserve (prevents race conditions)
reserve_pipeline_quota_atomic(org_slug)
```

| Quota | Check |
|-------|-------|
| Daily pipelines | `pipelines_run_today < daily_limit` |
| Monthly pipelines | `pipelines_run_month < monthly_limit` |
| Concurrent | `concurrent_pipelines_running < concurrent_limit` |
| Providers | Count vs `providers_limit` |
| Seats | Member count vs `seat_limit` |

**Self-healing:** Stale concurrent counters cleaned automatically on each pipeline request.

**Endpoint:** `GET /api/v1/organizations/{org}/quota`

## Services Architecture

```
src/core/services/
├─ _shared/           # Cache, date_utils, validation
├─ cost_read/         # Dashboard cost queries (Polars + LRU cache)
├─ usage_read/        # GenAI usage metrics (Polars)
├─ hierarchy_crud/    # N-level hierarchy CRUD + import/export
├─ notification_crud/ # Channels/Rules/Summaries CRUD
└─ integration_read/  # Integration metadata
```

**Pattern:** `*_read/` = Polars + LRU Cache (100 entries, TTL until midnight) | `*_crud/` = Direct BigQuery

## Table Ownership

| Table | Owner | Writes |
|-------|-------|--------|
| `org_subscriptions` | API (8000) | CRUD |
| `org_usage_quotas` | API (8000) | Quota updates |
| `subscription_plans` | API (8000) | CRUD |
| `org_hierarchy` | API (8000) | CRUD |
| `org_notification_*` | API (8000) | CRUD |
| `*_costs_daily` | Pipeline (8001) | Read-only |

**Rule:** Tables with `x_*` fields → Pipeline writes, API reads only

## Key Endpoints

```bash
# Bootstrap
POST /api/v1/admin/bootstrap
POST /api/v1/admin/bootstrap/sync

# Onboard org
POST /api/v1/organizations/onboard
POST /api/v1/organizations/{org}/sync

# Quota
GET  /api/v1/organizations/{org}/quota
POST /api/v1/admin/quota/reset-daily
POST /api/v1/admin/quota/reset-monthly
POST /api/v1/admin/quota/cleanup-stale

# Integration setup
POST /api/v1/integrations/{org}/{provider}/setup
POST /api/v1/integrations/{org}/{provider}/validate

# Subscription CRUD
POST /api/v1/subscriptions/{org}/providers/{p}/plans

# Hierarchy
GET  /api/v1/hierarchy/{org}/tree
POST /api/v1/hierarchy/{org}/import
GET  /api/v1/hierarchy/{org}/export

# Costs (Polars-powered)
GET  /api/v1/costs/{org}/total
GET  /api/v1/costs/{org}/summary
GET  /api/v1/costs/{org}/trend-granular
POST /api/v1/costs/{org}/cache/invalidate

# Notifications
GET  /api/v1/{org}/notifications/channels
POST /api/v1/{org}/notifications/rules
GET  /api/v1/{org}/notifications/history

# Cost Alerts
POST /api/v1/{org}/cost-alerts
POST /api/v1/admin/alerts/process-all

# Validation (for pipeline service)
POST /api/v1/validator/validate/{org}
POST /api/v1/validator/complete/{org}
```

## Key Files

| File | Purpose |
|------|---------|
| `configs/setup/bootstrap/schemas/*.json` | 27 meta table schemas |
| `configs/setup/organizations/onboarding/schemas/*.json` | 30+ per-org table schemas |
| `src/app/routers/` | 16 router files |
| `src/app/dependencies/auth.py` | Quota enforcement + self-healing |
| `src/app/models/org_models.py` | `SUBSCRIPTION_LIMITS` |
| `src/core/services/cost_read/` | Polars cost read service |

## Deployment

### Build & Deploy

```bash
cd 04-inra-cicd-automation/CICD

# Deploy api-service only
./cicd.sh api-service prod cloudact-prod

# Or use quick deploy
./quick/deploy-prod.sh api-service
```

### Environment Variables

Set via Cloud Run at deploy time:
- `GCP_PROJECT_ID` - GCP project
- `BIGQUERY_LOCATION` - BigQuery region (US)
- `ENVIRONMENT` - production/staging/test
- `CA_ROOT_API_KEY` - From Secret Manager
- `PIPELINE_SERVICE_URL` - Auto-discovered

### Cloud Run Config

| Setting | Value |
|---------|-------|
| Port | 8000 |
| CPU | 2 |
| Memory | 8Gi |
| Timeout | 300s |
| Min Instances | 2 (prod) |
| Max Instances | 10 (prod) |

### Version Update

Before creating release tag, update version in `src/app/config.py`:
```python
release_version: str = Field(default="v4.3.0")
release_timestamp: str = Field(default="2026-02-08T00:00:00Z")
```

---
**v4.3.0** | 2026-02-08
