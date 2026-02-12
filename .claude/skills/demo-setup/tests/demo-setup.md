# Demo Account Setup - Test Plan

## Test Matrix

### T-DS-1: Pre-Flight (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-1.1 | Frontend health | Integration | 200 |
| T-DS-1.2 | API Service health | Integration | `{"status":"ok"}` |
| T-DS-1.3 | Pipeline Service health | Integration | `{"status":"ok"}` |
| T-DS-1.4 | CA_ROOT_API_KEY set | Unit | Non-empty |
| T-DS-1.5 | GCP project auth | Integration | `bq ls cloudact-testing-1:` succeeds |

### T-DS-2: Account Cleanup (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-2.1 | Cleanup by email | Integration | All Supabase records + BQ dataset deleted |
| T-DS-2.2 | Cleanup by org slug | Integration | Organization + dataset deleted |
| T-DS-2.3 | Cleanup non-existent account | Integration | Graceful completion |
| T-DS-2.4 | Cleanup idempotent | Integration | Second cleanup succeeds silently |
| T-DS-2.5 | Output JSON structure | Unit | Contains supabaseDeleted, bigqueryDeleted, errors |

### T-DS-3: Account Creation (7 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-3.1 | Signup form fills | E2E | All fields populated |
| T-DS-3.2 | Plan selection | E2E | Scale plan selected |
| T-DS-3.3 | Stripe checkout | E2E | "Start trial" clicked, redirect |
| T-DS-3.4 | Org slug extracted | E2E | Matches `acme_inc_{base36}` |
| T-DS-3.5 | API key fetched | E2E | Non-empty `org_api_key_*` |
| T-DS-3.6 | Output JSON | Unit | success, orgSlug, apiKey, dashboardUrl |
| T-DS-3.7 | Timeout handling | E2E | Fails after 120s |

### T-DS-4: Data Loading (10 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-4.1 | Pricing CSV columns match schema | Unit | Same order as genai_payg_pricing.json |
| T-DS-4.2 | Pricing loaded with x_org_slug | Integration | Rows in BQ with correct org slug |
| T-DS-4.3 | OpenAI usage loaded | Integration | Rows in genai_payg_usage_raw |
| T-DS-4.4 | Anthropic usage loaded | Integration | Rows in genai_payg_usage_raw |
| T-DS-4.5 | Gemini usage loaded | Integration | Rows in genai_payg_usage_raw |
| T-DS-4.6 | Cloud billing loaded (4 providers) | Integration | Rows in each raw table |
| T-DS-4.7 | Subscription plans loaded | Integration | 15 plans in subscription_plans |
| T-DS-4.8 | Hierarchy seeded (2 trees) | Integration | 8 entities created |
| T-DS-4.9 | Org slug replaced in all data | Integration | No `acme_inc_01022026` remains |
| T-DS-4.10 | Subscription CSV columns match schema | Unit | Same order as subscription_plans.json |

### T-DS-5: Pipeline Execution (8 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-5.1 | Procedures synced | Integration | 200 response |
| T-DS-5.2 | Subscription pipeline COMPLETED | Integration | Cost data in FOCUS table |
| T-DS-5.3 | GenAI pipeline COMPLETED | Integration | GenAI costs in FOCUS table |
| T-DS-5.4 | Cloud FOCUS pipeline COMPLETED | Integration | Cloud costs in FOCUS table |
| T-DS-5.5 | Status polling works | Integration | Polls every 5s until done |
| T-DS-5.6 | Failure auto-diagnosis | Integration | Error includes suggested fix |
| T-DS-5.7 | Procedure auto-retry | Integration | Re-syncs + retries once |
| T-DS-5.8 | All 3 pipelines complete | Integration | All COMPLETED within 300s |

### T-DS-6: Alert Setup (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-6.1 | Email channel created | Integration | Channel with demo@cloudact.ai |
| T-DS-6.2 | Daily spike alert created | Integration | $5K threshold rule |
| T-DS-6.3 | Monthly budget alert created | Integration | 80% of $50K rule |
| T-DS-6.4 | Duplicate alert handling | Integration | 409 handled gracefully |

### T-DS-7: Cost Validation (7 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-7.1 | Total costs API returns data | Integration | Non-zero for all 3 categories |
| T-DS-7.2 | GenAI costs ~$232K | Integration | Within 20% |
| T-DS-7.3 | Cloud costs ~$382 | Integration | Within 50% |
| T-DS-7.4 | Subscription costs ~$1.4K | Integration | Within 20% |
| T-DS-7.5 | API vs BigQuery match | Integration | Totals within 1% |
| T-DS-7.6 | Frontend dashboard shows costs | E2E | Non-zero total |
| T-DS-7.7 | Date range required | Integration | No data without date params |

### T-DS-8: Data Integrity (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-8.1 | x_source_system not NULL | Integration | Zero NULL rows in FOCUS |
| T-DS-8.2 | ServiceCategory lowercase | Integration | Only genai, cloud, subscription |
| T-DS-8.3 | ServiceProviderName short codes | Integration | Only canonical codes |
| T-DS-8.4 | Data in Dec 2025 - Jan 2026 | Integration | All records in range |
| T-DS-8.5 | Org slug correct in all tables | Integration | x_org_slug matches |
| T-DS-8.6 | No duplicate records | Integration | Unique x_run_id + x_pipeline_run_date |

### T-DS-9: Full Lifecycle (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| T-DS-9.1 | Clean → Create → Load → Validate → Clean | E2E | Succeeds end-to-end |
| T-DS-9.2 | Re-create after cleanup | E2E | Second creation succeeds |
| T-DS-9.3 | Full setup < 10 min | E2E | Completes in time |

## Summary

| Group | Tests | Coverage |
|-------|-------|----------|
| Pre-Flight | 5 | Prerequisites |
| Cleanup | 5 | FR-DS-001 |
| Account Creation | 7 | FR-DS-002 |
| Data Loading | 10 | FR-DS-003 |
| Pipeline Execution | 8 | FR-DS-004 |
| Alert Setup | 4 | FR-DS-005 |
| Cost Validation | 7 | FR-DS-006 |
| Data Integrity | 6 | NFR-DS-004-006 |
| Full Lifecycle | 3 | All FRs |
| **TOTAL** | **55** | |

## Pass Criteria

- 55/55 tests pass
- Zero NULL x_source_system in FOCUS table
- Costs match within tolerance across API, BigQuery, Frontend
- Full lifecycle < 10 minutes
- No fix scripts needed - data loads cleanly

## Validation Queries

```sql
-- Data integrity check
SELECT ServiceCategory, x_source_system, COUNT(*) as records,
  ROUND(SUM(CAST(BilledCost AS FLOAT64)), 2) as total_cost
FROM `{project}.{dataset}.cost_data_standard_1_3`
WHERE ChargePeriodStart >= '2025-12-01' AND ChargePeriodStart < '2026-02-01'
GROUP BY ServiceCategory, x_source_system;

-- No NULL x_source_system
SELECT COUNT(*) FROM `{project}.{dataset}.cost_data_standard_1_3`
WHERE x_source_system IS NULL;

-- Provider names correct
SELECT DISTINCT ServiceCategory, ServiceProviderName
FROM `{project}.{dataset}.cost_data_standard_1_3` ORDER BY 1, 2;
```
