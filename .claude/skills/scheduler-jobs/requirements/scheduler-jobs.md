# Scheduler Jobs - Requirements

## Overview

Cloud Run Jobs for scheduled and manual operations. API-first design: jobs call API endpoints instead of direct database access.

## Source Specifications

- `05-scheduler-jobs/CLAUDE.md` - Architecture and operations
- `CLAUDE.md` (root) - Scheduler Jobs section

## Architecture

```
Cloud Scheduler (cron)
        │
        ▼
Cloud Run Jobs (05-scheduler-jobs/)
├─ Manual: bootstrap, org-sync-all, migrate
├─ Daily:  quota-reset, quota-cleanup, stale-cleanup, alerts
└─ Monthly: quota-monthly
        │
        ▼ (HTTP POST)
API Service (8000) ──────► BigQuery / Supabase
├─ /admin/bootstrap
├─ /admin/quota/reset-daily
├─ /admin/quota/cleanup-stale
├─ /admin/quota/reset-monthly
└─ /admin/alerts/process-all
```

## Functional Requirements

### FR-SJ-001: Job Creation & Infrastructure

| ID | Requirement |
|----|-------------|
| FR-SJ-001.1 | `create-all-jobs.sh` creates 8 Cloud Run Jobs (3 manual + 4 daily + 1 monthly) |
| FR-SJ-001.2 | `create-all-jobs.sh` creates 5 Cloud Scheduler triggers for automated jobs |
| FR-SJ-001.3 | Jobs use shared Docker image built from `05-scheduler-jobs/Dockerfile` |
| FR-SJ-001.4 | `cloudbuild-jobs.yaml` builds and pushes job image to GCR |
| FR-SJ-001.5 | `prod` environment requires confirmation (`echo "yes"` or interactive) |

### FR-SJ-002: Manual Jobs (Release Workflow)

| ID | Requirement |
|----|-------------|
| FR-SJ-002.1 | `migrate` calls Supabase Management API (NOT direct psql). Runs BEFORE frontend deploy |
| FR-SJ-002.2 | `bootstrap` is smart: fresh install creates 21+ tables, existing install syncs (adds columns) |
| FR-SJ-002.3 | `org-sync-all` iterates all active orgs and syncs their datasets. Runs AFTER bootstrap |
| FR-SJ-002.4 | Release order MUST be: migrate → bootstrap → org-sync-all |
| FR-SJ-002.5 | All manual jobs support `test`, `stage`, `prod` environments (NOT `local`) |

### FR-SJ-003: Scheduled Jobs (Daily)

| ID | Requirement |
|----|-------------|
| FR-SJ-003.1 | `quota-reset` runs at 00:00 UTC, resets daily pipeline counters for all orgs |
| FR-SJ-003.2 | `quota-cleanup` runs at 01:00 UTC, deletes quota records >90 days (direct BQ) |
| FR-SJ-003.3 | `stale-cleanup` runs at 02:00 UTC, fixes stuck concurrent counters (safety net only — self-healing handles most cases) |
| FR-SJ-003.4 | `alerts` runs at 08:00 UTC, processes cost alerts for all orgs |
| FR-SJ-003.5 | All daily jobs are idempotent — safe to re-run |

### FR-SJ-004: Scheduled Jobs (Monthly)

| ID | Requirement |
|----|-------------|
| FR-SJ-004.1 | `quota-monthly` runs at 00:05 UTC on 1st of month, resets monthly pipeline counters |
| FR-SJ-004.2 | Monthly reset is idempotent — safe to re-run |

### FR-SJ-005: API-First Design

| ID | Requirement |
|----|-------------|
| FR-SJ-005.1 | Jobs authenticate via `CA_ROOT_API_KEY` (X-CA-Root-Key header) |
| FR-SJ-005.2 | Jobs auto-detect API URL from GCP project (prod → api.cloudact.ai) |
| FR-SJ-005.3 | Exception: `quota-cleanup` uses direct BigQuery (maintenance job) |
| FR-SJ-005.4 | Exception: `migrate` uses Supabase Management API with SUPABASE_ACCESS_TOKEN |
| FR-SJ-005.5 | All API calls include error handling and retry logic |

### FR-SJ-006: Multi-Environment Support

| ID | Requirement |
|----|-------------|
| FR-SJ-006.1 | `run-job.sh` accepts `test`, `stage`, `prod` (NOT `local`) |
| FR-SJ-006.2 | Credentials must use absolute paths (tilde doesn't expand in gcloud) |
| FR-SJ-006.3 | Stage uses `cloudact-testing-1` project with `-test` secret suffix |
| FR-SJ-006.4 | Prod uses `cloudact-prod` project with `-prod` secret suffix |

## Non-Functional Requirements

### NFR-SJ-001: Reliability

| ID | Requirement |
|----|-------------|
| NFR-SJ-001.1 | All jobs are idempotent — safe to re-run without side effects |
| NFR-SJ-001.2 | Self-healing concurrent counters reduce stale-cleanup dependency |
| NFR-SJ-001.3 | Job failures are logged to Cloud Run execution logs |
| NFR-SJ-001.4 | Bootstrap smart mode: never destroys existing data (sync only adds) |

### NFR-SJ-002: Security

| ID | Requirement |
|----|-------------|
| NFR-SJ-002.1 | `CA_ROOT_API_KEY` stored in GCP Secret Manager (never in code) |
| NFR-SJ-002.2 | `SUPABASE_ACCESS_TOKEN` stored in GCP Secret Manager |
| NFR-SJ-002.3 | Service account credentials in `~/.gcp/` (never in repo) |
| NFR-SJ-002.4 | Prod operations require explicit confirmation |

## SDLC

### Development Workflow

1. Modify job script in `05-scheduler-jobs/jobs/`
2. Test locally: `python3 jobs/manual/bootstrap_smart.py` (requires env vars)
3. Build image: `gcloud builds submit --config=cloudbuild-jobs.yaml`
4. Test on stage: `./scripts/run-job.sh stage <job>`
5. Deploy to prod: `./scripts/run-job.sh prod <job>`

### Testing Approach

- **Unit**: Job scripts have inline validation (check env vars, API responses)
- **Integration**: `run-job.sh stage <job>` tests against real infrastructure
- **E2E**: Release workflow test: migrate → bootstrap → org-sync → verify

### Deployment

- Jobs image built via Cloud Build (`cloudbuild-jobs.yaml`)
- Cloud Scheduler triggers created via `create-all-jobs.sh`
- No CI/CD auto-trigger — jobs are manually deployed

## Key Files

| File | Purpose |
|------|---------|
| `05-scheduler-jobs/CLAUDE.md` | Full documentation |
| `05-scheduler-jobs/scripts/run-job.sh` | Execute jobs manually |
| `05-scheduler-jobs/scripts/create-all-jobs.sh` | Create jobs + schedulers |
| `05-scheduler-jobs/scripts/list-jobs.sh` | List jobs and executions |
| `05-scheduler-jobs/jobs/manual/*.py` | Manual job scripts |
| `05-scheduler-jobs/jobs/daily/*.py` | Daily job scripts |
| `05-scheduler-jobs/jobs/monthly/*.py` | Monthly job scripts |

## Related Skills

- `/bootstrap-onboard` - Bootstrap creates meta tables (BigQuery schema details)
- `/supabase-migrate` - Migration file format and status checking
- `/quota-mgmt` - Quota enforcement and reset logic
- `/infra-cicd` - Cloud Build deployment pipeline
