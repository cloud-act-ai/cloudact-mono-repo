# BigQuery Ops - Requirements

## Overview

Cost data architecture spanning all three cost types (Cloud, GenAI, SaaS Subscription) unified into a single FOCUS 1.3 compliant table (`cost_data_standard_1_3`). Covers the data flow from raw ingestion through stored procedure transformation to the API read layer powered by Polars with LRU caching.

## Source Specification

`COST_DATA_ARCHITECTURE.md` (v2.2, 2026-02-08)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Bootstrap (Cloud Run Job)                                              │
│  Creates: organizations dataset (30 meta tables)                        │
│  Stored procedures, pricing tables, system config                       │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BigQuery: organizations (system dataset)                               │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 30 meta tables (org_subscriptions, genai_payg_pricing, etc.)      │  │
│  │ Stored procedures (sp_cloud_*, sp_genai_*, sp_subscription_*)     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │ Onboarding (POST /organizations/onboard)
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BigQuery: {org_slug}_prod (per-org dataset, 30+ tables)                │
│                                                                         │
│  Raw Tables (Pipeline writes, x_* fields):                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ cloud_gcp_billing_raw_daily    cloud_aws_billing_raw_daily        │  │
│  │ cloud_azure_billing_raw_daily  cloud_oci_billing_raw_daily        │  │
│  │ genai_payg_usage_raw           genai_commitment_usage_raw         │  │
│  │ genai_infrastructure_usage_raw genai_payg_costs_daily             │  │
│  │ genai_commitment_costs_daily   genai_infrastructure_costs_daily   │  │
│  │ subscription_plans             subscription_plan_costs_daily      │  │
│  └───────────────────────────────┬───────────────────────────────────┘  │
│                                   │ Stored Procedures                    │
│                                   ▼ (from organizations dataset)         │
│  Unified Tables:                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ genai_usage_daily_unified      (Step 1 consolidation)             │  │
│  │ genai_costs_daily_unified      (Step 2 consolidation)             │  │
│  │ cost_data_standard_1_3         (FOCUS 1.3 - all cost types)       │  │
│  │ x_org_hierarchy                (hierarchy read replica)           │  │
│  └───────────────────────────────┬───────────────────────────────────┘  │
│                                   │                                      │
│  Materialized Views:              │ (auto-refresh)                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ mv_cost_summary, mv_cost_by_provider, mv_cost_trend, etc.        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────────────┐
│  API Service (8000)                                                     │
│  Polars engine reads from BQ tables + materialized views                │
│  LRU cache (100 entries, TTL midnight org TZ)                           │
│  /costs/{org}/* endpoints                                               │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────────────┐
│  Pipeline Service (8001)                                                │
│  Writes with x_* lineage fields (x_org_slug, x_pipeline_id, x_run_id) │
│  Idempotent MERGE on composite key                                      │
│  Triggers stored procedures after data writes                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Boundaries:**
- **API Service (8000):** Reads only. No x_* fields. Uses Polars for high-performance analytics.
- **Pipeline Service (8001):** Writes only. All rows carry x_* lineage fields. Triggers stored procedures.
- **Bootstrap:** Creates `organizations` dataset. Onboarding creates per-org `{org_slug}_prod` datasets.
- **Schema updates:** `bootstrap-sync` adds new columns to existing meta tables; `org-sync-all` propagates to all org datasets.

---

## Functional Requirements

### FR-01: Unified FOCUS 1.3 Table (`cost_data_standard_1_3`)

All cost types converge into a single table with FOCUS 1.3 compliance plus CloudAct extensions:

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

### FR-02: Cloud Cost Conversion (4 Providers)

| Procedure | Source | Output |
|-----------|--------|--------|
| `sp_cloud_gcp_convert_to_focus` | `cloud_gcp_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_aws_convert_to_focus` | `cloud_aws_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_azure_convert_to_focus` | `cloud_azure_billing_raw_daily` | `cost_data_standard_1_3` |
| `sp_cloud_oci_convert_to_focus` | `cloud_oci_billing_raw_daily` | `cost_data_standard_1_3` |

### FR-03: GenAI Cost Conversion (3-Step Consolidation)

| Step | Procedure | Input | Output |
|------|-----------|-------|--------|
| 1 | `sp_genai_1_consolidate_usage_daily` | `genai_*_usage_raw` (all flows) | `genai_usage_daily_unified` |
| 2 | `sp_genai_2_consolidate_costs_daily` | `genai_*_costs_daily` (all flows) | `genai_costs_daily_unified` |
| 3 | `sp_genai_3_convert_to_focus` | `genai_costs_daily_unified` | `cost_data_standard_1_3` |

### FR-04: Subscription Cost Conversion (2-Step)

| Step | Procedure | Input | Output |
|------|-----------|-------|--------|
| 1 | `sp_subscription_2_calculate_daily_costs` | `subscription_plans` | `subscription_plan_costs_daily` |
| 2 | `sp_subscription_3_convert_to_focus` | `subscription_plan_costs_daily` | `cost_data_standard_1_3` |

### FR-05: Hierarchy Model (5-Field)

| Field | Description |
|-------|-------------|
| `x_hierarchy_entity_id` | Entity identifier (e.g., `DEPT-001`, `PROJ-042`) |
| `x_hierarchy_entity_name` | Human-readable entity name |
| `x_hierarchy_level_code` | Level: `DEPT`, `PROJ`, `TEAM` |
| `x_hierarchy_path` | Full path of IDs (`/ORG/DEPT-001/PROJ-042`) |
| `x_hierarchy_path_names` | Full path of names (`/Acme/Engineering/Backend`) |

### FR-06: Cost Read Service (API Port 8000)

Polars DataFrames for high-performance analytics with LRU cache:

**Cost Endpoints:**

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

### FR-07: Cost Metrics

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

## Non-Functional Requirements

### NFR-01: Cache Configuration

| Setting | Value |
|---------|-------|
| Cache type | LRU (Least Recently Used) |
| Max entries | 100 |
| TTL | Until midnight in org timezone |
| Invalidation | Manual via endpoint or automatic at midnight |

### NFR-02: Stored Procedure Location

- All stored procedures reside in the `organizations` dataset
- Procedures operate on per-org datasets (`{org_slug}_prod`)

### NFR-03: Data Flow Architecture

```
Cloud Billing Export --+
GenAI Usage APIs ------+---> Raw Tables ---> Stored Procedures ---> cost_data_standard_1_3
SaaS Manual Entry -----+                                                   |
                                                                           v
Frontend (3000) <-- Server Actions <-- API Service (8000) <-- Polars + Cache
```

---

## SDLC

### Development Workflow

1. **Schema change** -- Edit JSON schema file in `02-api-service/configs/setup/organizations/onboarding/schemas/`
2. **Update stored procedure** (if needed) -- Edit SQL in `03-data-pipeline-service/configs/system/procedures/`
3. **Run bootstrap-sync** -- `./run-job.sh {env} bootstrap-sync` to add new columns to `organizations` meta tables
4. **Run org-sync-all** -- `./run-job.sh {env} org-sync-all` to propagate schema changes to all `{org_slug}_prod` datasets
5. **Verify in BigQuery** -- Check table schemas, run test queries
6. **Deploy services** -- Push to `main` (stage) or tag `v*` (prod)

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| Schema validation | pytest | JSON schema files parse correctly, required fields present |
| Bootstrap | pytest + BigQuery | 30 meta tables created, stored procedures deployed |
| Onboarding | pytest + BigQuery | Per-org dataset created with 30+ tables, correct schema |
| Stored procedures | pytest + BigQuery | FOCUS conversion output, consolidation correctness |
| Polars read layer | pytest | Query results match expected aggregations, cache behavior |
| Idempotency | pytest | Pipeline re-run produces no duplicates (MERGE composite key) |
| Integration | BigQuery queries | Cross-table joins, materialized view refresh, partition pruning |

### Deployment / CI/CD Integration

- **Stage:** Automatic on `git push origin main` via `cloudbuild-stage.yaml`
- **Production:** Triggered by `git tag v*` via `cloudbuild-prod.yaml`
- **Schema migration order:** (1) Deploy API Service, (2) `bootstrap-sync`, (3) `org-sync-all`, (4) Deploy Pipeline Service, (5) Deploy Frontend
- **Rollback:** Schema changes are additive (new columns only). No destructive DDL. Old columns remain.

### Release Cycle Position

BigQuery ops is the foundation layer. Schema changes here affect all downstream services (Pipeline writes, API reads, Frontend display). Always deploy schema changes and run sync jobs before deploying services that depend on new fields. The `bootstrap-sync` and `org-sync-all` jobs are idempotent and safe to re-run.

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
