# SaaS Subscription Costs

**v12.8** | 2026-02-05

> Fixed-cost SaaS tracking (Canva, ChatGPT Plus, Slack) → FOCUS 1.3

---

## Workflow

```
1. User adds subscription plan → Frontend form
2. API validates + stores → BigQuery subscription_plans table
3. Edit creates NEW version → Old row gets end_date (version history)
4. Pipeline calculates daily costs → sp_subscription_2_calculate_daily_costs
5. FOCUS conversion → sp_subscription_3_convert_to_focus → cost_data_standard_1_3
6. Dashboard displays → Unified cost analytics
```

---

## Architecture

```
Frontend (3000)        API Service (8000)           Pipeline (8001)
UI + Actions    →      CRUD + Validation     →     Cost Calculation
                       subscription_plans           subscription_plan_costs_daily
                                                   cost_data_standard_1_3
```

---

## API Endpoints (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/subscriptions/{org}/providers/{p}/plans` | List / Create |
| POST | `/subscriptions/{org}/providers/{p}/plans/{id}/edit-version` | Edit (versioned) |
| DELETE | `/subscriptions/{org}/providers/{p}/plans/{id}` | Soft delete |

---

## Pipeline (Port 8001)

| Endpoint | Purpose |
|----------|---------|
| `POST /pipelines/run/{org}/subscription/costs/subscription_cost` | Calculate daily costs + FOCUS |

---

## Key Fields

| Field | Purpose |
|-------|---------|
| `unit_price` | Monthly price (org currency) |
| `billing_cycle` | monthly, annual, quarterly |
| `pricing_model` | PER_SEAT, FLAT_FEE |
| `hierarchy_*` | Dept/Project/Team allocation |
| `end_date` | NULL = current version, set = historical |

---

## Integration Standards

| Standard | Implementation |
|----------|----------------|
| Version history | Edit creates new row, old row gets `end_date` — never overwrites |
| Multi-currency | Templates in USD → converted to org currency at creation |
| FX tracking | Stored with `source_currency`, `exchange_rate_used` |
| Daily amortization | `sp_subscription_2_calculate_daily_costs` divides monthly by days |
| FOCUS compliance | `sp_subscription_3_convert_to_focus` maps to standard schema |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/subscription_plans.py` | CRUD endpoints |
| `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml` | Pipeline config |
