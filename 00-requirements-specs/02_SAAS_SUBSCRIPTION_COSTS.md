# SaaS Subscription Costs

**v12.9** | 2026-02-08

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

## Fiscal Year Support

Reads `fiscal_year_start_month` from `org_profiles` to align cost calculations with the organization's fiscal calendar.

| Fiscal Year Type | Start Month | Example Orgs |
|------------------|-------------|-------------|
| Calendar year | 1 (January) | US corporations (default) |
| India / UK | 4 (April) | Indian companies, UK government |
| Australia | 7 (July) | Australian companies |

---

## Billing Cycle Types & Daily Cost Calculation

| Billing Cycle | Daily Cost Formula | Notes |
|---------------|-------------------|-------|
| Monthly | `cycle_cost / days_in_billing_period` | Anchor-date aware (e.g., Jan 15 → Feb 15 = 31 days) |
| Annual | `cycle_cost / fiscal_year_days` | 365 or 366 (leap year handling) |
| Quarterly | `cycle_cost / fiscal_quarter_days` | FQ1-FQ4, aligned to fiscal year start month |
| Semi-Annual | `cycle_cost / fiscal_half_days` | FH1-FH2, aligned to fiscal year start month |
| Weekly | `cycle_cost / 7` | Fixed 7-day periods |
| Custom | `cycle_cost / 30` | Fallback for non-standard cycles |

---

## Stored Procedures

| Procedure | Purpose | Output |
|-----------|---------|--------|
| `sp_subscription_2_calculate_daily_costs` | Amortize plan costs to daily granularity by billing cycle | `subscription_plan_costs_daily` |
| `sp_subscription_3_convert_to_focus` | Map daily costs to FOCUS 1.3 schema | `cost_data_standard_1_3` |

---

## Tables

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Plan definitions with version history (edits create new rows) |
| `subscription_plan_costs_daily` | Amortized daily cost output from stored procedure |
| `cost_data_standard_1_3` | Unified FOCUS 1.3 output (shared with Cloud + GenAI) |

---

## Key Fields

| Field | Purpose |
|-------|---------|
| `unit_price` | Price per billing cycle (org currency) |
| `billing_cycle` | monthly, annual, quarterly, semi_annual, weekly, custom |
| `pricing_model` | PER_SEAT, FLAT_FEE |
| `x_org_slug` | Organization identifier (multi-tenant row isolation) |
| `x_pipeline_id` | Pipeline template name |
| `x_credential_id` | Credential used |
| `x_pipeline_run_date` | Data date (idempotency key) |
| `x_hierarchy_entity_id` | Hierarchy entity ID allocation |
| `x_hierarchy_entity_name` | Hierarchy entity name |
| `x_hierarchy_level_code` | Hierarchy level (DEPT, PROJ, TEAM) |
| `x_hierarchy_path` | Full hierarchy path of IDs |
| `x_hierarchy_path_names` | Full hierarchy path of names |
| `end_date` | NULL = current version, set = historical |

---

## Version History

Edits create new rows with a new version — old rows receive an `end_date`. Data is never overwritten.

```
subscription_plans:
  Row 1: { plan_id: "P-001", version: 1, unit_price: 50, end_date: "2026-01-15" }  ← historical
  Row 2: { plan_id: "P-001", version: 2, unit_price: 75, end_date: NULL }           ← current
```

---

## Integration Standards

| Standard | Implementation |
|----------|----------------|
| Version history | Edit creates new row, old row gets `end_date` — never overwrites |
| Multi-currency | Templates in USD → converted to org currency at creation |
| FX tracking | Stored with `source_currency`, `exchange_rate_used` |
| Daily amortization | `sp_subscription_2_calculate_daily_costs` — billing-cycle-aware division |
| FOCUS compliance | `sp_subscription_3_convert_to_focus` maps to standard schema |
| Fiscal year alignment | Reads `fiscal_year_start_month` from `org_profiles` |
| Leap year handling | Annual/quarterly calculations account for 365 vs 366 day years |

---

## Compliance

| Standard | Implementation |
|----------|----------------|
| FinOps FOCUS 1.3 | All output conforms to FOCUS 1.3 unified schema |
| ASC 606 / IFRS 15 | Revenue recognition compliant daily amortization |
| GAAP / Statutory fiscal year | Fiscal year start month configurable per org |
| Leap year handling | Annual and quarterly periods adjust for 366-day years |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/subscription_plans.py` | CRUD endpoints |
| `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml` | Pipeline config |
