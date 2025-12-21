/**
 * Internationalization (i18n) Module
 *
 * Exports all i18n constants and formatters for org-level locale settings.
 *
 * Usage:
 * ```typescript
 * import { SUPPORTED_CURRENCIES, formatCurrency } from "@/lib/i18n"
 *
 * // Get org currency from context/settings
 * const orgCurrency = "AED"
 *
 * // Format costs in org's currency
 * formatCurrency(100, orgCurrency) // "100.00 د.إ"
 * ```
 */

// Constants
export {
  // Currency
  SUPPORTED_CURRENCIES,
  CURRENCY_CODES,
  CURRENCY_BY_CODE,
  CURRENCY_TO_COUNTRY,
  DEFAULT_CURRENCY,
  type CurrencyInfo,
  // Timezone
  SUPPORTED_TIMEZONES,
  TIMEZONE_VALUES,
  TIMEZONE_BY_VALUE,
  DEFAULT_TIMEZONE,
  type TimezoneInfo,
  // Language
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  type LanguageInfo,
  // Country
  SUPPORTED_COUNTRIES,
  COUNTRY_CODES,
  COUNTRY_BY_CODE,
  DEFAULT_COUNTRY,
  type CountryInfo,
  // Helpers
  getCountryFromCurrency,
  getCurrencyInfo,
  getTimezoneInfo,
  getLanguageInfo,
  getCountryInfo,
  isValidCurrency,
  isValidTimezone,
  isValidCountry,
  isValidLanguage,
} from "./constants"

// Formatters
export {
  // Currency
  formatCurrency,
  formatAmountWithSymbol,
  getCurrencySymbol,
  getCurrencyDecimals,
  getCurrencyDisplay,
  // Date/Time
  formatDateTime,
  formatDate,
  formatDateOnly,
  formatTime,
  formatRelativeTime,
  // Numbers
  formatNumber,
  formatPercent,
  formatCompact,
} from "./formatters"

// Currency Conversion
export {
  EXCHANGE_RATES,
  convertCurrency,
  convertFromUSD,
  convertToUSD,
  getExchangeRate,
  isCurrencySupported,
  getSupportedCurrencies,
  convertWithAudit,
  type ConversionAudit,
} from "../currency/exchange-rates"
