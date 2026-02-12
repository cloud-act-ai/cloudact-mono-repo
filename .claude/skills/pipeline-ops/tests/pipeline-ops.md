# Pipeline Ops - Test Plan

## Pipeline Execution Tests (Port 8001)

Pipeline lifecycle validation: run, status, lineage, and quota enforcement.

### Test Matrix (30 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Run GenAI pipeline (OpenAI) | E2E | `POST /pipelines/run/{org}/genai/payg/openai` returns 200 |
| 2 | Run GenAI pipeline (Anthropic) | E2E | `POST /pipelines/run/{org}/genai/payg/anthropic` returns 200 |
| 3 | Run GenAI pipeline (Gemini) | E2E | `POST /pipelines/run/{org}/genai/payg/gemini` returns 200 |
| 4 | Run GenAI pipeline (DeepSeek) | E2E | `POST /pipelines/run/{org}/genai/payg/deepseek` returns 200 |
| 5 | Run Cloud pipeline (GCP billing) | E2E | `POST /pipelines/run/{org}/gcp/cost/billing` returns 200 |
| 6 | Run Cloud pipeline (AWS billing) | E2E | `POST /pipelines/run/{org}/aws/cost/billing` returns 200 |
| 7 | Run Cloud pipeline (Azure billing) | E2E | `POST /pipelines/run/{org}/azure/cost/billing` returns 200 |
| 8 | Run Subscription pipeline | E2E | `POST /pipelines/run/{org}/subscription/costs/subscription_cost` returns 200 |
| 9 | Run pipeline with date range params | E2E | `?start_date=2026-01-01&end_date=2026-01-22` accepted |
| 10 | Pipeline status transitions | Status | `pending` -> `validating` -> `running` -> `completed` |
| 11 | Failed pipeline status | Status | Status set to `failed` with error details |
| 12 | Check pipeline run status | API | `GET /pipelines/status/{org}/{run_id}` returns current status |
| 13 | List pipeline run history | API | `GET /pipelines/history/{org}` returns recent runs |
| 14 | Get pipeline run logs | API | `GET /pipelines/logs/{org}/{run_id}` returns log entries |
| 15 | Get step-level logs | API | `GET /pipelines/logs/{org}/{run_id}/steps` returns per-step details |
| 16 | Get status transitions | API | `GET /pipelines/logs/{org}/{run_id}/transitions` returns state changes |
| 17 | Download full log | API | `GET /pipelines/logs/{org}/{run_id}/download` returns downloadable log |
| 18 | Provider must be lowercase | Validation | `gcp` accepted, `GCP` rejected (404) |
| 19 | Invalid provider returns 404 | Validation | Unknown provider key returns 404 |
| 20 | Invalid org_slug returns 401/403 | Validation | Non-existent org rejected |

### x_* Lineage Field Tests (7 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 21 | `x_org_slug` populated | Data | Matches request org_slug |
| 22 | `x_pipeline_id` populated | Data | Matches pipeline template name |
| 23 | `x_credential_id` populated | Data | Matches decrypted credential ID |
| 24 | `x_pipeline_run_date` populated | Data | DATE type, matches data date |
| 25 | `x_run_id` populated | Data | UUID format execution ID |
| 26 | `x_ingested_at` populated | Data | TIMESTAMP, write time |
| 27 | `x_ingestion_date` populated | Data | DATE, partition key |

### Quota Enforcement Tests (5 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 28 | Daily quota exceeded returns 429 | Quota | Error message with daily limit |
| 29 | Monthly quota exceeded returns 429 | Quota | Error message with monthly limit |
| 30 | Concurrent quota exceeded returns 429 | Quota | Error message with concurrent limit |

## Config Validation Tests

### YAML Config Tests (8 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Pipeline YAML is valid YAML syntax | Config | No parse errors |
| 2 | `pipeline_id` follows naming convention | Config | `{org_slug}-{provider}-{domain}` pattern |
| 3 | `ps_type` references existing processor | Config | Processor class found in `src/core/processors/` |
| 4 | All required config fields present | Config | No missing mandatory fields per step |
| 5 | `timeout_minutes` is reasonable (5-60) | Config | Within acceptable range |
| 6 | Schema JSON files are valid JSON | Config | No parse errors |
| 7 | Schema includes all x_* lineage fields | Config | All 7 x_* fields in schema definition |
| 8 | `depends_on` references valid step_ids | Config | No dangling step references |

## Stored Procedure Tests (Port 8001)

### Procedure Sync Tests (5 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Normal sync skips unchanged procedures | Sync | `POST /procedures/sync` returns with skip count |
| 2 | Force sync recreates all procedures | Sync | `POST /procedures/sync {"force": true}` recreates all |
| 3 | GenAI procedures exist after sync | Sync | `sp_genai_1`, `sp_genai_2`, `sp_genai_3` created |
| 4 | Cloud procedures exist after sync | Sync | `sp_cloud_1_convert_to_focus` created |
| 5 | Subscription procedures exist after sync | Sync | `sp_subscription_1` through `sp_subscription_4` created |

## Idempotency Tests (3 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Re-run same pipeline same date | Idempotency | No duplicate rows (DELETE + INSERT pattern) |
| 2 | Composite key enforced | Idempotency | `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` unique |
| 3 | Re-run updates x_ingested_at | Idempotency | Timestamp reflects latest run, not original |

## FOCUS 1.3 Conversion Tests (5 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Cloud -> FOCUS: BilledCost mapped | Data | GCP `cost`, AWS `unblended_cost`, Azure `cost_in_billing_currency` |
| 2 | Cloud -> FOCUS: EffectiveCost mapped | Data | Net cost after credits |
| 3 | GenAI -> FOCUS: conversion complete | Data | `sp_genai_3_convert_to_focus` output valid |
| 4 | Subscription -> FOCUS: conversion complete | Data | `sp_subscription_3_convert_to_focus` output valid |
| 5 | All cost types in unified table | Data | `cost_data_standard_1_3` has cloud + genai + subscription rows |

## Verification Commands

```bash
# 1. Run a GenAI pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/genai/payg/openai" \
  -H "X-API-Key: $ORG_API_KEY"

# 2. Run a Cloud pipeline with date range
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/gcp/cost/billing?start_date=2026-01-01&end_date=2026-01-22" \
  -H "X-API-Key: $ORG_API_KEY"

# 3. Check pipeline status
curl -s "http://localhost:8001/api/v1/pipelines/status/{org}/{run_id}" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool

# 4. List pipeline run history
curl -s "http://localhost:8001/api/v1/pipelines/history/{org}" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool

# 5. Get step-level logs
curl -s "http://localhost:8001/api/v1/pipelines/logs/{org}/{run_id}/steps" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool

# 6. Sync stored procedures (normal)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# 7. Force sync stored procedures
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'

# 8. Verify x_* lineage fields in BigQuery
bq query --use_legacy_sql=false \
  "SELECT x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at, x_ingestion_date FROM \`{project}.{org}_prod.cost_data_standard_1_3\` LIMIT 5"

# 9. Check idempotency (count before and after re-run)
bq query --use_legacy_sql=false \
  "SELECT x_pipeline_run_date, COUNT(*) as row_count FROM \`{project}.{org}_prod.cost_data_standard_1_3\` WHERE x_pipeline_id = 'genai_payg_openai' GROUP BY x_pipeline_run_date ORDER BY x_pipeline_run_date DESC LIMIT 5"

# 10. Validate pipeline YAML configs
python3 -c "
import yaml, glob
configs = glob.glob('03-data-pipeline-service/configs/**/*.yml', recursive=True)
for f in configs:
    try:
        with open(f) as fh:
            yaml.safe_load(fh)
        print(f'PASS: {f}')
    except yaml.YAMLError as e:
        print(f'FAIL: {f} - {e}')
"

# 11. Check pipeline logs for errors
tail -100 logs/pipeline.log | grep -iE "error|exception|failed"

# 12. Verify FOCUS 1.3 unified output
bq query --use_legacy_sql=false \
  "SELECT x_source_system, COUNT(*) as records, SUM(BilledCost) as total FROM \`{project}.{org}_prod.cost_data_standard_1_3\` GROUP BY x_source_system"
```

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Pipeline run via API | POST to pipeline endpoint | Status transitions visible in logs |
| Step-by-step execution | Check step logs after run | Each step shows start/end time and status |
| Retry on failure | Cause a transient error (e.g., BQ timeout) | Step retries per `max_attempts` config |
| Quota enforcement | Exceed daily limit > run pipeline | 429 returned with quota info |
| Concurrent limit | Run 2+ pipelines simultaneously | Second run queued or rejected per plan |
| Idempotent re-run | Run same pipeline twice for same date | Row count unchanged after second run |
| Procedure sync | Modify SQL > force sync > run pipeline | Updated procedure used |
| Schema mismatch debug | Check column mismatch error | Error identifies table and missing column |
| x_* field verification | Query output table in BigQuery | All 7 lineage fields populated |
| FOCUS conversion | Compare raw + FOCUS tables | BilledCost/EffectiveCost correctly mapped |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Pipeline execution tests | 20/20 (100%) |
| x_* lineage field tests | 7/7 (100%) |
| Quota enforcement tests | 3/3 (100%) |
| YAML config validation | 8/8 (100%) |
| Procedure sync tests | 5/5 (100%) |
| Idempotency tests | 3/3 (100%) |
| FOCUS 1.3 conversion tests | 5/5 (100%) |
| Provider lowercase enforcement | 100% -- uppercase rejected |
| Duplicate rows after re-run | 0 |
| Missing x_* fields in output | 0 |

## Known Limitations

1. **BigQuery dependency**: All pipeline execution tests require active BigQuery connection with provisioned org dataset
2. **Provider credentials**: Running actual pipelines requires valid integration credentials for each provider
3. **Quota testing**: Quota enforcement tests require manipulating Supabase quota records -- may need test isolation
4. **Concurrent limit testing**: Requires multiple simultaneous API calls -- use `xargs` or parallel curl
5. **Step timeout**: Step timeout tests require long-running operations -- may need mock processor
6. **Cloud Run latency**: In stage/prod, Cloud Run cold starts add 5-15s to first pipeline run
7. **Procedure sync**: Force sync recreates ALL procedures in BigQuery -- may impact concurrent pipelines
8. **Log retention**: Pipeline logs may be truncated in BigQuery after partition expiration (730 days)
