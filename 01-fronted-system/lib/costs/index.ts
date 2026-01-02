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
// NOTE: Comparisons and Summary functions removed
// Backend handles all cost calculations via /api/v1/costs/*
// Frontend only does UI transformation (colors, names, table rows)
// ============================================

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
  type PeriodDateRange,
  type ExtendedPeriodMetrics,
  type DailyTrendDataPoint,
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
  // Provider filtering & categorization
  CLOUD_PROVIDER_SET,
  GENAI_PROVIDER_SET,
  detectProviderCategory,
  isCloudProvider,
  isGenAIProvider,
  filterCloudProviders,
  filterGenAIProviders,
  filterSubscriptionProviders,
  // Safe value extraction
  getSafeValue,
  calculatePercentage,
  // Config objects
  GENAI_PROVIDER_CONFIG,
  CLOUD_PROVIDER_CONFIG,
  SAAS_PROVIDER_CONFIG,
  CATEGORY_CONFIG,
  OVERVIEW_CATEGORY_CONFIG,
  // Extended period date calculations
  getYesterdayRange,
  getWTDRange,
  getLastWeekRange,
  getMTDRange,
  getPreviousMonthRange,
  getLast2MonthsRange,
  getYTDRange,
  getFiscalYearRange,
  getFYTDRange,
  calculateFiscalYearForecast,
  // 30-day period calculations
  getLast30DaysRange,
  getPrevious30DaysRange,
  getSpecificMonthRange,
  getNovemberRange,
  getDecemberRange,
  // Daily trend data generation
  generateDailyTrendData,
} from "./dashboard-calculators"
