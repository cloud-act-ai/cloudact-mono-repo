# Subscription Costs - Test Plan

## API Tests (Port 8000)

Subscription plan CRUD and cost calculation validation via API Service.

### Test Matrix (24 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Create monthly subscription plan | API | 201 with `subscription_id` returned |
| 2 | Create annual subscription plan | API | 201 with `billing_cycle: annual` |
| 3 | Create quarterly subscription plan | API | 201 with `billing_cycle: quarterly` |
| 4 | Create semi-annual subscription plan | API | 201 with `billing_cycle: semi_annual` |
| 5 | Create weekly subscription plan | API | 201 with `billing_cycle: weekly` |
| 6 | Create custom billing cycle plan | API | 201 with `billing_cycle: custom` |
| 7 | Edit plan creates new version | API | New row with incremented `version`, old row gets `end_date` |
| 8 | List plans returns active versions only | API | Only rows where `end_date IS NULL` |
| 9 | Cancel subscription sets end_date | API | `end_date` populated, `status: cancelled` |
| 10 | Create plan with hierarchy allocation | API | 5-field hierarchy model populated |
| 11 | Create plan with multi-currency (EUR) | API | `source_currency: EUR`, `exchange_rate_used` set |
| 12 | Create plan with PER_SEAT pricing model | API | `pricing_model: PER_SEAT` |
| 13 | Create plan with FLAT_FEE pricing model | API | `pricing_model: FLAT_FEE` |
| 14 | Reject plan with missing required fields | Validation | 422 with field-level errors |
| 15 | Reject plan with invalid provider | Validation | 404 provider not found |
| 16 | Monthly daily cost = (price * users) / days_in_month | Calc | Correct amortization for 28/30/31 day months |
| 17 | Annual daily cost = (price * users) / 365 | Calc | Correct annual amortization |
| 18 | Leap year annual cost = (price * users) / 366 | Calc | Correct leap year handling |
| 19 | Prorated cost for partial month (start mid-month) | Calc | Only days after start_date included |
| 20 | Prorated cost for cancelled plan (end mid-month) | Calc | Only days before end_date included |
| 21 | Fiscal year alignment (April start) | Calc | Quarters align to fiscal_year_start_month |
| 22 | Provider coverage: Canva | API | Plan created for `canva` provider |
| 23 | Provider coverage: Slack | API | Plan created for `slack` provider |
| 24 | Provider coverage: ChatGPT Plus | API | Plan created for `chatgpt_plus` provider |

## Pipeline Tests (Port 8001)

Pipeline execution and FOCUS 1.3 conversion validation.

### Pipeline Execution Matrix (10 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Run subscription pipeline | E2E | `POST /pipelines/run/{org}/subscription/costs/subscription_cost` returns 200 |
| 2 | Step 1: sp_subscription_2_calculate_daily_costs | Pipeline | `subscription_plan_costs_daily` populated |
| 3 | Step 2: sp_subscription_3_convert_to_focus | Pipeline | `cost_data_standard_1_3` populated with `x_source_system = 'subscription_costs_daily'` |
| 4 | x_* lineage fields populated | Data | All 7 x_* fields present in output rows |
| 5 | Idempotent re-run (same date) | Pipeline | No duplicate rows after second run |
| 6 | Pipeline with no active subscriptions | Pipeline | Completes with 0 rows written (no error) |
| 7 | Pipeline with mixed billing cycles | Pipeline | Each plan uses correct daily cost formula |
| 8 | FOCUS 1.3 field mapping: BilledCost | Data | Matches `daily_cost_usd` from costs_daily |
| 9 | FOCUS 1.3 field mapping: ChargeCategory | Data | Set to `Usage` for subscription costs |
| 10 | Procedure sync before pipeline run | Pipeline | `POST /procedures/sync` returns 200, procedures created |

## Verification Commands

```bash
# 1. Create a subscription plan
curl -X POST "http://localhost:8000/api/v1/subscriptions/{org}/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_name": "TEAM",
    "price_per_user_monthly": 25.00,
    "number_of_users": 10,
    "currency": "USD",
    "start_date": "2025-01-01"
  }'

# 2. List active plans
curl -s "http://localhost:8000/api/v1/subscriptions/{org}/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool

# 3. Edit plan (version history)
curl -X POST "http://localhost:8000/api/v1/subscriptions/{org}/providers/chatgpt_plus/plans/{id}/edit-version" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number_of_users": 15, "effective_date": "2025-02-01"}'

# 4. Run subscription pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY"

# 5. Verify FOCUS 1.3 output in BigQuery
bq query --use_legacy_sql=false \
  "SELECT COUNT(*), SUM(BilledCost) FROM \`{project}.{org}_prod.cost_data_standard_1_3\` WHERE x_source_system = 'subscription_costs_daily'"

# 6. Verify daily costs table
bq query --use_legacy_sql=false \
  "SELECT cost_date, subscription_id, daily_cost_usd FROM \`{project}.{org}_prod.subscription_plan_costs_daily\` ORDER BY cost_date DESC LIMIT 10"

# 7. Sync stored procedures
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Plan CRUD via frontend | Integrations > Subscriptions > Add plan | Plan created, shown in list |
| Version history on edit | Edit price > check old version has end_date | Two rows: v1 (ended) + v2 (active) |
| Daily costs after pipeline | Run pipeline > check subscription_plan_costs_daily | One row per active plan per day |
| FOCUS 1.3 unification | Check cost_data_standard_1_3 | Subscription costs alongside cloud + GenAI |
| Multi-currency display | Create EUR plan > check costs | USD conversion applied |
| Fiscal year quarterly alignment | Set fiscal_year_start_month=4 > create quarterly plan | FQ1 starts April |
| Hierarchy allocation | Assign plan to DEPT-001 > run pipeline | Costs attributed to department |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| API CRUD tests passing | 15/15 (100%) |
| Pipeline execution tests | 10/10 (100%) |
| Billing cycle calculations | All 6 cycle types correct |
| Version history integrity | Edit never overwrites -- always creates new row |
| FOCUS 1.3 output | All required fields mapped |
| Multi-currency conversion | Exchange rate applied and tracked |
| x_* lineage fields | All 7 fields present on every output row |

## Known Limitations

1. **Exchange rates**: Currency conversion uses static rates at plan creation time -- no live FX feed
2. **Fiscal year**: Fiscal year start month read from `org_profiles` -- must be set before creating quarterly/annual plans
3. **BigQuery dependency**: Pipeline tests require active BigQuery connection with org dataset provisioned
4. **Demo data date range**: Use Dec 2025 - Jan 2026 for demo data verification (`?start_date=2025-12-01&end_date=2026-01-31`)
5. **Procedure sync**: Stored procedures must be synced to BigQuery before first pipeline run (`POST /procedures/sync`)
6. **Provider registry**: SaaS providers must exist in `configs/system/providers.yml` before plan creation
