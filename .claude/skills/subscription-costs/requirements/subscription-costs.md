# Subscription Costs - Requirements

## Overview

Fixed-cost SaaS subscription tracking (Canva, ChatGPT Plus, Slack, etc.) with version-controlled plan management, billing-cycle-aware daily amortization, fiscal year alignment, and FOCUS 1.3 conversion. Plans are managed via API CRUD operations, and daily costs are calculated through a 2-step stored procedure pipeline.

## Source Specification

`00-requirements-specs/02_SAAS_SUBSCRIPTION_COSTS.md` (v12.9, 2026-02-08)

---

## Functional Requirements

### FR-01: Subscription Plan CRUD (API Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/subscriptions/{org}/providers/{p}/plans` | List / Create plans |
| POST | `/subscriptions/{org}/providers/{p}/plans/{id}/edit-version` | Edit (creates new version) |
| DELETE | `/subscriptions/{org}/providers/{p}/plans/{id}` | Soft delete |

### FR-02: Version History

- Edits create NEW rows with incremented version number
- Old row receives an `end_date` -- data is never overwritten
- `end_date = NULL` indicates the current active version

```
subscription_plans:
  Row 1: { plan_id: "P-001", version: 1, unit_price: 50, end_date: "2026-01-15" }  <-- historical
  Row 2: { plan_id: "P-001", version: 2, unit_price: 75, end_date: NULL }           <-- current
```

### FR-03: Billing Cycle Types and Daily Cost Calculation

| Billing Cycle | Daily Cost Formula | Notes |
|---------------|-------------------|-------|
| Monthly | `cycle_cost / days_in_billing_period` | Anchor-date aware (e.g., Jan 15 to Feb 15 = 31 days) |
| Annual | `cycle_cost / fiscal_year_days` | 365 or 366 (leap year handling) |
| Quarterly | `cycle_cost / fiscal_quarter_days` | FQ1-FQ4, aligned to fiscal year start month |
| Semi-Annual | `cycle_cost / fiscal_half_days` | FH1-FH2, aligned to fiscal year start month |
| Weekly | `cycle_cost / 7` | Fixed 7-day periods |
| Custom | `cycle_cost / 30` | Fallback for non-standard cycles |

### FR-04: Fiscal Year Support

Reads `fiscal_year_start_month` from `org_profiles` to align cost calculations:

| Fiscal Year Type | Start Month | Example Orgs |
|------------------|-------------|-------------|
| Calendar year | 1 (January) | US corporations (default) |
| India / UK | 4 (April) | Indian companies, UK government |
| Australia | 7 (July) | Australian companies |

### FR-05: 2-Step Cost Calculation Pipeline (Port 8001)

Pipeline endpoint: `POST /pipelines/run/{org}/subscription/costs/subscription_cost`

| Step | Procedure | Purpose | Output |
|------|-----------|---------|--------|
| 1 | `sp_subscription_2_calculate_daily_costs` | Amortize plan costs to daily granularity by billing cycle | `subscription_plan_costs_daily` |
| 2 | `sp_subscription_3_convert_to_focus` | Map daily costs to FOCUS 1.3 schema | `cost_data_standard_1_3` |

### FR-06: Multi-Currency Support

- Templates stored in USD
- Converted to org currency at plan creation time
- FX tracking via `source_currency` and `exchange_rate_used` fields

### FR-07: Hierarchy Allocation (5-Field Model)

| Field | Description |
|-------|-------------|
| `x_hierarchy_entity_id` | Hierarchy entity ID allocation |
| `x_hierarchy_entity_name` | Hierarchy entity name |
| `x_hierarchy_level_code` | Level: `DEPT`, `PROJ`, `TEAM` |
| `x_hierarchy_path` | Full hierarchy path of IDs |
| `x_hierarchy_path_names` | Full hierarchy path of names |

---

## Non-Functional Requirements

### NFR-01: Tables

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Plan definitions with version history |
| `subscription_plan_costs_daily` | Amortized daily cost output from stored procedure |
| `cost_data_standard_1_3` | Unified FOCUS 1.3 output (shared with Cloud + GenAI) |

### NFR-02: Key Fields

| Field | Purpose |
|-------|---------|
| `unit_price` | Price per billing cycle (org currency) |
| `billing_cycle` | monthly, annual, quarterly, semi_annual, weekly, custom |
| `pricing_model` | PER_SEAT, FLAT_FEE |
| `x_org_slug` | Multi-tenant row isolation |
| `x_pipeline_id` | Pipeline template name |
| `x_credential_id` | Credential used |
| `x_pipeline_run_date` | Data date (idempotency key) |
| `end_date` | NULL = current version, set = historical |

### NFR-03: Compliance

| Standard | Implementation |
|----------|----------------|
| FinOps FOCUS 1.3 | All output conforms to FOCUS 1.3 unified schema |
| ASC 606 / IFRS 15 | Revenue recognition compliant daily amortization |
| GAAP / Statutory fiscal year | Fiscal year start month configurable per org |
| Leap year handling | Annual and quarterly periods adjust for 366-day years |

### NFR-04: Integration Standards

| Standard | Implementation |
|----------|----------------|
| Version history | Edit creates new row, old row gets `end_date` |
| Multi-currency | Templates in USD, converted to org currency at creation |
| FX tracking | Stored with `source_currency`, `exchange_rate_used` |
| Daily amortization | Billing-cycle-aware division via stored procedure |
| Fiscal year alignment | Reads `fiscal_year_start_month` from `org_profiles` |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/subscription_plans.py` | CRUD endpoints |
| `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml` | Pipeline config |
