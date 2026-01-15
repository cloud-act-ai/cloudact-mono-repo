/**
 * Currency Exchange Rate Service
 *
 * Fixed exchange rates for consistent currency conversion.
 * Rates are relative to USD (base currency).
 *
 * Update Policy: Rates should be reviewed monthly by admin.
 * Last Updated: 2025-12-14
 *
 * NOTE: Exchange rates are now loaded from CSV file (data/seed/exchange-rates.csv)
 * This file maintains backward compatibility with hardcoded constants.
 */

// Exchange rate staleness threshold (30 days in milliseconds)
const RATE_STALENESS_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000
const RATES_LAST_UPDATED = "2025-12-14"

/**
 * Check if exchange rates are stale (older than 30 days)
 * Returns warning message if stale, null otherwise
 */
export function checkExchangeRateStaleness(): { isStale: boolean; daysOld: number; warning: string | null } {
  const lastUpdated = new Date(RATES_LAST_UPDATED)
  const now = new Date()
  const diffMs = now.getTime() - lastUpdated.getTime()
  const daysOld = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const isStale = diffMs > RATE_STALENESS_THRESHOLD_MS

  return {
    isStale,
    daysOld,
    warning: isStale
      ? `Exchange rates are ${daysOld} days old (last updated: ${RATES_LAST_UPDATED}). Currency conversions may be inaccurate.`
      : null
  }
}

import { CURRENCY_CODES, CURRENCY_BY_CODE } from "@/lib/i18n/constants"
import {
  loadExchangeRates,
  getExchangeRate as getExchangeRateFromCSV,
} from "@/lib/seed/csv-loader"

// ============================================
// EXCHANGE RATES (USD as base = 1.0)
// ============================================

/**
 * Exchange rates relative to USD (FALLBACK ONLY)
 *
 * IMPORTANT: These hardcoded rates are FALLBACK values used only when:
 * 1. CSV file fails to load
 * 2. Synchronous conversion is required (prefer async CSV-based functions)
 *
 * For production use, prefer async functions that load from CSV:
 * - convertCurrencyAsync() instead of convertCurrency()
 * - getExchangeRateAsync() instead of getExchangeRate()
 *
 * NOTE: This list includes additional currencies (HKD, NZD, SEK, KRW) that
 * are supported for conversion but not in SUPPORTED_CURRENCIES constants.
 * Use isCurrencySupported() to check conversion support, isValidCurrency()
 * from constants to check if it's a primary supported currency.
 */
export const EXCHANGE_RATES: Record<string, number> = {
  // Base
  USD: 1.0,

  // Major currencies
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.5,
  CHF: 0.88,
  CAD: 1.36,
  AUD: 1.53,
  CNY: 7.24,
  INR: 83.12,
  SGD: 1.34,

  // Additional currencies (from CSV)
  HKD: 7.78,
  NZD: 1.67,
  SEK: 10.45,
  KRW: 1320.0,

  // Arab currencies
  AED: 3.673,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.31,
  BHD: 0.377,
  OMR: 0.385,
}

// ============================================
// CSV-BASED EXCHANGE RATES (Async)
// ============================================

// Cache TTL: 5 minutes (refresh rates periodically if CSV updates during runtime)
const CACHE_TTL_MS = 5 * 60 * 1000

let exchangeRatesMapCache: Record<string, number> | null = null
let cacheTimestamp: number | null = null

/**
 * Load exchange rates from CSV and build map
 * (Internal helper with TTL-based cache)
 */
async function loadExchangeRatesMap(): Promise<Record<string, number>> {
  const now = Date.now()

  // Return cached if still valid
  if (exchangeRatesMapCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return exchangeRatesMapCache
  }

  const rates = await loadExchangeRates()
  const map: Record<string, number> = {}

  rates.forEach((rate) => {
    map[rate.currency_code] = rate.rate_to_usd
  })

  exchangeRatesMapCache = map
  cacheTimestamp = now
  return map
}

/**
 * Clear the exchange rate cache (useful for testing or forcing refresh)
 */
export function clearExchangeRateCache(): void {
  exchangeRatesMapCache = null
  cacheTimestamp = null
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert amount from one currency to another (Synchronous)
 *
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency code (e.g., "USD")
 * @param toCurrency - Target currency code (e.g., "INR")
 * @param options.strict - If true, throws error for unsupported currencies (VAL-003 FIX)
 * @returns Converted amount rounded to currency-specific decimals
 *
 * NOTE: Uses hardcoded rates. For CSV-based conversion, use convertCurrencyAsync().
 *
 * WARNING: If either currency is not supported:
 * - With strict=false (default): returns original amount unchanged (logs warning)
 * - With strict=true: throws Error
 *
 * For detailed conversion info including success status, use convertWithAudit().
 *
 * @example
 * convertCurrency(100, "USD", "INR") // 8312.00
 * convertCurrency(100, "INR", "USD") // 1.20
 * convertCurrency(100, "EUR", "GBP") // 85.87
 * convertCurrency(100, "USD", "XYZ") // 100 (unsupported - returns original!)
 * convertCurrency(100, "USD", "XYZ", { strict: true }) // throws Error
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  options?: { strict?: boolean }
): number {
  // Same currency - no conversion needed
  if (fromCurrency === toCurrency) return amount

  // Validate currencies - warn if missing
  const fromRate = EXCHANGE_RATES[fromCurrency]
  const toRate = EXCHANGE_RATES[toCurrency]

  if (!fromRate || !toRate) {
    // VAL-003 FIX: Add strict mode that throws error for unsupported currencies
    if (options?.strict) {
      throw new Error(
        `Unsupported currency conversion: ${fromCurrency} → ${toCurrency}. ` +
        `Use isCurrencySupported() to validate currencies before conversion.`
      )
    }

    // Default: log warning and return original amount
    if (typeof console !== "undefined") {
      console.warn(
        `[Currency] Unsupported currency conversion: ${fromCurrency} → ${toCurrency}. ` +
        `Returning original amount (${amount}). Use isCurrencySupported() to validate currencies.`
      )
    }
    return amount
  }

  // Convert: from → USD → to
  const usdAmount = amount / fromRate
  const converted = usdAmount * toRate

  // Round to currency-specific decimals (JPY=0, KWD/BHD/OMR=3, most=2)
  const decimals = CURRENCY_BY_CODE[toCurrency]?.decimals ?? 2
  const multiplier = Math.pow(10, decimals)
  return Math.round(converted * multiplier) / multiplier
}

/**
 * Convert amount from one currency to another (Async CSV version)
 *
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency code (e.g., "USD")
 * @param toCurrency - Target currency code (e.g., "INR")
 * @returns Converted amount rounded to 2 decimals
 *
 * @example
 * await convertCurrencyAsync(100, "USD", "INR") // 8312.00
 * await convertCurrencyAsync(100, "INR", "USD") // 1.20
 * await convertCurrencyAsync(100, "EUR", "GBP") // 85.87
 */
export async function convertCurrencyAsync(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  // Same currency - no conversion needed
  if (fromCurrency === toCurrency) return amount

  try {
    const rates = await loadExchangeRatesMap()
    const fromRate = rates[fromCurrency]
    const toRate = rates[toCurrency]

    if (!fromRate || !toRate) {
      return amount
    }

    // Convert: from → USD → to
    const usdAmount = amount / fromRate
    const converted = usdAmount * toRate

    // Round to currency-specific decimals (JPY=0, KWD/BHD/OMR=3, most=2)
    const decimals = CURRENCY_BY_CODE[toCurrency]?.decimals ?? 2
    const multiplier = Math.pow(10, decimals)
    return Math.round(converted * multiplier) / multiplier
  } catch {
    return convertCurrency(amount, fromCurrency, toCurrency)
  }
}

/**
 * Convert USD amount to target currency (Synchronous)
 *
 * @param usdAmount - Amount in USD
 * @param toCurrency - Target currency code
 * @returns Converted amount
 *
 * @example
 * convertFromUSD(10, "INR") // 831.20
 * convertFromUSD(10, "AED") // 36.73
 */
export function convertFromUSD(usdAmount: number, toCurrency: string): number {
  return convertCurrency(usdAmount, "USD", toCurrency)
}

/**
 * Convert USD amount to target currency (Async CSV version)
 *
 * @param usdAmount - Amount in USD
 * @param toCurrency - Target currency code
 * @returns Converted amount
 *
 * @example
 * await convertFromUSDAsync(10, "INR") // 831.20
 * await convertFromUSDAsync(10, "AED") // 36.73
 */
export async function convertFromUSDAsync(
  usdAmount: number,
  toCurrency: string
): Promise<number> {
  return await convertCurrencyAsync(usdAmount, "USD", toCurrency)
}

/**
 * Convert amount to USD (Synchronous)
 *
 * @param amount - Amount in source currency
 * @param fromCurrency - Source currency code
 * @returns Amount in USD
 *
 * @example
 * convertToUSD(831.20, "INR") // 10.00
 * convertToUSD(36.73, "AED") // 10.00
 */
export function convertToUSD(amount: number, fromCurrency: string): number {
  return convertCurrency(amount, fromCurrency, "USD")
}

/**
 * Convert amount to USD (Async CSV version)
 *
 * @param amount - Amount in source currency
 * @param fromCurrency - Source currency code
 * @returns Amount in USD
 *
 * @example
 * await convertToUSDAsync(831.20, "INR") // 10.00
 * await convertToUSDAsync(36.73, "AED") // 10.00
 */
export async function convertToUSDAsync(
  amount: number,
  fromCurrency: string
): Promise<number> {
  return await convertCurrencyAsync(amount, fromCurrency, "USD")
}

/**
 * Get exchange rate for a currency (relative to USD)
 *
 * @param currency - Currency code
 * @returns Exchange rate or 1.0 if unknown
 *
 * NOTE: This is the synchronous version that uses hardcoded rates.
 * For CSV-based rates, use getExchangeRateAsync() instead.
 */
export function getExchangeRate(currency: string): number {
  return EXCHANGE_RATES[currency] ?? 1.0
}

/**
 * Get exchange rate for a currency (relative to USD) - Async CSV version
 *
 * @param currency - Currency code
 * @returns Exchange rate or 1.0 if unknown
 *
 * @example
 * const rate = await getExchangeRateAsync("INR")  // 83.12
 * const rate = await getExchangeRateAsync("EUR")  // 0.92
 */
export async function getExchangeRateAsync(currency: string): Promise<number> {
  try {
    return await getExchangeRateFromCSV(currency)
  } catch {
    return EXCHANGE_RATES[currency] ?? 1.0
  }
}

/**
 * Check if currency is supported for conversion
 *
 * @param currency - Currency code
 * @returns true if currency has exchange rate defined
 */
export function isCurrencySupported(currency: string): boolean {
  return currency in EXCHANGE_RATES
}

/**
 * Get all supported currency codes for conversion (Synchronous)
 *
 * NOTE: Returns hardcoded currencies. For CSV-based list, use getSupportedCurrenciesAsync().
 */
export function getSupportedCurrencies(): string[] {
  return Object.keys(EXCHANGE_RATES)
}

/**
 * Get all supported currency codes for conversion (Async CSV version)
 *
 * @returns Array of currency codes
 *
 * @example
 * const currencies = await getSupportedCurrenciesAsync()
 * // ["USD", "EUR", "GBP", "INR", ...]
 */
export async function getSupportedCurrenciesAsync(): Promise<string[]> {
  try {
    const rates = await loadExchangeRates()
    return rates.map((r) => r.currency_code)
  } catch {
    return getSupportedCurrencies()
  }
}

// ============================================
// AUDIT HELPERS
// ============================================

export interface ConversionAudit {
  sourceCurrency: string
  sourcePrice: number
  targetCurrency: string
  convertedPrice: number
  exchangeRateUsed: number
  convertedAt: string
}

/**
 * Convert amount with full audit trail (Synchronous)
 *
 * @param amount - Amount in source currency
 * @param fromCurrency - Source currency code
 * @param toCurrency - Target currency code
 * @returns Conversion result with audit trail
 *
 * @example
 * const result = convertWithAudit(10, "USD", "INR")
 * // {
 * //   sourceCurrency: "USD",
 * //   sourcePrice: 10,
 * //   targetCurrency: "INR",
 * //   convertedPrice: 831.20,
 * //   exchangeRateUsed: 83.12,
 * //   convertedAt: "2025-12-14T10:30:00.000Z"
 * // }
 */
export function convertWithAudit(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): ConversionAudit {
  const convertedPrice = convertCurrency(amount, fromCurrency, toCurrency)
  const exchangeRateUsed =
    getExchangeRate(toCurrency) / getExchangeRate(fromCurrency)

  return {
    sourceCurrency: fromCurrency,
    sourcePrice: amount,
    targetCurrency: toCurrency,
    convertedPrice,
    exchangeRateUsed: Math.round(exchangeRateUsed * 10000) / 10000,
    convertedAt: new Date().toISOString(),
  }
}

/**
 * Convert amount with full audit trail (Async CSV version)
 *
 * @param amount - Amount in source currency
 * @param fromCurrency - Source currency code
 * @param toCurrency - Target currency code
 * @returns Conversion result with audit trail
 *
 * @example
 * const result = await convertWithAuditAsync(10, "USD", "INR")
 * // {
 * //   sourceCurrency: "USD",
 * //   sourcePrice: 10,
 * //   targetCurrency: "INR",
 * //   convertedPrice: 831.20,
 * //   exchangeRateUsed: 83.12,
 * //   convertedAt: "2025-12-14T10:30:00.000Z"
 * // }
 */
export async function convertWithAuditAsync(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<ConversionAudit> {
  const convertedPrice = await convertCurrencyAsync(
    amount,
    fromCurrency,
    toCurrency
  )
  const fromRate = await getExchangeRateAsync(fromCurrency)
  const toRate = await getExchangeRateAsync(toCurrency)
  const exchangeRateUsed = toRate / fromRate

  return {
    sourceCurrency: fromCurrency,
    sourcePrice: amount,
    targetCurrency: toCurrency,
    convertedPrice,
    exchangeRateUsed: Math.round(exchangeRateUsed * 10000) / 10000,
    convertedAt: new Date().toISOString(),
  }
}
