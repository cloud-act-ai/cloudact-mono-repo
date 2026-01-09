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
| No costs calculated | Verify active subscriptions exist (`status = 'active'`) |
| Wrong currency | Match plan currency to org `default_currency` |
| Missing FOCUS data | Check `sp_subscription_3_convert_to_focus` logs |
| Procedure not found | Run `POST /api/v1/procedures/sync` (port 8001) |
