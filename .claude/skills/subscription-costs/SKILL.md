---
name: subscription-costs
description: |
  SaaS subscription cost management for CloudAct. Run subscription cost pipelines, debug calculations, manage subscription plans.
  Use when: running subscription cost pipelines, debugging cost calculations, managing SaaS subscriptions,
  working with saas_subscription_plans table, or FOCUS 1.3 conversion for subscriptions.
---

# Subscription Costs

## Overview
CloudAct manages SaaS subscription costs through a unified pipeline that calculates daily amortized costs and converts them to FOCUS 1.3 format.

## Key Locations
- **Pipeline Config:** `03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml`
- **Stored Procedures:** `03-data-pipeline-service/configs/system/procedures/saas_subscription/`
- **Processor:** `03-data-pipeline-service/src/core/processors/generic/procedure_executor.py`
- **Frontend:** `01-fronted-system/app/[orgSlug]/integrations/subscriptions/`
- **Dashboard:** `01-fronted-system/app/[orgSlug]/cost-dashboards/subscription-costs/`

## Pipeline Architecture

```
POST /api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost
  │
  └─► procedure_executor (generic.procedure_executor)
       │
       └─► sp_run_saas_subscription_costs_pipeline
            │
            ├─► Stage 1: sp_calculate_saas_subscription_plan_costs_daily
            │   └─► Outputs: saas_subscription_plan_costs_daily
            │
            └─► Stage 2: sp_convert_saas_costs_to_focus_1_3
                └─► Outputs: cost_data_standard_1_3 (x_SourceSystem = 'saas_subscription_costs_daily')
```

## Stored Procedures

| Procedure | Purpose |
|-----------|---------|
| `sp_run_saas_subscription_costs_pipeline` | Orchestrator - calls Stage 1 & 2 |
| `sp_calculate_saas_subscription_plan_costs_daily` | Calculate daily amortized costs |
| `sp_convert_saas_costs_to_focus_1_3` | Convert to FOCUS 1.3 format |

## Tables

### Input Table: `saas_subscription_plans`
```sql
subscription_id      STRING    -- Unique ID
org_slug            STRING    -- Organization
provider_id         STRING    -- e.g., 'chatgpt_plus', 'slack'
plan_name           STRING    -- e.g., 'TEAM', 'BUSINESS'
start_date          DATE      -- When subscription started
end_date            DATE      -- NULL if active
status              STRING    -- 'active', 'cancelled', 'expired'
billing_cycle       STRING    -- 'monthly', 'annual'
price_per_unit      FLOAT64   -- Monthly price
number_of_users     INT64     -- Seat count
currency            STRING    -- e.g., 'USD', 'INR'
hierarchy_dept_id   STRING    -- Cost allocation
hierarchy_project_id STRING
hierarchy_team_id   STRING
```

### Output Table: `saas_subscription_plan_costs_daily`
```sql
cost_date           DATE      -- The day
subscription_id     STRING    -- From plans
provider_id         STRING
plan_name           STRING
daily_cost_local    FLOAT64   -- In org currency
daily_cost_usd      FLOAT64   -- Converted to USD
currency            STRING
hierarchy_*         STRING    -- Allocation fields
```

### FOCUS Output: `cost_data_standard_1_3`
Filtered by: `x_SourceSystem = 'saas_subscription_costs_daily'`

## Instructions

### 1. Run Subscription Cost Pipeline
```bash
# Run for specific org
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{}'

# With date range (optional)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2025-01-01", "end_date": "2025-01-31"}'
```

### 2. Check Pipeline Status
```bash
# Get recent runs
curl -s "http://localhost:8001/api/v1/pipelines/runs?org_slug={org_slug}&limit=5" \
  -H "X-API-Key: {org_api_key}"

# Get specific run
curl -s "http://localhost:8001/api/v1/pipelines/runs/{pipeline_logging_id}" \
  -H "X-API-Key: {org_api_key}"
```

### 3. Sync Stored Procedures
```bash
# Sync all procedures (after updates)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: {root_key}"

# List synced procedures
curl -s "http://localhost:8001/api/v1/procedures" \
  -H "X-CA-Root-Key: {root_key}"
```

### 4. Create/Edit Subscription Plan (via API Service)
```bash
# Create new subscription
curl -X POST "http://localhost:8000/api/v1/subscriptions/{org_slug}/providers/chatgpt_plus/plans" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_name": "TEAM",
    "price_per_user_monthly": 25.00,
    "number_of_users": 10,
    "currency": "USD",
    "billing_cycle": "monthly",
    "start_date": "2025-01-01"
  }'

# Edit with version history
curl -X POST "http://localhost:8000/api/v1/subscriptions/{org_slug}/providers/chatgpt_plus/plans/{subscription_id}/edit-version" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "number_of_users": 15,
    "effective_date": "2025-02-01"
  }'
```

### 5. Debug Cost Calculations
```sql
-- Check subscription plans
SELECT * FROM `{project}.{org_slug}_dev.saas_subscription_plans`
WHERE status = 'active';

-- Check daily costs
SELECT cost_date, subscription_id, daily_cost_local, daily_cost_usd
FROM `{project}.{org_slug}_dev.saas_subscription_plan_costs_daily`
ORDER BY cost_date DESC
LIMIT 10;

-- Check FOCUS output
SELECT BillingPeriodStart, ServiceName, EffectiveCost, x_SourceSystem
FROM `{project}.{org_slug}_dev.cost_data_standard_1_3`
WHERE x_SourceSystem = 'saas_subscription_costs_daily'
ORDER BY BillingPeriodStart DESC
LIMIT 10;
```

## Cost Calculation Logic

### Daily Amortization
```python
# Monthly billing
daily_cost = (price_per_unit * number_of_users) / days_in_month

# Annual billing
daily_cost = (price_per_unit * number_of_users) / 365

# Prorated for partial months
if start_date.month == cost_date.month:
    # Only count from start_date
    proration = (days_in_month - start_date.day + 1) / days_in_month
```

### Multi-Currency
```python
# Convert to USD for standardization
daily_cost_usd = daily_cost_local * exchange_rate_to_usd
```

## Validation Checklist
- [ ] Subscription plans exist in `saas_subscription_plans` table
- [ ] Plans have `status = 'active'` and valid `start_date`
- [ ] Currency matches org's `default_currency`
- [ ] Stored procedures are synced to BigQuery
- [ ] Pipeline completes without errors
- [ ] Daily costs appear in output tables
- [ ] FOCUS data has `x_SourceSystem = 'saas_subscription_costs_daily'`

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Pipeline stuck PENDING | Duplicate run detection | Wait for existing run or check logs |
| No costs calculated | No active subscriptions | Add plans with `status = 'active'` |
| Wrong currency | Plan currency mismatch | Match plan currency to org default |
| Missing FOCUS data | Stage 2 failed | Check `sp_convert_saas_costs_to_focus_1_3` |
| Procedure not found | Not synced | Run `/api/v1/procedures/sync` |

## Example Prompts

```
# Running Pipeline
"Run the subscription cost pipeline for guru_inc_12012025"
"Execute SaaS costs pipeline for all January 2025"
"Trigger subscription cost calculation"

# Debugging
"Pipeline shows PENDING but not running"
"Why are no costs being calculated?"
"Check if subscription plans are active"

# Managing Subscriptions
"Add a new ChatGPT Plus subscription"
"Update seat count for Slack subscription"
"Cancel the Notion subscription"

# Cost Analysis
"Show subscription costs by provider"
"What's the daily cost for all SaaS?"
"Compare subscription costs month over month"
```

## Related Skills
- `cost-analysis` - Overall cost analysis and FOCUS 1.3
- `pipeline-ops` - General pipeline operations
- `hierarchy-ops` - Cost allocation to departments/projects
- `provider-mgmt` - Manage SaaS providers
