# GenAI Costs - Test Plan

## Overview

Validates GenAI cost pipelines across 6 providers (OpenAI, Anthropic, Gemini, Azure OpenAI, AWS Bedrock, GCP Vertex), 3 billing flows (PAYG, Commitment, Infrastructure), pricing management, the 3-step consolidation pipeline, and FOCUS 1.3 conversion.

## Test Matrix

### GenAI Table Creation (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | PAYG tables exist (3 tables) | Query | `genai_payg_pricing`, `genai_payg_usage_raw`, `genai_payg_costs_daily` in org dataset |
| 2 | Commitment tables exist (3 tables) | Query | `genai_commitment_pricing`, `genai_commitment_usage_raw`, `genai_commitment_costs_daily` |
| 3 | Infrastructure tables exist (3 tables) | Query | `genai_infrastructure_pricing`, `genai_infrastructure_usage_raw`, `genai_infrastructure_costs_daily` |
| 4 | Unified tables exist (2 tables) | Query | `genai_usage_daily_unified`, `genai_costs_daily_unified` |
| 5 | Partition columns configured | Validation | Usage tables partitioned by `usage_date`, cost tables by `cost_date` |
| 6 | Clustering columns configured | Validation | Clustering on `provider`, `model` (PAYG) or `commitment_id` (Commitment) |

### Pricing Management (7 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 7 | List all pricing | API | GET `/genai/{org}/pricing` returns pricing for all flows |
| 8 | List PAYG pricing by provider | API | GET `/genai/{org}/pricing/payg?provider=openai` returns OpenAI models |
| 9 | Pricing includes input/output rates | Validation | Each pricing row has `input_price` and `output_price` per 1M tokens |
| 10 | Set pricing override | API | PUT `/genai/{org}/pricing/payg/{id}/override` updates price |
| 11 | Override marked with `is_override=true` | Query | Overridden pricing has `is_override` flag |
| 12 | Override has `effective_from` date | Query | Override includes start date for application |
| 13 | Default pricing loaded on bootstrap | Validation | Standard model pricing populated for all 6 PAYG providers |

### PAYG Pipeline Execution (8 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 14 | Run OpenAI PAYG pipeline | API | POST `/pipelines/run/{org}/genai/payg/openai` succeeds |
| 15 | Run Anthropic PAYG pipeline | API | POST `/pipelines/run/{org}/genai/payg/anthropic` succeeds |
| 16 | Run Gemini PAYG pipeline | API | POST `/pipelines/run/{org}/genai/payg/gemini` succeeds |
| 17 | Run Azure OpenAI PAYG pipeline | API | POST `/pipelines/run/{org}/genai/payg/azure_openai` succeeds |
| 18 | Run AWS Bedrock PAYG pipeline | API | POST `/pipelines/run/{org}/genai/payg/aws_bedrock` succeeds |
| 19 | Run GCP Vertex PAYG pipeline | API | POST `/pipelines/run/{org}/genai/payg/gcp_vertex` succeeds |
| 20 | Usage raw data populated | Query | `genai_payg_usage_raw` has rows for run date |
| 21 | Costs daily calculated | Query | `genai_payg_costs_daily` has rows (usage x pricing) |

### Commitment Pipeline (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 22 | Run Azure OpenAI PTU pipeline | API | POST `/pipelines/run/{org}/genai/commitment/azure_openai` succeeds |
| 23 | Run AWS Bedrock PT pipeline | API | POST `/pipelines/run/{org}/genai/commitment/aws_bedrock` succeeds |
| 24 | Run GCP Vertex GSU pipeline | API | POST `/pipelines/run/{org}/genai/commitment/gcp_vertex` succeeds |
| 25 | Commitment costs daily populated | Query | `genai_commitment_costs_daily` has rows |

### Infrastructure Pipeline (2 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 26 | Run GCP Vertex infrastructure pipeline | API | POST `/pipelines/run/{org}/genai/infrastructure/gcp_vertex` succeeds |
| 27 | Infrastructure costs daily populated | Query | `genai_infrastructure_costs_daily` has rows for GPU/TPU hours |

### 3-Step Consolidation Pipeline (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 28 | Step 1: Consolidate usage daily | Procedure | `sp_genai_1_consolidate_usage_daily` merges all usage into `genai_usage_daily_unified` |
| 29 | Step 2: Consolidate costs daily | Procedure | `sp_genai_2_consolidate_costs_daily` merges all costs into `genai_costs_daily_unified` |
| 30 | Step 3: Convert to FOCUS 1.3 | Procedure | `sp_genai_3_convert_to_focus` writes to `cost_data_standard_1_3` |
| 31 | Consolidation pipeline endpoint works | API | POST `/pipelines/run/{org}/genai/unified/consolidate` runs all 3 steps |
| 32 | Step dependency order enforced | Validation | Step 2 waits for Step 1; Step 3 waits for Step 2 |
| 33 | FOCUS 1.3 rows have `x_source_system` | Query | FOCUS rows have values like `genai_openai`, `genai_anthropic` |

### Pipeline Lineage (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 34 | `x_org_slug` populated on all rows | Query | Multi-tenant field set correctly |
| 35 | `x_pipeline_id` identifies pipeline | Query | Values like `genai/payg/openai` |
| 36 | `x_run_id` is unique per execution | Query | UUID format, unique per pipeline run |
| 37 | `x_genai_provider` set correctly | Query | Values: `OPENAI`, `ANTHROPIC`, `GEMINI`, etc. |
| 38 | Idempotent writes on re-run | E2E | Running pipeline twice produces no duplicates |

### Cost Calculation Accuracy (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 39 | PAYG cost = usage x pricing | Calculation | `daily_cost = input_tokens * input_price + output_tokens * output_price` |
| 40 | Cost uses override pricing when set | Calculation | Override price applied instead of default |
| 41 | Multi-model costs summed correctly | Calculation | Total = sum of all model costs for provider |
| 42 | Zero usage produces zero cost | Calculation | No usage rows = no cost rows (no phantom costs) |
| 43 | Cost totals match API summary | Validation | BigQuery sum matches `/genai/{org}/costs/summary` response |

### Usage & Cost API Endpoints (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 44 | GET `/genai/{org}/usage` returns usage data | API | Usage records with token counts |
| 45 | GET `/genai/{org}/costs` returns cost data | API | Cost records with amounts |
| 46 | GET `/genai/{org}/costs/summary` with model breakdown | API | `include_models=true` returns per-model costs |
| 47 | Provider filter works | API | `?provider=openai` returns only OpenAI data |
| 48 | Date range filter works | API | `?start_date=...&end_date=...` returns filtered data |

### Hierarchy Allocation (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 49 | GenAI costs carry hierarchy fields | Query | `x_hierarchy_entity_id` populated in `genai_costs_daily_unified` |
| 50 | FOCUS 1.3 GenAI rows have hierarchy path | Query | `x_hierarchy_path` populated in `cost_data_standard_1_3` |
| 51 | Cost rollup by hierarchy works | Query | `GROUP BY x_hierarchy_entity_id` returns correct sums |

**Total: 51 tests**

## Verification Commands

```bash
# List GenAI tables
bq ls {org_slug}_prod --project_id=cloudact-testing-1 | grep genai

# Check pricing data
curl -s "http://localhost:8000/api/v1/genai/{org}/pricing" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Get PAYG pricing for OpenAI
curl -s "http://localhost:8000/api/v1/genai/{org}/pricing/payg?provider=openai" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Run OpenAI PAYG pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/genai/payg/openai" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"date": "2025-12-25"}'

# Run consolidation
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/genai/unified/consolidate" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"date": "2025-12-25"}'

# Get cost summary
curl -s "http://localhost:8000/api/v1/genai/{org}/costs/summary?start_date=2025-12-01&end_date=2026-01-31&include_models=true" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Get usage data
curl -s "http://localhost:8000/api/v1/genai/{org}/usage?start_date=2025-12-01&end_date=2026-01-31&provider=openai" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# BigQuery: Verify PAYG usage data
bq query --nouse_legacy_sql \
  "SELECT provider, model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output
   FROM \`{project}.{org}_prod.genai_payg_usage_raw\`
   WHERE usage_date >= '2025-12-01'
   GROUP BY 1, 2 ORDER BY total_input DESC"

# BigQuery: Verify PAYG costs
bq query --nouse_legacy_sql \
  "SELECT provider, model, SUM(total_cost) as total
   FROM \`{project}.{org}_prod.genai_payg_costs_daily\`
   WHERE cost_date >= '2025-12-01'
   GROUP BY 1, 2 ORDER BY total DESC"

# BigQuery: Verify unified consolidation
bq query --nouse_legacy_sql \
  "SELECT cost_type, provider, SUM(total_cost) as total
   FROM \`{project}.{org}_prod.genai_costs_daily_unified\`
   WHERE cost_date >= '2025-12-01'
   GROUP BY 1, 2 ORDER BY total DESC"

# BigQuery: Verify FOCUS 1.3 GenAI rows
bq query --nouse_legacy_sql \
  "SELECT ServiceProviderName, x_source_system, SUM(EffectiveCost) as total
   FROM \`{project}.{org}_prod.cost_data_standard_1_3\`
   WHERE x_source_system LIKE 'genai_%'
   GROUP BY 1, 2 ORDER BY total DESC"

# BigQuery: Check for duplicates
bq query --nouse_legacy_sql \
  "SELECT x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date, COUNT(*) as cnt
   FROM \`{project}.{org}_prod.genai_payg_usage_raw\`
   GROUP BY 1, 2, 3, 4
   HAVING cnt > 1"

# Check stored procedures
bq ls --routines organizations --project_id=cloudact-testing-1 | grep genai
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| GenAI tables created | 11/11 (100%) |
| Pricing data loaded | All 6 PAYG providers have default pricing |
| PAYG pipeline execution | 6/6 providers succeed (with valid credentials) |
| Consolidation pipeline | 3 steps complete in order |
| FOCUS 1.3 conversion | GenAI rows in unified cost table |
| Pipeline lineage fields | All x_* fields populated |
| Idempotent writes | 0 duplicate rows on re-run |
| Cost calculation accuracy | Computed cost = usage x pricing |
| Demo data expected total | GenAI costs ~$232K for Dec 2025 - Jan 2026 |

## Known Limitations

1. **Provider credentials**: Pipeline execution tests require valid API keys for each GenAI provider. Without credentials, pipelines fail at the extraction step.
2. **Commitment/Infrastructure**: Only Azure OpenAI (PTU), AWS Bedrock (PT), and GCP Vertex (GSU/GPU) support these flows. Other providers are PAYG only.
3. **Consolidation order**: The 3-step consolidation MUST run in order. Step 2 depends on Step 1, Step 3 depends on Step 2.
4. **Pricing overrides**: Override pricing is per-org. Default pricing is seeded at bootstrap and should not be modified for testing.
5. **Demo data**: GenAI demo data is generated for Dec 2025 - Jan 2026. Always use this date range for validation.
6. **Rate limits**: Provider APIs may rate-limit usage data extraction. Pipeline retries handle transient failures.
7. **GCP Vertex GPU**: Infrastructure flow is GCP Vertex only. Other providers do not have GPU/TPU billing flows.
8. **Stored procedure validation**: Procedures live in `organizations` dataset and operate on per-org datasets. Cannot test offline.

## Edge Cases Tested

- Pipeline run with no usage data (should succeed with 0 rows written)
- Pipeline run with expired/invalid credentials (should fail with clear error)
- Pricing override with future effective_from date (should not apply to past data)
- Multiple providers in same consolidation run (all merged correctly)
- Re-running pipeline for same date (idempotent, no duplicates)
- Very high token counts (billions of tokens, cost calculation overflow check)
- Zero-cost models (free tier or promotional pricing)
- Provider API returns partial data (should process available data, not fail)
