# API Development - Test Plan

## Backend Tests

API development validation via pytest across both services:
- **API Service Tests:** `02-api-service/tests/`
- **Pipeline Service Tests:** `03-data-pipeline-service/tests/`
- **Run API:** `cd 02-api-service && source venv/bin/activate && python -m pytest tests/ -v`
- **Run Pipeline:** `cd 03-data-pipeline-service && source venv/bin/activate && python -m pytest tests/ -v`

### Test Matrix (25 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | All routers import without errors | Import | No import exceptions |
| 2 | Router prefixes follow `/api/v1/{feature}` convention | Convention | All routers have versioned prefix |
| 3 | All routers registered in main.py | Registration | `app.include_router()` for each router |
| 4 | Pydantic request schemas validate required fields | Schema | Missing fields raise `ValidationError` |
| 5 | Pydantic request schemas reject invalid types | Schema | Wrong types raise `ValidationError` |
| 6 | Pydantic response schemas serialize correctly | Schema | `from_attributes = True` works with ORM objects |
| 7 | Field validators reject empty strings | Schema | `validator` raises for empty name/slug |
| 8 | Org key auth returns 401 without X-API-Key | Auth | `{"detail": "Missing API key"}` |
| 9 | Org key auth returns 401 with invalid key | Auth | `{"detail": "Invalid API key"}` |
| 10 | Root key auth returns 401 without X-CA-Root-Key | Auth | `{"detail": "Invalid root key"}` |
| 11 | Root key auth returns 401 with wrong root key | Auth | `{"detail": "Invalid root key"}` |
| 12 | Org key cannot access other org's data | Auth | 401 for mismatched org_slug |
| 13 | Rate limit returns 429 when exceeded | Auth | `{"detail": "Rate limit exceeded"}` |
| 14 | GET endpoints return 200 with valid auth | API | Successful response with data |
| 15 | POST endpoints return 200/201 with valid payload | API | Resource created/updated |
| 16 | 404 returned for non-existent resources | Error | `{"detail": "Resource not found"}` |
| 17 | 409 returned for duplicate resources | Error | `{"detail": "Resource already exists"}` |
| 18 | 400 returned for malformed request body | Error | Validation error details |
| 19 | Pagination works with limit/offset params | API | Correct subset of results |
| 20 | Date range filtering validates start < end | API | 400 if start_date > end_date |
| 21 | Health endpoint returns 200 without auth | API | `{"status": "ok"}` |
| 22 | OpenAPI docs accessible at /docs | API | Swagger UI loads |
| 23 | Pipeline Service x_* fields present on writes | Convention | All writes include x_org_slug, x_pipeline_id, etc. |
| 24 | API Service reads have NO x_* fields | Convention | Zero x_* fields in API Service responses |
| 25 | BigQuery client mocked in unit tests | Test | No real BigQuery calls in pytest |

## Backend Unit Tests

### API Service (02-api-service)

```bash
cd 02-api-service
source venv/bin/activate

# All tests
python -m pytest tests/ -v

# Individual test files
python -m pytest tests/test_00_health.py -v              # Health check
python -m pytest tests/test_01_bootstrap.py -v            # Bootstrap endpoints
python -m pytest tests/test_02_organizations.py -v        # Org onboarding
python -m pytest tests/test_03_integrations.py -v         # Integration setup
python -m pytest tests/test_04_genai_pricing.py -v        # GenAI pricing
python -m pytest tests/test_05_quota.py -v                # Quota endpoints
python -m pytest tests/test_05_subscription_providers.py -v  # Subscription plans
python -m pytest tests/test_05b_subscription_security.py -v  # Subscription auth
python -m pytest tests/test_06_user_onboarding_e2e.py -v  # E2E onboarding flow
python -m pytest tests/test_07_i18n.py -v                 # Internationalization
python -m pytest tests/test_08_genai_api.py -v            # GenAI API endpoints
python -m pytest tests/test_cache.py -v                   # Cache layer
python -m pytest tests/test_hierarchy_multitenancy.py -v  # Hierarchy isolation
```

| Domain | File | Tests |
|--------|------|-------|
| Health | `tests/test_00_health.py` | Health endpoint, version info |
| Bootstrap | `tests/test_01_bootstrap.py` | Meta table creation, idempotency, sync |
| Organizations | `tests/test_02_organizations.py` | Onboard, dryrun, status, slug validation |
| Integrations | `tests/test_03_integrations.py` | Provider setup, credential encryption |
| GenAI Pricing | `tests/test_04_genai_pricing.py` | Pricing catalog CRUD |
| Quota | `tests/test_05_quota.py` | Quota reads, limit enforcement |
| Subscriptions | `tests/test_05_subscription_providers.py` | SaaS subscription CRUD |
| Sub Security | `tests/test_05b_subscription_security.py` | Auth on subscription endpoints |
| E2E Onboard | `tests/test_06_user_onboarding_e2e.py` | Full onboarding flow |
| i18n | `tests/test_07_i18n.py` | Multi-language support |
| GenAI API | `tests/test_08_genai_api.py` | GenAI data endpoints |
| Cache | `tests/test_cache.py` | Cache hit/miss, TTL |
| Hierarchy | `tests/test_hierarchy_multitenancy.py` | Cross-org isolation |

### Pipeline Service (03-data-pipeline-service)

```bash
cd 03-data-pipeline-service
source venv/bin/activate

# All tests
python -m pytest tests/ -v

# Individual test files
python -m pytest tests/test_00_health.py -v                          # Health check
python -m pytest tests/test_04_pipelines.py -v                       # Pipeline execution
python -m pytest tests/test_05_subscription_pipelines.py -v          # Subscription pipelines
python -m pytest tests/test_05b_subscription_cost_calculation_unit.py -v  # Cost calc unit
python -m pytest tests/test_06_multi_org_fiscal_year.py -v           # Fiscal year support
python -m pytest tests/test_07_genai_pipelines.py -v                 # GenAI pipelines
python -m pytest tests/test_08_schema_validation.py -v               # Schema validation
python -m pytest tests/test_hierarchy_validation.py -v               # Hierarchy validation
python -m pytest tests/test_scope_enforcement.py -v                  # x_* scope enforcement
python -m pytest tests/test_processor_status_propagation.py -v       # Status propagation
python -m pytest tests/test_integration_bigquery.py -v               # BigQuery integration
```

| Domain | File | Tests |
|--------|------|-------|
| Health | `tests/test_00_health.py` | Health endpoint |
| Pipelines | `tests/test_04_pipelines.py` | Pipeline run, config load, step execution |
| Subscriptions | `tests/test_05_subscription_pipelines.py` | Subscription cost pipelines |
| Cost Calc | `tests/test_05b_subscription_cost_calculation_unit.py` | Daily cost calculation |
| Fiscal Year | `tests/test_06_multi_org_fiscal_year.py` | Multi-org fiscal year handling |
| GenAI | `tests/test_07_genai_pipelines.py` | GenAI PAYG/commitment pipelines |
| Schemas | `tests/test_08_schema_validation.py` | Pipeline config schema validation |
| Hierarchy | `tests/test_hierarchy_validation.py` | Hierarchy entity validation |
| Scope | `tests/test_scope_enforcement.py` | x_* field enforcement on writes |
| Status | `tests/test_processor_status_propagation.py` | Processor status flow |
| BigQuery | `tests/test_integration_bigquery.py` | BigQuery read/write integration |

## Integration Tests

| Test | Command | Expected |
|------|---------|----------|
| API health | `curl http://localhost:8000/health` | `{"status": "ok"}` |
| Pipeline health | `curl http://localhost:8001/health` | `{"status": "ok"}` |
| API docs | `curl -s http://localhost:8000/docs` | HTML Swagger UI |
| API ReDoc | `curl -s http://localhost:8000/redoc` | HTML ReDoc page |
| Auth required | `curl http://localhost:8000/api/v1/organizations/test_org/status` | 401 Unauthorized |
| Root key auth | `curl -H "X-CA-Root-Key: $KEY" http://localhost:8000/api/v1/admin/bootstrap/status` | 200 with status |
| Org key auth | `curl -H "X-API-Key: $ORG_KEY" http://localhost:8000/api/v1/costs/{org}/total` | 200 with data |
| Invalid key | `curl -H "X-API-Key: bad_key" http://localhost:8000/api/v1/costs/{org}/total` | 401 Invalid |

## SDLC Verification

| Check | Command | Expected |
|-------|---------|----------|
| Local dev starts | `cd 02-api-service && python3 -m uvicorn src.app.main:app --port 8000 --reload` | Server starts on :8000 |
| Hot reload works | Edit a router file, save | Uvicorn auto-reloads |
| Tests pass | `cd 02-api-service && python -m pytest tests/ -v` | All tests green |
| Cloud Build config | `ls 04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml` | File exists |
| Stage deploy trigger | `git push origin main` | Cloud Build triggers stage deploy |
| Prod deploy trigger | `git tag v4.x.x && git push origin v4.x.x` | Cloud Build triggers prod deploy |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Router registration | Read `main.py`, verify all routers listed | All `include_router()` calls present |
| Auth dependency injection | Check router `dependencies=` parameter | `Depends(verify_org_key)` or `Depends(verify_root_key)` |
| Schema validation | POST invalid payload to any endpoint | 422 with validation errors |
| Error responses | Trigger each HTTP error code | Correct status + detail message |
| x_* field separation | Check API Service responses vs Pipeline writes | API = no x_*, Pipeline = x_* present |
| OpenAPI accuracy | Visit `/docs`, compare against router code | All endpoints documented with correct schemas |
| Org isolation | Use Org A key, request Org B data | 401 Unauthorized |
| Polars reads | Check cost endpoints return transformed data | DataFrame results serialized as JSON |
| BigQuery mocks | Review conftest.py | `AsyncMock` for `BigQueryClient` |
| Rate limiting | Rapid-fire requests to rate-limited endpoint | 429 after threshold |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| API Service unit tests | 100% passing |
| Pipeline Service unit tests | 100% passing |
| Router registration complete | All routers in main.py |
| Auth on all endpoints | 0 unprotected org endpoints |
| x_* field separation | 0 x_* in API Service, 100% x_* in Pipeline writes |
| Schema validation | All request payloads validated |
| OpenAPI docs | All endpoints documented |
| Health endpoint | 200 without auth |
| Error handling | All error codes return correct HTTP status |

## Known Limitations

1. **BigQuery dependency in integration tests**: Full integration tests require BigQuery access; unit tests mock the client via `AsyncMock` in `conftest.py`
2. **Rate limiting in tests**: Rate limit tests may be flaky due to timing; use controlled delays or mock the rate limiter
3. **Polars in CI**: Polars requires specific CPU features; CI runners must support AVX2 or use polars-lts-cpu
4. **Service venvs**: Each service has its own virtual environment; activating the wrong venv causes import errors
5. **Port conflicts**: Both services must run on different ports (8000 and 8001); tests assume these defaults
6. **KMS mocking**: KMS encryption tests mock the GCP KMS client; real encryption tested only in stage/prod
7. **Numbered test files**: Tests run in alphabetical order (`test_00_`, `test_01_`, etc.); ordering matters for E2E flows that depend on prior state
