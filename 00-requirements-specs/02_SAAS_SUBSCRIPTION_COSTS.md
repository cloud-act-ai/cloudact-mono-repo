# SaaS Subscription Costs

**v12.7** | 2026-01-15

> Fixed-cost SaaS tracking (Canva, ChatGPT Plus, Slack) → FOCUS 1.3

---

## Architecture

```
Frontend (3000)        API Service (8000)           Pipeline (8001)
UI + Actions    →      CRUD + Validation     →     Cost Calculation
                       subscription_plans           subscription_plan_costs_daily
                                                   cost_data_standard_1_3
```

---

## Data Flow

```
Add Plan → API validates → BigQuery subscription_plans
        → Pipeline calculates daily costs → FOCUS 1.3
```

**Version History:** Edit creates NEW row, OLD row gets `end_date`

---

## API Endpoints (Port 8000)

```bash
GET/POST /api/v1/subscriptions/{org}/providers/{p}/plans           # List/Create
POST     /api/v1/subscriptions/{org}/providers/{p}/plans/{id}/edit-version  # Edit
DELETE   /api/v1/subscriptions/{org}/providers/{p}/plans/{id}      # Soft delete
```

---

## Pipeline (Port 8001)

```bash
POST /api/v1/pipelines/run/{org}/subscription/costs/subscription_cost
```

**Stored Procedures:**
- `sp_subscription_2_calculate_daily_costs` - Daily amortization
- `sp_subscription_3_convert_to_focus` - FOCUS 1.3

---

## Key Fields

| Field | Purpose |
|-------|---------|
| `unit_price` | Monthly price (org currency) |
| `billing_cycle` | monthly, annual, quarterly |
| `pricing_model` | PER_SEAT, FLAT_FEE |
| `hierarchy_*` | Dept/Project/Team allocation |

---

## Multi-Currency

Templates (USD) → converted to org currency → stored with `source_currency`, `exchange_rate_used`

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/subscription_plans.py` | CRUD |
| `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml` | Pipeline |
