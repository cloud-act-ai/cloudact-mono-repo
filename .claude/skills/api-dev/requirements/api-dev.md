# API Development - Requirements

## Overview

FastAPI development patterns for CloudAct covering both the API Service (port 8000) and Pipeline Service (port 8001). Defines conventions for router creation, Pydantic schema definition, authentication dependency injection, business logic processors, error handling middleware, and testing. The API Service handles reads (Polars), org management, and quota enforcement. The Pipeline Service handles pipeline execution and BigQuery writes with x_* lineage fields.

## Source Specifications

Defined in SKILL.md (`api-dev/SKILL.md`). Patterns derived from existing routers in both services.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Service Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  API Service (port 8000)              Pipeline Service (port 8001)   │
│  ───────────────────────              ────────────────────────────   │
│  src/app/                             src/app/                       │
│  ├── main.py (FastAPI app)            ├── main.py (FastAPI app)      │
│  ├── routers/                         ├── routers/                   │
│  │   ├── admin.py                     │   ├── pipelines.py           │
│  │   ├── organizations.py             │   ├── procedures.py          │
│  │   ├── integrations.py              │   ├── alerts.py              │
│  │   ├── costs.py                     │   └── scheduler.py           │
│  │   ├── hierarchy.py                 ├── dependencies/              │
│  │   ├── quota.py                     └── middleware/                │
│  │   ├── notifications.py                                            │
│  │   ├── chat_settings.py             Core Logic                     │
│  │   ├── cost_alerts.py               ├── processors/ (x_* fields)  │
│  │   ├── genai.py                     ├── engine/ (BigQuery writes)  │
│  │   └── ...                          └── security/ (KMS)           │
│  ├── dependencies/                                                   │
│  │   ├── auth.py                      Configs                        │
│  │   └── rate_limit_decorator.py      ├── {provider}/{domain}/*.yml │
│  └── middleware/                       └── system/providers.yml      │
│                                                                      │
│  Core Logic                           Rule: x_* fields REQUIRED     │
│  ├── processors/ (NO x_* fields)      in all pipeline writes         │
│  ├── engine/ (BigQuery reads)                                        │
│  ├── services/ (Polars reads)         Auth: X-API-Key (org ops)     │
│  ├── security/ (KMS encryption)       Auth: X-CA-Root-Key (admin)   │
│  └── providers/ (registry)                                           │
│                                                                      │
│  Auth: X-API-Key (org ops)                                           │
│  Auth: X-CA-Root-Key (admin ops)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-AD-001: Router Patterns

- **FR-AD-001.1**: All routers use `APIRouter` with explicit `prefix`, `tags`, and `dependencies`
- **FR-AD-001.2**: Prefix follows `/api/v1/{feature}` convention (versioned API)
- **FR-AD-001.3**: Org-scoped endpoints include `{org_slug}` path parameter
- **FR-AD-001.4**: Admin endpoints use `verify_root_key` dependency
- **FR-AD-001.5**: Org endpoints use `verify_org_key` dependency
- **FR-AD-001.6**: All routers registered in `main.py` via `app.include_router()`
- **FR-AD-001.7**: Response models declared via `response_model` parameter on each endpoint
- **FR-AD-001.8**: Endpoint docstrings used for auto-generated OpenAPI docs (`/docs`, `/redoc`)

### FR-AD-002: Schema Standards (Pydantic)

- **FR-AD-002.1**: Request schemas use `BaseModel` with `Field()` validators
- **FR-AD-002.2**: Response schemas use `from_attributes = True` for ORM compatibility
- **FR-AD-002.3**: All fields have explicit types; no `Any` without justification
- **FR-AD-002.4**: Validators use `@validator` or `@field_validator` for custom logic
- **FR-AD-002.5**: `json_schema_extra` provides example payloads for OpenAPI docs
- **FR-AD-002.6**: Optional fields use `Optional[T] = None` pattern
- **FR-AD-002.7**: Enum values defined as `Literal` or `Enum` types for constrained fields (status, provider)
- **FR-AD-002.8**: Date/time fields use `datetime` type with ISO 8601 format

### FR-AD-003: Authentication Dependency Injection

- **FR-AD-003.1**: `verify_org_key` reads `X-API-Key` header, validates SHA256 hash against `org_api_keys` in BigQuery
- **FR-AD-003.2**: `verify_root_key` reads `X-CA-Root-Key` header, compares against `CA_ROOT_API_KEY` env var
- **FR-AD-003.3**: Auth dependencies defined in `src/app/dependencies/auth.py`
- **FR-AD-003.4**: Missing key returns 401 with `"Missing API key"` message
- **FR-AD-003.5**: Invalid key returns 401 with `"Invalid API key"` message
- **FR-AD-003.6**: Key validation includes org_slug match (org key only works for its org)
- **FR-AD-003.7**: Rate limiting via `rate_limit_decorator.py` for abuse prevention

### FR-AD-004: Business Logic Processors

- **FR-AD-004.1**: Processors live in `src/core/processors/` organized by feature domain
- **FR-AD-004.2**: Each processor class receives `BigQueryClient` via dependency injection
- **FR-AD-004.3**: Processors handle BigQuery query construction and result transformation
- **FR-AD-004.4**: API Service processors use parameterized queries (no f-string SQL injection)
- **FR-AD-004.5**: Pipeline Service processors MUST include x_* lineage fields on all writes
- **FR-AD-004.6**: API Service processors MUST NOT include x_* fields (reads only)
- **FR-AD-004.7**: Services in `src/core/services/` provide higher-level abstractions over processors

### FR-AD-005: Error Handling

- **FR-AD-005.1**: Standard HTTP status codes: 400, 401, 403, 404, 409, 429, 500
- **FR-AD-005.2**: All errors use `HTTPException` with meaningful detail messages
- **FR-AD-005.3**: Global exception handler in middleware for unhandled exceptions
- **FR-AD-005.4**: Error responses include machine-readable codes where applicable
- **FR-AD-005.5**: 401 for missing/invalid auth, 403 for insufficient permissions
- **FR-AD-005.6**: 409 for duplicate resources (org slug, API key)
- **FR-AD-005.7**: 429 for rate limit exceeded
- **FR-AD-005.8**: Error utilities in `src/core/utils/error_handling.py`

### FR-AD-006: Data Read Patterns (API Service)

- **FR-AD-006.1**: Cost reads use Polars DataFrames for in-memory transformation
- **FR-AD-006.2**: Services in `src/core/services/cost_read/` handle cost query orchestration
- **FR-AD-006.3**: Pagination via `limit`/`offset` query parameters (max limit: 1000)
- **FR-AD-006.4**: Filtering via optional query parameters (provider, status, date range)
- **FR-AD-006.5**: Date ranges validated: `start_date` must precede `end_date`
- **FR-AD-006.6**: BigQuery reads go through `src/core/engine/bq_client.py`
- **FR-AD-006.7**: Caching layer in `src/core/utils/cache.py` for repeated queries

### FR-AD-007: Testing Patterns

- **FR-AD-007.1**: Tests use `pytest` with `pytest-asyncio` for async endpoint testing
- **FR-AD-007.2**: Test files in `tests/` directory, named `test_{nn}_{feature}.py` (numbered ordering)
- **FR-AD-007.3**: Shared fixtures in `tests/conftest.py` (BigQuery mocks, auth fixtures)
- **FR-AD-007.4**: BigQuery client mocked via `AsyncMock` for unit tests
- **FR-AD-007.5**: `httpx.AsyncClient` used for endpoint-level integration tests
- **FR-AD-007.6**: Auth tests verify both valid and invalid key scenarios
- **FR-AD-007.7**: Schema validation tests verify field constraints and error messages

### FR-AD-008: SDLC and Development Workflow

- **FR-AD-008.1**: Local development via `uvicorn --reload` (hot reload on file changes)
- **FR-AD-008.2**: API Service: `cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000 --reload`
- **FR-AD-008.3**: Pipeline Service: `cd 03-data-pipeline-service && python3 -m uvicorn src.app.main:app --port 8001 --reload`
- **FR-AD-008.4**: Each service has its own `venv/` (use `source venv/bin/activate`)
- **FR-AD-008.5**: Unit tests run before commit: `cd 02-api-service && python -m pytest tests/ -v`
- **FR-AD-008.6**: Deploy via Cloud Build: `cloudbuild-stage.yaml` on push to main, `cloudbuild-prod.yaml` on git tag
- **FR-AD-008.7**: OpenAPI docs auto-generated at `/docs` (Swagger) and `/redoc` (ReDoc)
- **FR-AD-008.8**: Health check endpoint at `/health` for Cloud Run readiness probes

---

## Non-Functional Requirements

### NFR-AD-001: Performance

| Standard | Target |
|----------|--------|
| Endpoint response time (p95) | < 500ms for reads, < 2s for writes |
| BigQuery query timeout | 30s default |
| Rate limiting | Configurable per endpoint |
| Payload size | < 10MB request body |

### NFR-AD-002: Security

- All endpoints require authentication (no public endpoints except `/health` and `/docs`)
- API keys stored as SHA256 hashes in BigQuery, KMS-encrypted for recovery
- Org-scoped endpoints enforce org_slug isolation (key must match org)
- No raw SQL construction in router layer; all queries parameterized
- Secrets in GCP Secret Manager, never hardcoded

### NFR-AD-003: Code Standards

| Standard | Implementation |
|----------|----------------|
| Type hints | All function signatures fully typed |
| Docstrings | All public endpoints and processors |
| Import ordering | stdlib, third-party, local |
| Async | All I/O-bound operations use `async`/`await` |
| Logging | Structured logging via `src/core/utils/logging.py` |

### NFR-AD-004: Deployment

| Aspect | Detail |
|--------|--------|
| Runtime | Cloud Run (2 CPU, 8Gi memory) |
| Stage deploy | Push to `main` triggers `cloudbuild-stage.yaml` |
| Prod deploy | Git tag `v*` triggers `cloudbuild-prod.yaml` |
| Health check | `GET /health` returns `{"status": "ok"}` |
| Environment | Env vars from GCP Secret Manager |

---

## SDLC

### Development Workflow

1. **Create router** -- Add new router in `src/app/routers/`, register in `main.py`
2. **Define schemas** -- Pydantic models in `src/app/models/` for request/response
3. **Implement logic** -- Service layer in `src/core/services/`, processor in `src/core/processors/`
4. **Write tests** -- `cd 02-api-service && python -m pytest tests/ -v -k "new_endpoint"`
5. **Local test** -- `uvicorn src.app.main:app --port 8000 --reload` and test with curl
6. **Deploy** -- Push to `main` (stage auto-deploy) or tag `v*` (prod)

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| Router endpoints | pytest + httpx | Request validation, auth headers, response schemas |
| Pydantic models | pytest | Field validation, optional defaults, enum constraints |
| Service logic | pytest + AsyncMock | BigQuery calls mocked, business logic verified |
| Auth middleware | pytest | X-CA-Root-Key, X-API-Key, missing/invalid headers |
| Polars reads | pytest | Query builder, LRU cache, response formatting |
| Integration | pytest --run-integration | Full endpoint-to-BigQuery flow against cloudact-testing-1 |

### Deployment / CI/CD

- **Stage:** Automatic on `git push origin main` via `cloudbuild-stage.yaml`
- **Production:** Triggered by `git tag v*` via `cloudbuild-prod.yaml`
- **Port:** 8000 (Cloud Run), 2 CPU, 8Gi memory
- **Health:** `GET /health` verified post-deploy
- **Secrets:** GCP Secret Manager injects `ca-root-api-key-{env}` and BigQuery credentials

---

## Key Files

### API Service (02-api-service)

| File | Purpose |
|------|---------|
| `src/app/main.py` | FastAPI app entry point, router registration |
| `src/app/routers/admin.py` | Bootstrap endpoints (X-CA-Root-Key) |
| `src/app/routers/organizations.py` | Org onboarding, status, sync |
| `src/app/routers/integrations.py` | Provider credential setup |
| `src/app/routers/costs.py` | Cost data reads (Polars) |
| `src/app/routers/hierarchy.py` | Org hierarchy CRUD |
| `src/app/routers/quota.py` | Quota usage reads |
| `src/app/routers/notifications.py` | Notification management |
| `src/app/routers/chat_settings.py` | AI chat BYOK settings |
| `src/app/routers/cost_alerts.py` | Cost alert configuration |
| `src/app/routers/genai.py` | GenAI data endpoints |
| `src/app/routers/genai_pricing.py` | GenAI pricing catalog |
| `src/app/routers/subscription_plans.py` | SaaS subscription CRUD |
| `src/app/routers/pipeline_logs.py` | Pipeline execution logs |
| `src/app/routers/pipeline_validator.py` | Pipeline config validation |
| `src/app/routers/pipelines_proxy.py` | Proxy to Pipeline Service |
| `src/app/dependencies/auth.py` | Auth dependency (verify_org_key, verify_root_key) |
| `src/app/dependencies/rate_limit_decorator.py` | Rate limiting decorator |
| `src/core/engine/bq_client.py` | BigQuery client wrapper |
| `src/core/processors/` | Business logic processors |
| `src/core/services/` | Service layer (cost_read, hierarchy_crud, etc.) |
| `src/core/security/kms_encryption.py` | GCP KMS encryption/decryption |
| `src/core/utils/error_handling.py` | Error handling utilities |
| `src/core/utils/validators.py` | Input validation helpers |
| `src/core/utils/cache.py` | Query caching |
| `tests/conftest.py` | Shared test fixtures |

### Pipeline Service (03-data-pipeline-service)

| File | Purpose |
|------|---------|
| `src/app/main.py` | FastAPI app entry point |
| `src/app/routers/pipelines.py` | Pipeline execution endpoints |
| `src/app/routers/procedures.py` | Org sync procedures |
| `src/app/routers/alerts.py` | Alert processing endpoints |
| `src/app/routers/scheduler.py` | Scheduler job endpoints |
| `tests/conftest.py` | Shared test fixtures |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/bootstrap-onboard` | Onboarding endpoints (admin.py, organizations.py). Uses auth patterns defined here. |
| `/config-validator` | Validates pipeline YAML and JSON schemas consumed by both services. |
| `/security-audit` | Auth patterns, KMS encryption, multi-tenant isolation. |
| `/test-orchestration` | Test execution patterns, conftest fixtures, pytest configuration. |
| `/pipeline-ops` | Pipeline Service endpoints, x_* lineage field enforcement. |
| `/cost-analysis` | Cost read patterns (Polars), cost_read service layer. |
| `/frontend-dev` | Frontend consumes API endpoints; schema contracts must match. |
| `/bigquery-ops` | BigQuery client, query patterns, schema management. |
