/**
 * Usage Formatters
 *
 * Display formatting functions for usage metrics.
 * Consistent formatting for tokens, requests, latency, and percentages.
 */

import { TOKEN_THRESHOLDS, TOKEN_SUFFIXES } from "./constants"

// ============================================
// Token Formatting
// ============================================

/**
 * Format token count for display (e.g., 1.5M, 250K)
 */
export function formatTokens(tokens: number): string {
  if (tokens >= TOKEN_THRESHOLDS.BILLION) {
    return `${(tokens / TOKEN_THRESHOLDS.BILLION).toFixed(1)}${TOKEN_SUFFIXES.BILLION}`
  }
  if (tokens >= TOKEN_THRESHOLDS.MILLION) {
    return `${(tokens / TOKEN_THRESHOLDS.MILLION).toFixed(1)}${TOKEN_SUFFIXES.MILLION}`
  }
  if (tokens >= TOKEN_THRESHOLDS.THOUSAND) {
    return `${(tokens / TOKEN_THRESHOLDS.THOUSAND).toFixed(1)}${TOKEN_SUFFIXES.THOUSAND}`
  }
  return tokens.toLocaleString()
}

/**
 * Format token count with full precision
 */
export function formatTokensFull(tokens: number): string {
  return tokens.toLocaleString()
}

/**
 * Format token count as compact (1M, 500K)
 */
export function formatTokensCompact(tokens: number): string {
  if (tokens >= TOKEN_THRESHOLDS.BILLION) {
    return `${Math.round(tokens / TOKEN_THRESHOLDS.BILLION)}${TOKEN_SUFFIXES.BILLION}`
  }
  if (tokens >= TOKEN_THRESHOLDS.MILLION) {
    return `${Math.round(tokens / TOKEN_THRESHOLDS.MILLION)}${TOKEN_SUFFIXES.MILLION}`
  }
  if (tokens >= TOKEN_THRESHOLDS.THOUSAND) {
    return `${Math.round(tokens / TOKEN_THRESHOLDS.THOUSAND)}${TOKEN_SUFFIXES.THOUSAND}`
  }
  return String(tokens)
}

/**
 * Format tokens with input/output breakdown
 */
export function formatTokenBreakdown(
  inputTokens: number,
  outputTokens: number
): string {
  return `${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out`
}

// ============================================
// Request Formatting
// ============================================

/**
 * Format request count
 */
export function formatRequests(requests: number): string {
  if (requests >= 1_000_000) {
    return `${(requests / 1_000_000).toFixed(1)}M`
  }
  if (requests >= 1_000) {
    return `${(requests / 1_000).toFixed(1)}K`
  }
  return requests.toLocaleString()
}

/**
 * Format requests with label
 */
export function formatRequestsWithLabel(requests: number): string {
  return `${formatRequests(requests)} requests`
}

/**
 * Format success rate percentage
 */
export function formatSuccessRate(rate: number): string {
  if (rate >= 99.9) return "99.9%"
  if (rate >= 99) return `${rate.toFixed(1)}%`
  return `${rate.toFixed(2)}%`
}

// ============================================
// Latency Formatting
// ============================================

/**
 * Format latency in milliseconds
 */
export function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  return `${Math.round(ms)}ms`
}

/**
 * Format latency with label
 */
export function formatLatencyWithLabel(ms: number, label: string = "latency"): string {
  return `${formatLatency(ms)} ${label}`
}

/**
 * Format time to first token
 */
export function formatTTFT(ms: number): string {
  return `${Math.round(ms)}ms TTFT`
}

// ============================================
// Rate Formatting
// ============================================

/**
 * Format tokens per second
 */
export function formatTokensPerSecond(tps: number): string {
  if (tps >= 1000) {
    return `${(tps / 1000).toFixed(1)}K/s`
  }
  return `${Math.round(tps)}/s`
}

/**
 * Format tokens per minute
 */
export function formatTokensPerMinute(tpm: number): string {
  if (tpm >= 1_000_000) {
    return `${(tpm / 1_000_000).toFixed(1)}M/min`
  }
  if (tpm >= 1000) {
    return `${(tpm / 1000).toFixed(1)}K/min`
  }
  return `${Math.round(tpm)}/min`
}

/**
 * Format tokens per request
 */
export function formatTokensPerRequest(tpr: number): string {
  if (tpr >= 1000) {
    return `${(tpr / 1000).toFixed(1)}K/req`
  }
  return `${Math.round(tpr)}/req`
}

/**
 * Format daily rate
 */
export function formatDailyRate(tokens: number): string {
  return `${formatTokens(tokens)}/day`
}

/**
 * Format monthly forecast
 */
export function formatMonthlyForecast(tokens: number): string {
  return `${formatTokens(tokens)}/mo`
}

// ============================================
// Percentage Formatting
// ============================================

/**
 * Format percentage with sign
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format percentage change with sign and arrow
 */
export function formatPercentChange(value: number): string {
  const sign = value > 0 ? "+" : ""
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→"
  return `${arrow} ${sign}${value.toFixed(1)}%`
}

/**
 * Get trend arrow
 */
export function getTrendArrow(change: number): string {
  if (change > 2) return "↑"
  if (change < -2) return "↓"
  return "→"
}

/**
 * Get trend color class for Tailwind
 */
export function getTrendColorClass(
  change: number,
  invertColors: boolean = false
): string {
  if (change > 2) {
    return invertColors ? "text-red-600" : "text-green-600"
  }
  if (change < -2) {
    return invertColors ? "text-green-600" : "text-red-600"
  }
  return "text-slate-500"
}

/**
 * Get trend background class for Tailwind
 */
export function getTrendBgClass(
  change: number,
  invertColors: boolean = false
): string {
  if (change > 2) {
    return invertColors ? "bg-red-50" : "bg-green-50"
  }
  if (change < -2) {
    return invertColors ? "bg-green-50" : "bg-red-50"
  }
  return "bg-slate-50"
}

// ============================================
// Cost Formatting (for usage-related costs)
// ============================================

/**
 * Format cost per 1M tokens
 */
export function formatCostPer1M(cost: number, currency: string = "USD"): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
  return `${formatter.format(cost)}/1M`
}

/**
 * Format cost per token (very small numbers)
 */
export function formatCostPerToken(
  cost: number,
  currency: string = "USD"
): string {
  if (cost === 0) return "$0.00"

  // Use scientific notation for very small values
  if (cost < 0.000001) {
    return `$${cost.toExponential(2)}`
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 6,
    maximumFractionDigits: 8,
  })
  return formatter.format(cost)
}

// ============================================
// Date/Time Formatting
// ============================================

/**
 * Format usage date for display
 */
export function formatUsageDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Format date range for display
 */
export function formatUsageDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })

  // Same year
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}, ${startDate.getFullYear()}`
  }

  return `${formatDate(startDate)}, ${startDate.getFullYear()} - ${formatDate(endDate)}, ${endDate.getFullYear()}`
}

// ============================================
// Combined Formatters
// ============================================

/**
 * Format usage summary for display
 */
export function formatUsageSummaryLine(
  tokens: number,
  requests: number
): string {
  return `${formatTokens(tokens)} tokens • ${formatRequests(requests)} requests`
}

/**
 * Format token rate with context
 */
export function formatTokenRate(
  dailyRate: number,
  monthlyForecast: number
): string {
  return `${formatTokens(dailyRate)}/day → ${formatTokens(monthlyForecast)}/mo`
}
