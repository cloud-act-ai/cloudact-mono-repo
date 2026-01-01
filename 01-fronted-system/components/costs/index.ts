/**
 * Cost Dashboard Components
 *
 * Reusable components for cost dashboards with lib/costs integration.
 *
 * @example
 * ```tsx
 * import {
 *   CostDashboardShell,
 *   CostSummaryGrid,
 *   CostBreakdownChart,
 *   CostDataTable,
 * } from "@/components/costs"
 *
 * export default function CostDashboard() {
 *   return (
 *     <CostDashboardShell
 *       title="Cost Overview"
 *       icon={DollarSign}
 *       onRefresh={handleRefresh}
 *     >
 *       <CostSummaryGrid data={summaryData} comparison={comparison} />
 *       <CostBreakdownChart title="By Provider" items={providers} />
 *       <CostDataTable title="Details" rows={tableRows} />
 *     </CostDashboardShell>
 *   )
 * }
 * ```
 */

// ============================================
// Metric Cards
// ============================================

export {
  CostMetricCard,
  CostMetricGrid,
  MTDMetricCard,
  DailyRateMetricCard,
  ForecastMetricCard,
  YTDMetricCard,
  type CostMetricCardProps,
  type CostMetricGridProps,
  type PresetMetricCardProps,
} from "./cost-metric-card"

// ============================================
// Breakdown Charts
// ============================================

export {
  CostBreakdownChart,
  ProviderBreakdownChart,
  CategoryBreakdownChart,
  SubscriptionCategoryChart,
  type BreakdownItem,
  type CostBreakdownChartProps,
  type PresetBreakdownProps,
} from "./cost-breakdown-chart"

// ============================================
// Summary Grid
// ============================================

export {
  CostSummaryGrid,
  CostComparisonBanner,
  CostSummaryWithComparison,
  type CostSummaryData,
  type CostSummaryGridProps,
  type CostComparisonBannerProps,
  type CostSummaryWithComparisonProps,
} from "./cost-summary-grid"

// ============================================
// Data Table
// ============================================

export {
  CostDataTable,
  type CostTableRow,
  type CostDataTableProps,
  type SortField,
  type SortDirection,
} from "./cost-data-table"

// ============================================
// Dashboard Shell
// ============================================

export {
  CostDashboardShell,
  CostDashboardSection,
  CostDashboardGrid,
  type CostDashboardShellProps,
  type CostDashboardSectionProps,
  type CostDashboardGridProps,
} from "./cost-dashboard-shell"

// ============================================
// Date Range Filter
// ============================================

export {
  DateRangeFilter,
  getPresetRange,
  getDefaultDateRange,
  formatDateRangeDisplay,
  dateRangeToApiParams,
  type DateRange,
  type DateRangePreset,
  type DateRangeFilterProps,
} from "./date-range-filter"

// ============================================
// Cost Filters (Hierarchy, Provider, Category)
// ============================================

export {
  CostFilters,
  getDefaultFilters,
  type CostFiltersState,
  type CostFiltersProps,
  type HierarchyEntity,
} from "./cost-filters"

// ============================================
// Score Ring (Apple Health style)
// ============================================

export {
  CostScoreRing,
  CostCategoryRing,
  type ScoreRingSegment,
  type CostScoreRingProps,
  type CostCategoryRingProps,
} from "./cost-score-ring"

// ============================================
// Daily Bar Chart (Apple Health Activity style)
// ============================================

export {
  CostDailyBarChart,
  WeeklyCostChart,
  MonthlyTrendChart,
  type DailyBarData,
  type CostDailyBarChartProps,
  type WeeklyCostChartProps,
  type MonthlyTrendChartProps,
} from "./cost-daily-bar-chart"

// ============================================
// Insights Card (Apple Health Highlights style)
// ============================================

export {
  CostInsightsCard,
  SpendComparisonCard,
  PeriodComparisonCard,
  type TrendDataPoint,
  type CostInsightsCardProps,
  type SpendComparisonCardProps,
  type PeriodComparisonCardProps,
} from "./cost-insights-card"

// ============================================
// Period Selector (D/W/M/6M/Y)
// ============================================

export {
  CostPeriodSelector,
  CostPeriodSelectorWithDate,
  usePeriodSelector,
  getPeriodDates,
  formatPeriodLabel,
  type PeriodType,
  type PeriodOption,
  type DatePeriod,
  type CostPeriodSelectorProps,
  type CostPeriodSelectorWithDateProps,
  type UsePeriodSelectorResult,
} from "./cost-period-selector"

// ============================================
// Extended Period Metrics Grid
// ============================================

export {
  CostPeriodMetricsGrid,
  CostPeriodMetricsBar,
  type PeriodCostData,
  type CostPeriodMetricsGridProps,
  type CostPeriodMetricsBarProps,
} from "./cost-period-metrics-grid"
