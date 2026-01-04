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
 *   FINOPS,
 *   getProviderColor,
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
 *
 * // Use FinOps standards
 * const dailyRate = totalCost / FINOPS.DAYS_PER_YEAR
 * const monthlyForecast = dailyRate * FINOPS.DAYS_PER_MONTH
 *
 * // Get provider colors
 * const color = getProviderColor("openai") // "#10A37F"
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
  // Core filters (CostRecord[])
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
  // Granular filters (GranularCostRow[] - for trend-granular endpoint)
  type GranularCostRow,
  type GranularFilterOptions,
  filterGranularByDateRange,
  filterGranularByProvider,
  filterGranularByCategory,
  filterGranularByDepartment,
  filterGranularByProject,
  filterGranularByTeam,
  applyGranularFilters,
  // Granular aggregations
  granularToTimeSeries,
  granularToProviderBreakdown,
  granularToCategoryBreakdown,
  granularTotalCost,
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

// ============================================
// FinOps Constants
// ============================================

export {
  // Constants
  FINOPS,
  TIME_RANGES,
  ROLLING_AVERAGE,
  // Validation helpers
  isValidNumber,
  safeNumber,
  // Rate calculations
  calculateDailyRate,
  calculateMonthlyForecast as calculateMonthlyForecastFromRate,
  calculateAnnualForecast as calculateAnnualForecastFromMonthly,
  calculateAnnualFromDaily,
  calculateAllForecasts,
  // YTD calculations
  calculateYTDForecast,
  getDaysElapsedInYear,
  // Time range helpers
  getDaysForTimeRange,
  getDaysBetween,
  getRollingAverageWindow,
  // Types
  type Forecasts,
} from "./constants"

// ============================================
// Design Tokens
// ============================================

export {
  // Provider color maps
  GENAI_PROVIDER_COLORS,
  CLOUD_PROVIDER_COLORS,
  SAAS_PROVIDER_COLORS,
  PROVIDER_COLORS,
  // Category colors
  CATEGORY_COLORS,
  // Chart palettes
  DEFAULT_CHART_PALETTE,
  GENAI_CHART_PALETTE,
  CLOUD_CHART_PALETTE,
  SUBSCRIPTION_CHART_PALETTE,
  OVERVIEW_CHART_PALETTE,
  CHART_PALETTES,
  // Default color
  DEFAULT_COLOR,
  // Color helpers
  getProviderColor,
  getCategoryColor,
  getChartColors,
  getChartColorAtIndex,
  assignRingChartColors,
  // Trend colors
  TREND_COLORS,
  getTrendColor,
  // Status colors
  STATUS_COLORS,
  // Types
  type ChartPaletteType,
} from "./design-tokens"
