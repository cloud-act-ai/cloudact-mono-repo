---
name: charts
description: |
  CloudAct Recharts component library. Base charts, cost-specific charts, presets, chart provider context.
  Use when: adding charts to pages, creating new chart components, migrating old charts, configuring chart themes,
  working with CostTrendChart, CostRingChart, MetricGrid, sparklines, or any data visualization.
---

# Charts - Recharts Component Library

Unified chart library for CloudAct cost dashboards. Built on Recharts with ChartProvider context for currency, theme, and time range sync.

## Trigger

Use when: adding charts, creating chart components, migrating old charts, configuring themes, working with cost visualizations.

```
/charts                          # Full chart library guide
/charts list                     # List all available components
/charts component <name>         # Show component API
/charts migrate <page>           # Migrate page to new charts
/charts example <type>           # Show example usage
```

## Key Locations

| File | Purpose |
|------|---------|
| `01-fronted-system/components/charts/index.ts` | Barrel exports (189 lines) |
| `01-fronted-system/components/charts/provider/chart-provider.tsx` | ChartProvider context |
| `01-fronted-system/components/charts/base/*.tsx` | Reusable bar, line, pie, combo, sparkline |
| `01-fronted-system/components/charts/cost/*.tsx` | Pre-configured cost dashboard charts |
| `01-fronted-system/components/charts/shared/*.tsx` | Tooltip, legend, skeleton, empty-state, data-table |
| `01-fronted-system/lib/costs/design-tokens.ts` | Chart palettes, provider colors, helper functions |

---

## Chart Components

### Base Charts

| Component | Import | Description |
|-----------|--------|-------------|
| `BaseBarChart` | `@/components/charts` | Horizontal/vertical/stacked bars |
| `BaseLineChart` | `@/components/charts` | Line with area fill option |
| `BasePieChart` | `@/components/charts` | Pie/donut/ring chart |
| `BaseComboChart` | `@/components/charts` | Bar + line with zoom/brush |
| `SparklineChart` | `@/components/charts` | Mini chart for metric cards |

### Cost-Specific Charts

| Component | Import | Description |
|-----------|--------|-------------|
| `CostTrendChart` | `@/components/charts` | Daily spend with rolling average line |
| `CostRingChart` | `@/components/charts` | Donut/ring category breakdown |
| `CostBreakdownChart` | `@/components/charts` | Horizontal bar breakdown by provider |
| `DailyCostChart` | `@/components/charts` | Daily cost bar chart |
| `DailyTrendChart` | `@/components/charts` | Executive daily trend with comparison |
| `MetricSparkline` | `@/components/charts` | Score cards with sparklines |
| `MetricGrid` | `@/components/charts` | 4-card metric layout |
| `CostDataTable` | `@/components/charts` | Cost data table with sorting/filtering |

### Shared Components

| Component | Import | Description |
|-----------|--------|-------------|
| `ChartTooltip` | `@/components/charts` | Styled tooltip for all charts |
| `ChartLegend` | `@/components/charts` | Legend with compact variant |
| `ChartSkeleton` | `@/components/charts` | Loading placeholder |
| `ChartEmptyState` | `@/components/charts` | No data message |
| `DataTable` | `@/components/charts` | Generic TanStack Table wrapper |

### Presets (Ready-to-use)

| Preset | Base Component | Configuration |
|--------|----------------|---------------|
| `MonthlyCostTrend` | CostTrendChart | 30-day trend with 7-day avg |
| `QuarterlyCostTrend` | CostTrendChart | 90-day trend with 14-day avg |
| `YearCostTrend` | CostTrendChart | 365-day trend with 30-day avg |
| `CategoryRingChart` | CostRingChart | GenAI/Cloud/Subscription donut |
| `CompactCategoryRing` | CostRingChart | Small donut for dashboard |
| `ProviderBreakdown` | CostBreakdownChart | Top providers horizontal bars |
| `CategoryBreakdown` | CostBreakdownChart | Category comparison bars |
| `WeeklyCostChart` | DailyCostChart | 7-day daily bars |
| `MonthlyCostChart` | DailyCostChart | 30-day daily bars |
| `StackedDailyChart` | DailyCostChart | Daily bars stacked by category |

---

## Import Pattern

```tsx
import {
  // Provider
  ChartProvider,
  useChartConfig,

  // Cost charts
  CostTrendChart,
  CostRingChart,
  CostBreakdownChart,
  DailyTrendChart,
  CostDataTable,
  MetricGrid,

  // Presets
  MonthlyCostTrend,
  CategoryRingChart,
  ProviderBreakdown,
} from "@/components/charts"

// Color helpers from design tokens
import {
  getProviderColor,
  getCategoryColor,
  getChartColors,
} from "@/lib/costs/design-tokens"
```

---

## Component APIs

### CostTrendChart

```tsx
<CostTrendChart
  title="Monthly Cost Trend"
  subtitle="Daily spend with 7-day rolling average"
  category="genai" | "cloud" | "subscription"  // Optional filter
  timeRange="30" | "90" | "365" | "mtd" | "ytd" | "custom"
  showBars={true}           // Daily cost bars
  showLine={true}           // Rolling average line
  budgetLine={10000}        // Reference line
  enableZoom={true}         // Brush for zoom (syncs with global filter)
  height={320}
  loading={false}
/>
```

### CostRingChart

```tsx
<CostRingChart
  title="Cost Breakdown"
  useCategories={true}      // Auto-load GenAI/Cloud/Subscription
  segments={[               // Or manual segments
    { key: "genai", name: "GenAI", value: 1000, color: "#10A37F" },
    { key: "cloud", name: "Cloud", value: 2000, color: "#4285F4" },
  ]}
  centerValue="$3,000"
  centerLabel="Total"
  size={160}
  thickness={16}
  showBreakdown={true}      // Legend list below
  showChevron={true}        // Clickable indicator
  onClick={() => {}}
  onSegmentClick={(segment) => {}}
/>
```

### CostBreakdownChart

```tsx
<CostBreakdownChart
  title="Top Providers"
  useProviders={true}       // Auto-load from context
  category="genai"          // Filter to category
  items={[                  // Or manual items
    { key: "openai", name: "OpenAI", value: 5000, count: 3 },
    { key: "aws", name: "AWS", value: 3000, count: 5 },
  ]}
  maxItems={5}              // Show top N + "Others"
  showOthers={true}
  countLabel="services"
  onItemClick={(item) => {}}
/>
```

### MetricSparkline

```tsx
<MetricSparkline
  title="Total Spend"
  category="total" | "genai" | "cloud" | "subscription"
  timeRange="30"
  showChange={true}         // Percentage change indicator
  invertTrend={true}        // Lower is better (costs)
  sparklineHeight={32}
  compact={false}
  onClick={() => {}}
/>
```

### MetricGrid

```tsx
<MetricGrid
  showAll={true}            // All 4 categories
  timeRange="30"
  compact={false}
  metrics={[                // Or custom metrics
    { title: "API Costs", category: "genai", invertTrend: true },
    { title: "Infrastructure", category: "cloud", invertTrend: true },
  ]}
/>
```

### SparklineChart

```tsx
<SparklineChart
  data={[100, 120, 115, 140, 135, 160, 180]}
  color="mint" | "coral" | "gray"
  width={80}
  height={24}
/>
```

---

## Context Integration

Charts automatically use currency, theme, and time range from context.

```tsx
// Wrap app/layout with providers
<ChartProvider>
  <CostDataProvider orgSlug={orgSlug}>
    {children}
  </CostDataProvider>
</ChartProvider>

// Access config in custom components
const { currency, theme, timeRange, setTimeRange, formatValue } = useChartConfig()
```

---

## Color System

Colors are defined in `lib/costs/design-tokens.ts` (439 lines).

### Theme Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Primary (Mint) | `#90FCA6` | Primary bars, positive trends |
| Secondary (Blue) | `#4285F4` | Cloud category, lines |
| Accent (Coral) | `#FF6C5E` | Subscription category, warnings |
| GenAI | `#10A37F` | GenAI category |
| Grid | `#E2E8F0` | Chart grid lines |
| Text | `#1E293B` | Primary text |
| Muted | `#64748B` | Secondary text, labels |

### Color Helpers

```tsx
import {
  getProviderColor,        // Get color for any provider (openai, aws, etc.)
  getCategoryColor,        // Get color for category (genai, cloud, subscription)
  getChartColors,          // Get palette for chart type
  GENAI_PROVIDER_COLORS,   // 12 GenAI provider colors
  CLOUD_PROVIDER_COLORS,   // 6 cloud provider colors
  SAAS_PROVIDER_COLORS,    // 20+ SaaS provider colors
  DEFAULT_CHART_PALETTE,   // Default chart color sequence
  GENAI_CHART_PALETTE,     // GenAI-specific palette
  CLOUD_CHART_PALETTE,     // Cloud-specific palette
} from "@/lib/costs/design-tokens"
```

---

## Chart Patterns

### Standard Chart Card

```tsx
<div className="bg-white rounded-2xl p-5 border border-gray-100">
  <div className="flex items-center justify-between mb-4">
    <h3 className="console-card-title text-gray-900">{title}</h3>
    <TimeRangeFilter />
  </div>
  <ResponsiveContainer width="100%" height={300}>
    {/* Chart content */}
  </ResponsiveContainer>
</div>
```

### Custom Tooltip

```tsx
<Tooltip
  content={({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-lg font-semibold text-gray-900">
          {formatCurrency(payload[0].value, currency)}
        </p>
      </div>
    );
  }}
/>
```

### Chart Gradient

```tsx
<defs>
  <linearGradient id="mintGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%" stopColor="#90FCA6" stopOpacity={0.3} />
    <stop offset="95%" stopColor="#90FCA6" stopOpacity={0} />
  </linearGradient>
</defs>
<Area fill="url(#mintGradient)" />
```

---

## Migration Guide

### Replace CostScoreRing

```tsx
// Before
<CostScoreRing segments={...} centerValue={...} />

// After
<CostRingChart
  title="Cost Breakdown"
  segments={segments}
  centerValue={centerValue}
  showBreakdown={true}
/>
```

### Replace CostComboChart

```tsx
// Before
<CostComboChart data={...} showBudgetLine={...} />

// After
<CostTrendChart
  title="Cost Trend"
  timeRange="30"
  budgetLine={budget}
  enableZoom={true}
/>
```

### Replace Progress Bars

```tsx
// Before
{providers.map(p => (
  <div>
    <span>{p.name}</span>
    <Progress value={p.percentage} />
  </div>
))}

// After
<CostBreakdownChart
  title="Top Providers"
  items={providers.map(p => ({ key: p.id, name: p.name, value: p.cost }))}
  maxItems={5}
/>
```

---

## Files Reference

```
01-fronted-system/components/charts/
├── provider/
│   └── chart-provider.tsx          # ChartProvider, useChartConfig
├── base/
│   ├── bar-chart.tsx               # BaseBarChart, HorizontalBarChart
│   ├── line-chart.tsx              # BaseLineChart, BaseAreaChart
│   ├── pie-chart.tsx               # BasePieChart, BaseDonutChart
│   ├── combo-chart.tsx             # BaseComboChart (with zoom)
│   └── sparkline.tsx               # SparklineChart, TrendSparkline
├── cost/
│   ├── trend-chart.tsx             # CostTrendChart + presets
│   ├── ring-chart.tsx              # CostRingChart + presets
│   ├── breakdown-chart.tsx         # CostBreakdownChart + presets
│   ├── daily-chart.tsx             # DailyCostChart + presets
│   ├── daily-trend-chart.tsx       # DailyTrendChart (executive dashboard)
│   ├── data-table.tsx              # CostDataTable (cost-specific)
│   └── metric-sparkline.tsx        # MetricSparkline, MetricGrid
├── shared/
│   ├── tooltip.tsx                 # ChartTooltip
│   ├── legend.tsx                  # ChartLegend, CompactLegend
│   ├── skeleton.tsx                # ChartSkeleton
│   ├── empty-state.tsx             # ChartEmptyState
│   └── data-table.tsx              # DataTable (generic TanStack wrapper)
└── index.ts                        # Barrel exports
```

---

## Common Issues

| Issue | Fix |
|-------|-----|
| Chart not responsive | Wrap in `<ResponsiveContainer width="100%" height={H}>` |
| Currency not formatting | Ensure `ChartProvider` wraps component tree |
| Zoom not syncing | Use `enableZoom={true}` and `timeRange` from context |
| Colors mismatched | Import from `@/lib/costs/design-tokens` |
| Empty chart no message | Use `ChartEmptyState` from shared |
| Tooltip cut off | Add `wrapperStyle={{ zIndex: 1000 }}` to Tooltip |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `design` | Brand color palette and chart colors defined here |
| `console-ui` | Dashboard layouts that use these chart components |
| `cost-analytics` | Data context that feeds chart components |
| `frontend-dev` | Next.js patterns for integrating charts in pages |
