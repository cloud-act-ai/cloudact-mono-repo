# /chart - Unified Chart Components

**Purpose**: Work with the CloudAct Recharts component library for cost dashboards.

## Quick Reference

All chart components are in: `01-fronted-system/components/charts/`

| Component Type | Location | Description |
|----------------|----------|-------------|
| Provider | `provider/chart-provider.tsx` | Global context with currency, theme, time range |
| Base Charts | `base/*.tsx` | Reusable bar, line, pie, combo, sparkline |
| Cost Charts | `cost/*.tsx` | Pre-configured for cost dashboards |
| Shared | `shared/*.tsx` | Tooltip, legend, skeleton, empty-state, zoom |
| Exports | `index.ts` | Barrel exports |

## Usage

```
/chart list                          # List all available chart components
/chart component <name>              # Show component API and usage
/chart migrate <page>                # Migrate a page to new charts
/chart example <type>                # Show example usage
```

---

## Chart Components

### Base Charts

| Component | Import | Description |
|-----------|--------|-------------|
| `BaseBarChart` | `@/components/charts` | Horizontal/vertical/stacked bars |
| `BaseLineChart` | `@/components/charts` | Line with area fill option |
| `BasePieChart` | `@/components/charts` | Pie/donut/ring chart |
| `BaseComboChart` | `@/components/charts` | Bar + line with zoom/brush |
| `SparklineChart` | `@/components/charts` | Mini chart for cards |

### Cost-Specific Charts

| Component | Import | Replaces |
|-----------|--------|----------|
| `CostTrendChart` | `@/components/charts` | CostComboChart |
| `CostRingChart` | `@/components/charts` | CostScoreRing |
| `CostBreakdownChart` | `@/components/charts` | Horizontal progress bars |
| `DailyCostChart` | `@/components/charts` | CostDailyBarChart |
| `MetricSparkline` | `@/components/charts` | Score cards with sparklines |
| `MetricGrid` | `@/components/charts` | 4-card metric layout |

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
// Import from barrel export
import {
  // Provider
  ChartProvider,
  useChartConfig,

  // Cost charts
  CostTrendChart,
  CostRingChart,
  CostBreakdownChart,
  MetricGrid,

  // Presets
  MonthlyCostTrend,
  CategoryRingChart,
  ProviderBreakdown,
} from "@/components/charts"
```

---

## Component APIs

### CostTrendChart

```tsx
<CostTrendChart
  title="Monthly Cost Trend"
  subtitle="Daily spend with 7-day rolling average"
  category="genai" | "cloud" | "subscription"  // Optional: filter by category
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
  centerValue="$3,000"      // Center display
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

---

## Context Integration

Charts automatically use:
- **Currency** from `CostDataContext` (org currency)
- **Theme** from `ChartProvider` (CloudAct design system)
- **Time Range** synced via `setTimeRange` (zoom updates global filter)

```tsx
// Access chart config in components
const { currency, theme, timeRange, setTimeRange, formatValue } = useChartConfig()
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
  <div className="...">
    <span>{p.name}</span>
    <Progress value={p.percentage} />
    <span>{formatCost(p.value)}</span>
  </div>
))}

// After
<CostBreakdownChart
  title="Top Providers"
  items={providers.map(p => ({
    key: p.id,
    name: p.name,
    value: p.cost,
  }))}
  maxItems={5}
/>
```

---

## Theme Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Primary (Mint) | `#90FCA6` | Primary bars, positive trends |
| Secondary (Blue) | `#4285F4` | Cloud category, lines |
| Accent (Coral) | `#FF6C5E` | Subscription category, warnings |
| GenAI | `#10A37F` | GenAI category |
| Grid | `#E2E8F0` | Chart grid lines |
| Text | `#1E293B` | Primary text |
| Muted | `#64748B` | Secondary text, labels |

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
│   └── metric-sparkline.tsx        # MetricSparkline, MetricGrid
├── shared/
│   ├── tooltip.tsx                 # ChartTooltip
│   ├── legend.tsx                  # ChartLegend, CompactLegend
│   ├── skeleton.tsx                # ChartSkeleton
│   ├── empty-state.tsx             # ChartEmptyState
│   └── zoom-brush.tsx              # ZoomBrush, RangeSlider
└── index.ts                        # Barrel exports
```

---

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
- `$FRONTEND` = `01-fronted-system`
