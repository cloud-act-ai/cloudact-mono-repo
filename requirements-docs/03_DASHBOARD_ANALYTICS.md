# Dashboard & Analytics

**Status**: IMPLEMENTED (v1.5) | **Updated**: 2025-12-04 | **Single Source of Truth**

> Dashboard layout, analytics charts, metrics display, and data visualization
> NOT specific cost calculations (see 02_CLOUD_COSTS.md, 02_LLM_API_USAGE_COSTS.md)
> NOT pipeline execution (see 03_PIPELINES.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{metric}` | Metric type | `cost`, `usage`, `trend` |
| `{period}` | Time period | `7d`, `30d`, `90d`, `1y` |

---

## TERMINOLOGY

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Dashboard** | Main analytics view | Cost overview | React page |
| **Chart** | Data visualization | Line chart, bar chart | Recharts component |
| **Metric** | Calculated value | Total monthly cost | Derived |
| **Summary Card** | Key stat display | $1,234 MTD | Component |
| **Trend** | Change over time | +15% vs last month | Calculated |

---

## Where Data Lives

| Storage | Source | What |
|---------|--------|------|
| BigQuery | `gcp_billing_costs` | GCP cost data |
| BigQuery | `gcp_billing_summary` | Aggregated GCP costs |
| BigQuery | `saas_subscription_plans` | SaaS subscription costs |
| BigQuery | `llm_usage_daily` | LLM usage (future) |
| API Service | Aggregation queries | Real-time calculations |

---

## Dashboard Pages

| Route | Purpose | Data Source |
|-------|---------|-------------|
| `/{org}/dashboard` | Main overview | All sources |
| `/{org}/analytics` | Detailed analytics | All sources |
| `/{org}/analytics/gcp` | GCP cost breakdown | gcp_billing_costs |
| `/{org}/analytics/llm` | LLM usage analytics | llm_usage_daily |
| `/{org}/subscriptions` | SaaS cost overview | saas_subscription_plans |

---

## Architecture Flow

### Dashboard Data Flow

```
+-----------------------------------------------------------------------------+
|                         DASHBOARD DATA FLOW                                  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  Frontend (3000)                                                            |
|  +-- Dashboard Page                                                         |
|      +-- SummaryCards component                                             |
|      +-- CostTrendChart component                                           |
|      +-- ServiceBreakdownChart component                                    |
|      +-- RecentPipelinesTable component                                     |
|                                                                             |
|  Data Fetching                                                              |
|  +-- Server Actions (getDashboardData)                                      |
|      +-- Calls Pipeline Service (8001)                                      |
|      +-- X-API-Key authentication                                           |
|                                                                             |
|  Pipeline Service                                                           |
|  +-- GET /api/v1/analytics/{org}/summary                                   |
|  +-- GET /api/v1/analytics/{org}/costs?period=30d                          |
|  +-- GET /api/v1/analytics/{org}/pipelines/recent                          |
|      +-- Queries BigQuery                                                   |
|      +-- Aggregates and returns                                             |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Chart Component Architecture

```
+-----------------------------------------------------------------------------+
|                      CHART COMPONENT ARCHITECTURE                            |
+-----------------------------------------------------------------------------+
|                                                                             |
|  Base Components (Recharts)                                                 |
|  +-- LineChart: Time series, trends                                        |
|  +-- BarChart: Category comparisons                                        |
|  +-- PieChart: Distribution breakdown                                      |
|  +-- AreaChart: Cumulative values                                          |
|                                                                             |
|  Custom Wrappers                                                            |
|  +-- CostTrendChart                                                         |
|      +-- Props: data, period, showProjection                               |
|      +-- Features: Tooltip, legend, responsive                             |
|                                                                             |
|  +-- ServiceBreakdownChart                                                  |
|      +-- Props: data, limit, showOther                                     |
|      +-- Features: Click to drill-down                                     |
|                                                                             |
|  +-- ProviderComparisonChart                                                |
|      +-- Props: data, providers                                            |
|      +-- Features: Stacked bars, percentage                                |
|                                                                             |
|  Theme Integration                                                          |
|  +-- Uses Tailwind CSS variables                                           |
|  +-- Dark mode support                                                     |
|  +-- Consistent color palette                                              |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Data Flow

```
Frontend (3000)              Pipeline Service (8001)              BigQuery
     |                              |                              |
     |                              |                              |
     |  1. Load Dashboard           |                              |
     |  getDashboardData()          |                              |
     |----------------------------->|                              |
     |                              |  Aggregate queries           |
     |                              |----------------------------->|
     |                              |                              |
     |                              |  - Total costs MTD           |
     |                              |  - Cost by service           |
     |                              |  - Daily trend               |
     |                              |  - Recent pipelines          |
     |                              |                              |
     |                              |<-----------------------------|
     |<-----------------------------|  Return aggregated data      |
     |                              |                              |
     |  2. Render Charts            |                              |
     |  +-- SummaryCards            |                              |
     |  +-- CostTrendChart          |                              |
     |  +-- ServiceBreakdown        |                              |
     |                              |                              |
     |  3. User Interaction         |                              |
     |  (change period, filter)     |                              |
     |----------------------------->|                              |
     |                              |  Re-query with params        |
     |                              |----------------------------->|
     |                              |<-----------------------------|
     |<-----------------------------|                              |

Data Sources:
- gcp_billing_costs: GCP cost line items
- gcp_billing_summary: Pre-aggregated costs
- saas_subscription_plans: SaaS subscription data
- pipeline_runs: Recent pipeline executions
```

---

## Component Definitions

### Summary Cards

```
+-----------------------------------------------------------------------------+
|                           SUMMARY CARDS                                      |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +------------------+  +------------------+  +------------------+           |
|  | Total Cost MTD   |  | vs Last Month    |  | Active Services  |           |
|  | $12,345.67       |  | +15.2%           |  | 24               |           |
|  | [dollar icon]    |  | [arrow up]       |  | [grid icon]      |           |
|  +------------------+  +------------------+  +------------------+           |
|                                                                             |
|  +------------------+  +------------------+  +------------------+           |
|  | Projected Month  |  | Daily Average    |  | Last Pipeline    |           |
|  | $18,500.00       |  | $398.25          |  | 2 hours ago      |           |
|  | [calendar icon]  |  | [chart icon]     |  | [play icon]      |           |
|  +------------------+  +------------------+  +------------------+           |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Cost Trend Chart

```
+-----------------------------------------------------------------------------+
|                         COST TREND CHART                                     |
+-----------------------------------------------------------------------------+
|  Cost Over Time                                   [7d] [30d] [90d] [1y]     |
|                                                                             |
|  $500 |                                                    ___              |
|       |                                               ___/   \              |
|  $400 |                                          ___/         \___          |
|       |                                     ___/                  \___      |
|  $300 |                                ___/                           \     |
|       |                           ___/                                 \    |
|  $200 |                      ___/                                       \   |
|       |                 ___/                                             \  |
|  $100 |            ___/                                                   \ |
|       |       ___/                                                         \|
|    $0 +---------------------------------------------------------------------+
|       Dec 1   Dec 5    Dec 10   Dec 15   Dec 20   Dec 25   Dec 30          |
|                                                                             |
|  Legend: --- GCP  --- LLM  --- SaaS  .... Projected                        |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Service Breakdown Chart

```
+-----------------------------------------------------------------------------+
|                      SERVICE BREAKDOWN                                       |
+-----------------------------------------------------------------------------+
|  Cost by Service (Last 30 days)                                             |
|                                                                             |
|  Compute Engine     ===================================== $4,500 (45%)      |
|  BigQuery           ====================== $2,200 (22%)                     |
|  Cloud Storage      ================ $1,500 (15%)                           |
|  Cloud Functions    ======== $800 (8%)                                      |
|  Pub/Sub            ===== $500 (5%)                                         |
|  Other              ==== $400 (4%)                                          |
|  ---------------                                                            |
|  Total: $10,000                                                             |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Frontend Implementation

### Server Actions

**File:** `fronted-system/actions/analytics.ts`

#### getDashboardData()

```typescript
async function getDashboardData(
  orgSlug: string,
  period?: string
): Promise<{
  success: boolean,
  data?: DashboardData,
  error?: string
}>
```

#### getCostTrend()

```typescript
async function getCostTrend(
  orgSlug: string,
  period: '7d' | '30d' | '90d' | '1y',
  providers?: string[]
): Promise<{
  success: boolean,
  trend?: CostTrendData[],
  error?: string
}>
```

#### getServiceBreakdown()

```typescript
async function getServiceBreakdown(
  orgSlug: string,
  period?: string,
  provider?: string
): Promise<{
  success: boolean,
  breakdown?: ServiceCost[],
  error?: string
}>
```

### TypeScript Interfaces

```typescript
export interface DashboardData {
  summary: DashboardSummary
  costTrend: CostTrendData[]
  serviceBreakdown: ServiceCost[]
  recentPipelines: PipelineRun[]
  alerts?: Alert[]
}

export interface DashboardSummary {
  total_cost_mtd: number
  total_cost_last_month: number
  cost_change_pct: number
  projected_monthly: number
  daily_average: number
  active_services: number
  active_integrations: number
  last_pipeline_at?: string
}

export interface CostTrendData {
  date: string
  gcp_cost?: number
  llm_cost?: number
  saas_cost?: number
  total_cost: number
}

export interface ServiceCost {
  service: string
  provider: string
  cost: number
  percentage: number
  change_pct?: number
}

export interface Alert {
  type: 'info' | 'warning' | 'error'
  title: string
  message: string
  action?: AlertAction
}
```

### Components

**File:** `fronted-system/components/analytics/`

| Component | Purpose | Props |
|-----------|---------|-------|
| `SummaryCards` | Key metrics display | `summary: DashboardSummary` |
| `CostTrendChart` | Time series chart | `data, period, showProjection` |
| `ServiceBreakdownChart` | Bar/pie chart | `data, limit, onDrillDown` |
| `ProviderComparisonChart` | Multi-provider view | `data, providers` |
| `PipelineStatusTable` | Recent runs | `runs, limit` |
| `AlertBanner` | Warning/info display | `alerts` |
| `PeriodSelector` | Time range picker | `value, onChange` |
| `ExportButton` | CSV/PDF export | `data, format` |

---

## Pipeline Engine Endpoints

**File:** `data-pipeline-service/src/app/routers/analytics.py`

### Analytics Endpoints

```
GET    /api/v1/analytics/{org}/summary
       -> Dashboard summary metrics
       -> Query: ?period=30d
       -> Returns: DashboardSummary

GET    /api/v1/analytics/{org}/costs
       -> Cost trend over time
       -> Query: ?period=30d&provider=gcp
       -> Returns: { trend: CostTrendData[] }

GET    /api/v1/analytics/{org}/breakdown
       -> Cost by service/category
       -> Query: ?period=30d&provider=gcp&limit=10
       -> Returns: { breakdown: ServiceCost[] }

GET    /api/v1/analytics/{org}/providers
       -> Cost by provider
       -> Query: ?period=30d
       -> Returns: { providers: ProviderCost[] }

GET    /api/v1/analytics/{org}/export
       -> Export analytics data
       -> Query: ?format=csv&period=30d
       -> Returns: CSV or PDF file
```

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| Dashboard page | Frontend | app/[orgSlug]/dashboard/page.tsx |
| Analytics page | Frontend | app/[orgSlug]/analytics/page.tsx |
| SummaryCards | Frontend | components/analytics/summary-cards.tsx |
| CostTrendChart | Frontend | components/analytics/cost-trend-chart.tsx |
| ServiceBreakdownChart | Frontend | components/analytics/service-breakdown.tsx |
| PeriodSelector | Frontend | components/analytics/period-selector.tsx |
| Analytics actions | Frontend | actions/analytics.ts |
| Analytics router | Pipeline | routers/analytics.py |
| Summary aggregation | Pipeline | services/analytics_service.py |

### NOT IMPLEMENTED

| Component | Notes | Priority |
|-----------|-------|----------|
| LLM usage charts | Pending usage extraction | P1 |
| Budget alerts | Threshold notifications | P2 |
| Custom dashboards | User-defined layouts | P3 |
| Scheduled reports | Email reports | P3 |
| Export to PDF | Currently CSV only | P3 |

---

## Chart Libraries

### Recharts (Primary)

Used for all charts with consistent styling:

```typescript
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie,
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'
```

### Chart Styling

```typescript
// Consistent color palette
const COLORS = {
  gcp: 'hsl(var(--chart-1))',      // Blue
  openai: 'hsl(var(--chart-2))',   // Green
  anthropic: 'hsl(var(--chart-3))', // Purple
  saas: 'hsl(var(--chart-4))',     // Orange
  projected: 'hsl(var(--muted))',  // Gray dashed
}

// Dark mode support via CSS variables
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No data | Show "No data available" message |
| API error | Show error banner, offer retry |
| Partial data | Render available, warn about missing |
| Loading | Show skeleton loaders |
| Stale data | Show timestamp, offer refresh |

---

## Test Files

| File | Purpose |
|------|---------|
| `fronted-system/tests/09-dashboard.test.ts` | Dashboard page tests |
| `fronted-system/tests/10-analytics-charts.test.ts` | Chart component tests |
| `data-pipeline-service/tests/test_07_analytics.py` | Analytics API tests |

---

## File References

### Frontend Files

| File | Purpose |
|------|---------|
| `fronted-system/app/[orgSlug]/dashboard/page.tsx` | Main dashboard |
| `fronted-system/app/[orgSlug]/analytics/page.tsx` | Analytics page |
| `fronted-system/app/[orgSlug]/analytics/gcp/page.tsx` | GCP analytics |
| `fronted-system/actions/analytics.ts` | Analytics server actions |
| `fronted-system/components/analytics/summary-cards.tsx` | Summary display |
| `fronted-system/components/analytics/cost-trend-chart.tsx` | Trend chart |
| `fronted-system/components/analytics/service-breakdown.tsx` | Breakdown chart |
| `fronted-system/components/analytics/period-selector.tsx` | Period picker |

### Pipeline Engine Files

| File | Purpose |
|------|---------|
| `data-pipeline-service/src/app/routers/analytics.py` | Analytics endpoints |
| `data-pipeline-service/src/services/analytics_service.py` | Aggregation logic |

---

**Version**: 1.5 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
