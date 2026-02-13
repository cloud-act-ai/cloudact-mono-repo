# Env Setup - Test Plan

## Overview

Validates local development environment setup: prerequisites, GCP credentials, Python virtual environments, Node.js dependencies, service startup, environment variables, Docker Compose, and test data initialization.

## Test Matrix (30 checks)

### Prerequisites (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Python 3.11+ installed | CLI | `python3 --version` returns 3.11+ |
| 2 | Node.js 20+ installed | CLI | `node --version` returns 20+ |
| 3 | npm 10+ installed | CLI | `npm --version` returns 10+ |
| 4 | Google Cloud SDK installed | CLI | `gcloud --version` returns version info |
| 5 | Docker installed | CLI | `docker --version` returns 24+ |

### GCP Credentials (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 6 | Stage credential file exists | Filesystem | `~/.gcp/cloudact-testing-1-e44da390bf82.json` present |
| 7 | Prod credential file exists | Filesystem | `~/.gcp/cloudact-prod.json` present |
| 8 | `gcloud auth list` shows active account | CLI | At least one active account listed |
| 9 | `gcloud config get project` returns valid project | CLI | Returns `cloudact-testing-1` for local dev |
| 10 | BigQuery access verified | CLI | `bq ls --project_id=cloudact-testing-1` succeeds |

### Python Virtual Environments (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 11 | API Service venv exists | Filesystem | `02-api-service/venv/bin/activate` present |
| 12 | Pipeline Service venv exists | Filesystem | `03-data-pipeline-service/venv/bin/activate` present |
| 13 | API Service dependencies installed | CLI | `source venv/bin/activate && pip check` passes in `02-api-service/` |
| 14 | Pipeline Service dependencies installed | CLI | `source venv/bin/activate && pip check` passes in `03-data-pipeline-service/` |
| 15 | FastAPI importable in API venv | CLI | `python -c "import fastapi"` succeeds in API venv |

### Frontend Setup (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 16 | `node_modules/` exists | Filesystem | `01-fronted-system/node_modules/` present |
| 17 | `next` package installed | CLI | `npx next --version` succeeds in `01-fronted-system/` |
| 18 | `package-lock.json` present | Filesystem | `01-fronted-system/package-lock.json` exists |
| 19 | Frontend builds without error | CLI | `npm run build` completes in `01-fronted-system/` |

### Environment Variables (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 20 | API `.env.local` exists | Filesystem | `02-api-service/.env.local` present |
| 21 | Pipeline `.env.local` exists | Filesystem | `03-data-pipeline-service/.env.local` present |
| 22 | Frontend `.env.local` exists | Filesystem | `01-fronted-system/.env.local` present |
| 23 | `GOOGLE_CLOUD_PROJECT` set in API env | Validation | Variable defined and non-empty |

### Service Startup and Health (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 24 | API Service starts on port 8000 | HTTP | `curl http://localhost:8000/health` returns `{"status":"ok"}` |
| 25 | Pipeline Service starts on port 8001 | HTTP | `curl http://localhost:8001/health` returns `{"status":"ok"}` |
| 26 | Frontend starts on port 3000 | HTTP | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns 200 |
| 27 | API Swagger UI accessible | HTTP | `curl http://localhost:8000/docs` returns 200 |
| 28 | Pipeline Swagger UI accessible | HTTP | `curl http://localhost:8001/docs` returns 200 |

### Docker Compose (2 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 29 | `docker-compose.yml` valid | CLI | `docker-compose config` parses without error |
| 30 | Docker Compose starts all services | CLI | `docker-compose up -d` starts 3 containers |

## Backend Tests

### Prerequisites Verification

```bash
# Check all prerequisites
python3 --version        # Expected: 3.11+
node --version           # Expected: 20+
npm --version            # Expected: 10+
gcloud --version         # Expected: Google Cloud SDK installed
docker --version         # Expected: 24+
docker-compose --version # Expected: 2+
```

### GCP Credential Verification

```bash
# Check credential files exist
ls -la ~/.gcp/cloudact-testing-1-e44da390bf82.json
ls -la ~/.gcp/cloudact-prod.json

# Verify active GCP auth
gcloud auth list
gcloud config get project

# Test BigQuery access
bq ls --project_id=cloudact-testing-1

# Activate stage credentials
gcloud auth activate-service-account --key-file=~/.gcp/cloudact-testing-1-e44da390bf82.json
gcloud config set project cloudact-testing-1
```

### Python Environment Verification

```bash
# API Service
cd 02-api-service
source venv/bin/activate
python --version
pip check
python -c "import fastapi; print(fastapi.__version__)"
deactivate

# Pipeline Service
cd 03-data-pipeline-service
source venv/bin/activate
python --version
pip check
python -c "import fastapi; print(fastapi.__version__)"
deactivate
```

### Frontend Verification

```bash
cd 01-fronted-system
ls node_modules/.package-lock.json    # Confirm node_modules exists
npx next --version                     # Confirm Next.js installed
npm run build                          # Confirm builds cleanly
```

### Environment Variable Verification

```bash
# Check .env.local files exist
ls -la 02-api-service/.env.local
ls -la 03-data-pipeline-service/.env.local
ls -la 01-fronted-system/.env.local

# Verify critical variables (existence, not values)
grep "GOOGLE_CLOUD_PROJECT" 02-api-service/.env.local
grep "CA_ROOT_API_KEY" 02-api-service/.env.local
grep "NEXT_PUBLIC_SUPABASE_URL" 01-fronted-system/.env.local
grep "STRIPE_SECRET_KEY" 01-fronted-system/.env.local
```

### Service Health Verification

```bash
# Start services (each in separate terminal, or use Docker Compose)
# Then verify:

# API Service
curl -s http://localhost:8000/health | python3 -m json.tool
# Expected: {"status": "ok"}

# Pipeline Service
curl -s http://localhost:8001/health | python3 -m json.tool
# Expected: {"status": "ok"}

# Frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200

# API Docs
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs
# Expected: 200

# Pipeline Docs
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/docs
# Expected: 200
```

### Docker Compose Verification

```bash
# Validate config
docker-compose config

# Start all services
docker-compose up -d

# Check running containers
docker-compose ps

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Test Data Initialization

```bash
# 1. Bootstrap (requires API Service running)
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"

# 2. Demo account setup (requires all 3 services running)
cd 01-fronted-system
npx tsx tests/demo-setup/setup-demo-account.ts
# Output: { orgSlug, apiKey, dashboardUrl }

# 3. Load demo data
export ORG_SLUG="acme_inc_xxxxx"   # from step 2
export ORG_API_KEY="..."           # from step 2
npx tsx tests/demo-setup/load-demo-data-direct.ts \
  --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 4. Verify costs (demo data: Dec 2025 - Jan 2026)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool
```

## Frontend Tests

No dedicated Playwright tests for env-setup. Frontend setup is verified via HTTP health check and successful build.

```bash
cd 01-fronted-system

# Build verification
npm run build

# Dev server verification
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200
kill %1
```

## SDLC Verification

| Phase | Verification | Command |
|-------|-------------|---------|
| Initial setup | Clone + install | `git clone ... && npm install && pip install ...` |
| Credential config | GCP auth | `gcloud auth list` |
| Env vars | .env.local files | `ls *.env.local` per service |
| Service startup | Health checks | `curl /health` on each port |
| Data init | Bootstrap | `POST /api/v1/admin/bootstrap` |
| Data init | Demo account | `setup-demo-account.ts` + `load-demo-data-direct.ts` |
| Daily dev | Hot-reload | Edit file, verify change reflected in browser/API |
| Pre-commit | Local tests | Run relevant test suite |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| All prerequisites installed | Run version checks | All tools at required versions |
| GCP credentials configured | `gcloud auth list` | Active account shown |
| Python venvs created | `ls */venv/bin/activate` | Files exist for API and Pipeline |
| Frontend dependencies installed | `ls 01-fronted-system/node_modules` | Directory exists and populated |
| .env.local files present | `ls */.env.local` | Files exist for all 3 services |
| API Service starts | `curl localhost:8000/health` | `{"status":"ok"}` |
| Pipeline Service starts | `curl localhost:8001/health` | `{"status":"ok"}` |
| Frontend starts | `curl localhost:3000` | 200 response |
| API docs accessible | Open `localhost:8000/docs` | Swagger UI renders |
| Bootstrap works | POST to bootstrap endpoint | 200 with tables created |
| Demo account works | Run setup script | Account created with API key |
| Hot-reload works | Edit Python file, check response | Change reflected without manual restart |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Prerequisites installed | 5/5 (100%) |
| GCP credentials valid | 2/2 credential files present |
| Python venvs functional | 2/2 venvs with deps installed |
| Frontend deps installed | node_modules populated |
| .env.local files present | 3/3 services configured |
| Health checks passing | 3/3 services return OK |
| API docs accessible | 2/2 Swagger UIs load |
| Bootstrap succeeds | 27 meta tables created |
| Docker Compose valid | Config parses, services start |

## Known Limitations

1. **GCP credential files**: Service account JSON files must be obtained from a team admin. Cannot be auto-generated during setup.
2. **Supabase keys**: Anon key and service role key must be copied from Supabase dashboard. No automated retrieval.
3. **Stripe TEST keys**: Must be obtained from Stripe dashboard (test mode). Different team members may use different test accounts.
4. **Port conflicts**: If ports 3000, 8000, or 8001 are in use by other processes, services will fail to start. Kill the conflicting process first.
5. **Docker Compose vs manual**: Docker Compose and manual startup are alternatives. Running both simultaneously will cause port conflicts.
6. **Demo data date range**: Demo data covers Dec 2025 - Jan 2026. Always use `start_date=2025-12-01&end_date=2026-01-31` for queries.
7. **Email confirmation**: Supabase email confirmation must be manually disabled for local demo account setup.
8. **venv activation**: Python virtual environments must be activated in each terminal session. Forgetting activation leads to import errors.
9. **M1/M2 Mac**: Some Python packages may require Rosetta or ARM-specific builds. Use `pip install --no-cache-dir` if install fails.
