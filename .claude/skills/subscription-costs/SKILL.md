---
name: subscription-costs
description: |
  SaaS subscription cost management. Run pipelines, manage plans, debug calculations.
  Use when: running subscription pipelines, managing SaaS subscriptions, debugging cost calculations.
---

# Subscription Costs

## Architecture
```
subscription_plans → sp_subscription_2_calculate_daily_costs
                     → subscription_plan_costs_daily
                     → sp_subscription_3_convert_to_focus
                     → cost_data_standard_1_3 (FOCUS 1.3)
```

## Files
- Pipeline: `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml`
- Procedures: `03-data-pipeline-service/configs/system/procedures/subscription/`
- API Router: `02-api-service/src/app/routers/subscriptions.py`
- Frontend: `01-fronted-system/app/[orgSlug]/integrations/subscriptions/`

## Tables
```
subscription_plans → Input (CRUD via API 8000)
  - subscription_id, provider_id, plan_name, status
  - price_per_unit, number_of_users, billing_cycle
  - start_date, end_date, currency
  - hierarchy_entity_id, hierarchy_path

subscription_plan_costs_daily → Output (Pipeline writes)
  - cost_date, subscription_id, daily_cost_local, daily_cost_usd
  - hierarchy allocation fields

cost_data_standard_1_3 → FOCUS 1.3 format
  - Filter: x_source_system = 'subscription_costs_daily'
```

## Key Operations

**Run pipeline (Pipeline Service 8001):**
```bash
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $KEY" -d '{}'
```

**Create subscription (API Service 8000):**
```bash
curl -X POST "http://localhost:8000/api/v1/subscriptions/{org}/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $KEY" -d '{
    "plan_name": "TEAM",
    "price_per_user_monthly": 25.00,
    "number_of_users": 10,
    "currency": "USD",
    "start_date": "2025-01-01"
  }'
```

**Edit with version history:**
```bash
curl -X POST "http://localhost:8000/api/v1/subscriptions/{org}/providers/{provider}/plans/{id}/edit-version" \
  -H "X-API-Key: $KEY" -d '{
    "number_of_users": 15,
    "effective_date": "2025-02-01"
  }'
```

**Cancel subscription:**
```bash
curl -X DELETE "http://localhost:8000/api/v1/subscriptions/{org}/providers/{provider}/plans/{id}" \
  -H "X-API-Key: $KEY" -d '{"end_date": "2025-03-31"}'
```

## Cost Calculation
- **Monthly:** `(price_per_unit × users) / days_in_month`
- **Annual:** `(price_per_unit × users) / 365`
- **Prorated:** Partial month calculation for start/end dates
- **Multi-currency:** Converts to USD via exchange rates

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Pipeline stuck PENDING | Check for duplicate runs in `org_meta_pipeline_runs` |
| No costs calculated | Verify active subscriptions exist (`status = 'active'`) in `subscription_plans` table |
| Wrong currency | Match plan currency to org `default_currency` |
| Missing FOCUS data | Check `sp_subscription_3_convert_to_focus` logs |
| Procedure not found | Run `POST /api/v1/procedures/sync` (port 8001) |
| **subscription_plans table empty** | CSV had `org_slug` instead of `x_org_slug` or REQUIRED hierarchy fields empty. Fix CSV and re-load with `bq load --skip_leading_rows=1` |
| **CSV "Too many values"** (36 vs 35) | Extra comma in CSV data rows. Use `python3 csv.reader` to count columns per row. Common: extra comma between `contract_id` and `notes` fields |
| **x_hierarchy_level_code wrong** | Must be `department`, `project`, or `team` (NOT `function`). Must match actual hierarchy level |
| **REQUIRED hierarchy fields** | `x_hierarchy_entity_id`, `x_hierarchy_entity_name`, `x_hierarchy_path`, `x_hierarchy_path_names` are all REQUIRED in schema. Pipeline fails silently if empty |

### Verified Subscription Costs (Jan 2025 - Dec 2026, 15 plans)

| Metric | Value |
|--------|-------|
| Plans loaded | 15 SaaS subscriptions |
| Daily cost records | 10,950 (15 × 730 days) |
| BQ total cost | ~$151K |
| API total (date-filtered) | ~$85K |
| FOCUS records | 10,950 per-provider rows |
| Providers in FOCUS | slack, notion, figma, zoom, chatgpt_plus, adobe_cc, claude_pro, copilot, canva, jira, confluence, cursor, linear, github, vercel |

## Environments

| Environment | Pipeline URL | BigQuery Dataset | API URL |
|-------------|-------------|------------------|---------|
| local | `http://localhost:8001` | `{org}_local` | `http://localhost:8000` |
| stage | Cloud Run URL | `{org}_stage` | Cloud Run URL |
| prod | `https://pipeline.cloudact.ai` | `{org}_prod` | `https://api.cloudact.ai` |

```bash
# Run subscription pipeline (local)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/subscription/costs/subscription_cost" \
  -H "x-api-key: {org_api_key}"

# Run subscription pipeline (stage)
curl -X POST "https://cloudact-pipeline-service-test-*.a.run.app/api/v1/pipelines/run/{org}/subscription/costs/subscription_cost" \
  -H "x-api-key: {org_api_key}"
```

## Testing

### Verify Plans Loaded
```bash
bq query --nouse_legacy_sql \
  "SELECT COUNT(*) as plans, COUNT(DISTINCT provider_id) as providers FROM \`cloudact-testing-1.{org}_local.subscription_plans\` WHERE x_org_slug='{org}'"
# Expected: plans > 0
```

### Verify Pipeline Output
```bash
# Daily costs
bq query --nouse_legacy_sql \
  "SELECT COUNT(*) as row_count, SUM(daily_cost) as total FROM \`cloudact-testing-1.{org}_local.subscription_plan_costs_daily\`"

# FOCUS output
bq query --nouse_legacy_sql \
  "SELECT ServiceCategory, COUNT(*) as rows, SUM(BilledCost) as total FROM \`cloudact-testing-1.{org}_local.cost_data_standard_1_3\` WHERE ServiceCategory='subscription' GROUP BY 1"
```

### CSV Validation (Before Load)
```python
import csv
with open('subscription_plans.csv') as f:
    reader = csv.reader(f)
    header = next(reader)
    print(f"Header columns: {len(header)}")
    for i, row in enumerate(reader):
        assert len(row) == len(header), f"Row {i+1}: {len(row)} cols (expected {len(header)})"
# Must be exactly 35 columns. Extra commas = column count mismatch.
```

## Source Specifications

Requirements consolidated from:
- `02_SAAS_SUBSCRIPTION_COSTS.md` - SaaS subscription costs

## 5 Implementation Pillars

| Pillar | How Subscription Costs Handles It |
|--------|-------------------------------|
| **i18n** | SaaS costs stored in plan's `currency` field, multi-currency conversion to USD via exchange rates, `formatCost()` for all frontend display |
| **Enterprise** | Subscription lifecycle tracking (active/cancelled/expired), pro-rated daily cost calculation, plan version history via `edit-version` endpoint |
| **Cross-Service** | Frontend plan CRUD (3000) → API (8000) stores in `subscription_plans` → Pipeline (8001) calculates daily costs → BigQuery `cost_data_standard_1_3` (FOCUS 1.3) |
| **Multi-Tenancy** | `subscription_plans` scoped by `x_org_slug`, pipeline output includes `x_org_slug` in every row, `{org_slug}_prod` dataset isolation |
| **Reusability** | Shared FOCUS 1.3 schema for output, subscription pipeline YAML configs follow `BaseProcessor` pattern, cost formatters from `lib/costs/` |

## Related Skills

- `pipeline-ops` - Pipeline execution and debugging
- `hierarchy` - Hierarchy fields in subscription plans
- `cost-analysis` - FOCUS 1.3 output from subscription pipeline
- `demo-setup` - Demo subscription data loading
