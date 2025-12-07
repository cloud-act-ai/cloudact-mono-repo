# FinOps SaaS Subscription Cost Pipeline

This bundle provides the complete SaaS subscription cost calculation system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SYSTEM ARCHITECTURE                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  CENTRAL DATASET: {project_id}.organizations                                     │
│  ├── Procedures (created ONCE, called for each customer):                        │
│  │   ├── sp_calculate_saas_subscription_plan_costs_daily                        │
│  │   ├── sp_convert_saas_costs_to_focus_1_2                                     │
│  │   └── sp_run_saas_subscription_costs_pipeline (orchestrator)                 │
│  │                                                                               │
│  └── Bootstrap Tables (15 org_* tables)                                          │
│      └── org_subscription_audit (audit trail for all orgs)                       │
│                                                                                  │
│  PER-CUSTOMER DATASETS: {project_id}.{org_slug}_prod                            │
│  └── Tables (created during onboarding):                                         │
│      ├── saas_subscription_plans (dimension - user-managed subscriptions)        │
│      ├── saas_subscription_plan_costs_daily (fact - calculated by pipeline)      │
│      └── cost_data_standard_1_2 (FOCUS 1.2 - standardized costs)                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Tables

### Per-Customer Dataset Tables

| Table | Type | Description |
|-------|------|-------------|
| `saas_subscription_plans` | Dimension | Master subscription data (user-managed via UI/API) |
| `saas_subscription_plan_costs_daily` | Fact | Daily amortized costs (pipeline-generated) |
| `cost_data_standard_1_2` | Standard | FinOps FOCUS 1.2 normalized costs |

### Central (organizations) Dataset

| Table | Type | Description |
|-------|------|-------------|
| `org_subscription_audit` | Audit | Audit trail for subscription changes |

## Procedures

All procedures live in `{project_id}.organizations` dataset but operate on customer datasets.

### 1. sp_calculate_saas_subscription_plan_costs_daily

**Stage 1:** Expands active subscription plans into daily amortized cost rows.

```sql
CALL `{project_id}.organizations`.sp_calculate_saas_subscription_plan_costs_daily(
  'gac-prod-471220',    -- p_project_id
  'acme_corp_prod',     -- p_dataset_id (customer dataset)
  DATE('2024-01-01'),   -- p_start_date
  DATE('2024-01-31')    -- p_end_date
);
```

**Logic:**
- Reads active subscriptions from `saas_subscription_plans`
- Applies pricing model (PER_SEAT vs FLAT_FEE)
- Applies discounts (percentage or fixed)
- Calculates daily cost based on billing cycle
- Writes to `saas_subscription_plan_costs_daily`

### 2. sp_convert_saas_costs_to_focus_1_2

**Stage 2:** Converts daily costs to FinOps FOCUS 1.2 standard format.

```sql
CALL `{project_id}.organizations`.sp_convert_saas_costs_to_focus_1_2(
  'gac-prod-471220',    -- p_project_id
  'acme_corp_prod',     -- p_dataset_id (customer dataset)
  DATE('2024-01-01'),   -- p_start_date
  DATE('2024-01-31')    -- p_end_date
);
```

**Logic:**
- Reads from `saas_subscription_plan_costs_daily`
- Maps fields to FOCUS 1.2 columns
- Writes to `cost_data_standard_1_2`
- Uses `SourceSystem = 'saas_subscription_costs_daily'` for idempotency

### 3. sp_run_saas_subscription_costs_pipeline (Orchestrator)

**Runs both stages** in sequence for a customer.

```sql
CALL `{project_id}.organizations`.sp_run_saas_subscription_costs_pipeline(
  'gac-prod-471220',    -- p_project_id
  'acme_corp_prod',     -- p_dataset_id (customer dataset)
  DATE('2024-01-01'),   -- p_start_date
  DATE('2024-01-31')    -- p_end_date
);
```

## Flow Diagram

```
+-----------------------------------------------------------------------------------+
| STEP 1: Customer Dataset Tables (created during org onboarding)                   |
| {project_id}.{org_slug}_prod.saas_subscription_plans                              |
| {project_id}.{org_slug}_prod.saas_subscription_plan_costs_daily                   |
| {project_id}.{org_slug}_prod.cost_data_standard_1_2                               |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
| STEP 2: User manages subscriptions via UI/API                                     |
| - Enable provider → seed default plans                                            |
| - Add/edit/delete custom plans                                                    |
| - Set seats, pricing, discounts                                                   |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
| STEP 3: Pipeline runs (daily scheduler or ad-hoc)                                 |
| POST /api/v1/pipelines/run/{org}/subscription/cost/saas_cost                      |
|                                                                                   |
| Calls: sp_run_saas_subscription_costs_pipeline(project, dataset, start, end)      |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
           +----------------------------------------------------------+
           | Stage 1: Calculate Daily Costs                           |
           | sp_calculate_saas_subscription_plan_costs_daily          |
           |                                                          |
           | 1. Read active subscriptions                             |
           | 2. Apply pricing model (PER_SEAT / FLAT_FEE)             |
           | 3. Apply discounts (percentage / fixed)                  |
           | 4. Calculate: cycle_cost / days_in_cycle = daily_cost    |
           | 5. Write to saas_subscription_plan_costs_daily           |
           +----------------------------------------------------------+
                                       |
                                       v
           +----------------------------------------------------------+
           | Stage 2: Convert to FOCUS 1.2 Standard                   |
           | sp_convert_saas_costs_to_focus_1_2                       |
           |                                                          |
           | 1. Read from saas_subscription_plan_costs_daily          |
           | 2. Map to FOCUS 1.2 columns                              |
           | 3. Set ChargeCategory = 'Subscription'                   |
           | 4. Write to cost_data_standard_1_2                       |
           +----------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
| STEP 4: Cost data available for dashboards and analytics                          |
| - Daily costs in saas_subscription_plan_costs_daily                               |
| - Standardized costs in cost_data_standard_1_2                                    |
| - Can aggregate with GCP, LLM, and other costs                                    |
+-----------------------------------------------------------------------------------+
```

## How to Run

### Daily Run (Scheduler)

Pipeline service scheduler calls for each active customer:

```sql
-- For each active org
CALL `gac-prod-471220.organizations`.sp_run_saas_subscription_costs_pipeline(
  'gac-prod-471220',
  'acme_corp_prod',
  DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),
  DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
);
```

### Ad-hoc Run (API)

```bash
curl -X POST http://localhost:8001/api/v1/pipelines/run/acme_corp/subscription/cost/saas_cost \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2024-01-01",
    "end_date": "2024-01-31"
  }'
```

### Backfill Run (Full Month)

```sql
CALL `gac-prod-471220.organizations`.sp_run_saas_subscription_costs_pipeline(
  'gac-prod-471220',
  'acme_corp_prod',
  DATE('2024-01-01'),
  DATE('2024-12-31')
);
```

## Pricing Logic

### Pricing Models

| Model | Formula | Example |
|-------|---------|---------|
| `PER_SEAT` | `unit_price × seats` | $30/seat × 10 seats = $300/month |
| `FLAT_FEE` | `unit_price` (seats ignored for price) | $199/month flat |

### Daily Cost Calculation

```
daily_cost = cycle_cost / days_in_cycle

Where:
- cycle_cost = base_price × seats (PER_SEAT) or base_price (FLAT_FEE)
- days_in_cycle = days in month (monthly) or days in year (annual)
```

### Discount Application

```sql
CASE
  WHEN discount_type = 'percent' THEN
    cycle_cost × (1 - discount_value / 100)
  WHEN discount_type = 'fixed' THEN
    cycle_cost - discount_value
  ELSE
    cycle_cost
END
```

### Leap Year Handling

- Monthly: `cycle_cost / EXTRACT(DAY FROM LAST_DAY(day))`
- Annual: `cycle_cost / days_in_year` (366 for leap years, 365 otherwise)

## Handling Cancellations (SCD Type 2)

To cancel a subscription:

1. **Do NOT delete** the row
2. Set `end_date` to the last valid day
3. Set `status` to 'cancelled'
4. Pipeline calculates costs up to `end_date`

Example:
```sql
UPDATE saas_subscription_plans
SET end_date = '2024-12-31', status = 'cancelled'
WHERE subscription_id = 'sub_123';
```

## Changing Seats (SCD Type 2)

To change seat count:

1. **Close the old row**: Set `end_date` to today
2. **Create new row**: Insert with `start_date` = tomorrow and new seat count

This preserves historical cost accuracy.

## Files in This Directory

| File | Purpose |
|------|---------|
| `01_create_tables.sql` | DDL for all tables (reference only) |
| `02_proc_stage1_calc_daily_costs.sql` | Legacy procedure (use new sp_* files) |
| `03_proc_stage2_convert_to_standard_1_2.sql` | Legacy procedure (use new sp_* files) |
| `04_proc_orchestrator.sql` | Legacy orchestrator (use new sp_* files) |
| `sp_calculate_saas_subscription_plan_costs_daily.sql` | **Production procedure** |
| `sp_convert_saas_costs_to_focus_1_2.sql` | **Production procedure** |
| `sp_run_saas_subscription_costs_pipeline.sql` | **Production orchestrator** |
| `default_subscription_plans.csv` | Sample seed data |

## Integration with Pipeline Service

Pipeline config: `data-pipeline-service/configs/subscription/cost/saas_cost.yml`

```yaml
pipeline_id: saas-subscription-costs
steps:
  - step: run_cost_pipeline
    processor: subscription.saas_cost
    config:
      procedure: sp_run_saas_subscription_costs_pipeline
      project_id: ${GCP_PROJECT_ID}
      dataset_id: ${org_slug}_${env}
```

---

**Version**: 2.0 | **Updated**: 2025-12-06
