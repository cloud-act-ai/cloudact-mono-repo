/**
 * Usage Helpers Library
 *
 * Client-side utilities for filtering, aggregating, and displaying usage data.
 * Focused on GenAI (LLM) usage metrics: tokens, requests, latency.
 *
 * @example
 * ```typescript
 * import {
 *   calculateUsageSummary,
 *   transformGenAIProviderBreakdown,
 *   formatTokens,
 *   GENAI_PROVIDER_CONFIG,
 * } from "@/lib/usage"
 *
 * // Calculate summary from records
 * const summary = calculateUsageSummary(records, "USD")
 *
 * // Transform for charts
 * const breakdown = transformGenAIProviderBreakdown(records)
 *
 * // Format for display
 * const formatted = formatTokens(summary.total_tokens)
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  // Core usage types
  GenAIUsageRecord,
  UsageSummary,
  UsageBreakdown,
  TokenUsage,
  RequestMetrics,
  LatencyMetrics,
  // Chart & table types
  UsageBreakdownItem,
  UsageTableRow,
  UsageTimeSeriesPoint,
  // Filter & config types
  UsageFilterOptions,
  UsageProviderConfig,
  UsageModelConfig,
  // Comparison types
  UsageComparison,
  UsageTrend,
  // Response types
  UsageDataResponse,
  UsageBreakdownResponse,
} from "./types"

// ============================================
// Calculations
// ============================================

export {
  // Date info
  type DateInfo,
  getDateInfo,
  isInCurrentMonth,
  // Token calculations
  calculateTotalTokens,
  calculateTokenUsage,
  calculateTokensPerRequest,
  calculateTokenRatio,
  calculateCacheHitRate,
  // Rate calculations
  calculateDailyTokenRate,
  calculateMonthlyTokenForecast,
  calculateAnnualTokenForecast,
  calculateTokensPerMinute,
  calculateTokensPerSecond,
  calculateTokenForecasts,
  // Request calculations
  calculateRequestMetrics,
  calculateSuccessRate,
  calculateFailureRate,
  calculateDailyRequestRate,
  // Latency calculations
  calculateLatencyMetrics,
  calculateAverageLatency,
  calculateLatencyPercentile,
  // Cost calculations
  calculateCostPerToken,
  calculateCostPer1MTokens,
  calculateCostPerRequest,
  estimateTokenCost,
  // Summary calculations
  calculateUsageSummary,
  // Trend calculations
  calculateUsageTrend,
  calculatePercentageChange,
  calculatePercentage,
} from "./calculations"

// ============================================
// Helpers
// ============================================

export {
  // Filtering
  filterByDateRange,
  filterByProviders,
  filterByModels,
  filterByMinTokens,
  filterSuccessfulOnly,
  applyUsageFilters,
  filterCurrentMonth,
  // Aggregation
  aggregateByProvider,
  aggregateByModel,
  aggregateByDate,
  // Entity helpers
  getEntityName,
  getEntityColor,
  // Breakdown transformations
  transformToBreakdownItems,
  transformProvidersToBreakdownItems,
  transformModelsToBreakdownItems,
  // Table transformations
  calculateTableRow,
  transformToTableRows,
  transformProvidersToTableRows,
  transformModelsToTableRows,
  // Unique value extractors
  getUniqueProviders,
  getUniqueModels,
  getDateRangeFromRecords,
  // Summing helpers
  sumTokens,
  sumInputTokens,
  sumOutputTokens,
  sumRequests,
  sumCost,
} from "./helpers"

// ============================================
// Constants
// ============================================

export {
  // Provider configs
  GENAI_PROVIDER_NAMES,
  GENAI_PROVIDER_COLORS,
  GENAI_PROVIDER_CONFIG,
  // Model configs
  MODEL_NAMES,
  MODEL_PROVIDERS,
  MODEL_CONTEXT_WINDOWS,
  GENAI_MODEL_CONFIG,
  // Defaults
  DEFAULT_USAGE_CURRENCY,
  DEFAULT_CHART_COLORS,
  getColorByIndex,
  // Token thresholds
  TOKEN_THRESHOLDS,
  TOKEN_SUFFIXES,
  // Provider utilities
  GENAI_PROVIDER_SET,
  isGenAIProvider,
  getProviderFromModel,
} from "./constants"

// ============================================
// Formatters
// ============================================

export {
  // Token formatting
  formatTokens,
  formatTokensFull,
  formatTokensCompact,
  formatTokenBreakdown,
  // Request formatting
  formatRequests,
  formatRequestsWithLabel,
  formatSuccessRate,
  // Latency formatting
  formatLatency,
  formatLatencyWithLabel,
  formatTTFT,
  // Rate formatting
  formatTokensPerSecond,
  formatTokensPerMinute,
  formatTokensPerRequest,
  formatDailyRate,
  formatMonthlyForecast,
  // Percentage formatting
  formatPercent,
  formatPercentChange,
  getTrendArrow,
  getTrendColorClass,
  getTrendBgClass,
  // Cost formatting
  formatCostPer1M,
  formatCostPerToken,
  // Date formatting
  formatUsageDate,
  formatUsageDateRange,
  // Combined formatters
  formatUsageSummaryLine,
  formatTokenRate,
} from "./formatters"

// ============================================
// GenAI-Specific Exports
// ============================================

export {
  // Provider transformations
  transformGenAIProviderBreakdown,
  transformGenAIProviderTableRows,
  // Model transformations
  transformGenAIModelBreakdown,
  transformGenAIModelTableRows,
  // Time series
  transformGenAITimeSeries,
  transformGenAITokenTrend,
  transformGenAIRequestTrend,
  // Summary calculations
  calculateGenAIUsageSummary,
  getGenAIQuickStats,
  // Provider filters
  filterOpenAIUsage,
  filterAnthropicUsage,
  filterGeminiUsage,
  filterDeepSeekUsage,
  // Dashboard preparation
  prepareGenAIDashboardData,
} from "./genai"
