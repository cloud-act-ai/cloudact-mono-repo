# Cost Data Architecture

**v2.2** | 2026-02-08

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
| `x_org_slug` | org | Multi-tenant row isolation |
| `x_source_system` | system | `cloud_gcp`, `genai_openai`, `subscription` |
| `x_pipeline_id` | pipeline | Pipeline that wrote the data |
| `x_credential_id` | credential | Credential used |
| `x_pipeline_run_date` | date | Data date (idempotency key) |
| `x_run_id` | run | Execution UUID |
| `x_ingested_at` | timestamp | Write timestamp |
| `x_ingestion_date` | date | Partition key |

---

## Hierarchy Model (5-field)

All cost tables use a consistent 5-field hierarchy model:

| Field | Description |
|-------|-------------|
| `x_hierarchy_entity_id` | Entity identifier (e.g., `DEPT-001`, `PROJ-042`) |
| `x_hierarchy_entity_name` | Human-readable entity name |
| `x_hierarchy_level_code` | Level in hierarchy (`DEPT`, `PROJ`, `TEAM`) |
| `x_hierarchy_path` | Full path of IDs (`/ORG/DEPT-001/PROJ-042`) |
| `x_hierarchy_path_names` | Full path of names (`/Acme/Engineering/Backend`) |

---

## Source Tables → FOCUS Conversion

### Stored Procedures (all in `organizations` dataset, operate on per-org datasets)

**Cloud:**

| Procedure | Source | Output |
|-----------|--------|--------|
| `sp_cloud_gcp_convert_to_focus` | `cloud_gcp_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_aws_convert_to_focus` | `cloud_aws_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_azure_convert_to_focus` | `cloud_azure_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_oci_convert_to_focus` | `cloud_oci_billing_raw_daily` | `cost_data_standard_1_3` |

**GenAI (3-step consolidation):**

| Step | Procedure | Input | Output |
|------|-----------|-------|--------|
| 1 | `sp_genai_1_consolidate_usage_daily` | `genai_*_usage_raw` (all flows) | `genai_usage_daily_unified` |
| 2 | `sp_genai_2_consolidate_costs_daily` | `genai_*_costs_daily` (all flows) | `genai_costs_daily_unified` |
| 3 | `sp_genai_3_convert_to_focus` | `genai_costs_daily_unified` | `cost_data_standard_1_3` |

**Subscription (2-step):**

| Step | Procedure | Input | Output |
|------|-----------|-------|--------|
| 1 | `sp_subscription_2_calculate_daily_costs` | `subscription_plans` | `subscription_plan_costs_daily` |
| 2 | `sp_subscription_3_convert_to_focus` | `subscription_plan_costs_daily` | `cost_data_standard_1_3` |

---

## Cost Read Service (API Port 8000)

The cost read service uses Polars DataFrames for high-performance analytics with an LRU cache layer.

### Cache Configuration

| Setting | Value |
|---------|-------|
| Cache type | LRU (Least Recently Used) |
| Max entries | 100 |
| TTL | Until midnight in org timezone |
| Invalidation | Manual via endpoint or automatic at midnight |

### Cost Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/costs/{org}/summary` | Summary across all cost types |
| `GET /api/v1/costs/{org}/by-provider` | Costs grouped by provider |
| `GET /api/v1/costs/{org}/by-service` | Costs grouped by service |
| `GET /api/v1/costs/{org}/trend` | Cost trend over time |
| `GET /api/v1/costs/{org}/trend-granular` | Granular cost trend (daily/weekly/monthly) |
| `GET /api/v1/costs/{org}/subscriptions` | Subscription costs only |
| `GET /api/v1/costs/{org}/cloud` | Cloud costs only |
| `GET /api/v1/costs/{org}/genai` | GenAI costs only |
| `GET /api/v1/costs/{org}/total` | Total cost across all types |
| `GET /api/v1/costs/{org}/cache/stats` | Cache hit/miss statistics |
| `POST /api/v1/costs/{org}/cache/invalidate` | Force cache invalidation |

### Cost Metrics

| Metric | Description |
|--------|-------------|
| `total_daily_cost` | Sum of all costs for a single day |
| `total_monthly_cost` | Sum of all costs for a calendar month |
| `total_annual_cost` | Sum of all costs for a fiscal/calendar year |
| `ytd_cost` | Year-to-date cumulative cost |
| `mtd_cost` | Month-to-date cumulative cost |
| `forecast_monthly_cost` | Projected cost for current month (based on trend) |
| `forecast_annual_cost` | Projected cost for current year (based on trend) |

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
| `configs/cloud/{provider}/cost/billing.yml` | Cloud pipeline configs |
| `configs/genai/payg/{provider}.yml` | GenAI PAYG pipeline configs |
| `configs/genai/unified/consolidate.yml` | GenAI consolidation pipeline config |
| `configs/subscription/costs/subscription_cost.yml` | Subscription pipeline config |
| `configs/system/procedures/` | Stored procedures (FOCUS conversion) |
