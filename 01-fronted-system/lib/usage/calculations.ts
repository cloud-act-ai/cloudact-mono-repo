/**
 * Usage Calculations
 *
 * Centralized calculation functions for usage metrics.
 * Eliminates hardcoded calculations from dashboard pages.
 */

import type {
  GenAIUsageRecord,
  UsageSummary,
  TokenUsage,
  RequestMetrics,
  LatencyMetrics,
  UsageTrend,
} from "./types"

// ============================================
// Date Info (Cached)
// ============================================

export interface DateInfo {
  now: Date
  daysInMonth: number
  daysElapsed: number
  daysRemaining: number
  monthStart: Date
  monthEnd: Date
  yearStart: Date
  year: number
  month: number
}

let cachedDateInfo: DateInfo | null = null
let cachedDateInfoTimestamp: number = 0
const DATE_INFO_CACHE_TTL = 60000 // 1 minute

/**
 * Get cached date info for consistent calculations
 */
export function getDateInfo(): DateInfo {
  const now = Date.now()
  if (cachedDateInfo && now - cachedDateInfoTimestamp < DATE_INFO_CACHE_TTL) {
    return cachedDateInfo
  }

  const date = new Date()
  const year = date.getFullYear()
  const month = date.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysElapsed = Math.max(1, date.getDate())
  const daysRemaining = daysInMonth - daysElapsed

  cachedDateInfo = {
    now: date,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    monthStart: new Date(Date.UTC(year, month, 1)),
    monthEnd: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)),
    yearStart: new Date(Date.UTC(year, 0, 1)),
    year,
    month,
  }
  cachedDateInfoTimestamp = now

  return cachedDateInfo
}

/**
 * Check if a date is in the current month
 */
export function isInCurrentMonth(dateStr: string): boolean {
  const { year, month } = getDateInfo()
  const date = new Date(dateStr)
  return date.getFullYear() === year && date.getMonth() === month
}

// ============================================
// Token Calculations
// ============================================

/**
 * Calculate total tokens from input and output
 */
export function calculateTotalTokens(
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  return inputTokens + outputTokens + cachedTokens
}

/**
 * Calculate token usage summary
 */
export function calculateTokenUsage(
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): TokenUsage {
  return {
    input: inputTokens,
    output: outputTokens,
    cached: cachedTokens,
    total: inputTokens + outputTokens + cachedTokens,
  }
}

/**
 * Calculate tokens per request
 */
export function calculateTokensPerRequest(
  totalTokens: number,
  requestCount: number
): number {
  if (requestCount === 0) return 0
  return Math.round(totalTokens / requestCount)
}

/**
 * Calculate input/output token ratio
 */
export function calculateTokenRatio(
  inputTokens: number,
  outputTokens: number
): number {
  if (outputTokens === 0) return 0
  return inputTokens / outputTokens
}

/**
 * Calculate cached token percentage
 */
export function calculateCacheHitRate(
  cachedTokens: number,
  inputTokens: number
): number {
  if (inputTokens === 0) return 0
  return (cachedTokens / inputTokens) * 100
}

// ============================================
// Rate Calculations
// ============================================

/**
 * Calculate daily token rate from MTD usage
 */
export function calculateDailyTokenRate(
  mtdTokens: number,
  daysElapsed?: number
): number {
  const days = daysElapsed ?? getDateInfo().daysElapsed
  if (days === 0) return 0
  return mtdTokens / days
}

/**
 * Calculate monthly token forecast
 */
export function calculateMonthlyTokenForecast(
  dailyRate: number,
  daysInMonth?: number
): number {
  const days = daysInMonth ?? getDateInfo().daysInMonth
  return Math.round(dailyRate * days)
}

/**
 * Calculate annual token forecast
 */
export function calculateAnnualTokenForecast(monthlyForecast: number): number {
  return Math.round(monthlyForecast * 12)
}

/**
 * Calculate tokens per minute rate
 */
export function calculateTokensPerMinute(
  tokens: number,
  minutes: number
): number {
  if (minutes === 0) return 0
  return Math.round(tokens / minutes)
}

/**
 * Calculate tokens per second rate
 */
export function calculateTokensPerSecond(
  tokens: number,
  seconds: number
): number {
  if (seconds === 0) return 0
  return tokens / seconds
}

/**
 * Calculate all token forecasts from MTD usage
 */
export function calculateTokenForecasts(mtdTokens: number): {
  dailyRate: number
  monthlyForecast: number
  annualForecast: number
} {
  const dateInfo = getDateInfo()
  const dailyRate = calculateDailyTokenRate(mtdTokens, dateInfo.daysElapsed)
  const monthlyForecast = calculateMonthlyTokenForecast(dailyRate, dateInfo.daysInMonth)
  const annualForecast = calculateAnnualTokenForecast(monthlyForecast)

  return { dailyRate, monthlyForecast, annualForecast }
}

// ============================================
// Request Calculations
// ============================================

/**
 * Calculate request metrics
 */
export function calculateRequestMetrics(
  total: number,
  successful: number,
  failed: number,
  totalTokens: number
): RequestMetrics {
  const successRate = total > 0 ? (successful / total) * 100 : 0
  const avgTokensPerRequest = total > 0 ? Math.round(totalTokens / total) : 0

  return {
    total,
    successful,
    failed,
    successRate: Math.round(successRate * 100) / 100,
    avgTokensPerRequest,
  }
}

/**
 * Calculate success rate percentage
 */
export function calculateSuccessRate(
  successful: number,
  total: number
): number {
  if (total === 0) return 100
  return (successful / total) * 100
}

/**
 * Calculate failure rate percentage
 */
export function calculateFailureRate(failed: number, total: number): number {
  if (total === 0) return 0
  return (failed / total) * 100
}

/**
 * Calculate daily request rate
 */
export function calculateDailyRequestRate(
  mtdRequests: number,
  daysElapsed?: number
): number {
  const days = daysElapsed ?? getDateInfo().daysElapsed
  if (days === 0) return 0
  return Math.round(mtdRequests / days)
}

// ============================================
// Latency Calculations
// ============================================

/**
 * Calculate latency metrics from records
 */
export function calculateLatencyMetrics(
  records: GenAIUsageRecord[]
): LatencyMetrics {
  const withLatency = records.filter((r) => r.avg_latency_ms !== undefined)
  const withTtft = records.filter((r) => r.avg_ttft_ms !== undefined)

  const avgLatency =
    withLatency.length > 0
      ? withLatency.reduce((sum, r) => sum + (r.avg_latency_ms || 0), 0) /
        withLatency.length
      : 0

  const avgTtft =
    withTtft.length > 0
      ? withTtft.reduce((sum, r) => sum + (r.avg_ttft_ms || 0), 0) /
        withTtft.length
      : 0

  return {
    avgLatency: Math.round(avgLatency),
    avgTtft: Math.round(avgTtft),
  }
}

/**
 * Calculate average latency from array of values
 */
export function calculateAverageLatency(latencies: number[]): number {
  if (latencies.length === 0) return 0
  return latencies.reduce((sum, l) => sum + l, 0) / latencies.length
}

/**
 * Calculate latency percentile
 */
export function calculateLatencyPercentile(
  latencies: number[],
  percentile: number
): number {
  if (latencies.length === 0) return 0
  const sorted = [...latencies].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

// ============================================
// Cost Calculations
// ============================================

/**
 * Calculate cost per token
 */
export function calculateCostPerToken(
  totalCost: number,
  totalTokens: number
): number {
  if (totalTokens === 0) return 0
  return totalCost / totalTokens
}

/**
 * Calculate cost per 1M tokens
 */
export function calculateCostPer1MTokens(
  totalCost: number,
  totalTokens: number
): number {
  if (totalTokens === 0) return 0
  return (totalCost / totalTokens) * 1_000_000
}

/**
 * Calculate cost per request
 */
export function calculateCostPerRequest(
  totalCost: number,
  requestCount: number
): number {
  if (requestCount === 0) return 0
  return totalCost / requestCount
}

/**
 * Estimate token cost using pricing
 */
export function estimateTokenCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePer1M: number,
  outputPricePer1M: number,
  cachedTokens: number = 0,
  cachedPricePer1M: number = 0
): number {
  const inputCost = (inputTokens / 1_000_000) * inputPricePer1M
  const outputCost = (outputTokens / 1_000_000) * outputPricePer1M
  const cachedCost = (cachedTokens / 1_000_000) * cachedPricePer1M
  return inputCost + outputCost + cachedCost
}

// ============================================
// Summary Calculations
// ============================================

/**
 * Calculate usage summary from records
 */
export function calculateUsageSummary(
  records: GenAIUsageRecord[],
  currency: string = "USD"
): UsageSummary {
  if (records.length === 0) {
    return {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cached_tokens: 0,
      total_tokens: 0,
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      success_rate: 100,
      avg_latency_ms: 0,
      avg_ttft_ms: 0,
      rate_limit_hits: 0,
      total_cost: 0,
      currency,
      provider_count: 0,
      model_count: 0,
      date_range: { start: "", end: "" },
    }
  }

  const totals = records.reduce(
    (acc, r) => ({
      input_tokens: acc.input_tokens + (r.input_tokens || 0),
      output_tokens: acc.output_tokens + (r.output_tokens || 0),
      cached_tokens: acc.cached_tokens + (r.cached_tokens || 0),
      requests: acc.requests + (r.request_count || 0),
      successful: acc.successful + (r.successful_requests || r.request_count || 0),
      failed: acc.failed + (r.failed_requests || 0),
      latency_sum: acc.latency_sum + (r.avg_latency_ms || 0),
      latency_count: acc.latency_count + (r.avg_latency_ms ? 1 : 0),
      ttft_sum: acc.ttft_sum + (r.avg_ttft_ms || 0),
      ttft_count: acc.ttft_count + (r.avg_ttft_ms ? 1 : 0),
      rate_limit_hits: acc.rate_limit_hits + (r.rate_limit_hits || 0),
      cost: acc.cost + (r.total_cost || 0),
    }),
    {
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      requests: 0,
      successful: 0,
      failed: 0,
      latency_sum: 0,
      latency_count: 0,
      ttft_sum: 0,
      ttft_count: 0,
      rate_limit_hits: 0,
      cost: 0,
    }
  )

  const uniqueProviders = new Set(records.map((r) => r.provider))
  const uniqueModels = new Set(records.map((r) => r.model))
  const dates = records.map((r) => r.usage_date).sort()

  const totalTokens = totals.input_tokens + totals.output_tokens + totals.cached_tokens
  const successRate = totals.requests > 0
    ? (totals.successful / totals.requests) * 100
    : 100

  return {
    total_input_tokens: totals.input_tokens,
    total_output_tokens: totals.output_tokens,
    total_cached_tokens: totals.cached_tokens,
    total_tokens: totalTokens,
    total_requests: totals.requests,
    successful_requests: totals.successful,
    failed_requests: totals.failed,
    success_rate: Math.round(successRate * 100) / 100,
    avg_latency_ms: totals.latency_count > 0
      ? Math.round(totals.latency_sum / totals.latency_count)
      : 0,
    avg_ttft_ms: totals.ttft_count > 0
      ? Math.round(totals.ttft_sum / totals.ttft_count)
      : 0,
    rate_limit_hits: totals.rate_limit_hits,
    total_cost: Math.round(totals.cost * 100) / 100,
    currency,
    provider_count: uniqueProviders.size,
    model_count: uniqueModels.size,
    date_range: {
      start: dates[0] || "",
      end: dates[dates.length - 1] || "",
    },
  }
}

// ============================================
// Trend Calculations
// ============================================

/**
 * Calculate usage trend from records
 */
export function calculateUsageTrend(records: GenAIUsageRecord[]): UsageTrend {
  if (records.length < 2) {
    return {
      direction: "stable",
      dailyGrowthRate: 0,
      monthlyProjection: 0,
      annualProjection: 0,
      daysAnalyzed: records.length,
    }
  }

  // Group by date
  const byDate = new Map<string, number>()
  for (const r of records) {
    const current = byDate.get(r.usage_date) || 0
    byDate.set(r.usage_date, current + r.input_tokens + r.output_tokens)
  }

  const sortedDates = Array.from(byDate.keys()).sort()
  const dailyTokens = sortedDates.map((d) => byDate.get(d) || 0)

  // Calculate average daily change
  let totalChange = 0
  for (let i = 1; i < dailyTokens.length; i++) {
    if (dailyTokens[i - 1] > 0) {
      totalChange += (dailyTokens[i] - dailyTokens[i - 1]) / dailyTokens[i - 1]
    }
  }
  const avgDailyChange = totalChange / (dailyTokens.length - 1)

  // Determine direction
  let direction: "increasing" | "decreasing" | "stable"
  if (avgDailyChange > 0.02) {
    direction = "increasing"
  } else if (avgDailyChange < -0.02) {
    direction = "decreasing"
  } else {
    direction = "stable"
  }

  // Calculate projections
  const avgDaily = dailyTokens.reduce((a, b) => a + b, 0) / dailyTokens.length
  const dateInfo = getDateInfo()
  const monthlyProjection = Math.round(avgDaily * dateInfo.daysInMonth)
  const annualProjection = Math.round(monthlyProjection * 12)

  return {
    direction,
    dailyGrowthRate: Math.round(avgDailyChange * 10000) / 100, // as percentage
    monthlyProjection,
    annualProjection,
    daysAnalyzed: sortedDates.length,
  }
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(
  current: number,
  previous: number
): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0
  }
  return ((current - previous) / previous) * 100
}

/**
 * Calculate percentage of total
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 10000) / 100
}
