---
name: troubleshooting
description: |
  Cross-service troubleshooting and debugging for CloudAct. Common error patterns, recovery strategies, diagnostic steps.
  Use when: debugging cross-service errors, investigating pipeline failures, diagnosing API errors, fixing BigQuery timeouts,
  resolving Supabase constraint violations, troubleshooting auth failures, or general problem diagnosis.
---

# Troubleshooting Guide

## Overview

CloudAct has 4 services that interact: Frontend (3000), API Service (8000), Pipeline Service (8001), Chat Backend (8002). Errors often cascade across services. This guide provides systematic debugging approaches.

## Quick Diagnostic Steps

### 1. Check Health First
```bash
curl -s https://api.cloudact.ai/health | python3 -m json.tool
curl -s https://pipeline.cloudact.ai/health | python3 -m json.tool
curl -s https://chat.cloudact.ai/health | python3 -m json.tool
```

### 2. Check Recent Errors
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND severity>=ERROR \
  AND timestamp>=\"$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)\"" \
  --project=cloudact-prod --limit=20 \
  --format="table(timestamp,resource.labels.service_name,textPayload)"
```

### 3. Check Job Status
```bash
gcloud run jobs executions list --region=us-central1 --project=cloudact-prod --limit=5
```

## Common Error Patterns

### Authentication & Authorization

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Missing or invalid `X-API-Key` header | Verify org API key in Supabase `org_api_keys_secure` |
| `401 Invalid root key` | Wrong `X-CA-Root-Key` | Check `ca-root-api-key-{env}` in GCP Secret Manager |
| `403 Forbidden` | Cloud Run IAM issue | Run `./quick/fix-auth.sh <env>` |
| `Supabase auth error` | Invalid JWT or session expired | Check `SUPABASE_SERVICE_ROLE_KEY` in secrets |
| `Signup 400 Error` | Email confirmation enabled | Disable in Supabase dashboard > Auth > Email Auth |

### Pipeline Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `Pipeline not found (404)` | Wrong provider/domain/pipeline name | Use lowercase: `gcp` not `GCP`, check `configs/` YAML |
| `on_failure: fail` | Invalid on_failure value | Use `stop`, `alert`, or `continue` (NOT `fail`) |
| `x_org_slug missing` | Missing pipeline lineage field | Pipeline Service MUST include all `x_*` fields |
| `Quota exceeded` | Daily/monthly pipeline limit hit | Check `GET /api/v1/organizations/{org}/quota` |
| `Concurrent limit` | Too many parallel pipelines | Wait for running pipeline to finish, or check stale cleanup |
| `Credential not found` | Missing integration credential | Run `/integration-setup` for the provider |
| `BQ permission denied` | Service account lacks access | Check IAM for BigQuery Data Editor role |

### BigQuery Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `Dataset not found` | Org not onboarded or dataset deleted | Run bootstrap + org-sync via Cloud Run Jobs |
| `Table not found` | Schema drift or missing bootstrap | Run `./run-job.sh {env} bootstrap` |
| `STRING cannot be cast to TIMESTAMP` | Wrong datetime format | Use datetime objects, not ISO strings |
| `Quota exceeded` | BQ API rate limit | Add retry with exponential backoff |
| `Row too large` | JSON field exceeds 10MB | Trim or split large payloads |
| `Streaming insert timeout` | Network or BQ overload | Retry; check BQ status page |

### Supabase Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `owner trigger blocks delete` | RLS triggers on org tables | Use Management API with `DISABLE TRIGGER USER` |
| `unique constraint violation` | Duplicate insert | Check idempotency, use upsert |
| `JWT expired` | Token refresh failed | Check frontend auth flow, `SUPABASE_SERVICE_ROLE_KEY` |
| `Connection refused` | Supabase project paused | Check Supabase dashboard, unpause |
| `RLS policy violation` | Missing org context | Ensure `org_slug` in request context |

### Stripe Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `Checkout creation fails` | Missing `STRIPE_SECRET_KEY` | Run `./secrets/setup-secrets.sh {env}` |
| `Webhook signature invalid` | Wrong `STRIPE_WEBHOOK_SECRET` | Verify webhook secret in Stripe dashboard |
| `Plans not loading` | Wrong price IDs | Verify LIVE price IDs in env (prod uses different IDs) |
| `Subscription not found` | Stripe/Supabase mismatch | Check both Stripe dashboard and `organizations` table |

### Frontend Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `NEXT_PUBLIC_* not updating` | Env vars baked at build time | Must rebuild Docker image |
| `API connection refused` | Wrong `NEXT_PUBLIC_API_URL` | Check env vars, service-to-service URLs |
| `Hydration mismatch` | Server/client state mismatch | Check server components vs client components |
| `Dashboard shows no data` | Wrong date range or no data loaded | Default is 365 days; check BQ for data |

### Service-to-Service Communication

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection refused localhost:8001` | Using localhost in Cloud Run | Set `PIPELINE_SERVICE_URL` env var to Cloud Run URL |
| `Cannot connect to validation` | Wrong API URL | Set `API_SERVICE_URL` env var |
| `CORS error` | Frontend calling wrong origin | Check `NEXT_PUBLIC_API_URL` matches deployment |
| `Timeout on pipeline run` | Long-running pipeline | Increase Cloud Run timeout (max 3600s) |

## Debugging Procedures

### Pipeline Run Failure
1. Get the `x_run_id` from the error response
2. Query pipeline run logs:
   ```sql
   SELECT * FROM `{project}.{org}_prod.org_meta_pipeline_runs`
   WHERE run_id = '{x_run_id}'
   ORDER BY started_at DESC LIMIT 1
   ```
3. Check step logs:
   ```sql
   SELECT * FROM `{project}.{org}_prod.org_meta_step_logs`
   WHERE run_id = '{x_run_id}'
   ORDER BY step_order
   ```
4. Look at state transitions:
   ```sql
   SELECT * FROM `{project}.{org}_prod.org_meta_state_transitions`
   WHERE run_id = '{x_run_id}'
   ORDER BY transitioned_at
   ```

### Cost Data Not Appearing
1. Verify pipeline ran successfully (check `org_meta_pipeline_runs`)
2. Check data exists in source table (e.g., `gcp_billing_raw`)
3. Verify FOCUS conversion ran (`cost_data_standard_1_3`)
4. Check date range — API defaults to last 365 days
5. Verify hierarchy mapping if filtering by department/project

### Bootstrap/Sync Failures
1. Check job execution status:
   ```bash
   gcloud run jobs executions list --job=cloudact-manual-bootstrap \
     --project=cloudact-prod --region=us-central1
   ```
2. Read job logs (see monitoring skill)
3. Verify GCP credentials are active
4. Check if `organizations` dataset exists in BQ console
5. Verify 30 meta tables present

### Quota Issues
1. Check current quota:
   ```bash
   curl -s "https://api.cloudact.ai/api/v1/organizations/{org}/quota" \
     -H "X-API-Key: {key}" | python3 -m json.tool
   ```
2. If stale concurrent counter: wait for stale-cleanup job (runs daily) or trigger manually
3. If daily/monthly exceeded: wait for reset or upgrade plan

## Environment-Specific Notes

| Environment | Project | Notes |
|------------|---------|-------|
| test/stage | `cloudact-testing-1` | Same Supabase (kwroaccbrxppfiysqlzs), TEST Stripe keys |
| prod | `cloudact-prod` | Supabase (ovfxswhkkshouhsryzaf), LIVE Stripe keys |

**Key Rule:** Always activate the correct GCP credentials before debugging:
```bash
# Stage (ABSOLUTE PATHS - ~/ does NOT expand in gcloud!)
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json

# Prod
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json
```

## Platform-Specific Gotchas

| Gotcha | Details |
|--------|---------|
| macOS `head -n -1` | Doesn't work (GNU syntax). Use `python3 -c` instead |
| curl exits 0 on HTTP 500 | Always use `-w '\n%{http_code}'` to detect errors |
| `run-job.sh` environments | Valid: `test`, `stage`, `prod` (NOT `local` — map to `stage`) |
| `source .env.local` + `npx tsx` | Env vars don't propagate. Use inline: `VAR=$(grep ...) npx tsx ...` |
| GCP credential paths | ABSOLUTE paths only: `/Users/openclaw/.gcp/` (NOT `~/.gcp/`) |

## Development Rules (Non-Negotiable)

- **No over-engineering** - Simple, direct fixes. Fix the root cause, don't add workarounds.
- **Multi-tenancy support** - Always check `org_slug` isolation when debugging data issues
- **Don't break existing functionality** - Run all tests before/after applying fixes
- **ZERO mock tests** - Validate fixes against real services, not mocks
- **Update skills with learnings** - Document new error patterns and fixes in skill files
- **LRU in-memory cache** - NO Redis. If debugging cache issues, it's always LRU-based.
- **Enterprise-grade for 10k customers** - Fixes must scale. No single-org workarounds.

## 5 Implementation Pillars

| Pillar | How Troubleshooting Handles It |
|--------|-------------------------------|
| **i18n** | Debug locale sync issues (Supabase vs BigQuery); currency mismatch diagnostics; timezone boundary errors in date filters |
| **Enterprise** | Structured diagnostic steps; cross-environment debugging (local/stage/prod); log analysis via `gcloud logging`; error pattern recognition |
| **Cross-Service** | Trace errors across Frontend -> API -> Pipeline -> BigQuery -> Chat; `request_id` / `x_run_id` correlation across service boundaries |
| **Multi-Tenancy** | Always scope debugging to specific `org_slug`; verify data isolation; check for cross-tenant data leaks in query results |
| **Reusability** | Shared diagnostic SQL queries; health check endpoints (`/health`); log search patterns; recovery procedures documented per error type |

## Related Skills
- `/monitoring` - Logs, health checks, observability
- `/pipeline-ops` - Pipeline-specific debugging
- `/bigquery-ops` - BigQuery schema and query issues
- `/bootstrap-onboard` - Bootstrap and onboarding issues
- `/quota-mgmt` - Quota enforcement issues
- `/security-audit` - Auth and security issues

---
**Last Updated:** 2026-02-14
