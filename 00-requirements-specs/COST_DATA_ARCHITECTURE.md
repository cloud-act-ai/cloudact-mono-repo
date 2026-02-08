# Cost Data Architecture

**v2.1** | 2026-02-05

> All costs (SaaS, Cloud, GenAI) → FOCUS 1.3 unified table

---

## Data Flow Workflow

```
Cloud Billing Export ──┐
GenAI Usage APIs ──────┤──→ Raw Tables ──→ Stored Procedures ──→ cost_data_standard_1_3
SaaS Manual Entry ─────┘                                                │
                                                                        ↓
Frontend (3000) ← Server Actions ← API Service (8000) ← Polars + Cache
```

---

## Architecture

```
Frontend (3000)        API Service (8000)           Pipeline (8001)
Cost Dashboards   →    Polars + Cache         ←    Cost calculation
actions/costs.ts       services/cost_read/         → cost_data_standard_1_3
```

---

## Unified Table: `cost_data_standard_1_3`

FOCUS 1.3 compliant with CloudAct extensions (`x_*` fields).

| FOCUS Field | Source | Description |
|-------------|--------|-------------|
| `ChargePeriodStart` | cost_date | Charge period start |
| `EffectiveCost` | total_cost | Actual cost amount |
| `ServiceProviderName` | provider | Provider name |
| `SubAccountId` | hierarchy_team_id | Hierarchy allocation |
| `x_source_system` | system | `cloud_gcp`, `genai_openai`, `subscription` |
| `x_pipeline_id` | pipeline | Pipeline that wrote the data |
| `x_run_id` | run | Execution UUID |

---

## Source Tables → FOCUS Conversion

| Source | Raw Tables | Stored Procedure | Output |
|--------|-----------|------------------|--------|
| Cloud | `cloud_{provider}_billing_raw_daily` | `sp_cloud_1_convert_to_focus` | FOCUS 1.3 |
| GenAI | `genai_*_costs_daily` | `sp_genai_3_convert_to_focus` | FOCUS 1.3 |
| SaaS | `subscription_plan_costs_daily` | `sp_subscription_3_convert_to_focus` | FOCUS 1.3 |

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `lib/costs/types.ts` | TypeScript types |
| `lib/costs/date-ranges.ts` | Period calculations (MTD, YTD, MoM) |
| `lib/costs/filters.ts` | Data filtering |
| `lib/costs/formatters.ts` | Display formatting (currency, numbers) |
| `app/[orgSlug]/cost-dashboards/` | Dashboard pages |

### API Service
| File | Purpose |
|------|---------|
| `src/core/services/cost_read/` | Polars + LRU cache read service |
| `src/lib/costs/` | Calculations, aggregations |

### Pipeline Service
| File | Purpose |
|------|---------|
| `configs/{provider}/cost/*.yml` | Pipeline configs |
| `configs/system/procedures/` | Stored procedures (FOCUS conversion) |
