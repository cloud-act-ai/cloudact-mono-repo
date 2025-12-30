/**
 * Cost Summary Calculator
 *
 * Calculate summary statistics from cost records.
 */

import type { CostRecord } from "@/actions/costs"
import type { DateRange, CostSummary } from "./types"
import {
  filterByDateRange,
  sumCosts,
  groupByProvider,
  groupByCategory,
} from "./filters"
import {
  dateRanges,
  getDaysInRange,
  getDaysRemainingInMonth,
  getDaysRemainingInYear,
  getDaysInCurrentMonth,
} from "./date-ranges"

// ============================================
// Summary Calculation
// ============================================

/**
 * Calculate comprehensive cost summary from records
 */
export function calculateSummary(
  records: CostRecord[],
  range: DateRange
): CostSummary {
  if (!records || !Array.isArray(records)) {
    records = []
  }

  const filtered = filterByDateRange(records, range)
  const total = sumCosts(filtered)
  const days = Math.max(1, getDaysInRange(range))
  const dailyAverage = total / days

  // Get MTD and YTD
  const mtdRecords = filterByDateRange(records, dateRanges.mtd())
  const ytdRecords = filterByDateRange(records, dateRanges.ytd())
  const mtd = sumCosts(mtdRecords)
  const ytd = sumCosts(ytdRecords)

  // Calculate run rates
  const daysInMonth = getDaysInCurrentMonth()
  const daysRemainingMonth = getDaysRemainingInMonth()
  const daysRemainingYear = getDaysRemainingInYear()

  const monthlyRunRate = dailyAverage * daysInMonth
  const annualRunRate = dailyAverage * 365

  // Calculate forecasts
  const forecastMonthly = mtd + dailyAverage * daysRemainingMonth
  const forecastAnnual = ytd + dailyAverage * daysRemainingYear

  // Group by provider and category
  const byProvider = groupByProvider(filtered)
  const byCategory = groupByCategory(filtered)

  return {
    total,
    dailyAverage,
    monthlyRunRate,
    annualRunRate,
    mtd,
    ytd,
    forecastMonthly,
    forecastAnnual,
    byProvider,
    byCategory,
    recordCount: filtered.length,
    dateRange: range,
  }
}

/**
 * Calculate quick summary (minimal calculations)
 */
export function calculateQuickSummary(records: CostRecord[]): {
  total: number
  recordCount: number
  providers: string[]
  categories: string[]
} {
  const total = sumCosts(records)
  const providers = new Set<string>()
  const categories = new Set<string>()

  for (const record of records) {
    if (record.ServiceProviderName) {
      providers.add(record.ServiceProviderName)
    }
    if (record.ServiceCategory) {
      categories.add(record.ServiceCategory)
    }
  }

  return {
    total,
    recordCount: records.length,
    providers: Array.from(providers).sort(),
    categories: Array.from(categories).sort(),
  }
}

// ============================================
// Run Rate Calculations
// ============================================

/**
 * Calculate daily run rate from records
 * Uses the most recent day with data, or average of last N days
 */
export function calculateDailyRate(
  records: CostRecord[],
  method: "latest" | "average" = "average",
  lookbackDays: number = 7
): number {
  if (records.length === 0) return 0

  // Sort records by date (descending)
  const sorted = [...records].sort((a, b) =>
    b.ChargePeriodStart.localeCompare(a.ChargePeriodStart)
  )

  if (method === "latest") {
    // Get the most recent date
    const latestDate = sorted[0].ChargePeriodStart.split("T")[0]
    const latestRecords = sorted.filter(
      (r) => r.ChargePeriodStart.startsWith(latestDate)
    )
    return sumCosts(latestRecords)
  }

  // Average method
  const now = new Date()
  const lookbackStart = new Date(now)
  lookbackStart.setDate(lookbackStart.getDate() - lookbackDays)

  const recentRecords = records.filter((r) => {
    const date = new Date(r.ChargePeriodStart)
    return date >= lookbackStart && date <= now
  })

  if (recentRecords.length === 0) return 0

  const total = sumCosts(recentRecords)
  return total / lookbackDays
}

/**
 * Calculate monthly run rate
 */
export function calculateMonthlyRunRate(dailyRate: number): number {
  return dailyRate * getDaysInCurrentMonth()
}

/**
 * Calculate annual run rate
 */
export function calculateAnnualRunRate(dailyRate: number): number {
  return dailyRate * 365
}

// ============================================
// Forecast Calculations
// ============================================

/**
 * Forecast end-of-month cost
 */
export function forecastMonthEnd(records: CostRecord[]): number {
  if (!records || !Array.isArray(records) || records.length === 0) {
    return 0
  }

  const mtdRecords = filterByDateRange(records, dateRanges.mtd())
  const mtd = sumCosts(mtdRecords)
  const dailyRate = calculateDailyRate(records)
  const daysRemaining = Math.max(0, getDaysRemainingInMonth())

  // If it's the first day of the month with no data, return 0 instead of projecting from nothing
  if (mtd === 0 && dailyRate === 0) {
    return 0
  }

  return mtd + dailyRate * daysRemaining
}

/**
 * Forecast end-of-year cost
 */
export function forecastYearEnd(records: CostRecord[]): number {
  if (!records || !Array.isArray(records) || records.length === 0) {
    return 0
  }

  const ytdRecords = filterByDateRange(records, dateRanges.ytd())
  const ytd = sumCosts(ytdRecords)
  const dailyRate = calculateDailyRate(records)
  const daysRemaining = Math.max(0, getDaysRemainingInYear())

  // If no data exists, return 0
  if (ytd === 0 && dailyRate === 0) {
    return 0
  }

  return ytd + dailyRate * daysRemaining
}

/**
 * Calculate forecast for a custom period
 */
export function forecastPeriod(
  records: CostRecord[],
  targetRange: DateRange
): {
  actual: number
  forecast: number
  confidence: "high" | "medium" | "low"
} {
  const now = new Date()

  // If target is entirely in the past, return actual
  if (targetRange.end < now) {
    const actual = sumCosts(filterByDateRange(records, targetRange))
    return { actual, forecast: actual, confidence: "high" }
  }

  // Calculate actual for completed portion
  const completedRange: DateRange = {
    start: targetRange.start,
    end: now,
    label: "Completed",
  }
  const actual = sumCosts(filterByDateRange(records, completedRange))

  // Calculate remaining days
  const totalDays = getDaysInRange(targetRange)
  const completedDays = getDaysInRange(completedRange)
  const remainingDays = totalDays - completedDays

  // Get daily rate
  const dailyRate = calculateDailyRate(records)

  // Forecast
  const forecast = actual + dailyRate * remainingDays

  // Confidence based on data availability
  let confidence: "high" | "medium" | "low"
  if (completedDays >= totalDays * 0.7) {
    confidence = "high"
  } else if (completedDays >= totalDays * 0.3) {
    confidence = "medium"
  } else {
    confidence = "low"
  }

  return { actual, forecast, confidence }
}

// ============================================
// Statistical Helpers
// ============================================

/**
 * Calculate average daily cost
 */
export function calculateAverageDailyCost(
  records: CostRecord[],
  range: DateRange
): number {
  const filtered = filterByDateRange(records, range)
  const total = sumCosts(filtered)
  const days = getDaysInRange(range)
  return days > 0 ? total / days : 0
}

/**
 * Calculate median daily cost
 */
export function calculateMedianDailyCost(
  records: CostRecord[],
  range: DateRange
): number {
  if (!records || !Array.isArray(records)) return 0

  const filtered = filterByDateRange(records, range)

  // Group by day
  const dailyCosts = new Map<string, number>()
  for (const record of filtered) {
    if (!record.ChargePeriodStart) continue
    const date = record.ChargePeriodStart.split("T")[0]
    const cost = record.EffectiveCost ?? record.BilledCost ?? 0
    const current = dailyCosts.get(date) || 0
    dailyCosts.set(date, current + (Number.isFinite(cost) ? cost : 0))
  }

  const values = Array.from(dailyCosts.values()).sort((a, b) => a - b)

  if (values.length === 0) return 0
  if (values.length === 1) return values[0]

  const mid = Math.floor(values.length / 2)
  return values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid]
}

/**
 * Find highest cost day in range
 */
export function findHighestCostDay(
  records: CostRecord[],
  range: DateRange
): { date: string; cost: number } | null {
  const filtered = filterByDateRange(records, range)

  if (filtered.length === 0) return null

  const dailyCosts = new Map<string, number>()
  for (const record of filtered) {
    const date = record.ChargePeriodStart.split("T")[0]
    const current = dailyCosts.get(date) || 0
    dailyCosts.set(date, current + (record.EffectiveCost || record.BilledCost || 0))
  }

  let maxDate = ""
  let maxCost = 0

  for (const [date, cost] of dailyCosts) {
    if (cost > maxCost) {
      maxDate = date
      maxCost = cost
    }
  }

  return { date: maxDate, cost: maxCost }
}

/**
 * Find lowest cost day in range
 */
export function findLowestCostDay(
  records: CostRecord[],
  range: DateRange
): { date: string; cost: number } | null {
  const filtered = filterByDateRange(records, range)

  if (filtered.length === 0) return null

  const dailyCosts = new Map<string, number>()
  for (const record of filtered) {
    const date = record.ChargePeriodStart.split("T")[0]
    const current = dailyCosts.get(date) || 0
    dailyCosts.set(date, current + (record.EffectiveCost || record.BilledCost || 0))
  }

  let minDate = ""
  let minCost = Infinity

  for (const [date, cost] of dailyCosts) {
    if (cost < minCost) {
      minDate = date
      minCost = cost
    }
  }

  return { date: minDate, cost: minCost }
}

/**
 * Calculate cost distribution percentiles
 */
export function calculatePercentiles(
  records: CostRecord[],
  range: DateRange,
  percentiles: number[] = [25, 50, 75, 90, 95]
): Map<number, number> {
  const filtered = filterByDateRange(records, range)

  // Group by day
  const dailyCosts = new Map<string, number>()
  for (const record of filtered) {
    const date = record.ChargePeriodStart.split("T")[0]
    const current = dailyCosts.get(date) || 0
    dailyCosts.set(date, current + (record.EffectiveCost || record.BilledCost || 0))
  }

  const values = Array.from(dailyCosts.values()).sort((a, b) => a - b)
  const result = new Map<number, number>()

  if (values.length === 0) {
    for (const p of percentiles) {
      result.set(p, 0)
    }
    return result
  }

  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * values.length) - 1
    result.set(p, values[Math.max(0, index)])
  }

  return result
}
