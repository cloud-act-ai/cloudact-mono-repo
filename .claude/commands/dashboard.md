# /dashboard - Cost Dashboard Pages

**Purpose**: Work with CloudAct cost dashboard pages and their unified chart components.

## Quick Reference

All dashboard pages are in: `01-fronted-system/app/[orgSlug]/`

| Page | Path | Description |
|------|------|-------------|
| Main Dashboard | `dashboard/page.tsx` | Account summary with all categories |
| Cost Overview | `cost-dashboards/overview/page.tsx` | Detailed cost analytics |
| GenAI Costs | `cost-dashboards/genai-costs/page.tsx` | GenAI provider breakdown |
| Cloud Costs | `cost-dashboards/cloud-costs/page.tsx` | Cloud provider breakdown |
| Subscription Costs | `cost-dashboards/subscription-costs/page.tsx` | SaaS subscription breakdown |

## Usage

```
/dashboard list                      # List all dashboard pages
/dashboard page <name>               # Show page structure and components
/dashboard migrate <page>            # Migrate page to new charts
/dashboard verify                    # Verify all pages use unified charts
```

---

## Dashboard Page Structure

### Main Dashboard (`/[orgSlug]/dashboard`)

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ Welcome Message + Time Range Selector                            │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│ │ Total   │ │ GenAI   │ │ Cloud   │ │ SaaS    │  MetricGrid     │
│ │ Spend   │ │ Spend   │ │ Spend   │ │ Spend   │                 │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────┐ ┌────────────────────────────┐│
│ │                                │ │                            ││
│ │     CostTrendChart             │ │   CategoryRingChart        ││
│ │     (30-day with zoom)         │ │   (Donut breakdown)        ││
│ │                                │ │                            ││
│ └────────────────────────────────┘ └────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────┐ ┌────────────────────────────┐│
│ │   ProviderBreakdown            │ │   Quick Actions            ││
│ │   (Top 5 providers)            │ │   (Links to details)       ││
│ └────────────────────────────────┘ └────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**Components Used:**
- `MetricGrid` - 4-card score card row
- `CostTrendChart` - Time series with zoom
- `CategoryRingChart` - GenAI/Cloud/Subscription donut
- `ProviderBreakdown` - Top providers horizontal bars

### Cost Overview (`/[orgSlug]/cost-dashboards/overview`)

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ Cost Analytics Header + Time Range + Filters                     │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│ │ Total   │ │ GenAI   │ │ Cloud   │ │ SaaS    │  MetricGrid     │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────┐│
│ │                                                                ││
│ │          CostTrendChart (Full width, with zoom)                ││
│ │                                                                ││
│ └────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────┐ ┌────────────────────────────┐│
│ │   CategoryBreakdown            │ │   ProviderBreakdown        ││
│ │   (GenAI vs Cloud vs SaaS)     │ │   (All providers)          ││
│ └────────────────────────────────┘ └────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Category Pages (GenAI/Cloud/Subscription)

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ Category Header + Time Range + Filters                           │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│ │ Total   │ │ Daily   │ │ Monthly │ │ YoY     │  Category       │
│ │ Spend   │ │ Avg     │ │ Trend   │ │ Change  │  Metrics        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────┐│
│ │                                                                ││
│ │      CostTrendChart (category filtered, with zoom)             ││
│ │                                                                ││
│ └────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────┐│
│ │                                                                ││
│ │      ProviderBreakdown (category filtered)                     ││
│ │                                                                ││
│ └────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

---

## Shared UI Elements

### Time Range Selector

All pages use the same time range selector that syncs with chart zoom:

```tsx
import { TimeRangeSelect } from "@/components/costs"
import { useCostData } from "@/contexts/cost-data-context"

const { selectedTimeRange, setTimeRange } = useCostData()

<TimeRangeSelect
  value={selectedTimeRange}
  onChange={(range) => setTimeRange(range)}
/>
```

**Options:**
- `7` - Last 7 days
- `14` - Last 14 days
- `30` - Last 30 days (default)
- `90` - Last 90 days
- `365` - Last 365 days
- `mtd` - Month to date
- `qtd` - Quarter to date
- `ytd` - Year to date
- `custom` - Custom date range

### Filter Controls

```tsx
import { CostFilters } from "@/components/costs"

<CostFilters
  showCategories={true}     // GenAI/Cloud/Subscription
  showProviders={true}      // Provider dropdown
  showHierarchy={true}      // Dept/Project/Team
/>
```

---

## Data Flow

```
CostDataContext (org-level cache)
    │
    ├── totalCosts          → MetricGrid, summary cards
    ├── providerBreakdown   → ProviderBreakdown, CostBreakdownChart
    ├── dailyTrend          → CostTrendChart
    ├── categoryTrendData   → Category-specific trends
    │
    └── ChartProvider (currency, theme, time range)
            │
            └── All chart components
```

---

## Page Component Template

```tsx
"use client"

import { useCostData } from "@/contexts/cost-data-context"
import { useChartConfig } from "@/components/charts"
import {
  CostTrendChart,
  ProviderBreakdown,
  MetricGrid,
} from "@/components/charts"
import { TimeRangeSelect, PageHeader } from "@/components/costs"

export default function CostDashboardPage() {
  const { totalCosts, isLoading, selectedTimeRange, setTimeRange } = useCostData()
  const { formatValue } = useChartConfig()

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Cost Dashboard"
        subtitle="Monitor and analyze your spending"
      >
        <TimeRangeSelect
          value={selectedTimeRange}
          onChange={setTimeRange}
        />
      </PageHeader>

      {/* Metric Cards */}
      <MetricGrid timeRange={selectedTimeRange} />

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CostTrendChart
          title="Cost Trend"
          timeRange={selectedTimeRange}
          enableZoom={true}
          className="lg:col-span-2"
        />

        <ProviderBreakdown maxItems={5} />
      </div>
    </div>
  )
}
```

---

## Design Guidelines

### Container Width
- All dashboard pages use `max-w-7xl mx-auto`
- Consistent with Apple Health/Fitness+ pattern

### Spacing
- Page sections: `space-y-6`
- Card grids: `gap-4 sm:gap-6`
- Card padding: `p-4 sm:p-5`

### Grid Layouts
- Metric cards: `grid-cols-2 lg:grid-cols-4`
- Two-column: `lg:grid-cols-2`
- Full-width charts: `lg:col-span-2`

### Cards
- Background: `bg-white`
- Border radius: `rounded-xl sm:rounded-2xl`
- Shadow: `shadow-sm hover:shadow-md`
- Border: `border border-slate-100`

---

## Migration Checklist

For each dashboard page:

1. [ ] Remove old chart component imports
2. [ ] Import from `@/components/charts`
3. [ ] Replace `CostScoreRing` with `CostRingChart`
4. [ ] Replace `CostComboChart` with `CostTrendChart`
5. [ ] Replace progress bars with `CostBreakdownChart`
6. [ ] Replace score cards with `MetricSparkline` or `MetricGrid`
7. [ ] Add `timeRange` prop to charts
8. [ ] Enable `enableZoom` on trend charts
9. [ ] Remove manual currency formatting (handled by context)
10. [ ] Test zoom/brush syncs with time range selector

---

## Files Reference

```
01-fronted-system/app/[orgSlug]/
├── dashboard/
│   └── page.tsx                    # Main dashboard
├── cost-dashboards/
│   ├── overview/
│   │   └── page.tsx                # Cost overview
│   ├── genai-costs/
│   │   └── page.tsx                # GenAI costs
│   ├── cloud-costs/
│   │   └── page.tsx                # Cloud costs
│   └── subscription-costs/
│       └── page.tsx                # Subscription costs
```

---

## Context Reference

```
01-fronted-system/
├── contexts/
│   └── cost-data-context.tsx       # CostDataProvider, useCostData
├── components/
│   ├── charts/                     # Unified chart library
│   ├── costs/                      # Cost-specific components
│   └── org-providers.tsx           # Wraps CostDataProvider + ChartProvider
```

---

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
- `$FRONTEND` = `01-fronted-system`

## Debug Account (for testing dashboards)

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Org Slug | `acme_inc_01032026` |

**Test URLs:**
- Dashboard: `http://localhost:3000/acme_inc_01032026/dashboard`
- Cost Overview: `http://localhost:3000/acme_inc_01032026/cost-dashboards/overview`
- GenAI Costs: `http://localhost:3000/acme_inc_01032026/cost-dashboards/genai-costs`
- Cloud Costs: `http://localhost:3000/acme_inc_01032026/cost-dashboards/cloud-costs`

See `.claude/debug-config.md` for full debug configuration.
