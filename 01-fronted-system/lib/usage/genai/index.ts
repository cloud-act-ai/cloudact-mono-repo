/**
 * GenAI Usage Module
 *
 * GenAI-specific exports for usage data handling.
 *
 * @example
 * ```typescript
 * import {
 *   transformGenAIProviderBreakdown,
 *   calculateGenAIUsageSummary,
 *   prepareGenAIDashboardData,
 * } from "@/lib/usage/genai"
 *
 * const dashboardData = prepareGenAIDashboardData(records, "USD")
 * ```
 */

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
  // Configs
  GENAI_PROVIDER_CONFIG,
  GENAI_MODEL_CONFIG,
} from "./transformers"
