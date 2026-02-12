# Subscription Costs - Requirements

## Overview

Fixed-cost SaaS subscription tracking (Canva, ChatGPT Plus, Slack, etc.) with version-controlled plan management, billing-cycle-aware daily amortization, fiscal year alignment, and FOCUS 1.3 conversion. Plans are managed via API CRUD operations, and daily costs are calculated through a 2-step stored procedure pipeline.

## Source Specification

`02_SAAS_SUBSCRIPTION_COSTS.md` (v12.9, 2026-02-08)

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  Frontend (3000) - Next.js 16                                        │
│  /{org}/cost-dashboards/subscription-costs                           │
│  Subscription plan CRUD UI (create, edit-version, delete)            │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │ Server Actions
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  API Service (8000) - FastAPI                                         │
│                                                                       │
│  CRUD Endpoints:                                                      │
│  GET/POST  /subscriptions/{org}/providers/{p}/plans                  │
│  POST      /subscriptions/{org}/providers/{p}/plans/{id}/edit-version│
│  DELETE    /subscriptions/{org}/providers/{p}/plans/{id}             │
│                                                                       │
│  Version History: Edits create NEW row, old row gets end_date        │
│  Multi-Currency: Templates in USD, converted at plan creation        │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │ Writes to BigQuery
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  BigQuery: {org_slug}_prod                                            │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ subscription_plans (version-controlled, end_date=NULL=current)  │  │
│  └─────────────────────────┬───────────────────────────────────────┘  │
│                             │                                         │
│  Pipeline Service (8001)    │ POST /pipelines/run/{org}/subscription  │
│  triggers 2-step pipeline   │      /costs/subscription_cost           │
│                             ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ Step 1: sp_subscription_2_calculate_daily_costs                 │  │
│  │         Billing-cycle-aware amortization                        │  │
│  │         (monthly/annual/quarterly/semi-annual/weekly/custom)    │  │
│  │         Fiscal year alignment via org_profiles                  │  │
│  │                          │                                      │  │
│  │                          ▼                                      │  │
│  │ subscription_plan_costs_daily (amortized daily costs)           │  │
│  │                          │                                      │  │
│  │ Step 2: sp_subscription_3_convert_to_focus                      │  │
│  │         Map to FOCUS 1.3 schema                                 │  │
│  │                          │                                      │  │
│  │                          ▼                                      │  │
│  │ cost_data_standard_1_3  (FOCUS 1.3 unified)                    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

**Key Distinction:** Unlike Cloud and GenAI costs (which pull from external APIs), subscription costs are manually managed via CRUD. The API Service writes plan definitions directly to BigQuery, and the Pipeline Service calculates daily amortized costs from those plans.

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

## SDLC

### Development Workflow

1. **Create subscription plan via UI** -- Frontend CRUD form submits to API Service
2. **API stores plan to BigQuery** -- `subscription_plans` table with version history
3. **Run cost calculation pipeline** -- `POST /pipelines/run/{org}/subscription/costs/subscription_cost` triggers 2-step pipeline
4. **Pipeline calculates daily costs** -- `sp_subscription_2_calculate_daily_costs` amortizes by billing cycle
5. **Pipeline converts to FOCUS 1.3** -- `sp_subscription_3_convert_to_focus` writes to `cost_data_standard_1_3`
6. **Verify in dashboard** -- Check `/{org}/cost-dashboards/subscription-costs` for correct display

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| API CRUD | pytest | Plan create, edit-version, soft delete, version history |
| Daily amortization | pytest | Billing cycle calculations (monthly, annual, quarterly, leap year) |
| Fiscal year logic | pytest | FY alignment per org (calendar, India/UK April, Australia July) |
| FOCUS conversion | pytest + BigQuery | `sp_subscription_3_convert_to_focus` output validation |
| Frontend CRUD | Vitest | Form validation, version display, currency formatting |
| End-to-end | Playwright | Create plan, verify in dashboard, edit version, check history |
| Demo validation | Demo scripts | Load demo data (Dec 2025 - Jan 2026), verify subscription totals (~$1.4K) |

### Deployment / CI/CD Integration

- **Stage:** Automatic on `git push origin main` via `cloudbuild-stage.yaml`
- **Production:** Triggered by `git tag v*` via `cloudbuild-prod.yaml`
- **Deploy order:** API Service first (CRUD endpoints), then Pipeline Service (stored procedures), then Frontend
- **Post-deploy:** Create a test plan, run pipeline, verify daily costs appear in `cost_data_standard_1_3`

### Release Cycle Position

Subscription costs have a unique flow: API writes data (plans), Pipeline reads and transforms it (daily costs + FOCUS 1.3). Both services must be deployed for the full lifecycle to work. Frontend changes to the subscription dashboard can deploy independently.

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/subscription_plans.py` | CRUD endpoints |
| `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml` | Pipeline config |
