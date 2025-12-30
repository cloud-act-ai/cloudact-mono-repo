/**
 * Cost Helpers Library
 *
 * Client-side utilities for filtering, comparing, and summarizing cost data.
 * Fetch data once, filter many times for fast chart interactions.
 *
 * @example
 * ```typescript
 * import {
 *   dateRanges,
 *   filterByDateRange,
 *   calculateSummary,
 *   monthOverMonth,
 *   formatCost,
 * } from "@/lib/costs"
 *
 * // Fetch wide range once
 * const { data } = await getCosts(orgSlug, dateRanges.last12Months())
 *
 * // Filter client-side (instant, no API call)
 * const mtdCosts = filterByDateRange(data, dateRanges.mtd())
 * const summary = calculateSummary(data, dateRanges.thisMonth())
 * const comparison = monthOverMonth(data)
 *
 * // Format for display
 * const formatted = formatCost(summary.total, "USD")
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  DateRange,
  PeriodComparison,
  CostSummary,
  GroupedCostData,
  TimeSeriesPoint,
  CostFilterOptions,
  FiscalYearConfig,
} from "./types"

export { DEFAULT_FISCAL_YEAR_CONFIG } from "./types"

// Re-export API types for convenience
export type {
  CostRecord,
  ProviderBreakdown,
  ServiceBreakdown,
  CostTrendPoint,
  CostDataResponse,
  TotalCostSummary,
} from "@/actions/costs"

// ============================================
// Date Ranges
// ============================================

export {
  dateRanges,
  getDaysInRange,
  getDaysRemainingInMonth,
  getDaysRemainingInYear,
  getDaysInCurrentMonth,
  isDateInRange,
  toApiParams,
  getPreviousPeriod,
} from "./date-ranges"

// ============================================
// Filters
// ============================================

export {
  // Core filters
  filterByDateRange,
  filterByProvider,
  filterByCategory,
  filterByMinAmount,
  filterByMaxAmount,
  applyFilters,
  // Aggregations
  sumCosts,
  // Grouping
  groupByDay,
  groupByWeek,
  groupByMonth,
  groupByProvider,
  groupByCategory,
  groupByService,
  // Chart transformations
  toGroupedArray,
  toTimeSeries,
  toTimeSeriesWithProviders,
  // Utilities
  getUniqueProviders,
  getUniqueCategories,
  getUniqueServices,
  getDateRangeFromRecords,
} from "./filters"

// ============================================
// Comparisons
// ============================================

export {
  // Core comparison
  comparePeriods,
  // Pre-built comparisons
  monthOverMonth,
  weekOverWeek,
  quarterOverQuarter,
  yearOverYear,
  mtdComparison,
  ytdComparison,
  last7DaysComparison,
  last30DaysComparison,
  compareWithPreviousPeriod,
  // Provider/category comparisons
  compareProviderCosts,
  compareCategoryCosts,
  // Trend analysis
  calculateGrowthRate,
  analyzeTrend,
} from "./comparisons"

// ============================================
// Summary
// ============================================

export {
  // Main summary
  calculateSummary,
  calculateQuickSummary,
  // Run rates
  calculateDailyRate,
  calculateMonthlyRunRate,
  calculateAnnualRunRate,
  // Forecasts
  forecastMonthEnd,
  forecastYearEnd,
  forecastPeriod,
  // Statistics
  calculateAverageDailyCost,
  calculateMedianDailyCost,
  findHighestCostDay,
  findLowestCostDay,
  calculatePercentiles,
} from "./summary"

// ============================================
// Formatters
// ============================================

export {
  // Cost formatting
  formatCost,
  formatCostCompact,
  formatCostWithSign,
  formatCostRange,
  // Percentage formatting
  formatPercent,
  formatPercentChange,
  // Trend formatting
  getTrendArrow,
  getTrendColorClass,
  getTrendBgClass,
  formatTrend,
  // Number formatting
  formatNumber,
  formatRecordCount,
  // Date formatting
  formatDate,
  formatDateRange,
  formatMonthYear,
  // Comparison formatting
  formatComparison,
  // Summary formatting
  formatRunRate,
  formatForecast,
} from "./formatters"

// ============================================
// Dashboard Calculators
// ============================================

export {
  // Types
  type DateInfo,
  type ProviderData,
  type CategoryData,
  type EntityConfig,
  type RawSubscriptionRecord,
  // Date utilities
  getDateInfo,
  isInCurrentMonth,
  // Rate & Forecast calculations
  calculateDailyRateFromMTD,
  calculateMonthlyForecast,
  calculateAnnualForecast,
  calculateForecasts,
  // Entity name & color
  getEntityName,
  getEntityColor,
  // Table row transformation
  calculateProviderTableRow,
  calculateCategoryTableRow,
  // Breakdown item transformation
  calculateProviderBreakdownItem,
  calculateCategoryBreakdownItem,
  // Batch transformations
  transformProvidersToTableRows,
  transformCategoriesToTableRows,
  transformProvidersToBreakdownItems,
  transformCategoriesToBreakdownItems,
  // Provider filtering
  CLOUD_PROVIDER_SET,
  GENAI_PROVIDER_SET,
  filterCloudProviders,
  filterGenAIProviders,
  // Aggregation
  aggregateByCategory,
  aggregateByProvider,
  // Safe value extraction
  getSafeValue,
  calculatePercentage,
  // Config objects
  GENAI_PROVIDER_CONFIG,
  CLOUD_PROVIDER_CONFIG,
  CATEGORY_CONFIG,
  OVERVIEW_CATEGORY_CONFIG,
} from "./dashboard-calculators"
