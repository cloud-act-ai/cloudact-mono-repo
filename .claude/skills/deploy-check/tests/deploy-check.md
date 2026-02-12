# Deploy Check - Test Plan

## Overview

Validates the full deployment lifecycle: Cloud Build triggers, health checks, secrets management, rollback procedures, and environment isolation across test, stage, and prod environments.

## Test Matrix (32 checks)

### Health Check Endpoints (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | API Service health (stage) | HTTP | `{"status":"ok"}` from stage Cloud Run URL |
| 2 | Pipeline Service health (stage) | HTTP | `{"status":"ok"}` from stage Cloud Run URL |
| 3 | API Service health (prod) | HTTP | `{"status":"ok"}` from `https://api.cloudact.ai/health` |
| 4 | Pipeline Service health (prod) | HTTP | `{"status":"ok"}` from `https://pipeline.cloudact.ai/health` |
| 5 | Frontend health (prod) | HTTP | 200 from `https://cloudact.ai` |
| 6 | `status.sh prod` checks all services | CLI | Outputs health status for all 3 services |

### Cloud Build Triggers (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 7 | `cloudbuild-stage.yaml` is valid YAML | Validation | File parses without errors |
| 8 | `cloudbuild-prod.yaml` is valid YAML | Validation | File parses without errors |
| 9 | Stage build history exists | CLI | `gcloud builds list --project=cloudact-testing-1 --limit=5` returns results |
| 10 | Prod build history exists | CLI | `gcloud builds list --project=cloudact-prod --limit=5` returns results |
| 11 | Latest stage build status is SUCCESS | CLI | Most recent build shows `STATUS: SUCCESS` |

### Secrets Validation (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 12 | `verify-secrets.sh prod` passes | CLI | All required secrets confirmed |
| 13 | `validate-env.sh prod frontend` passes | CLI | Frontend env vars and secrets validated |
| 14 | `ca-root-api-key-prod` exists in Secret Manager | GCP | `gcloud secrets describe ca-root-api-key-prod` succeeds |
| 15 | `stripe-secret-key-prod` exists in Secret Manager | GCP | `gcloud secrets describe stripe-secret-key-prod` succeeds |
| 16 | `stripe-webhook-secret-prod` exists in Secret Manager | GCP | `gcloud secrets describe stripe-webhook-secret-prod` succeeds |
| 17 | `supabase-service-role-key-prod` exists in Secret Manager | GCP | `gcloud secrets describe supabase-service-role-key-prod` succeeds |

### Service URLs and Routing (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 18 | `cloudact.ai` resolves and returns 200 | HTTP | Frontend accessible |
| 19 | `api.cloudact.ai` resolves and returns 200 | HTTP | API docs or health page |
| 20 | `pipeline.cloudact.ai` resolves and returns 200 | HTTP | Pipeline docs or health page |
| 21 | Cloud Run traffic routes 100% to latest revision | CLI | `gcloud run services describe` shows latest at 100% |

### Rollback Readiness (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 22 | Cloud Run revisions list available (api-service) | CLI | Multiple revisions listed |
| 23 | Cloud Run revisions list available (pipeline-service) | CLI | Multiple revisions listed |
| 24 | Traffic routing to previous revision (stage only) | CLI | Traffic shifted successfully |
| 25 | New patch tag triggers rebuild | E2E | `v*.*.N+1` tag triggers `cloudbuild-prod.yaml` |

### Deploy Scripts (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 26 | `deploy-test.sh` completes without error | CLI | All 3 services deployed to test |
| 27 | `deploy.sh` deploys single service to test | CLI | Specified service deployed |
| 28 | `releases.sh next` suggests valid version | CLI | Outputs `vMAJOR.MINOR.PATCH` format |
| 29 | `releases.sh list` shows existing tags | CLI | Lists git tags matching `v*` |

### Environment Isolation (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 30 | `environments.conf` has valid entries | Validation | test, stage, prod environments defined |
| 31 | Stage uses `cloudact-testing-1` project | Validation | Cloud Build and Cloud Run in correct project |
| 32 | Prod uses `cloudact-prod` project | Validation | Cloud Build and Cloud Run in correct project |

## Backend Tests

### Verification Commands

```bash
# Health checks (prod)
curl -s https://api.cloudact.ai/health
curl -s https://pipeline.cloudact.ai/health
curl -s -o /dev/null -w "%{http_code}" https://cloudact.ai

# Health checks (stage - get URL first)
API_URL=$(gcloud run services describe cloudact-api-service-stage \
  --region=us-central1 --format="value(status.url)" --project=cloudact-testing-1)
curl -s ${API_URL}/health

PIPELINE_URL=$(gcloud run services describe cloudact-pipeline-service-stage \
  --region=us-central1 --format="value(status.url)" --project=cloudact-testing-1)
curl -s ${PIPELINE_URL}/health
```

### Secrets Verification

```bash
cd 04-inra-cicd-automation/CICD

# Verify all secrets exist
./secrets/verify-secrets.sh prod
./secrets/verify-secrets.sh stage

# Validate environment config
./secrets/validate-env.sh prod frontend
./secrets/validate-env.sh prod api-service
./secrets/validate-env.sh prod pipeline-service

# Check individual secrets (existence only, not values)
gcloud secrets describe ca-root-api-key-prod --project=cloudact-prod
gcloud secrets describe stripe-secret-key-prod --project=cloudact-prod
gcloud secrets describe stripe-webhook-secret-prod --project=cloudact-prod
gcloud secrets describe supabase-service-role-key-prod --project=cloudact-prod
```

### Cloud Build Verification

```bash
# Build history
gcloud builds list --project=cloudact-prod --region=global --limit=5
gcloud builds list --project=cloudact-testing-1 --region=global --limit=5

# YAML validation
python3 -c "import yaml; yaml.safe_load(open('04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml'))"
python3 -c "import yaml; yaml.safe_load(open('04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml'))"
```

### Rollback Verification

```bash
# List revisions
gcloud run revisions list --service=cloudact-api-service-prod \
  --project=cloudact-prod --region=us-central1

# Check traffic allocation
gcloud run services describe cloudact-api-service-prod \
  --project=cloudact-prod --region=us-central1 \
  --format="value(status.traffic)"

# Rollback (stage testing only)
gcloud run services update-traffic cloudact-api-service-stage \
  --to-revisions=PREVIOUS_REVISION=100 \
  --project=cloudact-testing-1 --region=us-central1
```

### Release Management

```bash
cd 04-inra-cicd-automation/CICD

# Check next version
./releases.sh next

# List releases
./releases.sh list

# Check deployed versions
./releases.sh deployed
```

### Post-Deploy Monitoring

```bash
cd 04-inra-cicd-automation/CICD

# Status check
./quick/status.sh prod

# Monitor logs (50 lines)
./monitor/watch-all.sh prod 50
```

## Frontend Tests

No dedicated frontend E2E tests for deploy-check. Frontend health is verified via HTTP status code from the production URL.

```bash
# Verify frontend is serving
curl -s -o /dev/null -w "%{http_code}" https://cloudact.ai
# Expected: 200
```

## SDLC Verification

| Phase | Verification | Command |
|-------|-------------|---------|
| Pre-deploy | Secrets exist | `./secrets/verify-secrets.sh prod` |
| Pre-deploy | Env vars valid | `./secrets/validate-env.sh prod frontend` |
| Deploy (stage) | Push to main | `git push origin main` |
| Deploy (prod) | Tag and push | `git tag v4.x.y && git push origin v4.x.y` |
| Post-deploy | Health checks | `curl /health` on each service |
| Post-deploy | Status check | `./quick/status.sh prod` |
| Post-deploy | Log monitoring | `./monitor/watch-all.sh prod 50` |
| Rollback | New patch tag | `git tag v4.x.y+1 && git push origin v4.x.y+1` |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Stage auto-deploys on merge to main | Merge PR, check Cloud Build | Build starts within 1 minute |
| Prod auto-deploys on tag push | Push `v*` tag, check Cloud Build | Build starts within 1 minute |
| All 3 services healthy after deploy | `status.sh prod` | All services return `{"status":"ok"}` |
| Secrets accessible by services | Deploy succeeds, no secret errors in logs | No `SECRET_NOT_FOUND` errors |
| Rollback restores previous version | Shift traffic to previous revision | Health checks pass on old revision |
| No 5xx errors post-deploy | Monitor logs for 15 minutes | Zero 5xx responses |
| Production URLs resolve correctly | `curl cloudact.ai`, `api.cloudact.ai`, `pipeline.cloudact.ai` | All return 200 |
| Manual scripts cannot deploy to prod | Attempt `deploy.sh prod` | Script refuses or warns |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Health checks passing (prod) | 3/3 (100%) |
| Health checks passing (stage) | 3/3 (100%) |
| Secrets validation | 4/4 required secrets exist |
| Cloud Build YAML valid | 2/2 (100%) |
| Production URLs reachable | 3/3 (100%) |
| Rollback readiness | Revisions available, traffic routing works |
| Build history queryable | Both projects return build results |

## Known Limitations

1. **Cloud Build triggers**: Cannot be unit-tested without actual git push/tag operations. Verify via build history after real deployments.
2. **Production rollback**: Only test rollback procedures in stage. Production rollback is via new patch tag (preferred) or traffic shift (emergency).
3. **Secrets rotation**: Testing secret updates requires GCP IAM permissions. Do not rotate production secrets during testing.
4. **Frontend build-time vars**: `NEXT_PUBLIC_*` variables are baked at Docker build time. Changing them requires a full rebuild and redeploy.
5. **Manual script guardrails**: Manual deploy scripts may not have explicit production blocking in all cases. Rely on process discipline and Cloud Build for prod.
6. **Health check latency**: Cold-start Cloud Run services may take 10-30 seconds to respond on first request after scale-to-zero.
7. **Cross-service deploy ordering**: Cloud Build deploys all 3 services in parallel. If API depends on Pipeline being up, there may be transient errors during deploy.
