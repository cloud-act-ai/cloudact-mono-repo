/**
 * Period Comparison Helpers
 *
 * Compare costs between two time periods.
 */

import type { CostRecord } from "@/actions/costs"
import type { DateRange, PeriodComparison } from "./types"
import { filterByDateRange, sumCosts, groupByDay, groupByWeek, groupByMonth } from "./filters"
import { dateRanges, getPreviousPeriod } from "./date-ranges"

// ============================================
// Core Comparison Function
// ============================================

/**
 * Compare costs between two periods
 */
export function comparePeriods(
  records: CostRecord[],
  currentRange: DateRange,
  previousRange: DateRange
): PeriodComparison {
  const currentRecords = filterByDateRange(records, currentRange)
  const previousRecords = filterByDateRange(records, previousRange)

  const currentTotal = sumCosts(currentRecords)
  const previousTotal = sumCosts(previousRecords)

  const change = currentTotal - previousTotal
  const changePercent =
    previousTotal > 0 ? (change / previousTotal) * 100 : currentTotal > 0 ? 100 : 0

  let trend: "up" | "down" | "flat"
  if (change > 0.01) {
    trend = "up"
  } else if (change < -0.01) {
    trend = "down"
  } else {
    trend = "flat"
  }

  return {
    current: {
      total: currentTotal,
      label: currentRange.label,
      recordCount: currentRecords.length,
    },
    previous: {
      total: previousTotal,
      label: previousRange.label,
      recordCount: previousRecords.length,
    },
    change,
    changePercent,
    trend,
  }
}

// ============================================
// Pre-built Comparisons
// ============================================

/**
 * Compare this month vs last month
 */
export function monthOverMonth(records: CostRecord[]): PeriodComparison {
  return comparePeriods(records, dateRanges.thisMonth(), dateRanges.lastMonth())
}

/**
 * Compare this week vs last week
 */
export function weekOverWeek(records: CostRecord[]): PeriodComparison {
  return comparePeriods(records, dateRanges.thisWeek(), dateRanges.lastWeek())
}

/**
 * Compare this quarter vs last quarter
 */
export function quarterOverQuarter(records: CostRecord[]): PeriodComparison {
  return comparePeriods(records, dateRanges.thisQuarter(), dateRanges.lastQuarter())
}

/**
 * Compare this year vs last year
 */
export function yearOverYear(records: CostRecord[]): PeriodComparison {
  return comparePeriods(records, dateRanges.thisYear(), dateRanges.lastYear())
}

/**
 * Compare MTD this month vs MTD last month (same number of days)
 */
export function mtdComparison(records: CostRecord[]): PeriodComparison {
  const now = new Date()
  const currentDay = now.getDate()

  // Current MTD
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const currentEnd = now

  // Last month same days
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, currentDay)

  return comparePeriods(
    records,
    {
      start: currentStart,
      end: currentEnd,
      label: "MTD",
    },
    {
      start: lastMonthStart,
      end: lastMonthEnd,
      label: "Last Month MTD",
    }
  )
}

/**
 * Compare YTD this year vs YTD last year (same number of days)
 */
export function ytdComparison(records: CostRecord[]): PeriodComparison {
  const now = new Date()

  // Current YTD
  const currentStart = new Date(now.getFullYear(), 0, 1)
  const currentEnd = now

  // Last year same period
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1)
  const lastYearEnd = new Date(
    now.getFullYear() - 1,
    now.getMonth(),
    now.getDate()
  )

  return comparePeriods(
    records,
    {
      start: currentStart,
      end: currentEnd,
      label: "YTD",
    },
    {
      start: lastYearStart,
      end: lastYearEnd,
      label: "Last Year YTD",
    }
  )
}

/**
 * Compare last 7 days vs previous 7 days
 */
export function last7DaysComparison(records: CostRecord[]): PeriodComparison {
  const current = dateRanges.last7Days()
  const previous = getPreviousPeriod(current)
  previous.label = "Previous 7 Days"
  return comparePeriods(records, current, previous)
}

/**
 * Compare last 30 days vs previous 30 days
 */
export function last30DaysComparison(records: CostRecord[]): PeriodComparison {
  const current = dateRanges.last30Days()
  const previous = getPreviousPeriod(current)
  previous.label = "Previous 30 Days"
  return comparePeriods(records, current, previous)
}

/**
 * Compare any custom range with its previous equivalent period
 */
export function compareWithPreviousPeriod(
  records: CostRecord[],
  range: DateRange
): PeriodComparison {
  const previous = getPreviousPeriod(range)
  return comparePeriods(records, range, previous)
}

// ============================================
// Provider/Category Comparisons
// ============================================

/**
 * Compare provider costs between two periods
 */
export function compareProviderCosts(
  records: CostRecord[],
  currentRange: DateRange,
  previousRange: DateRange
): Map<string, PeriodComparison> {
  const currentRecords = filterByDateRange(records, currentRange)
  const previousRecords = filterByDateRange(records, previousRange)

  // Get all unique providers
  const providers = new Set<string>()
  for (const r of [...currentRecords, ...previousRecords]) {
    if (r.ServiceProviderName) {
      providers.add(r.ServiceProviderName)
    }
  }

  const result = new Map<string, PeriodComparison>()

  for (const provider of providers) {
    const currentProviderRecords = currentRecords.filter(
      (r) => r.ServiceProviderName === provider
    )
    const previousProviderRecords = previousRecords.filter(
      (r) => r.ServiceProviderName === provider
    )

    const currentTotal = sumCosts(currentProviderRecords)
    const previousTotal = sumCosts(previousProviderRecords)
    const change = currentTotal - previousTotal
    const changePercent =
      previousTotal > 0 ? (change / previousTotal) * 100 : currentTotal > 0 ? 100 : 0

    result.set(provider, {
      current: {
        total: currentTotal,
        label: currentRange.label,
        recordCount: currentProviderRecords.length,
      },
      previous: {
        total: previousTotal,
        label: previousRange.label,
        recordCount: previousProviderRecords.length,
      },
      change,
      changePercent,
      trend: change > 0.01 ? "up" : change < -0.01 ? "down" : "flat",
    })
  }

  return result
}

/**
 * Compare category costs between two periods
 */
export function compareCategoryCosts(
  records: CostRecord[],
  currentRange: DateRange,
  previousRange: DateRange
): Map<string, PeriodComparison> {
  const currentRecords = filterByDateRange(records, currentRange)
  const previousRecords = filterByDateRange(records, previousRange)

  // Get all unique categories
  const categories = new Set<string>()
  for (const r of [...currentRecords, ...previousRecords]) {
    if (r.ServiceCategory) {
      categories.add(r.ServiceCategory)
    }
  }

  const result = new Map<string, PeriodComparison>()

  for (const category of categories) {
    const currentCategoryRecords = currentRecords.filter(
      (r) => r.ServiceCategory === category
    )
    const previousCategoryRecords = previousRecords.filter(
      (r) => r.ServiceCategory === category
    )

    const currentTotal = sumCosts(currentCategoryRecords)
    const previousTotal = sumCosts(previousCategoryRecords)
    const change = currentTotal - previousTotal
    const changePercent =
      previousTotal > 0 ? (change / previousTotal) * 100 : currentTotal > 0 ? 100 : 0

    result.set(category, {
      current: {
        total: currentTotal,
        label: currentRange.label,
        recordCount: currentCategoryRecords.length,
      },
      previous: {
        total: previousTotal,
        label: previousRange.label,
        recordCount: previousCategoryRecords.length,
      },
      change,
      changePercent,
      trend: change > 0.01 ? "up" : change < -0.01 ? "down" : "flat",
    })
  }

  return result
}

// ============================================
// Trend Analysis
// ============================================

/**
 * Calculate growth rate (CAGR-style for longer periods)
 */
export function calculateGrowthRate(
  startValue: number,
  endValue: number,
  periods: number
): number {
  if (startValue <= 0 || periods <= 0) return 0
  return (Math.pow(endValue / startValue, 1 / periods) - 1) * 100
}

/**
 * Determine if costs are trending up, down, or stable
 * Analyzes the last N periods to determine trend direction
 */
export function analyzeTrend(
  records: CostRecord[],
  granularity: "daily" | "weekly" | "monthly" = "daily",
  lookbackPeriods: number = 7
): {
  direction: "up" | "down" | "stable"
  averageChange: number
  averageChangePercent: number
} {
  if (!records || records.length === 0) {
    return { direction: "stable", averageChange: 0, averageChangePercent: 0 }
  }

  let grouped: Map<string, number>
  switch (granularity) {
    case "weekly":
      grouped = groupByWeek(records)
      break
    case "monthly":
      grouped = groupByMonth(records)
      break
    default:
      grouped = groupByDay(records)
  }

  const sortedValues = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-lookbackPeriods)
    .map(([, v]) => v)

  if (sortedValues.length < 2) {
    return { direction: "stable", averageChange: 0, averageChangePercent: 0 }
  }

  // Calculate period-over-period changes
  const changes: number[] = []
  for (let i = 1; i < sortedValues.length; i++) {
    changes.push(sortedValues[i] - sortedValues[i - 1])
  }

  const averageChange = changes.reduce((a, b) => a + b, 0) / changes.length
  const averageValue = sortedValues.reduce((a, b) => a + b, 0) / sortedValues.length
  const averageChangePercent = averageValue > 0 ? (averageChange / averageValue) * 100 : 0

  let direction: "up" | "down" | "stable"
  if (averageChangePercent > 5) {
    direction = "up"
  } else if (averageChangePercent < -5) {
    direction = "down"
  } else {
    direction = "stable"
  }

  return {
    direction,
    averageChange,
    averageChangePercent,
  }
}
