/**
 * FinOps Calculation Constants
 *
 * Industry-standard constants for cloud cost management.
 * Based on FinOps Foundation best practices.
 *
 * @see https://www.finops.org/
 *
 * Key Principles:
 * - Use 30-day standardized month for all forecasts
 * - Use actual days in period for rate calculations
 * - All functions include NaN validation
 */

// ============================================
// FinOps Constants
// ============================================

/**
 * Standard FinOps calculation constants
 * - DAYS_PER_MONTH: 30-day standardized month (industry standard)
 * - MONTHS_PER_YEAR: 12 months
 * - DAYS_PER_YEAR: 365 days (non-leap year)
 * - MAX_CACHE_DAYS: Maximum days to cache before requiring new API call
 */
export const FINOPS = {
  /** Standard 30-day month for forecasts (FinOps standard) */
  DAYS_PER_MONTH: 30,
  /** Months per year */
  MONTHS_PER_YEAR: 12,
  /** Days per year (non-leap) */
  DAYS_PER_YEAR: 365,
  /** Default data fetch window - always fetch 365 days */
  DEFAULT_FETCH_DAYS: 365,
  /** Maximum days before cache invalidation */
  MAX_CACHE_DAYS: 365,
  /** Cache TTL in milliseconds (5 minutes) */
  CACHE_TTL_MS: 5 * 60 * 1000,
} as const

// ============================================
// Time Range Constants
// ============================================

export const TIME_RANGES = {
  /** 7-day window */
  WEEK: 7,
  /** 30-day window (standard month) */
  MONTH: 30,
  /** 90-day window (quarter) */
  QUARTER: 90,
  /** 365-day window (year) */
  YEAR: 365,
} as const

// ============================================
// Validation Helpers
// ============================================

/**
 * Check if a value is a valid finite number
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value)
}

/**
 * Ensure a number is valid, return 0 if not
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  return isValidNumber(value) ? value : fallback
}

// ============================================
// Rate Calculations (FinOps Standard)
// ============================================

/**
 * Calculate daily rate from total cost over a period.
 *
 * Formula: dailyRate = totalCost / daysInPeriod
 *
 * @param totalCost - Total cost for the period
 * @param daysInPeriod - Number of days in the period
 * @returns Daily cost rate (0 if invalid inputs)
 */
export function calculateDailyRate(totalCost: number, daysInPeriod: number): number {
  if (!isValidNumber(totalCost) || !isValidNumber(daysInPeriod) || daysInPeriod <= 0) {
    return 0
  }
  return totalCost / daysInPeriod
}

/**
 * Calculate monthly forecast from daily rate.
 * Uses standard 30-day month (FinOps standard).
 *
 * Formula: monthlyForecast = dailyRate * 30
 *
 * @param dailyRate - Daily cost rate
 * @returns Monthly forecast (0 if invalid input)
 */
export function calculateMonthlyForecast(dailyRate: number): number {
  if (!isValidNumber(dailyRate)) {
    return 0
  }
  return dailyRate * FINOPS.DAYS_PER_MONTH
}

/**
 * Calculate annual forecast from monthly forecast.
 *
 * Formula: annualForecast = monthlyForecast * 12
 *
 * @param monthlyForecast - Monthly cost forecast
 * @returns Annual forecast (0 if invalid input)
 */
export function calculateAnnualForecast(monthlyForecast: number): number {
  if (!isValidNumber(monthlyForecast)) {
    return 0
  }
  return monthlyForecast * FINOPS.MONTHS_PER_YEAR
}

/**
 * Calculate annual forecast directly from daily rate.
 * Uses standard 30-day month * 12 = 360 days (FinOps standard).
 *
 * Formula: annualForecast = dailyRate * 30 * 12 = dailyRate * 360
 *
 * Note: This is different from dailyRate * 365. The FinOps standard
 * uses 30-day months for consistency in forecasting.
 *
 * @param dailyRate - Daily cost rate
 * @returns Annual forecast (0 if invalid input)
 */
export function calculateAnnualFromDaily(dailyRate: number): number {
  return calculateAnnualForecast(calculateMonthlyForecast(dailyRate))
}

// ============================================
// Forecast Bundle
// ============================================

export interface Forecasts {
  /** Daily cost rate */
  dailyRate: number
  /** Monthly forecast (30-day) */
  monthlyForecast: number
  /** Annual forecast (12 * 30-day months) */
  annualForecast: number
}

/**
 * Calculate all forecasts from total cost and period days.
 *
 * This is the primary function for dashboard calculations.
 * Uses FinOps standard 30-day month for all forecasts.
 *
 * @param totalCost - Total cost for the period
 * @param daysInPeriod - Number of days in the period
 * @returns All forecast values
 *
 * @example
 * ```typescript
 * // For a 365-day total
 * const { dailyRate, monthlyForecast, annualForecast } = calculateAllForecasts(36500, 365)
 * // dailyRate = 100
 * // monthlyForecast = 3000 (100 * 30)
 * // annualForecast = 36000 (3000 * 12)
 *
 * // For MTD cost (e.g., 15 days elapsed)
 * const mtdForecasts = calculateAllForecasts(1500, 15)
 * // dailyRate = 100
 * // monthlyForecast = 3000
 * // annualForecast = 36000
 * ```
 */
export function calculateAllForecasts(totalCost: number, daysInPeriod: number): Forecasts {
  const dailyRate = calculateDailyRate(totalCost, daysInPeriod)
  const monthlyForecast = calculateMonthlyForecast(dailyRate)
  const annualForecast = calculateAnnualForecast(monthlyForecast)

  return {
    dailyRate,
    monthlyForecast,
    annualForecast,
  }
}

// ============================================
// YTD Calculations
// ============================================

/**
 * Calculate YTD forecast from daily rate.
 * Unlike annual forecast, this uses actual days elapsed in year.
 *
 * @param dailyRate - Daily cost rate
 * @param daysElapsedInYear - Days elapsed since Jan 1
 * @returns YTD forecast
 */
export function calculateYTDForecast(dailyRate: number, daysElapsedInYear: number): number {
  if (!isValidNumber(dailyRate) || !isValidNumber(daysElapsedInYear) || daysElapsedInYear <= 0) {
    return 0
  }
  return dailyRate * daysElapsedInYear
}

/**
 * Get the number of days elapsed in the current year
 */
export function getDaysElapsedInYear(): number {
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const diffMs = now.getTime() - yearStart.getTime()
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

// ============================================
// Time Range Helpers
// ============================================

/**
 * Get the number of days in a time range preset
 */
export function getDaysForTimeRange(range: "7d" | "30d" | "90d" | "365d" | string): number {
  switch (range) {
    case "7d":
      return TIME_RANGES.WEEK
    case "30d":
      return TIME_RANGES.MONTH
    case "90d":
      return TIME_RANGES.QUARTER
    case "365d":
      return TIME_RANGES.YEAR
    default:
      return TIME_RANGES.YEAR // Default to full year
  }
}

/**
 * Calculate days between two dates
 */
export function getDaysBetween(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate
  const end = typeof endDate === "string" ? new Date(endDate) : endDate

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 0
  }

  const diffMs = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end
}

// ============================================
// Rolling Average Constants
// ============================================

export const ROLLING_AVERAGE = {
  /** Rolling average window for 7-day view */
  "7d": 3,
  /** Rolling average window for 30-day view */
  "30d": 7,
  /** Rolling average window for 90-day view */
  "90d": 14,
  /** Rolling average window for 365-day view */
  "365d": 30,
} as const

/**
 * Get the rolling average window size for a time range
 */
export function getRollingAverageWindow(
  range: "7d" | "30d" | "90d" | "365d" | string
): number {
  switch (range) {
    case "7d":
      return ROLLING_AVERAGE["7d"]
    case "30d":
      return ROLLING_AVERAGE["30d"]
    case "90d":
      return ROLLING_AVERAGE["90d"]
    case "365d":
      return ROLLING_AVERAGE["365d"]
    default:
      return ROLLING_AVERAGE["30d"]
  }
}
