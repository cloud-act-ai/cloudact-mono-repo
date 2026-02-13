# Deploy Check - Requirements

## Overview

Deployment automation, health checks, and rollback for CloudAct. Covers the full deployment lifecycle across three environments (test, stage, prod) with automated Cloud Build triggers, pre/post-deployment validation, secrets management, and rollback procedures. All three Cloud Run services (frontend, api-service, pipeline-service) are deployed as a unit per environment.

## Source Specifications

Defined in SKILL.md. Additional context from:
- `04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml`
- `04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml`
- Root `CLAUDE.md` (Deployment section)

---

## Architecture

```
+---------------------------------------------------------------------------+
|                     CloudAct Deployment Flow                              |
+---------------------------------------------------------------------------+
|                                                                           |
|  Developer                  Cloud Build                   Cloud Run       |
|  ---------                  -----------                   ---------       |
|                                                                           |
|  git push main ----------> cloudbuild-stage.yaml -------> Stage Env       |
|                             (Auto-trigger)                (3 services)    |
|                                                                           |
|  git tag v* ------------> cloudbuild-prod.yaml ---------> Prod Env        |
|  git push origin v*        (Auto-trigger)                (3 services)     |
|                                                                           |
|  ./quick/deploy-test.sh -> Manual Docker build+push ----> Test Env        |
|                             (Dev/test ONLY)              (3 services)     |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  Pre-Deploy                Post-Deploy                   Rollback         |
|  ----------                -----------                   --------         |
|  validate-env.sh           /health on each service       New patch tag    |
|  verify-secrets.sh         status.sh <env>               (v4.4.1)        |
|                            watch-all.sh <env> <lines>    OR traffic shift |
|                                                          to prev revision |
+---------------------------------------------------------------------------+
```

---

## Functional Requirements

### FR-DC-001: Automated Stage Deployment

- **FR-DC-001.1**: Push to `main` branch triggers `cloudbuild-stage.yaml` automatically
- **FR-DC-001.2**: Cloud Build builds Docker images for all 3 services (frontend, api-service, pipeline-service)
- **FR-DC-001.3**: Cloud Build deploys all 3 services to Cloud Run in `cloudact-testing-1` project
- **FR-DC-001.4**: Build logs are queryable via `gcloud builds list --project=cloudact-testing-1`
- **FR-DC-001.5**: Each service is deployed with 2 CPU, 8Gi memory

### FR-DC-002: Automated Production Deployment

- **FR-DC-002.1**: Pushing a `v*` tag (e.g., `v4.4.0`) triggers `cloudbuild-prod.yaml` automatically
- **FR-DC-002.2**: Cloud Build builds Docker images for all 3 services
- **FR-DC-002.3**: Cloud Build deploys all 3 services to Cloud Run in `cloudact-prod` project
- **FR-DC-002.4**: Build logs are queryable via `gcloud builds list --project=cloudact-prod`
- **FR-DC-002.5**: Production URLs: `cloudact.ai` (frontend), `api.cloudact.ai` (API), `pipeline.cloudact.ai` (pipeline)

### FR-DC-003: Pre-Deployment Validation

- **FR-DC-003.1**: `./secrets/validate-env.sh <env> <service>` validates environment variables and secrets per service
- **FR-DC-003.2**: `./secrets/verify-secrets.sh <env>` confirms all required secrets exist in GCP Secret Manager
- **FR-DC-003.3**: Validation must pass for: `ca-root-api-key-{env}`, `stripe-secret-key-{env}`, `stripe-webhook-secret-{env}`, `supabase-service-role-key-{env}`
- **FR-DC-003.4**: Cloud Build YAML files must parse without errors before deploy

### FR-DC-004: Health Check Endpoints

- **FR-DC-004.1**: Each service exposes `/health` returning `{"status":"ok"}`
- **FR-DC-004.2**: Frontend (port 3000): `http(s)://{frontend_url}/health` or root returns 200
- **FR-DC-004.3**: API Service (port 8000): `http(s)://{api_url}/health` returns `{"status":"ok"}`
- **FR-DC-004.4**: Pipeline Service (port 8001): `http(s)://{pipeline_url}/health` returns `{"status":"ok"}`
- **FR-DC-004.5**: `./quick/status.sh <env>` runs health checks on all 3 services for the given environment

### FR-DC-005: Post-Deployment Verification

- **FR-DC-005.1**: All 3 health endpoints return 200 within 2 minutes of deployment
- **FR-DC-005.2**: `./monitor/watch-all.sh <env> <lines>` streams live logs for monitoring
- **FR-DC-005.3**: No 5xx errors in first 15 minutes post-deploy
- **FR-DC-005.4**: Cloud Run revision shows traffic routed to latest revision at 100%

### FR-DC-006: Rollback Procedure

- **FR-DC-006.1**: Rollback via new patch tag (e.g., `v4.4.1` pointing to previous working commit)
- **FR-DC-006.2**: Alternative rollback: route traffic to previous Cloud Run revision via `gcloud run services update-traffic`
- **FR-DC-006.3**: Cloud Run revision history is queryable via `gcloud run revisions list`
- **FR-DC-006.4**: Rollback must restore all 3 services to a known-good state

### FR-DC-007: Manual Deploy Scripts (Test/Dev Only)

- **FR-DC-007.1**: `./quick/deploy-test.sh` deploys all services to test environment
- **FR-DC-007.2**: Manual scripts must NEVER be used for production deployments
- **FR-DC-007.3**: `./deploy/deploy.sh` deploys a single service to a specified environment
- **FR-DC-007.4**: `./deploy-all.sh` deploys all services to a specified environment

### FR-DC-008: Secrets Management

- **FR-DC-008.1**: All secrets stored in GCP Secret Manager (never in code or environment files)
- **FR-DC-008.2**: Cloud Run services mount secrets at runtime from Secret Manager
- **FR-DC-008.3**: Four required secrets per environment: `ca-root-api-key-{env}`, `stripe-secret-key-{env}`, `stripe-webhook-secret-{env}`, `supabase-service-role-key-{env}`
- **FR-DC-008.4**: `./secrets/setup-secrets.sh <env>` creates missing secrets

---

## SDLC / Development Workflow

### Deployment Pipeline

```
Developer Workflow:
  1. Develop on feature branch
  2. PR to main -> Code review
  3. Merge to main -> Stage auto-deploy (Cloud Build)
  4. Verify stage: health checks + manual QA
  5. Tag release: git tag v4.x.y && git push origin v4.x.y
  6. Prod auto-deploy (Cloud Build)
  7. Verify prod: health checks + monitor logs

CI/CD Triggers:
  - Stage: cloudbuild-stage.yaml (on push to main)
  - Prod:  cloudbuild-prod.yaml  (on push of v* tag)

Manual Scripts (test/dev ONLY):
  - deploy-test.sh (quick test deploy)
  - deploy.sh (single service)
  - deploy-all.sh (all services)
```

### Testing Approach

| Phase | What | How |
|-------|------|-----|
| Pre-deploy | Secrets validation | `verify-secrets.sh`, `validate-env.sh` |
| Pre-deploy | YAML validation | Parse `cloudbuild-*.yaml` |
| Post-deploy | Health checks | `curl /health` on each service |
| Post-deploy | Smoke tests | `status.sh <env>` |
| Post-deploy | Log monitoring | `watch-all.sh <env> <lines>` |
| Ongoing | Build history | `gcloud builds list` |

### CI/CD Integration

- Cloud Build triggers configured in GCP Console for each project
- Stage builds on every merge to `main`
- Prod builds on every `v*` tag push
- Build logs retained in GCP Cloud Build history
- No manual intervention required for standard deploys

---

## Environments

| Environment | GCP Project | Trigger | Cloud Build YAML | Manual Scripts |
|-------------|-------------|---------|------------------|----------------|
| test | `cloudact-testing-1` | Manual only | N/A | `deploy-test.sh` |
| stage | `cloudact-testing-1` | Push to `main` | `cloudbuild-stage.yaml` | Not recommended |
| prod | `cloudact-prod` | Push `v*` tag | `cloudbuild-prod.yaml` | **NEVER** |

---

## Cloud Run Services

| Service | Port | CPU | Memory | Prod URL |
|---------|------|-----|--------|----------|
| frontend | 3000 | 2 | 8Gi | cloudact.ai |
| api-service | 8000 | 2 | 8Gi | api.cloudact.ai |
| pipeline-service | 8001 | 2 | 8Gi | pipeline.cloudact.ai |

---

## Non-Functional Requirements

### NFR-DC-001: Deployment Speed

- Cloud Build completes in < 15 minutes for all 3 services
- Health checks pass within 2 minutes of deployment
- Zero-downtime deploys via Cloud Run revision traffic shifting

### NFR-DC-002: Environment Isolation

- Test and stage share `cloudact-testing-1` project but use separate service names
- Production uses dedicated `cloudact-prod` project
- Stripe TEST keys for test/stage, LIVE keys for prod
- Supabase: `kwroaccbrxppfiysqlzs` for test/stage, `ovfxswhkkshouhsryzaf` for prod
- Manual deploy scripts blocked from targeting production

### NFR-DC-003: Security

- All secrets in GCP Secret Manager, never in source code
- Webhook secrets (`whsec_*`) validated on every Stripe event
- Service accounts have minimum required IAM permissions
- `DISABLE_AUTH` must be `false` in production
- `NEXT_PUBLIC_*` variables baked at build time (cannot be changed at runtime)

### NFR-DC-004: Reliability

- Cloud Run auto-scales from 0 to configured max instances
- Failed deployments do not affect currently running revision
- Rollback available via previous revision traffic routing or new patch tag
- Build history retained for audit trail

### NFR-DC-005: Observability

- `./monitor/watch-all.sh <env> <lines>` for real-time log streaming
- `gcloud builds list` for build history
- `gcloud run revisions list` for revision history
- Cloud Run metrics available in GCP Console

---

## Key Files

| File | Purpose |
|------|---------|
| `04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml` | Stage Cloud Build trigger definition |
| `04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml` | Prod Cloud Build trigger definition |
| `04-inra-cicd-automation/CICD/quick/deploy-test.sh` | Manual deploy for test environment |
| `04-inra-cicd-automation/CICD/quick/status.sh` | Service status checker |
| `04-inra-cicd-automation/CICD/monitor/watch-all.sh` | Log monitoring script |
| `04-inra-cicd-automation/CICD/secrets/validate-env.sh` | Environment variable validation |
| `04-inra-cicd-automation/CICD/secrets/verify-secrets.sh` | GCP Secret Manager verification |
| `04-inra-cicd-automation/CICD/secrets/setup-secrets.sh` | Secret creation script |
| `04-inra-cicd-automation/CICD/deploy/deploy.sh` | Single-service deploy script |
| `04-inra-cicd-automation/CICD/deploy-all.sh` | All-services deploy script |
| `04-inra-cicd-automation/CICD/releases.sh` | Release management (list, next, deployed) |
| `04-inra-cicd-automation/CICD/environments.conf` | Environment configuration |
| `01-fronted-system/Dockerfile` | Frontend Docker image |
| `02-api-service/Dockerfile` | API Service Docker image |
| `03-data-pipeline-service/Dockerfile` | Pipeline Service Docker image |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/infra-cicd` | Architecture and infrastructure requirements. Deploy-check validates the infra-cicd deployment standards. |
| `/env-setup` | Local development environment. Deploy-check covers remote environment deployment. |
| `/bootstrap-onboard` | Post-deployment bootstrap. After deploy, run bootstrap and org-sync via Cloud Run Jobs. |
| `/stripe-billing` | Stripe secrets validation. Deploy-check verifies `stripe-secret-key-{env}` and `stripe-webhook-secret-{env}`. |
| `/security-audit` | Security standards enforcement. Deploy-check validates secrets and auth configuration. |
