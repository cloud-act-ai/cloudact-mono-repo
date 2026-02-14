---
name: go-live
description: |
  Go-live checklist and deployment playbook for CloudAct production releases.
  Use when: deploying to production, preparing for go-live, running pre-deploy checks,
  verifying post-deploy health, managing rollbacks, setting up scheduler jobs,
  or running the full go-live sequence.
---

# Go-Live Playbook

Production deployment checklist for CloudAct. Covers everything from pre-deploy validation
through deployment, post-deploy verification, scheduler setup, and rollback procedures.

**Current Version:** v4.4.4 | **Services:** 4 (Frontend, API, Pipeline, Chat)

## Quick Reference

| File | What | When |
|------|------|------|
| [checklist/pre-deploy.md](checklist/pre-deploy.md) | Secrets, migrations, tests | Before tagging |
| [checklist/deploy.md](checklist/deploy.md) | Tag, build, health checks | Deployment day |
| [checklist/post-deploy.md](checklist/post-deploy.md) | Verify, monitor, announce | After deploy |
| [checklist/rollback.md](checklist/rollback.md) | Revert if things break | Emergency only |
| [tests/smoke-tests.md](tests/smoke-tests.md) | 10-min quick validation | After every deploy |
| [tests/feature-matrix.md](tests/feature-matrix.md) | 370+ feature tests | Major releases |
| [scheduler/cloud-run-jobs.md](scheduler/cloud-run-jobs.md) | Job creation & schedules | First deploy + changes |
| [scheduler/pipelines.md](scheduler/pipelines.md) | Per-org data pipelines | After org onboarding |

## Go-Live Sequence (TL;DR)

```
1. Pre-Deploy     → secrets, migrations, tests pass
2. Tag & Push     → git tag vX.Y.Z && git push origin vX.Y.Z
3. Cloud Build    → automatic (watch: gcloud builds list)
4. Health Check   → curl all 4 services
5. Smoke Test     → login, dashboard, API, alerts
6. Scheduler      → create jobs, verify schedules
7. Monitor 30min  → watch logs for errors
8. Announce       → team notification
```

## Key Locations

| Resource | Path |
|----------|------|
| Cloud Build (prod) | `04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml` |
| Cloud Build (stage) | `04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml` |
| Deploy script | `04-inra-cicd-automation/CICD/deploy/deploy.sh` |
| Secrets validation | `04-inra-cicd-automation/CICD/secrets/validate-env.sh` |
| Status check | `04-inra-cicd-automation/CICD/quick/status.sh` |
| Log monitor | `04-inra-cicd-automation/CICD/monitor/watch-all.sh` |
| Version management | `04-inra-cicd-automation/CICD/releases.sh` |
| Scheduler scripts | `05-scheduler-jobs/scripts/` |
| Supabase migrations | `01-fronted-system/scripts/supabase_db/migrate.sh` |
| Cloud Run Jobs | `05-scheduler-jobs/scripts/run-job.sh` |

## Environments

| Env | GCP Project | Trigger | URL |
|-----|-------------|---------|-----|
| Stage | cloudact-testing-1 | `git push origin main` | *.stage (internal) |
| Prod | cloudact-prod | `git tag v* && git push origin v*` | cloudact.ai |

## Cloud Run Services

| Service | Port | Memory | Prod URL | Health |
|---------|------|--------|----------|--------|
| API | 8000 | 8Gi | api.cloudact.ai | `GET /health` |
| Pipeline | 8001 | 8Gi | pipeline.cloudact.ai | `GET /health` |
| Chat | 8002 | 4Gi | chat.cloudact.ai | `GET /health` |
| Frontend | 3000 | 2Gi | cloudact.ai | `GET /api/health` |

## Procedures

### Full Go-Live (First Production Deploy)

1. **Pre-deploy** - Follow [checklist/pre-deploy.md](checklist/pre-deploy.md)
2. **Deploy** - Follow [checklist/deploy.md](checklist/deploy.md)
3. **Scheduler setup** - Follow [scheduler/cloud-run-jobs.md](scheduler/cloud-run-jobs.md)
4. **Post-deploy** - Follow [checklist/post-deploy.md](checklist/post-deploy.md)
5. **Smoke tests** - Follow [tests/smoke-tests.md](tests/smoke-tests.md)
6. **Feature validation** - Follow [tests/feature-matrix.md](tests/feature-matrix.md)

### Routine Release (Subsequent Deploys)

1. **Pre-deploy** - Secrets + migrations only
2. **Deploy** - Tag and push
3. **Smoke tests** - 10-min validation
4. **Monitor** - 30 minutes of log watching

### Hotfix Release

1. Fix on main, push to stage, verify
2. Tag with patch version (e.g., v4.4.3)
3. Push tag, monitor Cloud Build
4. Smoke test production
5. Watch logs 15 minutes

## Known Issues (Resolved)

21 issues found and fixed during initial go-live testing (2026-01-28/29). All test-verified.

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| ISS-001 | CRITICAL | Multi-org data leakage in alerts | Added `WHERE org_slug = @org_slug` |
| ISS-005 | CRITICAL | API key mismatch Supabase/BigQuery | Return existing key instead of regenerating |
| ISS-004 | HIGH | subscription_plan_costs_daily missing org_slug | Added column to schema |
| ISS-011 | HIGH | Cloud FOCUS convert undefined variable | Fixed EXCEPTION handler |
| ISS-012 | HIGH | Cloud raw tables missing pricing columns | Added via ALTER TABLE |
| ISS-017 | HIGH | Alert queries wrong x_source_system values | Changed to LIKE pattern |

**Full issue log:** Previously in `go-live-issues.csv` (now consolidated here).

## Critical Learnings

1. **Cloud Build is automated** - Never manual deploy to prod. Use git tags.
2. **Version is baked** - Update `version.json` at repo root BEFORE creating git tag.
3. **Scheduler jobs cascade** - Order: migrate -> bootstrap -> org-sync-all.
4. **GCP creds: absolute paths** - `/Users/openclaw/.gcp/` not `~/.gcp/`.
5. **Stage service account** - `cloudact-sa-stage@` and prod is `cloudact-sa-prod@` (both use `-sa-` prefix).
6. **Stripe keys differ** - Stage uses `sk_test_*`, prod uses `sk_live_*`. Verify before deploy.
7. **Health check format** - Returns `{"status": "healthy", "service": "...", "version": "..."}`.
8. **Frontend health at `/api/health`** - Next.js API route, NOT `/health` like backend services.
9. **curl exits 0 on 500** - Use `-w '\n%{http_code}'` to detect HTTP errors.
10. **run-job.sh envs** - Valid: `test`, `stage`, `prod` (NOT `local`).
11. **Prod confirmation** - `run-job.sh prod` requires typing "yes" (or pipe `echo "yes" |`).
12. **Job naming** - All jobs use `cloudact-{category}-{name}` (NOT `ca-{env}-*`). Triggers append `-trigger`.
13. **Cost page routes** - All cost pages under `/{org}/cost-dashboards/` (NOT `/{org}/cloud-costs`).

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/infra-cicd` | Deployment scripts, Cloud Build, secrets management |
| `/deploy-check` | Pre-deployment validation, health checks |
| `/scheduler-jobs` | Cloud Run Jobs lifecycle |
| `/supabase-migrate` | Database migrations |
| `/bootstrap-onboard` | Bootstrap + org onboarding |
| `/monitoring` | Log tailing, error tracking |
| `/stripe-billing` | Stripe product/price verification |
| `/security-audit` | Security validation |
| `/demo-setup` | Demo account for production testing |
