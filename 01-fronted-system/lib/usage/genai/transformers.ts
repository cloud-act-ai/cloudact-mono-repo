/**
 * GenAI Usage Transformers
 *
 * GenAI-specific transformation functions for usage data.
 * Uses the centralized provider configurations.
 */

import type {
  GenAIUsageRecord,
  UsageBreakdownItem,
  UsageTableRow,
  UsageTimeSeriesPoint,
  UsageSummary,
} from "../types"
import {
  aggregateByProvider,
  aggregateByModel,
  aggregateByDate,
  transformToBreakdownItems,
  transformToTableRows,
  filterCurrentMonth,
  filterByProviders,
  sumTokens,
  sumRequests,
} from "../helpers"
import {
  calculateUsageSummary,
  calculateTokenForecasts,
  getDateInfo,
} from "../calculations"
import {
  GENAI_PROVIDER_CONFIG,
  GENAI_MODEL_CONFIG,
  GENAI_PROVIDER_COLORS,
  getProviderFromModel,
} from "../constants"

// ============================================
// Provider Transformations
// ============================================

/**
 * Transform GenAI usage records to provider breakdown items
 */
export function transformGenAIProviderBreakdown(
  records: GenAIUsageRecord[],
  maxItems: number = 10
): UsageBreakdownItem[] {
  const aggregated = aggregateByProvider(records)
  return transformToBreakdownItems(aggregated, GENAI_PROVIDER_CONFIG, maxItems)
}

/**
 * Transform GenAI usage records to provider table rows
 */
export function transformGenAIProviderTableRows(
  records: GenAIUsageRecord[],
  maxRows: number = 20
): UsageTableRow[] {
  const aggregated = aggregateByProvider(records)
  return transformToTableRows(aggregated, GENAI_PROVIDER_CONFIG, maxRows)
}

// ============================================
// Model Transformations
// ============================================

/**
 * Get model config with provider-inherited colors
 */
function getModelConfig() {
  // Build model colors from provider colors
  const modelColors: Record<string, string> = {}
  for (const [model, provider] of Object.entries(GENAI_MODEL_CONFIG.providers)) {
    modelColors[model] = GENAI_PROVIDER_COLORS[provider] || "#94a3b8"
  }

  return {
    names: GENAI_MODEL_CONFIG.names,
    colors: modelColors,
    defaultColor: "#94a3b8",
    defaultType: "Model",
  }
}

/**
 * Transform GenAI usage records to model breakdown items
 */
export function transformGenAIModelBreakdown(
  records: GenAIUsageRecord[],
  maxItems: number = 10
): UsageBreakdownItem[] {
  const aggregated = aggregateByModel(records)
  const modelConfig = getModelConfig()
  return transformToBreakdownItems(aggregated, modelConfig, maxItems)
}

/**
 * Transform GenAI usage records to model table rows
 */
export function transformGenAIModelTableRows(
  records: GenAIUsageRecord[],
  maxRows: number = 20
): UsageTableRow[] {
  const aggregated = aggregateByModel(records)
  const modelConfig = getModelConfig()
  return transformToTableRows(aggregated, modelConfig, maxRows)
}

// ============================================
// Time Series Transformations
// ============================================

/**
 * Transform GenAI usage records to time series for charts
 */
export function transformGenAITimeSeries(
  records: GenAIUsageRecord[]
): UsageTimeSeriesPoint[] {
  return aggregateByDate(records)
}

/**
 * Transform GenAI usage to daily token chart data
 */
export function transformGenAITokenTrend(
  records: GenAIUsageRecord[]
): Array<{ date: string; tokens: number; input: number; output: number }> {
  const timeSeries = aggregateByDate(records)
  return timeSeries.map((point) => ({
    date: point.date,
    tokens: point.tokens,
    input: point.inputTokens,
    output: point.outputTokens,
  }))
}

/**
 * Transform GenAI usage to daily request chart data
 */
export function transformGenAIRequestTrend(
  records: GenAIUsageRecord[]
): Array<{ date: string; requests: number }> {
  const timeSeries = aggregateByDate(records)
  return timeSeries.map((point) => ({
    date: point.date,
    requests: point.requests,
  }))
}

// ============================================
// Summary Transformations
// ============================================

/**
 * Calculate GenAI usage summary with forecasts
 */
export function calculateGenAIUsageSummary(
  records: GenAIUsageRecord[],
  currency: string = "USD"
): UsageSummary & {
  dailyTokenRate: number
  monthlyTokenForecast: number
  annualTokenForecast: number
} {
  const summary = calculateUsageSummary(records, currency)

  // Calculate MTD tokens for current month
  const currentMonthRecords = filterCurrentMonth(records)
  const mtdTokens = sumTokens(currentMonthRecords)

  // Calculate forecasts
  const forecasts = calculateTokenForecasts(mtdTokens)

  return {
    ...summary,
    dailyTokenRate: forecasts.dailyRate,
    monthlyTokenForecast: forecasts.monthlyForecast,
    annualTokenForecast: forecasts.annualForecast,
  }
}

/**
 * Get GenAI usage quick stats
 */
export function getGenAIQuickStats(records: GenAIUsageRecord[]): {
  totalTokens: number
  totalRequests: number
  providerCount: number
  modelCount: number
  topProvider: string | null
  topModel: string | null
} {
  const totalTokens = sumTokens(records)
  const totalRequests = sumRequests(records)
  const providers = new Set(records.map((r) => r.provider))
  const models = new Set(records.map((r) => r.model))

  // Find top provider
  const byProvider = aggregateByProvider(records)
  const topProvider = byProvider.length > 0 ? byProvider[0].key : null

  // Find top model
  const byModel = aggregateByModel(records)
  const topModel = byModel.length > 0 ? byModel[0].key : null

  return {
    totalTokens,
    totalRequests,
    providerCount: providers.size,
    modelCount: models.size,
    topProvider,
    topModel,
  }
}

// ============================================
// Provider-Specific Filters
// ============================================

/**
 * Get OpenAI usage records
 */
export function filterOpenAIUsage(
  records: GenAIUsageRecord[]
): GenAIUsageRecord[] {
  return filterByProviders(records, ["openai"])
}

/**
 * Get Anthropic usage records
 */
export function filterAnthropicUsage(
  records: GenAIUsageRecord[]
): GenAIUsageRecord[] {
  return filterByProviders(records, ["anthropic"])
}

/**
 * Get Google/Gemini usage records
 */
export function filterGeminiUsage(
  records: GenAIUsageRecord[]
): GenAIUsageRecord[] {
  return filterByProviders(records, ["gemini", "google"])
}

/**
 * Get DeepSeek usage records
 */
export function filterDeepSeekUsage(
  records: GenAIUsageRecord[]
): GenAIUsageRecord[] {
  return filterByProviders(records, ["deepseek"])
}

// ============================================
// Dashboard Data Preparation
// ============================================

/**
 * Prepare complete GenAI usage dashboard data
 */
export function prepareGenAIDashboardData(
  records: GenAIUsageRecord[],
  currency: string = "USD"
): {
  summary: UsageSummary & {
    dailyTokenRate: number
    monthlyTokenForecast: number
    annualTokenForecast: number
  }
  providerBreakdown: UsageBreakdownItem[]
  modelBreakdown: UsageBreakdownItem[]
  timeSeries: UsageTimeSeriesPoint[]
  providerTable: UsageTableRow[]
  modelTable: UsageTableRow[]
  quickStats: {
    totalTokens: number
    totalRequests: number
    providerCount: number
    modelCount: number
    topProvider: string | null
    topModel: string | null
  }
} {
  return {
    summary: calculateGenAIUsageSummary(records, currency),
    providerBreakdown: transformGenAIProviderBreakdown(records),
    modelBreakdown: transformGenAIModelBreakdown(records),
    timeSeries: transformGenAITimeSeries(records),
    providerTable: transformGenAIProviderTableRows(records),
    modelTable: transformGenAIModelTableRows(records),
    quickStats: getGenAIQuickStats(records),
  }
}

// ============================================
// Export helpers for specific provider configs
// ============================================

export { GENAI_PROVIDER_CONFIG, GENAI_MODEL_CONFIG }
