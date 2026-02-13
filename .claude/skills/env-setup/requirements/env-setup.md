# Env Setup - Requirements

## Overview

Local development environment setup for CloudAct. Covers GCP credential configuration, Python virtual environment creation for backend services, Node.js setup for the frontend, Docker Compose for local orchestration, environment variable configuration, service startup, and test data initialization. This skill enables developers to go from a fresh clone to a running local development stack.

## Source Specifications

Defined in SKILL.md. Additional context from:
- Root `CLAUDE.md` (Development section)
- Service-specific `CLAUDE.md` files in each project directory

---

## Architecture

```
+---------------------------------------------------------------------------+
|                     Local Development Stack                               |
+---------------------------------------------------------------------------+
|                                                                           |
|  Developer Machine                                                        |
|  ------------------                                                       |
|                                                                           |
|  ~/.gcp/                        GCP Credentials                           |
|  +-- cloudact-testing-1-*.json  (Stage / Test)                            |
|  +-- cloudact-prod.json         (Production - read-only access)           |
|                                                                           |
|  01-fronted-system/             Next.js 16 (Port 3000)                    |
|  +-- node_modules/              npm install                               |
|  +-- .env.local                 Supabase + Stripe + API URLs              |
|                                                                           |
|  02-api-service/                FastAPI (Port 8000)                        |
|  +-- venv/                      Python 3.11+ venv                         |
|  +-- .env.local                 GCP project + root key + BigQuery         |
|                                                                           |
|  03-data-pipeline-service/      FastAPI (Port 8001)                       |
|  +-- venv/                      Python 3.11+ venv                         |
|  +-- .env.local                 GCP project + BigQuery                    |
|                                                                           |
|  docker-compose.yml             Optional: run all via Docker              |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  External Dependencies (Remote)                                           |
|  ------------------------------                                           |
|  BigQuery (cloudact-testing-1)  Cost data, org datasets                   |
|  Supabase (kwroaccbrxppfiysqlzs) Auth, organizations, quotas             |
|  Stripe (TEST keys)             Billing checkout (test mode)              |
|  GCP KMS (cloudact-testing-1)   Credential encryption                    |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## Functional Requirements

### FR-ES-001: Prerequisites

- **FR-ES-001.1**: Python 3.11+ installed and available as `python3`
- **FR-ES-001.2**: Node.js 20+ and npm 10+ installed
- **FR-ES-001.3**: Google Cloud SDK (`gcloud`) installed and configured
- **FR-ES-001.4**: Docker 24+ and Docker Compose 2+ installed (optional, for container-based dev)
- **FR-ES-001.5**: Git configured for the repository

### FR-ES-002: GCP Credential Setup

- **FR-ES-002.1**: Service account key files stored in `~/.gcp/` (never in the repository)
- **FR-ES-002.2**: Stage/test credential: `~/.gcp/cloudact-testing-1-e44da390bf82.json` for project `cloudact-testing-1`
- **FR-ES-002.3**: Production credential: `~/.gcp/cloudact-prod.json` for project `cloudact-prod`
- **FR-ES-002.4**: `gcloud auth application-default login` for local development (alternative to service account)
- **FR-ES-002.5**: `GOOGLE_APPLICATION_CREDENTIALS` environment variable points to the active credential file
- **FR-ES-002.6**: `gcloud config set project cloudact-testing-1` for local development context

### FR-ES-003: Python Virtual Environments

- **FR-ES-003.1**: API Service venv at `02-api-service/venv/` created via `python3 -m venv venv`
- **FR-ES-003.2**: Pipeline Service venv at `03-data-pipeline-service/venv/` created via `python3 -m venv venv`
- **FR-ES-003.3**: Dependencies installed via `pip install -r requirements.txt` in each venv
- **FR-ES-003.4**: Each service uses its own isolated venv (never share or use system Python)
- **FR-ES-003.5**: Scheduler Jobs venv at `05-scheduler-jobs/venv/` (optional, for local job testing)

### FR-ES-004: Frontend Setup

- **FR-ES-004.1**: `npm install` in `01-fronted-system/` installs all dependencies
- **FR-ES-004.2**: `.env.local` configured with Supabase URL, anon key, and service role key
- **FR-ES-004.3**: `.env.local` configured with Stripe publishable and secret keys (TEST mode)
- **FR-ES-004.4**: `.env.local` configured with API URL (`http://localhost:8000`) and Pipeline URL (`http://localhost:8001`)
- **FR-ES-004.5**: `npm run dev` starts the Next.js dev server on port 3000

### FR-ES-005: Environment Variables

- **FR-ES-005.1**: Each service has a `.env.local` file for local development
- **FR-ES-005.2**: Required for all services: `GOOGLE_CLOUD_PROJECT`, `ENVIRONMENT=development`, `BQ_LOCATION=US`
- **FR-ES-005.3**: Required for API Service: `CA_ROOT_API_KEY` (minimum 32 characters)
- **FR-ES-005.4**: Required for Frontend: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`
- **FR-ES-005.5**: `.env.local` files are gitignored (never committed to source control)

### FR-ES-006: Service Startup

- **FR-ES-006.1**: API Service: `cd 02-api-service && source venv/bin/activate && python3 -m uvicorn src.app.main:app --port 8000 --reload`
- **FR-ES-006.2**: Pipeline Service: `cd 03-data-pipeline-service && source venv/bin/activate && python3 -m uvicorn src.app.main:app --port 8001 --reload`
- **FR-ES-006.3**: Frontend: `cd 01-fronted-system && npm run dev` (starts on port 3000)
- **FR-ES-006.4**: Each service starts independently in its own terminal
- **FR-ES-006.5**: `--reload` flag enables hot-reloading for Python services during development

### FR-ES-007: Docker Compose (Alternative)

- **FR-ES-007.1**: `docker-compose up -d` starts all 3 services in containers
- **FR-ES-007.2**: Docker Compose mounts `~/.config/gcloud` for GCP credentials
- **FR-ES-007.3**: Ports mapped: 3000 (frontend), 8000 (api), 8001 (pipeline)
- **FR-ES-007.4**: `docker-compose logs -f` for live log streaming
- **FR-ES-007.5**: `docker-compose down` stops and removes containers

### FR-ES-008: Test Data Initialization

- **FR-ES-008.1**: Bootstrap creates the `organizations` dataset with 27 meta tables via `POST /api/v1/admin/bootstrap`
- **FR-ES-008.2**: Demo account setup via `npx tsx tests/demo-setup/setup-demo-account.ts` (creates Supabase user + Stripe subscription + BigQuery dataset)
- **FR-ES-008.3**: Demo data loaded via `npx tsx tests/demo-setup/load-demo-data-direct.ts` (cost data for Dec 2025 - Jan 2026)
- **FR-ES-008.4**: Demo credentials: `demo@cloudact.ai` / `Demo1234` / Acme Inc
- **FR-ES-008.5**: Supabase email confirmation must be disabled for local demo setup

### FR-ES-009: Verification

- **FR-ES-009.1**: `curl http://localhost:8000/health` returns `{"status":"ok"}`
- **FR-ES-009.2**: `curl http://localhost:8001/health` returns `{"status":"ok"}`
- **FR-ES-009.3**: `http://localhost:3000` loads the frontend without errors
- **FR-ES-009.4**: `http://localhost:8000/docs` shows FastAPI Swagger UI
- **FR-ES-009.5**: `http://localhost:8001/docs` shows FastAPI Swagger UI

---

## SDLC / Development Workflow

### Local Dev Cycle

```
Developer Local Cycle:
  1. Clone repo, run env-setup (one-time)
  2. Start services (3 terminals or Docker Compose)
  3. Edit code -> hot-reload picks up changes
  4. Test locally (manual + E2E)
  5. Commit and push to feature branch
  6. PR to main -> code review
  7. Merge -> auto-deploy to stage

Daily Startup:
  1. cd 02-api-service && source venv/bin/activate && uvicorn ... --reload
  2. cd 03-data-pipeline-service && source venv/bin/activate && uvicorn ... --reload
  3. cd 01-fronted-system && npm run dev
  4. Open http://localhost:3000

After Dependency Changes:
  - Python: pip install -r requirements.txt (in active venv)
  - Node.js: npm install (in 01-fronted-system/)
```

### Testing Approach

| Phase | What | How |
|-------|------|-----|
| Setup validation | Prerequisites check | Verify versions: python3, node, gcloud, docker |
| Setup validation | Credentials check | `gcloud auth list`, `ls ~/.gcp/` |
| Service startup | Health checks | `curl /health` on each service |
| Service startup | API docs | Open `/docs` on API and Pipeline services |
| Data initialization | Bootstrap | `POST /api/v1/admin/bootstrap` |
| Data initialization | Demo account | `setup-demo-account.ts` + `load-demo-data-direct.ts` |
| Ongoing dev | Hot-reload | Edit file, verify change reflected |

### CI/CD Integration

- Local development uses `cloudact-testing-1` GCP project (same as stage)
- Environment variables in `.env.local` files are not committed (gitignored)
- Docker Compose config mirrors Cloud Run service topology
- Same Dockerfiles used for local Docker and Cloud Build

---

## Environment Variables Summary

### API Service (.env.local)

```bash
GOOGLE_CLOUD_PROJECT=cloudact-testing-1
GOOGLE_APPLICATION_CREDENTIALS=~/.gcp/cloudact-testing-1-e44da390bf82.json
CA_ROOT_API_KEY=your-secure-key-min-32-chars
ENVIRONMENT=development
BQ_LOCATION=US
BIGQUERY_LOCATION=US
LOG_LEVEL=DEBUG
```

### Pipeline Service (.env.local)

```bash
GOOGLE_CLOUD_PROJECT=cloudact-testing-1
GOOGLE_APPLICATION_CREDENTIALS=~/.gcp/cloudact-testing-1-e44da390bf82.json
ENVIRONMENT=development
BQ_LOCATION=US
BIGQUERY_LOCATION=US
LOG_LEVEL=DEBUG
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://kwroaccbrxppfiysqlzs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PIPELINE_URL=http://localhost:8001
```

---

## Non-Functional Requirements

### NFR-ES-001: Setup Time

- Full environment setup (from clone to running services) should complete in < 15 minutes
- Dependency installation: npm < 2 minutes, pip < 3 minutes per service
- Service startup: each service ready within 10 seconds

### NFR-ES-002: Isolation

- Each Python service has its own venv (no shared packages)
- Frontend uses its own `node_modules/`
- GCP credentials in `~/.gcp/` are outside the repository
- `.env.local` files are gitignored and machine-specific

### NFR-ES-003: Reproducibility

- `requirements.txt` pins dependency versions for consistent installs
- `package-lock.json` ensures deterministic npm installs
- Docker Compose provides identical container environment across machines

### NFR-ES-004: Developer Experience

- Hot-reload enabled for all services during development
- FastAPI Swagger UI available at `/docs` for API exploration
- Error messages in development mode include full stack traces (`LOG_LEVEL=DEBUG`)
- Port conflicts detectable via `lsof -i :<port>`

---

## Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Docker Compose configuration for all services |
| `02-api-service/requirements.txt` | API Service Python dependencies |
| `03-data-pipeline-service/requirements.txt` | Pipeline Service Python dependencies |
| `01-fronted-system/package.json` | Frontend Node.js dependencies |
| `02-api-service/Dockerfile` | API Service Docker image definition |
| `03-data-pipeline-service/Dockerfile` | Pipeline Service Docker image definition |
| `01-fronted-system/Dockerfile` | Frontend Docker image definition |
| `.env.example` | Environment variable template |
| `01-fronted-system/tests/demo-setup/setup-demo-account.ts` | Demo account creation script |
| `01-fronted-system/tests/demo-setup/load-demo-data-direct.ts` | Demo data loading script |
| `01-fronted-system/tests/demo-setup/cleanup-demo-account.ts` | Demo account cleanup script |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Port already in use | Previous process still running | `lsof -i :<port>` then `kill -9 <PID>` |
| GCP auth not working | Expired or missing credentials | `gcloud auth application-default login` |
| Module not found (Python) | Wrong venv or missing install | `source venv/bin/activate && pip install -r requirements.txt` |
| Node modules error | Stale `node_modules/` | `rm -rf node_modules package-lock.json && npm install` |
| BigQuery permission denied | Wrong GCP project | `gcloud config set project cloudact-testing-1` |
| Supabase connection error | Wrong URL or keys in `.env.local` | Verify Supabase project ID matches environment |
| Stripe checkout fails | Missing or wrong Stripe keys | Use TEST keys (`pk_test_*`, `sk_test_*`) for local dev |
| Demo signup 400 error | Email confirmation enabled | Disable in Supabase Auth settings |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/deploy-check` | Deployment to remote environments. Env-setup covers the local development counterpart. |
| `/bootstrap-onboard` | Bootstrap and org onboarding. Required after env-setup to initialize test data. |
| `/test-orchestration` | Running tests. Env-setup provides the local environment that tests run against. |
| `/infra-cicd` | Infrastructure architecture. Env-setup mirrors the production topology locally. |
| `/frontend-dev` | Frontend development patterns. Env-setup configures the Next.js development server. |
| `/api-dev` | API development patterns. Env-setup configures the FastAPI development server. |
