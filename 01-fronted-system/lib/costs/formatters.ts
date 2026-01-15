/**
 * Cost Display Formatters
 *
 * Format costs, percentages, and trends for display.
 * Leverages existing i18n formatters where possible.
 */

import type { PeriodComparison } from "./types"
import { isValidCurrency, DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// ============================================
// Cost Formatting
// ============================================

/**
 * Format cost with currency symbol
 * Uses Intl.NumberFormat for proper locale handling
 */
export function formatCost(
  amount: number,
  currency: string = "USD",
  options?: {
    compact?: boolean
    decimals?: number
    showSign?: boolean
  }
): string {
  const { compact = false, decimals = 2, showSign = false } = options || {}

  // Handle NaN, Infinity, null, and undefined - return $0.00
  if (!Number.isFinite(amount)) {
    amount = 0
  }

  // VAL-001 FIX: Validate currency code before passing to Intl.NumberFormat
  // Invalid codes cause RangeError, fall back to DEFAULT_CURRENCY
  const safeCurrency = isValidCurrency(currency) ? currency : DEFAULT_CURRENCY

  // FORMAT-001 FIX: Use undefined to respect user's browser locale
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: compact ? 0 : decimals,
    maximumFractionDigits: compact ? 1 : decimals,
    notation: compact ? "compact" : "standard",
    signDisplay: showSign ? "exceptZero" : "auto",
  })

  return formatter.format(amount)
}

/**
 * Format cost as compact (e.g., $1.2K, $3.4M)
 */
export function formatCostCompact(amount: number, currency: string = "USD"): string {
  return formatCost(amount, currency, { compact: true })
}

/**
 * Format cost with sign (e.g., +$100.00, -$50.00)
 */
export function formatCostWithSign(amount: number, currency: string = "USD"): string {
  return formatCost(amount, currency, { showSign: true })
}

/**
 * Format cost range (e.g., "$100 - $500")
 * VAL-002 FIX: Currency validation happens in formatCost
 */
export function formatCostRange(
  min: number,
  max: number,
  currency: string = "USD"
): string {
  // Currency is validated in formatCost, safe to pass through
  return `${formatCost(min, currency)} - ${formatCost(max, currency)}`
}

// ============================================
// Percentage Formatting
// ============================================

/**
 * Format percentage
 * Note: Input value is expected to be 0-100 (e.g., 15 for 15%)
 * The function converts to 0-1 for Intl.NumberFormat
 */
export function formatPercent(
  value: number,
  options?: {
    decimals?: number
    showSign?: boolean
  }
): string {
  const { decimals = 1, showSign = false } = options || {}

  // Handle NaN, Infinity, and null/undefined
  if (!Number.isFinite(value)) {
    return "0%"
  }

  // FORMAT-001 FIX: Use undefined to respect user's browser locale
  const formatter = new Intl.NumberFormat(undefined, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: showSign ? "exceptZero" : "auto",
  })

  // value is 0-100, convert to 0-1 for percentage formatting
  return formatter.format(value / 100)
}

/**
 * Format percentage change (e.g., "+15.2%", "-8.5%")
 */
export function formatPercentChange(value: number): string {
  return formatPercent(value, { showSign: true })
}

// ============================================
// Trend Formatting
// ============================================

/**
 * Get trend arrow character
 */
export function getTrendArrow(trend: "up" | "down" | "flat"): string {
  switch (trend) {
    case "up":
      return "↑"
    case "down":
      return "↓"
    default:
      return "→"
  }
}

/**
 * Get trend color class (Tailwind)
 */
export function getTrendColorClass(
  trend: "up" | "down" | "flat",
  costContext: boolean = true
): string {
  // For costs, up is bad (red), down is good (green)
  // For revenue/savings, it's the opposite
  if (costContext) {
    switch (trend) {
      case "up":
        return "text-red-500"
      case "down":
        return "text-green-500"
      default:
        return "text-gray-500"
    }
  } else {
    switch (trend) {
      case "up":
        return "text-green-500"
      case "down":
        return "text-red-500"
      default:
        return "text-gray-500"
    }
  }
}

/**
 * Get trend background color class (Tailwind)
 */
export function getTrendBgClass(
  trend: "up" | "down" | "flat",
  costContext: boolean = true
): string {
  if (costContext) {
    switch (trend) {
      case "up":
        return "bg-red-50 text-red-700"
      case "down":
        return "bg-green-50 text-green-700"
      default:
        return "bg-gray-50 text-gray-700"
    }
  } else {
    switch (trend) {
      case "up":
        return "bg-green-50 text-green-700"
      case "down":
        return "bg-red-50 text-red-700"
      default:
        return "bg-gray-50 text-gray-700"
    }
  }
}

/**
 * Format trend with arrow and percentage
 */
export function formatTrend(
  comparison: PeriodComparison,
  currency: string = "USD"
): {
  text: string
  arrow: string
  colorClass: string
  bgClass: string
} {
  const arrow = getTrendArrow(comparison.trend)
  const percentText = formatPercentChange(comparison.changePercent)
  const amountText = formatCostWithSign(comparison.change, currency)

  return {
    text: `${arrow} ${percentText} (${amountText})`,
    arrow,
    colorClass: getTrendColorClass(comparison.trend),
    bgClass: getTrendBgClass(comparison.trend),
  }
}

// ============================================
// Number Formatting
// ============================================

/**
 * Format large number with suffix (K, M, B)
 */
export function formatNumber(
  value: number,
  options?: {
    compact?: boolean
    decimals?: number
  }
): string {
  const { compact = false, decimals = 0 } = options || {}

  // FORMAT-001 FIX: Use undefined to respect user's browser locale
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    notation: compact ? "compact" : "standard",
  })

  return formatter.format(value)
}

/**
 * Format record count (e.g., "1,234 records")
 */
export function formatRecordCount(count: number): string {
  const formatted = formatNumber(count)
  return `${formatted} ${count === 1 ? "record" : "records"}`
}

// ============================================
// Date Formatting
// ============================================

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date

  // Handle invalid dates
  if (isNaN(d.getTime())) {
    return "Invalid date"
  }

  // FORMAT-001 FIX: Use undefined to respect user's browser locale
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Format date range for display
 */
export function formatDateRange(start: Date | string, end: Date | string): string {
  const startDate = typeof start === "string" ? new Date(start) : start
  const endDate = typeof end === "string" ? new Date(end) : end

  // Handle invalid dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return "Invalid date range"
  }

  const sameYear = startDate.getFullYear() === endDate.getFullYear()
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth()
  const sameDay = sameMonth && startDate.getDate() === endDate.getDate()

  // Same day: "Dec 1, 2025"
  if (sameDay) {
    return formatDate(startDate)
  }

  if (sameMonth) {
    // Same month: "Dec 1-31, 2025"
    // FORMAT-001 FIX: Use undefined to respect user's browser locale
    return `${startDate.toLocaleDateString(undefined, { month: "short" })} ${startDate.getDate()}-${endDate.getDate()}, ${endDate.getFullYear()}`
  }

  if (sameYear) {
    // Same year: "Dec 1 - Jan 31, 2025"
    // FORMAT-001 FIX: Use undefined to respect user's browser locale
    return `${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${endDate.getFullYear()}`
  }

  // Different years: "Dec 1, 2024 - Jan 31, 2025"
  return `${formatDate(startDate)} - ${formatDate(endDate)}`
}

/**
 * Format month-year (e.g., "December 2025")
 */
export function formatMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date

  // Handle invalid dates
  if (isNaN(d.getTime())) {
    return "Invalid date"
  }

  // FORMAT-001 FIX: Use undefined to respect user's browser locale
  return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
}

// ============================================
// Comparison Formatting
// ============================================

/**
 * Format comparison for display in UI
 */
export function formatComparison(
  comparison: PeriodComparison,
  currency: string = "USD"
): {
  current: string
  previous: string
  change: string
  changePercent: string
  trend: string
  summary: string
} {
  const current = formatCost(comparison.current.total, currency)
  const previous = formatCost(comparison.previous.total, currency)
  const change = formatCostWithSign(comparison.change, currency)
  const changePercent = formatPercentChange(comparison.changePercent)
  const trend = getTrendArrow(comparison.trend)

  const direction =
    comparison.trend === "up"
      ? "increased"
      : comparison.trend === "down"
        ? "decreased"
        : "stayed flat"

  const summary = `Costs ${direction} by ${formatCost(Math.abs(comparison.change), currency)} (${formatPercent(Math.abs(comparison.changePercent))}) compared to ${comparison.previous.label}`

  return {
    current,
    previous,
    change,
    changePercent,
    trend,
    summary,
  }
}

// ============================================
// Summary Formatting
// ============================================

/**
 * Format run rate display (e.g., "$1,234/day", "$37K/mo")
 */
export function formatRunRate(
  amount: number,
  period: "day" | "week" | "month" | "year",
  currency: string = "USD"
): string {
  const periodSuffix = {
    day: "/day",
    week: "/wk",
    month: "/mo",
    year: "/yr",
  }

  const useCompact = amount >= 10000
  const formatted = useCompact
    ? formatCostCompact(amount, currency)
    : formatCost(amount, currency)

  return `${formatted}${periodSuffix[period]}`
}

/**
 * Format forecast display with confidence
 */
export function formatForecast(
  amount: number,
  confidence: "high" | "medium" | "low",
  currency: string = "USD"
): {
  value: string
  confidence: string
  confidenceClass: string
} {
  const confidenceLabels = {
    high: "High confidence",
    medium: "Medium confidence",
    low: "Low confidence",
  }

  const confidenceClasses = {
    high: "text-green-600",
    medium: "text-yellow-600",
    low: "text-orange-600",
  }

  return {
    value: formatCost(amount, currency),
    confidence: confidenceLabels[confidence],
    confidenceClass: confidenceClasses[confidence],
  }
}
