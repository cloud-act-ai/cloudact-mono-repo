/**
 * Cost Dashboard Components
 *
 * Reusable components for cost dashboards with lib/costs integration.
 *
 * @example
 * ```tsx
 * import {
 *   CostBreakdownChart,
 *   CostDataTable,
 * } from "@/components/charts"
 * import {
 *   CostDashboardShell,
 *   CostSummaryGrid,
 * } from "@/components/costs"
 *
 * export default function CostDashboard() {
 *   return (
 *     <CostDashboardShell
 *       title="Cost Overview"
 *       icon={DollarSign}
 *       onRefresh={handleClearCache}
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
// DEPRECATED: Breakdown Chart
// Use @/components/charts CostBreakdownChart instead
// ============================================

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
// DEPRECATED: Data Table
// Use @/components/charts CostDataTable instead
// ============================================

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
  TimeRangeFilter,
  getRollingAverageWindow,
  getRollingAverageLabel,
  getTimeRangeLabel,
  DEFAULT_TIME_RANGE,
  TIME_RANGE_OPTIONS,
  type CostFiltersState,
  type CostFiltersProps,
  type HierarchyEntity,
  type TimeRangeFilterProps,
  type CategoryOption,
  type CustomDateRange,
} from "./cost-filters"

// ============================================
// DEPRECATED: Old Chart Components
// Use @/components/charts instead for:
// - CostScoreRing → CostRingChart
// - CostDailyBarChart → DailyCostChart
// - CostInsightsCard → MetricSparkline
// ============================================

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

// ============================================
// DEPRECATED: Combo Chart
// Use @/components/charts CostTrendChart instead
// ============================================
