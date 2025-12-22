# API Service (Port 8000)

Frontend-facing API for org management, auth, and integrations. Handles bootstrap, onboarding, integration setup, subscription plans, and cost analytics. Does NOT run pipelines (port 8001).

## Routers

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| Admin | `/api/v1/admin/*` | Bootstrap, dev API key |
| Organizations | `/api/v1/organizations/*` | Onboarding, subscription, locale |
| Integrations | `/api/v1/integrations/*` | Setup/validate credentials |
| Subscription Plans | `/api/v1/subscriptions/*` | SaaS CRUD with version history |
| Cost Service | `/api/v1/costs/*` | Polars-powered analytics |

## Development

```bash
cd 02-api-service
pip install -r requirements.txt
python3 -m uvicorn src.app.main:app --port 8000 --reload

# Tests
python -m pytest tests/ -v
python -m pytest tests/ -v --run-integration
```

## Bootstrap (14 Meta Tables)

| Table | Purpose | Partitioned |
|-------|---------|-------------|
| org_profiles | Org metadata + i18n | - |
| org_api_keys | API keys | created_at |
| org_subscriptions | Plans & limits | created_at |
| org_usage_quotas | Quota tracking | usage_date |
| org_integration_credentials | Encrypted creds | - |
| org_meta_pipeline_runs | Execution logs | start_time |
| org_meta_step_logs | Step logs | start_time |
| org_meta_dq_results | DQ results | ingestion_date |
| org_pipeline_configs | Pipeline config | - |
| org_scheduled_pipeline_runs | Scheduled jobs | scheduled_time |
| org_pipeline_execution_queue | Queue | scheduled_time |
| org_cost_tracking | Cost data | usage_date |
| org_audit_logs | Audit trail | created_at |
| org_idempotency_keys | Deduplication | - |

**Schemas:** `configs/setup/bootstrap/schemas/*.json`

## Key Endpoints

```bash
# Bootstrap (one-time)
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Onboard organization
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"org_slug":"my_org","company_name":"My Org","admin_email":"admin@example.com","subscription_plan":"FREE","default_currency":"USD"}'

# Get API key (dev only)
curl -X GET "http://localhost:8000/api/v1/admin/dev/api-key/my_org" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Setup integration
curl -X POST "http://localhost:8000/api/v1/integrations/my_org/openai/setup" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"api_key":"sk-..."}'

# SaaS subscription
curl -X POST "http://localhost:8000/api/v1/subscriptions/my_org/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"plan_name":"TEAM","price_per_user_monthly":25.00,"currency":"USD"}'
```

## i18n (Locale)

**Currencies (16):** USD, EUR, GBP, INR, JPY, CNY, AED, SAR, QAR, KWD, BHD, OMR, AUD, CAD, SGD, CHF

**Timezones (15):** UTC, America/*, Europe/*, Asia/*, Australia/Sydney

```bash
# Get locale
curl -X GET "http://localhost:8000/api/v1/organizations/my_org/locale" -H "X-API-Key: $ORG_API_KEY"

# Update locale
curl -X PUT "http://localhost:8000/api/v1/organizations/my_org/locale" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"default_currency":"INR","default_timezone":"Asia/Kolkata"}'
```

## SaaS Subscription Plans

**Version History:** Edits create new rows. Old row gets `end_date`, new row starts from `effective_date`.

**Status Values:** `active`, `pending`, `cancelled`, `expired`

**Currency Enforcement:** Plans MUST match org's `default_currency`.

**Audit Fields:** `source_currency`, `source_price`, `exchange_rate_used` for currency conversion tracking.

```bash
# Edit with version history
curl -X POST "http://localhost:8000/api/v1/subscriptions/my_org/providers/chatgpt_plus/plans/123/edit-version" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"number_of_users":15,"effective_date":"2025-02-01"}'

# End subscription (soft delete)
curl -X DELETE "http://localhost:8000/api/v1/subscriptions/my_org/providers/chatgpt_plus/plans/123" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"end_date":"2025-03-31"}'
```

## Project Structure

```
02-api-service/
├── src/app/
│   ├── main.py                 # FastAPI entry
│   ├── routers/                # API endpoints
│   └── models/i18n_models.py   # i18n constants
├── src/core/
│   ├── engine/bq_client.py     # BigQuery client
│   ├── security/               # KMS encryption
│   └── processors/             # Business logic
├── configs/
│   ├── setup/bootstrap/        # 14 table schemas
│   └── saas/seed/              # Subscription templates
└── tests/
```

## Environment (.env.local)

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
GCP_PROJECT_ID=your-project
CA_ROOT_API_KEY=your-admin-key-32chars
KMS_KEY_NAME=projects/.../cryptoKeys/your-key
ENVIRONMENT=development
```

## Security

- All endpoints require auth (X-CA-Root-Key or X-API-Key)
- Credentials encrypted via KMS
- Rate limiting enabled
- Dev API key endpoint blocked in production

---
**Last Updated:** 2025-12-22
