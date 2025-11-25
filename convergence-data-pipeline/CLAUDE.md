# CLAUDE.md - Project Context

## Core Architecture

**Scheduler-Driven Pipeline System** - All operations are pipelines, not real-time APIs.

```
Cloud Scheduler → Check due pipelines → Execute → Log to org_meta_*
```

## Key Operations

### Bootstrap (one-time)
```bash
POST /api/v1/admin/bootstrap
Header: X-Admin-Key
```

### Onboard Organization
```bash
POST /api/v1/organizations/onboard
Header: X-Admin-Key
Body: {"org_slug": "...", "company_name": "...", "admin_email": "..."}
```

### Run Pipeline
```bash
POST /api/v1/pipelines/run/{org_slug}/gcp/cost/cost_billing
Header: X-API-Key (org key)
Body: {"date": "2025-11-24"}
```

## Dataset Structure

**Central `organizations` dataset:**
- `org_profiles`, `org_api_keys`, `org_subscriptions`, `org_usage_quotas`
- `org_cloud_credentials`, `org_pipeline_configs`
- `org_scheduled_pipeline_runs`, `org_pipeline_execution_queue`
- `org_meta_pipeline_runs`, `org_meta_step_logs`, `org_meta_dq_results`

**Per-org `{org_slug}_{env}` dataset:**
- Data tables only (gcp_cost_billing, etc.)

## Deployment

```bash
./simple_deploy.sh stage|prod
./simple_test.sh stage|prod
```

## URLs

- Stage: `https://convergence-pipeline-stage-526075321773.us-central1.run.app`
- Prod: `https://convergence-pipeline-prod-820784027009.us-central1.run.app`

## Config Paths

- Pipeline configs: `configs/{provider}/{domain}/{pipeline}.yml`
- Step templates: `ps_templates/{provider}/{domain}/`
- Processors: `src/core/processors/`
