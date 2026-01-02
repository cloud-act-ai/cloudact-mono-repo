# SaaS Subscription Costs

**Status**: IMPLEMENTED (v12.7) | **Updated**: 2026-01-01

> Track fixed-cost SaaS subscriptions (Canva, ChatGPT Plus, Slack, etc.). Related: [Cloud Costs](02_CLOUD_COSTS.md) | [GenAI Costs](02_GENAI_COSTS.md)

---

## Quick Reference

| Service | Port | Role |
|---------|------|------|
| Frontend | 3000 | UI + Server Actions |
| API Service | 8000 | CRUD + Validation |
| Pipeline Service | 8001 | Cost Calculation |

---

## DO's and DON'Ts

| DO | DON'T |
|----|-------|
| Lock currency to org default | Never hard delete plans |
| Use version history for edits | Never update price in place |
| Validate provider names | Never allow currency mismatch |
| Soft delete with `end_date` | Never skip input validation |
| Trigger cost pipeline after changes | Never call pipeline service directly |

---

## Data Storage

```
SUPABASE                              BIGQUERY
saas_subscription_providers_meta      {org}_{env}.saas_subscription_plans (28 cols)
├─ provider ON/OFF toggles            {org}_{env}.saas_subscription_plan_costs_daily
└─ NO plan data                       {org}_{env}.cost_data_standard_1_3
```

---

## User Flows

### Enable Provider
```
Toggle ON → Insert to Supabase meta → Empty BigQuery table
         → Show "Add from Template" buttons
```

### Add Subscription
```
Select Template → Convert price to org currency → Create plan in BigQuery
              → If start_date past: trigger cost backfill
```

### Edit Subscription (Version History)
```
Edit form → POST edit-version → OLD row: end_date = effective_date - 1
                             → NEW row: new subscription_id
```

### End Subscription (Soft Delete)
```
End button → Set end_date + status='cancelled'
          → Plan remains for historical reporting
```

---

## Multi-Currency

```
Seed CSV (USD) → Template Page converts to org currency → BigQuery stores:
                                                         ├─ currency (org default)
                                                         ├─ unit_price (converted)
                                                         ├─ source_currency (USD)
                                                         ├─ source_price (original)
                                                         └─ exchange_rate_used
```

**16 Currencies:** USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD, AED, SAR, QAR, KWD, BHD, OMR

---

## API Endpoints

```
GET    /api/v1/subscriptions/{org}/providers/{p}/plans           # List plans
POST   /api/v1/subscriptions/{org}/providers/{p}/plans           # Create
POST   /api/v1/subscriptions/{org}/providers/{p}/plans/{id}/edit-version  # Edit with history
DELETE /api/v1/subscriptions/{org}/providers/{p}/plans/{id}      # Soft delete
GET    /api/v1/subscriptions/{org}/providers/{p}/available-plans # Get templates
```

---

## Cost Pipeline

**Config:** `03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml`

**Stored Procedures:**
| Procedure | Purpose |
|-----------|---------|
| `sp_calculate_saas_subscription_plan_costs_daily` | Daily amortized costs |
| `sp_convert_saas_costs_to_focus_1_3` | FOCUS 1.3 format |
| `sp_run_saas_subscription_costs_pipeline` | Orchestrator |

---

## Billing Cycles

| Cycle | Calculation |
|-------|-------------|
| monthly | unit_price / days_in_month |
| annual | yearly_price / 365 |
| quarterly | price / actual_days (90-92) |
| semi-annual | price / 182-184 |

**Fiscal Year:** Configurable via `fiscal_year_start_month` (1=Jan, 4=Apr/India, 7=Jul/Australia)

---

## Key Fields

| Field | Purpose |
|-------|---------|
| subscription_id | UUID primary key |
| plan_name | Display name |
| unit_price | Monthly price in org currency |
| billing_cycle | monthly, annual, quarterly, semi_annual |
| pricing_model | PER_SEAT, FLAT_FEE |
| status | active, cancelled, expired, pending |
| hierarchy_* | Dept/Project/Team allocation |

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/subscription-providers.ts` | Server actions |
| `02-api-service/src/app/routers/subscription_plans.py` | CRUD endpoints |
| `02-api-service/configs/saas/seed/data/saas_subscription_plans.csv` | Templates |
| `03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml` | Pipeline |

---

## Validation

```typescript
// Provider: sanitizeProviderName() - no reserved names
// Plan name: max 50 chars
// Price: >= 0
// Billing cycle: monthly, annual, quarterly, semi_annual
// Pricing model: PER_SEAT, FLAT_FEE
// Status: active, cancelled, expired, pending
```

---

## Error Handling

| Error | Fix |
|-------|-----|
| 409 Duplicate | Plan with same name exists |
| 400 Currency mismatch | Must use org default currency |
| Pipeline timeout | Increase timeout for large date ranges |

---

**v12.7** | 2026-01-01
