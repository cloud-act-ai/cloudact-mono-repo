/**
 * Charts Library
 *
 * Unified Recharts-based component library for CloudAct.
 * All charts use org currency from CostDataContext.
 */

// ============================================
// Provider
// ============================================

export {
  ChartProvider,
  useChartConfig,
  getCategoryColor,
  getPaletteColor,
  getGradientId,
  type ChartTheme,
  type ChartContextValue,
} from "./provider/chart-provider"

// ============================================
// Base Charts
// ============================================

// Bar Chart
export {
  BaseBarChart,
  HorizontalBarChart,
  VerticalBarChart,
  type BarConfig,
  type BaseBarChartProps,
} from "./base/bar-chart"

// Line Chart
export {
  BaseLineChart,
  BaseAreaChart,
  type LineConfig,
  type BaseLineChartProps,
} from "./base/line-chart"

// Pie Chart
export {
  BasePieChart,
  BaseDonutChart,
  BaseRingChart,
  type PieDataItem,
  type BasePieChartProps,
} from "./base/pie-chart"

// Combo Chart
export {
  BaseComboChart,
  type SeriesConfig,
  type BarSeriesConfig,
  type LineSeriesConfig,
  type BaseComboChartProps,
} from "./base/combo-chart"

// Sparkline
export {
  SparklineChart,
  TrendSparkline,
  MiniBarSparkline,
  type SparklineChartProps,
} from "./base/sparkline"

// ============================================
// Cost-Specific Charts
// ============================================

// Trend Chart (with zoom)
export {
  CostTrendChart,
  MonthlyCostTrend,
  QuarterlyCostTrend,
  YearCostTrend,
  type CostTrendChartProps,
  type CostTrendDataPoint,
} from "./cost/trend-chart"

// Ring Chart (donut)
export {
  CostRingChart,
  CategoryRingChart,
  CompactCategoryRing,
  type CostRingChartProps,
  type RingSegment,
} from "./cost/ring-chart"

// Breakdown Chart (horizontal bars)
export {
  CostBreakdownChart,
  ProviderBreakdown,
  CategoryBreakdown,
  type CostBreakdownChartProps,
  type BreakdownItem,
} from "./cost/breakdown-chart"

// Daily Chart (vertical bars)
export {
  DailyCostChart,
  WeeklyCostChart,
  MonthlyCostChart,
  StackedDailyChart,
  type DailyCostChartProps,
  type DailyDataPoint,
} from "./cost/daily-chart"

// Daily Trend Chart (simple bar + line with smart time bucketing)
export {
  DailyTrendChart,
  type DailyTrendChartProps,
  type DailyTrendDataPoint,
  type ChartTimeRange,
  type AggregationType,
} from "./cost/daily-trend-chart"

// Metric Sparkline (score cards)
export {
  MetricSparkline,
  TotalSpendMetric,
  GenAISpendMetric,
  CloudSpendMetric,
  SubscriptionSpendMetric,
  MetricGrid,
  type MetricSparklineProps,
  type MetricGridProps,
} from "./cost/metric-sparkline"

// ============================================
// Shared Components
// ============================================

// Tooltip
export {
  ChartTooltip,
  SimpleTooltip,
  type ChartTooltipProps,
} from "./shared/tooltip"

// Legend
export {
  ChartLegend,
  CompactLegend,
  AnimatedLegend,
  type LegendItem,
  type ChartLegendProps,
} from "./shared/legend"

// Skeleton
export {
  ChartSkeleton,
  type ChartSkeletonProps,
} from "./shared/skeleton"

// Empty State
export {
  ChartEmptyState,
  type ChartEmptyStateProps,
} from "./shared/empty-state"

// Zoom Brush
export {
  ZoomBrush,
  RangeSlider,
  type ZoomBrushProps,
  type RangeSliderProps,
} from "./shared/zoom-brush"

// Data Table (TanStack Table)
export {
  DataTable,
  SortableHeader,
  ProgressCell,
  StatusBadgeCell,
  type DataTableProps,
  type ColumnDef,
} from "./shared/data-table"

// ============================================
// Cost Data Table
// ============================================

export {
  CostDataTable,
  ProviderCostTable,
  GenAIProviderTable,
  CloudProviderTable,
  SubscriptionCostTable,
  FocusCostDetailTable,
  type CostDataTableProps,
  type CostTableRow,
} from "./cost/data-table"
