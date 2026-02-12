# Infrastructure & CI/CD - Test Plan

## Overview

Validates deployment workflows, Cloud Build triggers, health checks, rollback procedures, secrets management, and Cloud Run Jobs for all environments (test, stage, prod).

## Test Matrix

### Cloud Build Triggers (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Push to main triggers stage deployment | E2E | Cloud Build starts for `cloudbuild-stage.yaml` |
| 2 | Push v* tag triggers prod deployment | E2E | Cloud Build starts for `cloudbuild-prod.yaml` |
| 3 | Cloud Build stage YAML is valid | Validation | `cloudbuild-stage.yaml` parses without errors |
| 4 | Cloud Build prod YAML is valid | Validation | `cloudbuild-prod.yaml` parses without errors |
| 5 | Build history is queryable | CLI | `gcloud builds list --project=cloudact-prod --limit=5` returns results |

### Version Tagging (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 6 | `releases.sh next` suggests valid version | CLI | Outputs `vMAJOR.MINOR.PATCH` format |
| 7 | `releases.sh list` shows existing tags | CLI | Lists git tags matching `v*` pattern |
| 8 | `releases.sh deployed` shows deployed versions | CLI | Shows version per environment |
| 9 | Version in `config.py` matches latest tag | Validation | `release_version` field matches git tag |

### Health Checks (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 10 | API Service health (stage) | HTTP | `{"status":"ok"}` from stage URL |
| 11 | Pipeline Service health (stage) | HTTP | `{"status":"ok"}` from stage URL |
| 12 | API Service health (prod) | HTTP | `{"status":"ok"}` from `https://api.cloudact.ai/health` |
| 13 | Pipeline Service health (prod) | HTTP | `{"status":"ok"}` from `https://pipeline.cloudact.ai/health` |
| 14 | Frontend health (prod) | HTTP | 200 from `https://cloudact.ai` |
| 15 | `status.sh` checks all services | CLI | Outputs health status for all 3 services |

### Deploy Scripts (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 16 | `deploy-all.sh test` completes | CLI | All 3 services deployed to test |
| 17 | `cicd.sh` builds and pushes single service | CLI | Docker image built, pushed to GCR, deployed |
| 18 | `build.sh` creates Docker image | CLI | Image tagged with `{env}-{timestamp}` |
| 19 | `push.sh` pushes to GCR | CLI | Image appears in `gcr.io/{project}/` |
| 20 | `deploy.sh` deploys to Cloud Run | CLI | Service revision created |

### Secrets Management (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 21 | `verify-secrets.sh prod` passes | CLI | All 4 required secrets exist |
| 22 | `validate-env.sh prod frontend` passes | CLI | Env vars + secrets validated |
| 23 | `ca-root-api-key-prod` exists | GCP | Secret accessible in Secret Manager |
| 24 | `stripe-secret-key-prod` exists | GCP | Secret accessible in Secret Manager |
| 25 | `supabase-service-role-key-prod` exists | GCP | Secret accessible in Secret Manager |

### Rollback Operations (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 26 | List Cloud Run revisions | CLI | `gcloud run revisions list` returns revision history |
| 27 | Traffic routing to previous revision | CLI | Traffic shifted to specified revision |
| 28 | Backup image tagging works | CLI | Current image tagged with `backup-{timestamp}` |

### Cloud Run Jobs (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 29 | `list-jobs.sh` shows all jobs | CLI | Lists bootstrap, quota-reset-daily, stale-cleanup, etc. |
| 30 | `run-job.sh` bootstrap completes | CLI | Job execution succeeds |
| 31 | `run-job.sh` quota-reset-daily completes | CLI | Job execution succeeds |
| 32 | `run-job.sh` stale-cleanup completes | CLI | Job execution succeeds |
| 33 | Cloud Scheduler triggers are active | CLI | `gcloud scheduler jobs list` shows ENABLED state |
| 34 | Job execution history is queryable | CLI | `gcloud run jobs executions list` returns history |

### Environment Configuration (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 35 | `environments.conf` has valid entries | Validation | test, stage, prod environments defined |
| 36 | GCP credential files exist | Validation | Files present in `~/.gcp/` |
| 37 | Service account activation works | CLI | `gcloud auth activate-service-account` succeeds |
| 38 | Service-to-service URLs configured | Validation | `PIPELINE_SERVICE_URL` and `API_SERVICE_URL` set |

**Total: 38 tests**

## Verification Commands

```bash
# Cloud Build status
gcloud builds list --project=cloudact-prod --region=global --limit=5
gcloud builds list --project=cloudact-testing-1 --region=global --limit=5

# Health checks (prod)
curl -s https://api.cloudact.ai/health
curl -s https://pipeline.cloudact.ai/health

# Health checks (stage - get URL first)
API_URL=$(gcloud run services describe cloudact-api-service-stage --region=us-central1 --format="value(status.url)" --project=cloudact-testing-1)
curl -s ${API_URL}/health

# Releases
cd 04-inra-cicd-automation/CICD
./releases.sh next
./releases.sh list
./releases.sh deployed

# Secrets
cd 04-inra-cicd-automation/CICD
./secrets/verify-secrets.sh prod
./secrets/validate-env.sh prod frontend

# Status
./quick/status.sh prod

# Cloud Run Jobs
cd 05-scheduler-jobs
./scripts/list-jobs.sh prod
gcloud run jobs executions list --region=us-central1 --project=cloudact-prod --limit=10

# Cloud Scheduler
gcloud scheduler jobs list --location=us-central1 --project=cloudact-prod

# Revisions (rollback readiness)
gcloud run revisions list --service=cloudact-api-service-prod --project=cloudact-prod --region=us-central1
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Health checks passing | 6/6 (100%) |
| Secrets validation | 5/5 (100%) |
| Cloud Build triggers valid | 2/2 (100%) |
| Cloud Run Jobs operational | 4/4 (100%) |
| Deploy scripts functional | 5/5 (test env only) |
| Rollback readiness | Revisions available, traffic routing works |

## Known Limitations

1. **Cloud Build triggers**: Cannot be tested without actual git push/tag operations. Verify via build history.
2. **Production deploys**: Manual deploy scripts should NOT be used for prod. Always use git tags.
3. **Secrets rotation**: Testing secret updates requires GCP IAM permissions. Do not test on prod secrets directly.
4. **Service account naming**: Test uses `cloudact-sa-test@`, but stage/prod use `cloudact-{env}@` (no `-sa-`).
5. **Frontend env vars**: `NEXT_PUBLIC_*` variables are baked at build time. Cannot change at runtime.
6. **Rollback in prod**: Only test rollback procedures in stage. Prod rollback is via new patch tag.
7. **Image tag convention**: Push script creates `{env}-{timestamp}` tags. Deploy expects `{env}-latest` or version tags.
