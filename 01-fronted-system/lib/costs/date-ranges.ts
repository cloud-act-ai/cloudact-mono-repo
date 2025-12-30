/**
 * Date Range Helpers
 *
 * Generate start/end dates for common time periods.
 * All dates are in local timezone, normalized to start/end of day.
 */

import { DateRange, FiscalYearConfig, DEFAULT_FISCAL_YEAR_CONFIG } from "./types"

// ============================================
// Date Utilities
// ============================================

/**
 * Get start of day (00:00:00.000)
 */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get end of day (23:59:59.999)
 */
function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Get start of week (Monday)
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  return startOfDay(d)
}

/**
 * Get end of week (Sunday)
 */
function endOfWeek(date: Date): Date {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + 6)
  return endOfDay(d)
}

/**
 * Get start of month
 */
function startOfMonth(date: Date): Date {
  const d = new Date(date)
  d.setDate(1)
  return startOfDay(d)
}

/**
 * Get end of month
 */
function endOfMonth(date: Date): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1, 0) // Last day of current month
  return endOfDay(d)
}

/**
 * Get start of quarter
 */
function startOfQuarter(date: Date): Date {
  const d = new Date(date)
  const quarter = Math.floor(d.getMonth() / 3)
  d.setMonth(quarter * 3, 1)
  return startOfDay(d)
}

/**
 * Get end of quarter
 */
function endOfQuarter(date: Date): Date {
  const d = new Date(date)
  const quarter = Math.floor(d.getMonth() / 3)
  d.setMonth(quarter * 3 + 3, 0) // Last day of quarter
  return endOfDay(d)
}

/**
 * Get start of year
 */
function startOfYear(date: Date): Date {
  const d = new Date(date)
  d.setMonth(0, 1)
  return startOfDay(d)
}

/**
 * Get end of year
 */
function endOfYear(date: Date): Date {
  const d = new Date(date)
  d.setMonth(11, 31)
  return endOfDay(d)
}

/**
 * Subtract days from date
 */
function subDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

/**
 * Subtract months from date
 */
function subMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() - months)
  return d
}

/**
 * Subtract years from date
 */
function subYears(date: Date, years: number): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() - years)
  return d
}

/**
 * Format date for label (e.g., "Dec 30, 2025")
 */
function formatLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ============================================
// Date Range Generators
// ============================================

/**
 * Date range factory functions
 */
export const dateRanges = {
  // ----------------------------------------
  // Current Periods
  // ----------------------------------------

  /**
   * Today (start to end of current day)
   */
  today: (): DateRange => {
    const now = new Date()
    return {
      start: startOfDay(now),
      end: endOfDay(now),
      label: "Today",
    }
  },

  /**
   * This week (Monday to Sunday)
   */
  thisWeek: (): DateRange => {
    const now = new Date()
    return {
      start: startOfWeek(now),
      end: endOfWeek(now),
      label: "This Week",
    }
  },

  /**
   * This month (1st to last day)
   */
  thisMonth: (): DateRange => {
    const now = new Date()
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
      label: "This Month",
    }
  },

  /**
   * This quarter (Q1-Q4)
   */
  thisQuarter: (): DateRange => {
    const now = new Date()
    const quarter = Math.floor(now.getMonth() / 3) + 1
    return {
      start: startOfQuarter(now),
      end: endOfQuarter(now),
      label: `Q${quarter} ${now.getFullYear()}`,
    }
  },

  /**
   * This year (Jan 1 to Dec 31)
   */
  thisYear: (): DateRange => {
    const now = new Date()
    return {
      start: startOfYear(now),
      end: endOfYear(now),
      label: `${now.getFullYear()}`,
    }
  },

  // ----------------------------------------
  // Previous Periods (for comparison)
  // ----------------------------------------

  /**
   * Last week (previous Monday to Sunday)
   */
  lastWeek: (): DateRange => {
    const now = new Date()
    const lastWeekDate = subDays(startOfWeek(now), 1)
    return {
      start: startOfWeek(lastWeekDate),
      end: endOfWeek(lastWeekDate),
      label: "Last Week",
    }
  },

  /**
   * Last month
   */
  lastMonth: (): DateRange => {
    const now = new Date()
    const lastMonthDate = subMonths(now, 1)
    return {
      start: startOfMonth(lastMonthDate),
      end: endOfMonth(lastMonthDate),
      label: lastMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    }
  },

  /**
   * Last quarter
   */
  lastQuarter: (): DateRange => {
    const now = new Date()
    const lastQuarterDate = subMonths(now, 3)
    const quarter = Math.floor(lastQuarterDate.getMonth() / 3) + 1
    return {
      start: startOfQuarter(lastQuarterDate),
      end: endOfQuarter(lastQuarterDate),
      label: `Q${quarter} ${lastQuarterDate.getFullYear()}`,
    }
  },

  /**
   * Last year
   */
  lastYear: (): DateRange => {
    const now = new Date()
    const lastYearDate = subYears(now, 1)
    return {
      start: startOfYear(lastYearDate),
      end: endOfYear(lastYearDate),
      label: `${lastYearDate.getFullYear()}`,
    }
  },

  // ----------------------------------------
  // Rolling Periods
  // ----------------------------------------

  /**
   * Last 7 days (including today)
   */
  last7Days: (): DateRange => {
    const now = new Date()
    return {
      start: startOfDay(subDays(now, 6)),
      end: endOfDay(now),
      label: "Last 7 Days",
    }
  },

  /**
   * Last 30 days (including today)
   */
  last30Days: (): DateRange => {
    const now = new Date()
    return {
      start: startOfDay(subDays(now, 29)),
      end: endOfDay(now),
      label: "Last 30 Days",
    }
  },

  /**
   * Last 90 days (including today)
   */
  last90Days: (): DateRange => {
    const now = new Date()
    return {
      start: startOfDay(subDays(now, 89)),
      end: endOfDay(now),
      label: "Last 90 Days",
    }
  },

  /**
   * Last 6 months
   */
  last6Months: (): DateRange => {
    const now = new Date()
    return {
      start: startOfDay(subMonths(now, 6)),
      end: endOfDay(now),
      label: "Last 6 Months",
    }
  },

  /**
   * Last 12 months
   */
  last12Months: (): DateRange => {
    const now = new Date()
    return {
      start: startOfDay(subMonths(now, 12)),
      end: endOfDay(now),
      label: "Last 12 Months",
    }
  },

  // ----------------------------------------
  // To-Date Periods
  // ----------------------------------------

  /**
   * Month to date (1st of month to today)
   */
  mtd: (): DateRange => {
    const now = new Date()
    return {
      start: startOfMonth(now),
      end: endOfDay(now),
      label: "MTD",
    }
  },

  /**
   * Quarter to date
   */
  qtd: (): DateRange => {
    const now = new Date()
    return {
      start: startOfQuarter(now),
      end: endOfDay(now),
      label: "QTD",
    }
  },

  /**
   * Year to date (Jan 1 to today)
   */
  ytd: (): DateRange => {
    const now = new Date()
    return {
      start: startOfYear(now),
      end: endOfDay(now),
      label: "YTD",
    }
  },

  // ----------------------------------------
  // Fiscal Year
  // ----------------------------------------

  /**
   * Current fiscal year
   */
  thisFiscalYear: (config: FiscalYearConfig = DEFAULT_FISCAL_YEAR_CONFIG): DateRange => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1 // 1-12

    // Determine fiscal year start
    let fyStartYear = currentYear
    if (currentMonth < config.startMonth) {
      fyStartYear = currentYear - 1
    }

    const start = new Date(fyStartYear, config.startMonth - 1, config.startDay)
    const end = new Date(fyStartYear + 1, config.startMonth - 1, config.startDay - 1)

    return {
      start: startOfDay(start),
      end: endOfDay(end),
      label: `FY${fyStartYear + 1}`,
    }
  },

  /**
   * FY2025 (Apr 1, 2024 - Mar 31, 2025)
   */
  fy2025: (): DateRange => ({
    start: new Date(2024, 3, 1), // Apr 1, 2024
    end: endOfDay(new Date(2025, 3, 0)), // Mar 31, 2025 (day 0 of Apr = last day of Mar)
    label: "FY2025",
  }),

  /**
   * FY2026 (Apr 1, 2025 - Mar 31, 2026)
   */
  fy2026: (): DateRange => ({
    start: new Date(2025, 3, 1),
    end: endOfDay(new Date(2026, 3, 0)), // Mar 31, 2026 (day 0 of Apr = last day of Mar)
    label: "FY2026",
  }),

  /**
   * Fiscal year to date
   */
  fytd: (config: FiscalYearConfig = DEFAULT_FISCAL_YEAR_CONFIG): DateRange => {
    const fy = dateRanges.thisFiscalYear(config)
    const now = new Date()
    return {
      start: fy.start,
      end: endOfDay(now),
      label: "FYTD",
    }
  },

  // ----------------------------------------
  // Custom
  // ----------------------------------------

  /**
   * Custom date range
   */
  custom: (start: Date, end: Date, label?: string): DateRange => ({
    start: startOfDay(start),
    end: endOfDay(end),
    label: label || `${formatLabel(start)} - ${formatLabel(end)}`,
  }),

  /**
   * Specific month
   */
  month: (year: number, month: number): DateRange => {
    const d = new Date(year, month - 1, 1) // month is 1-12
    return {
      start: startOfMonth(d),
      end: endOfMonth(d),
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    }
  },

  /**
   * Specific quarter
   */
  quarter: (year: number, quarter: number): DateRange => {
    const d = new Date(year, (quarter - 1) * 3, 1) // quarter is 1-4
    return {
      start: startOfQuarter(d),
      end: endOfQuarter(d),
      label: `Q${quarter} ${year}`,
    }
  },

  /**
   * Specific year
   */
  year: (year: number): DateRange => {
    const d = new Date(year, 0, 1)
    return {
      start: startOfYear(d),
      end: endOfYear(d),
      label: `${year}`,
    }
  },
}

// ============================================
// Date Range Utilities
// ============================================

/**
 * Get number of days in a date range
 * Returns at least 1 even if dates are the same or swapped
 */
export function getDaysInRange(range: DateRange): number {
  const diffTime = Math.abs(range.end.getTime() - range.start.getTime())
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1)
}

/**
 * Get number of days remaining in current month
 */
export function getDaysRemainingInMonth(): number {
  const now = new Date()
  const endOfMonthDate = endOfMonth(now)
  return endOfMonthDate.getDate() - now.getDate()
}

/**
 * Get number of days remaining in current year
 */
export function getDaysRemainingInYear(): number {
  const now = new Date()
  const endOfYearDate = endOfYear(now)
  const diffTime = endOfYearDate.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Get days in current month
 */
export function getDaysInCurrentMonth(): number {
  const now = new Date()
  return endOfMonth(now).getDate()
}

/**
 * Check if date is within range
 */
export function isDateInRange(date: Date, range: DateRange): boolean {
  const d = startOfDay(date)
  return d >= range.start && d <= range.end
}

/**
 * Convert DateRange to API query params format
 */
export function toApiParams(range: DateRange): { start_date: string; end_date: string } {
  return {
    start_date: range.start.toISOString().split("T")[0],
    end_date: range.end.toISOString().split("T")[0],
  }
}

/**
 * Get the previous equivalent period for comparison
 */
export function getPreviousPeriod(range: DateRange): DateRange {
  const days = getDaysInRange(range)
  const previousEnd = subDays(range.start, 1)
  const previousStart = subDays(previousEnd, days - 1)

  return {
    start: startOfDay(previousStart),
    end: endOfDay(previousEnd),
    label: `Previous Period`,
  }
}
