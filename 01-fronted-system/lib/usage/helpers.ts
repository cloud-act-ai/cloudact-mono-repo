/**
 * Usage Helpers
 *
 * Transformation, aggregation, and filtering helpers for usage data.
 * Provides consistent data transformation for charts and tables.
 */

import type {
  GenAIUsageRecord,
  UsageBreakdown,
  UsageBreakdownItem,
  UsageTableRow,
  UsageTimeSeriesPoint,
  UsageFilterOptions,
  UsageProviderConfig,
} from "./types"
import {
  getDateInfo,
  isInCurrentMonth,
  calculateTokensPerRequest,
  calculateDailyTokenRate,
  calculateMonthlyTokenForecast,
  calculatePercentage,
  type DateInfo,
} from "./calculations"
import { formatLocalDate } from "@/lib/i18n/formatters"

// ============================================
// Filtering
// ============================================

/**
 * Filter usage records by date range
 */
export function filterByDateRange(
  records: GenAIUsageRecord[],
  startDate: Date,
  endDate: Date
): GenAIUsageRecord[] {
  const start = formatLocalDate(startDate)
  const end = formatLocalDate(endDate)

  return records.filter((r) => r.usage_date >= start && r.usage_date <= end)
}

/**
 * Filter usage records by providers
 */
export function filterByProviders(
  records: GenAIUsageRecord[],
  providers: string[]
): GenAIUsageRecord[] {
  const providerSet = new Set(providers.map((p) => p.toLowerCase()))
  return records.filter((r) => providerSet.has(r.provider.toLowerCase()))
}

/**
 * Filter usage records by models
 */
export function filterByModels(
  records: GenAIUsageRecord[],
  models: string[]
): GenAIUsageRecord[] {
  const modelSet = new Set(models.map((m) => m.toLowerCase()))
  return records.filter((r) => modelSet.has(r.model.toLowerCase()))
}

/**
 * Filter usage records by minimum token count
 */
export function filterByMinTokens(
  records: GenAIUsageRecord[],
  minTokens: number
): GenAIUsageRecord[] {
  return records.filter(
    (r) => r.input_tokens + r.output_tokens >= minTokens
  )
}

/**
 * Filter to only successful requests
 */
export function filterSuccessfulOnly(
  records: GenAIUsageRecord[]
): GenAIUsageRecord[] {
  return records.filter(
    (r) => !r.failed_requests || r.failed_requests === 0
  )
}

/**
 * Apply multiple filters
 */
export function applyUsageFilters(
  records: GenAIUsageRecord[],
  options: UsageFilterOptions
): GenAIUsageRecord[] {
  let filtered = [...records]

  if (options.dateRange) {
    filtered = filterByDateRange(
      filtered,
      options.dateRange.start,
      options.dateRange.end
    )
  }

  if (options.providers && options.providers.length > 0) {
    filtered = filterByProviders(filtered, options.providers)
  }

  if (options.models && options.models.length > 0) {
    filtered = filterByModels(filtered, options.models)
  }

  if (options.minTokens !== undefined) {
    filtered = filterByMinTokens(filtered, options.minTokens)
  }

  if (options.successfulOnly) {
    filtered = filterSuccessfulOnly(filtered)
  }

  return filtered
}

/**
 * Filter records to current month only
 */
export function filterCurrentMonth(
  records: GenAIUsageRecord[]
): GenAIUsageRecord[] {
  return records.filter((r) => isInCurrentMonth(r.usage_date))
}

// ============================================
// Aggregation
// ============================================

/**
 * Aggregate usage by provider
 */
export function aggregateByProvider(
  records: GenAIUsageRecord[]
): UsageBreakdown[] {
  const byProvider = new Map<
    string,
    {
      input_tokens: number
      output_tokens: number
      requests: number
      cost: number
    }
  >()

  for (const r of records) {
    const key = r.provider.toLowerCase()
    const current = byProvider.get(key) || {
      input_tokens: 0,
      output_tokens: 0,
      requests: 0,
      cost: 0,
    }

    byProvider.set(key, {
      input_tokens: current.input_tokens + (r.input_tokens || 0),
      output_tokens: current.output_tokens + (r.output_tokens || 0),
      requests: current.requests + (r.request_count || 0),
      cost: current.cost + (r.total_cost || 0),
    })
  }

  const total = Array.from(byProvider.values()).reduce(
    (sum, v) => sum + v.input_tokens + v.output_tokens,
    0
  )

  return Array.from(byProvider.entries())
    .map(([key, data]) => {
      const totalTokens = data.input_tokens + data.output_tokens
      return {
        key,
        name: key,
        total_tokens: totalTokens,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        request_count: data.requests,
        percentage: calculatePercentage(totalTokens, total),
        cost: data.cost,
      }
    })
    .sort((a, b) => b.total_tokens - a.total_tokens)
}

/**
 * Aggregate usage by model
 */
export function aggregateByModel(
  records: GenAIUsageRecord[]
): UsageBreakdown[] {
  const byModel = new Map<
    string,
    {
      provider: string
      input_tokens: number
      output_tokens: number
      requests: number
      cost: number
    }
  >()

  for (const r of records) {
    const key = r.model.toLowerCase()
    const current = byModel.get(key) || {
      provider: r.provider,
      input_tokens: 0,
      output_tokens: 0,
      requests: 0,
      cost: 0,
    }

    byModel.set(key, {
      provider: current.provider || r.provider,
      input_tokens: current.input_tokens + (r.input_tokens || 0),
      output_tokens: current.output_tokens + (r.output_tokens || 0),
      requests: current.requests + (r.request_count || 0),
      cost: current.cost + (r.total_cost || 0),
    })
  }

  const total = Array.from(byModel.values()).reduce(
    (sum, v) => sum + v.input_tokens + v.output_tokens,
    0
  )

  return Array.from(byModel.entries())
    .map(([key, data]) => {
      const totalTokens = data.input_tokens + data.output_tokens
      return {
        key,
        name: key,
        total_tokens: totalTokens,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        request_count: data.requests,
        percentage: calculatePercentage(totalTokens, total),
        cost: data.cost,
      }
    })
    .sort((a, b) => b.total_tokens - a.total_tokens)
}

/**
 * Aggregate usage by date
 */
export function aggregateByDate(
  records: GenAIUsageRecord[]
): UsageTimeSeriesPoint[] {
  const byDate = new Map<
    string,
    {
      input_tokens: number
      output_tokens: number
      requests: number
      cost: number
      byProvider: Map<string, number>
      byModel: Map<string, number>
    }
  >()

  for (const r of records) {
    const key = r.usage_date
    const current = byDate.get(key) || {
      input_tokens: 0,
      output_tokens: 0,
      requests: 0,
      cost: 0,
      byProvider: new Map<string, number>(),
      byModel: new Map<string, number>(),
    }

    const tokens = (r.input_tokens || 0) + (r.output_tokens || 0)

    // Update provider breakdown
    const providerKey = r.provider.toLowerCase()
    current.byProvider.set(
      providerKey,
      (current.byProvider.get(providerKey) || 0) + tokens
    )

    // Update model breakdown
    const modelKey = r.model.toLowerCase()
    current.byModel.set(
      modelKey,
      (current.byModel.get(modelKey) || 0) + tokens
    )

    byDate.set(key, {
      input_tokens: current.input_tokens + (r.input_tokens || 0),
      output_tokens: current.output_tokens + (r.output_tokens || 0),
      requests: current.requests + (r.request_count || 0),
      cost: current.cost + (r.total_cost || 0),
      byProvider: current.byProvider,
      byModel: current.byModel,
    })
  }

  return Array.from(byDate.entries())
    .map(([date, data]) => ({
      date,
      tokens: data.input_tokens + data.output_tokens,
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      requests: data.requests,
      cost: data.cost,
      byProvider: Object.fromEntries(data.byProvider),
      byModel: Object.fromEntries(data.byModel),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================
// Entity Name & Color Helpers
// ============================================

/**
 * Get display name for entity
 */
export function getEntityName(
  key: string,
  config: UsageProviderConfig
): string {
  const normalized = key.toLowerCase()
  return config.names[normalized] || key
}

/**
 * Get color for entity
 */
export function getEntityColor(
  key: string,
  config: UsageProviderConfig
): string {
  const normalized = key.toLowerCase()
  return config.colors[normalized] || config.defaultColor
}

// ============================================
// Breakdown Item Transformations
// ============================================

/**
 * Transform aggregated usage to breakdown items for charts
 */
export function transformToBreakdownItems(
  breakdowns: UsageBreakdown[],
  config: UsageProviderConfig,
  maxItems: number = 10
): UsageBreakdownItem[] {
  return breakdowns.slice(0, maxItems).map((b) => ({
    key: b.key,
    name: getEntityName(b.key, config),
    value: b.total_tokens,
    percentage: b.percentage,
    count: b.request_count,
    color: getEntityColor(b.key, config),
  }))
}

/**
 * Transform provider breakdown to breakdown items
 */
export function transformProvidersToBreakdownItems(
  records: GenAIUsageRecord[],
  config: UsageProviderConfig,
  maxItems: number = 10
): UsageBreakdownItem[] {
  const aggregated = aggregateByProvider(records)
  return transformToBreakdownItems(aggregated, config, maxItems)
}

/**
 * Transform model breakdown to breakdown items
 */
export function transformModelsToBreakdownItems(
  records: GenAIUsageRecord[],
  config: UsageProviderConfig,
  maxItems: number = 10
): UsageBreakdownItem[] {
  const aggregated = aggregateByModel(records)
  return transformToBreakdownItems(aggregated, config, maxItems)
}

// ============================================
// Table Row Transformations
// ============================================

/**
 * Calculate a single table row from breakdown data
 */
export function calculateTableRow(
  breakdown: UsageBreakdown,
  dateInfo: DateInfo,
  config: UsageProviderConfig
): UsageTableRow {
  const dailyRate = calculateDailyTokenRate(
    breakdown.total_tokens,
    dateInfo.daysElapsed
  )
  const monthlyForecast = calculateMonthlyTokenForecast(
    dailyRate,
    dateInfo.daysInMonth
  )
  const avgTokensPerRequest = calculateTokensPerRequest(
    breakdown.total_tokens,
    breakdown.request_count
  )

  return {
    id: breakdown.key,
    name: getEntityName(breakdown.key, config),
    type: config.defaultType || "Usage",
    inputTokens: breakdown.input_tokens,
    outputTokens: breakdown.output_tokens,
    totalTokens: breakdown.total_tokens,
    requests: breakdown.request_count,
    avgTokensPerRequest,
    dailyRate: Math.round(dailyRate),
    monthlyForecast: Math.round(monthlyForecast),
    percentage: breakdown.percentage,
    color: getEntityColor(breakdown.key, config),
  }
}

/**
 * Transform breakdowns to table rows
 */
export function transformToTableRows(
  breakdowns: UsageBreakdown[],
  config: UsageProviderConfig,
  maxRows: number = 20
): UsageTableRow[] {
  const dateInfo = getDateInfo()
  return breakdowns
    .slice(0, maxRows)
    .map((b) => calculateTableRow(b, dateInfo, config))
}

/**
 * Transform provider breakdown to table rows
 */
export function transformProvidersToTableRows(
  records: GenAIUsageRecord[],
  config: UsageProviderConfig,
  maxRows: number = 20
): UsageTableRow[] {
  const aggregated = aggregateByProvider(records)
  return transformToTableRows(aggregated, config, maxRows)
}

/**
 * Transform model breakdown to table rows
 */
export function transformModelsToTableRows(
  records: GenAIUsageRecord[],
  config: UsageProviderConfig,
  maxRows: number = 20
): UsageTableRow[] {
  const aggregated = aggregateByModel(records)
  return transformToTableRows(aggregated, config, maxRows)
}

// ============================================
// Unique Value Extractors
// ============================================

/**
 * Get unique providers from records
 */
export function getUniqueProviders(records: GenAIUsageRecord[]): string[] {
  return Array.from(new Set(records.map((r) => r.provider.toLowerCase())))
}

/**
 * Get unique models from records
 */
export function getUniqueModels(records: GenAIUsageRecord[]): string[] {
  return Array.from(new Set(records.map((r) => r.model.toLowerCase())))
}

/**
 * Get date range from records
 */
export function getDateRangeFromRecords(
  records: GenAIUsageRecord[]
): { start: string; end: string } | null {
  if (records.length === 0) return null

  const dates = records.map((r) => r.usage_date).sort()
  return {
    start: dates[0],
    end: dates[dates.length - 1],
  }
}

// ============================================
// Summing Helpers
// ============================================

/**
 * Sum total tokens from records
 */
export function sumTokens(records: GenAIUsageRecord[]): number {
  return records.reduce(
    (sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0),
    0
  )
}

/**
 * Sum input tokens from records
 */
export function sumInputTokens(records: GenAIUsageRecord[]): number {
  return records.reduce((sum, r) => sum + (r.input_tokens || 0), 0)
}

/**
 * Sum output tokens from records
 */
export function sumOutputTokens(records: GenAIUsageRecord[]): number {
  return records.reduce((sum, r) => sum + (r.output_tokens || 0), 0)
}

/**
 * Sum requests from records
 */
export function sumRequests(records: GenAIUsageRecord[]): number {
  return records.reduce((sum, r) => sum + (r.request_count || 0), 0)
}

/**
 * Sum cost from records
 */
export function sumCost(records: GenAIUsageRecord[]): number {
  return records.reduce((sum, r) => sum + (r.total_cost || 0), 0)
}
