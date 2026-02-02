/**
 * Internationalization Formatters
 *
 * Utility functions for formatting currency, dates, and numbers
 * based on org-level locale settings.
 *
 * Uses native Intl APIs for proper localization.
 */

import {
  CURRENCY_BY_CODE,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  type CurrencyInfo,
} from "./constants"

// ============================================
// HELPER: Safe Number Validation
// ============================================

/**
 * Validate and normalize a numeric value
 * Returns 0 for null, undefined, NaN, or Infinity
 */
function safeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const num = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(num)) return 0
  return num
}

/**
 * Validate and normalize a currency code
 * Returns default currency if invalid
 */
function safeCurrency(code: unknown): string {
  if (typeof code !== "string" || !code) return DEFAULT_CURRENCY
  const upper = code.toUpperCase()
  return CURRENCY_CODES.includes(upper) ? upper : DEFAULT_CURRENCY
}

// ============================================
// CURRENCY FORMATTING
// ============================================

/**
 * Format amount as currency string
 *
 * @param amount - Numeric amount to format (null/undefined/NaN returns "$0.00")
 * @param currencyCode - ISO 4217 currency code (e.g., "USD", "AED")
 * @param locale - Optional locale for number formatting (defaults to "en-US")
 * @returns Formatted currency string (e.g., "$100.00", "100.00 د.إ")
 *
 * @example
 * formatCurrency(100, "USD") // "$100.00"
 * formatCurrency(100, "JPY") // "¥100" (no decimals)
 * formatCurrency(100, "KWD") // "KD 100.000" (3 decimals)
 * formatCurrency(null, "USD") // "$0.00"
 * formatCurrency(-50, "USD") // "-$50.00"
 */
export function formatCurrency(
  amount: number | null | undefined,
  currencyCode: string = DEFAULT_CURRENCY,
  locale: string = "en-US"
): string {
  const safeAmount = safeNumber(amount)
  const safeCode = safeCurrency(currencyCode)
  const currency = CURRENCY_BY_CODE[safeCode]
  const decimals = currency?.decimals ?? 2

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: safeCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safeAmount)
  } catch {
    // Fallback for unsupported currencies
    const symbol = currency?.symbol ?? safeCode
    const formatted = Math.abs(safeAmount).toFixed(decimals)
    return safeAmount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`
  }
}

/**
 * Format amount with just the currency symbol
 *
 * @param amount - Numeric amount (null/undefined/NaN returns symbol + "0.00")
 * @param currencyCode - ISO 4217 currency code
 * @returns Amount with symbol prefix (e.g., "$100.00", "$1,000,000.00")
 */
export function formatAmountWithSymbol(
  amount: number | null | undefined,
  currencyCode: string = DEFAULT_CURRENCY
): string {
  const safeAmount = safeNumber(amount)
  const safeCode = safeCurrency(currencyCode)
  const currency = CURRENCY_BY_CODE[safeCode]
  const symbol = currency?.symbol ?? "$"
  const decimals = currency?.decimals ?? 2
  const absAmount = Math.abs(safeAmount)
  const formatted = absAmount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return safeAmount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`
}

/**
 * Get currency symbol for display
 * Returns "$" for invalid/null/undefined currency codes
 */
export function getCurrencySymbol(currencyCode: string | null | undefined): string {
  if (!currencyCode) return "$"
  return CURRENCY_BY_CODE[currencyCode]?.symbol ?? "$"
}

/**
 * Get currency decimal places
 * Returns 2 for invalid/null/undefined currency codes
 */
export function getCurrencyDecimals(currencyCode: string | null | undefined): number {
  if (!currencyCode) return 2
  return CURRENCY_BY_CODE[currencyCode]?.decimals ?? 2
}

/**
 * Get currency display info
 * Returns null for invalid/null/undefined currency codes
 */
export function getCurrencyDisplay(currencyCode: string | null | undefined): CurrencyInfo | null {
  if (!currencyCode) return null
  return CURRENCY_BY_CODE[currencyCode] ?? null
}

// ============================================
// DATE/TIME FORMATTING
// ============================================

/**
 * Validate and normalize a date value
 * Returns current date for null, undefined, or invalid dates
 * TZ-001 FIX: Logs warning when invalid date is converted to current date
 */
function safeDate(value: unknown): Date {
  if (value === null || value === undefined) return new Date()
  const d = typeof value === "string" ? new Date(value) : value as Date
  // Check if date is valid (NaN check)
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    // TZ-001 FIX: Log warning for invalid dates (helps identify data issues)
    if (typeof console !== "undefined") {
      console.warn(`[i18n] Invalid date value "${String(value)}" converted to current date`)
    }
    return new Date()
  }
  return d
}

/**
 * Safe access to NODE_ENV for browser environments
 */
function isDevelopment(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV === "development"
  } catch {
    return false
  }
}

/**
 * Validate and normalize a timezone value
 * Returns "UTC" for invalid timezones, logs warning in dev mode
 */
function safeTimezone(value: unknown): string {
  if (typeof value !== "string" || !value) return DEFAULT_TIMEZONE

  // Try to validate the timezone using Intl
  try {
    // This will throw for invalid timezones
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return value
  } catch {
    // Log warning in development mode for invalid timezone
    if (typeof console !== "undefined" && isDevelopment()) {
      console.warn(`[i18n] Invalid timezone "${value}", falling back to UTC`)
    }
    return DEFAULT_TIMEZONE
  }
}

/**
 * Format date/time in specified timezone
 *
 * @param date - Date object or ISO string (null/undefined/invalid returns current time)
 * @param timezone - IANA timezone (e.g., "Asia/Dubai")
 * @param locale - Optional locale (defaults to "en-US")
 * @returns Formatted date string
 *
 * @example
 * formatDateTime(new Date(), "Asia/Dubai") // "Dec 13, 2025, 2:30 PM"
 * formatDateTime("2025-12-13T10:00:00Z", "UTC") // "Dec 13, 2025, 10:00 AM"
 * formatDateTime(null, "UTC") // Current date/time
 */
export function formatDateTime(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  locale: string = "en-US"
): string {
  const d = safeDate(date)
  const tz = safeTimezone(timezone)

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: tz,
    }).format(d)
  } catch {
    // Fallback for invalid timezone - use UTC
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(d)
    } catch {
      return d.toLocaleString(locale)
    }
  }
}

/**
 * Format date only (no time)
 * Returns current date for null/undefined/invalid dates
 */
export function formatDate(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  locale: string = "en-US"
): string {
  const d = safeDate(date)
  const tz = safeTimezone(timezone)

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: tz,
    }).format(d)
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(d)
    } catch {
      return d.toLocaleDateString(locale)
    }
  }
}

/**
 * Format DATE field (timezone-agnostic)
 *
 * For BigQuery DATE fields (YYYY-MM-DD) that should display the SAME date
 * everywhere regardless of user's timezone.
 *
 * Parses as local date instead of UTC to avoid timezone conversion.
 *
 * @param dateString - ISO date string "YYYY-MM-DD" (e.g., "2025-01-15")
 * @param locale - Optional locale (defaults to "en-US")
 * @returns Formatted date string (e.g., "Jan 15, 2025")
 *
 * @example
 * formatDateOnly("2025-01-15") // "Jan 15, 2025" (same in all timezones)
 * formatDateOnly("2025-12-31") // "Dec 31, 2025" (same in all timezones)
 * formatDateOnly(null) // Returns empty string
 */
export function formatDateOnly(
  dateString: string | null | undefined,
  locale: string = "en-US"
): string {
  if (!dateString) return ""

  try {
    // Parse YYYY-MM-DD as local date (not UTC)
    const [year, month, day] = dateString.split("-").map(Number)

    // Validate parsed values
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
      return ""
    }

    // Validate day based on month (handle Feb 30, Apr 31, etc.)
    const daysInMonth = new Date(year, month, 0).getDate()
    if (day > daysInMonth) {
      // FORMAT-001 FIX: Log warning in all environments for invalid dates
      if (typeof console !== "undefined") {
        console.warn(`[i18n] Invalid date: ${dateString} (${month}/${day} doesn't exist)`)
      }
      return ""
    }

    // Create local date (month is 0-indexed in Date constructor)
    const localDate = new Date(year, month - 1, day)

    // Verify the date wasn't adjusted (handles edge cases)
    if (localDate.getDate() !== day || localDate.getMonth() !== month - 1) {
      return ""
    }

    // Format using Intl without timezone conversion
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(localDate)
  } catch {
    // Fallback - return empty string on parsing failure (consistent with other invalid inputs)
    if (typeof console !== "undefined" && isDevelopment()) {
      console.warn(`[i18n] Failed to parse date: ${dateString}`)
    }
    return ""
  }
}

/**
 * Format time only (no date)
 * Returns current time for null/undefined/invalid dates
 */
export function formatTime(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  locale: string = "en-US"
): string {
  const d = safeDate(date)
  const tz = safeTimezone(timezone)

  try {
    return new Intl.DateTimeFormat(locale, {
      timeStyle: "short",
      timeZone: tz,
    }).format(d)
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeStyle: "short",
        timeZone: "UTC",
      }).format(d)
    } catch {
      return d.toLocaleTimeString(locale)
    }
  }
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 * Handles both past and future dates
 * Returns "now" for null/undefined/invalid dates
 */
export function formatRelativeTime(
  date: Date | string | null | undefined,
  locale: string = "en-US"
): string {
  // Handle null/undefined differently - return "now"
  if (date === null || date === undefined) {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second")
    } catch {
      return "now"
    }
  }

  const d = typeof date === "string" ? new Date(date) : date

  // Handle invalid dates
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second")
    } catch {
      return "now"
    }
  }

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const absDiffMs = Math.abs(diffMs)
  const isPast = diffMs > 0

  const absDiffSec = Math.floor(absDiffMs / 1000)
  const absDiffMin = Math.floor(absDiffSec / 60)
  const absDiffHour = Math.floor(absDiffMin / 60)
  const absDiffDay = Math.floor(absDiffHour / 24)

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })

    // "just now" for very recent times (within 10 seconds)
    if (absDiffSec < 10) return rtf.format(0, "second")

    const sign = isPast ? -1 : 1

    if (absDiffDay > 0) return rtf.format(sign * absDiffDay, "day")
    if (absDiffHour > 0) return rtf.format(sign * absDiffHour, "hour")
    if (absDiffMin > 0) return rtf.format(sign * absDiffMin, "minute")
    return rtf.format(sign * absDiffSec, "second")
  } catch {
    // Fallback for unsupported locales
    if (absDiffSec < 10) return "now"
    if (absDiffDay > 0) return isPast ? `${absDiffDay} days ago` : `in ${absDiffDay} days`
    if (absDiffHour > 0) return isPast ? `${absDiffHour} hours ago` : `in ${absDiffHour} hours`
    if (absDiffMin > 0) return isPast ? `${absDiffMin} minutes ago` : `in ${absDiffMin} minutes`
    return isPast ? `${absDiffSec} seconds ago` : `in ${absDiffSec} seconds`
  }
}

// ============================================
// NUMBER FORMATTING
// ============================================

/**
 * Format number with locale-specific separators
 * Returns "0" for null/undefined/NaN/Infinity
 */
export function formatNumber(
  value: number | null | undefined,
  locale: string = "en-US",
  options?: Intl.NumberFormatOptions
): string {
  const safeVal = safeNumber(value)
  try {
    return new Intl.NumberFormat(locale, options).format(safeVal)
  } catch {
    return safeVal.toString()
  }
}

/**
 * Format as percentage
 * Returns "0.0%" for null/undefined/NaN/Infinity
 */
export function formatPercent(
  value: number | null | undefined,
  locale: string = "en-US",
  decimals: number = 1
): string {
  const safeVal = safeNumber(value)
  try {
    return new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safeVal)
  } catch {
    // Fallback: format the value consistently as a percentage
    // safeVal is already 0-1 range for Intl, so multiply by 100 for display
    const percentValue = safeVal * 100
    const formatted = Number.isFinite(percentValue) ? percentValue.toFixed(decimals) : "0"
    return `${formatted}%`
  }
}

/**
 * Format large numbers with abbreviation (e.g., 1.2K, 3.4M)
 * Returns "0" for null/undefined/NaN/Infinity
 */
export function formatCompact(
  value: number | null | undefined,
  locale: string = "en-US"
): string {
  const safeVal = safeNumber(value)
  try {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      compactDisplay: "short",
    }).format(safeVal)
  } catch {
    // Fallback for unsupported locales
    if (safeVal >= 1e9) return `${(safeVal / 1e9).toFixed(1)}B`
    if (safeVal >= 1e6) return `${(safeVal / 1e6).toFixed(1)}M`
    if (safeVal >= 1e3) return `${(safeVal / 1e3).toFixed(1)}K`
    return safeVal.toString()
  }
}
