/**
 * Internationalization Constants
 *
 * Org-level multi-tenant attributes for currency, timezone, country, language.
 * These are foundational settings like org_slug - set at signup, propagated everywhere.
 *
 * Standards:
 * - Currency: ISO 4217
 * - Country: ISO 3166-1 alpha-2
 * - Language: BCP 47
 * - Timezone: IANA
 */

// ============================================
// CURRENCIES (ISO 4217) - 16 supported
// ============================================

export interface CurrencyInfo {
  code: string
  symbol: string
  name: string
  decimals: number
  country: string // Default country for this currency
}

export const SUPPORTED_CURRENCIES: readonly CurrencyInfo[] = [
  // Major 10
  { code: "USD", symbol: "$", name: "US Dollar", decimals: 2, country: "US" },
  { code: "EUR", symbol: "€", name: "Euro", decimals: 2, country: "DE" },
  { code: "GBP", symbol: "£", name: "British Pound", decimals: 2, country: "GB" },
  { code: "JPY", symbol: "JP¥", name: "Japanese Yen", decimals: 0, country: "JP" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc", decimals: 2, country: "CH" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", decimals: 2, country: "CA" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", decimals: 2, country: "AU" },
  { code: "CNY", symbol: "CN¥", name: "Chinese Yuan", decimals: 2, country: "CN" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", decimals: 2, country: "IN" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", decimals: 2, country: "SG" },
  // Arab Countries (6)
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", decimals: 2, country: "AE" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal", decimals: 2, country: "SA" },
  { code: "QAR", symbol: "ر.ق", name: "Qatari Riyal", decimals: 2, country: "QA" },
  { code: "KWD", symbol: "د.ك", name: "Kuwaiti Dinar", decimals: 3, country: "KW" },
  { code: "BHD", symbol: "د.ب", name: "Bahraini Dinar", decimals: 3, country: "BH" },
  { code: "OMR", symbol: "ر.ع", name: "Omani Rial", decimals: 3, country: "OM" },
] as const

// Quick lookup maps
export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(c => c.code)
export const CURRENCY_BY_CODE = Object.fromEntries(
  SUPPORTED_CURRENCIES.map(c => [c.code, c])
) as Record<string, CurrencyInfo>

// Currency to country mapping (for auto-inference)
export const CURRENCY_TO_COUNTRY = Object.fromEntries(
  SUPPORTED_CURRENCIES.map(c => [c.code, c.country])
) as Record<string, string>

// ============================================
// TIMEZONES (IANA) - 15 supported
// NOTE: Offsets shown are standard time only (not DST-adjusted).
// For accurate current offsets, use Intl.DateTimeFormat dynamically.
// ============================================

export interface TimezoneInfo {
  value: string
  label: string
  offset: string // Standard time offset (not DST-adjusted)
}

export const SUPPORTED_TIMEZONES: readonly TimezoneInfo[] = [
  { value: "UTC", label: "UTC", offset: "+00:00" },
  { value: "America/New_York", label: "Eastern Time (ET)", offset: "-05:00" },
  { value: "America/Chicago", label: "Central Time (CT)", offset: "-06:00" },
  { value: "America/Denver", label: "Mountain Time (MT)", offset: "-07:00" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", offset: "-08:00" },
  { value: "Europe/London", label: "London (GMT/BST)", offset: "+00:00" },
  { value: "Europe/Paris", label: "Paris (CET)", offset: "+01:00" },
  { value: "Europe/Berlin", label: "Berlin (CET)", offset: "+01:00" },
  { value: "Asia/Dubai", label: "Dubai (GST)", offset: "+04:00" },
  { value: "Asia/Riyadh", label: "Riyadh (AST)", offset: "+03:00" },
  { value: "Asia/Kolkata", label: "India (IST)", offset: "+05:30" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", offset: "+08:00" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", offset: "+09:00" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)", offset: "+08:00" },
  { value: "Australia/Sydney", label: "Sydney (AEST)", offset: "+10:00" },
] as const

export const TIMEZONE_VALUES = SUPPORTED_TIMEZONES.map(tz => tz.value)
export const TIMEZONE_BY_VALUE = Object.fromEntries(
  SUPPORTED_TIMEZONES.map(tz => [tz.value, tz])
) as Record<string, TimezoneInfo>

// ============================================
// LANGUAGES (BCP 47) - 10 supported
// Currently only English is active, others for future
// ============================================

export interface LanguageInfo {
  code: string
  name: string
  nativeName: string
  rtl?: boolean // Right-to-left
}

export const SUPPORTED_LANGUAGES: readonly LanguageInfo[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
] as const

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(l => l.code)

// ============================================
// FISCAL YEAR START - Month when fiscal year begins
// ============================================

export interface FiscalYearInfo {
  month: number // 1-12
  label: string
  countries: string[] // Countries that typically use this fiscal year start
}

export const FISCAL_YEAR_OPTIONS: readonly FiscalYearInfo[] = [
  { month: 1, label: "January (Calendar Year)", countries: ["US", "CN", "AE", "SA", "QA", "KW", "BH", "OM", "SG", "CH", "DE", "FR"] },
  { month: 4, label: "April (Apr-Mar)", countries: ["IN", "JP", "GB", "CA"] },
  { month: 7, label: "July (Jul-Jun)", countries: ["AU"] },
  { month: 10, label: "October (Oct-Sep)", countries: [] }, // US Federal Government
] as const

// Timezone to default fiscal year start month mapping
export const TIMEZONE_TO_FISCAL_YEAR: Record<string, number> = {
  // US - January (Calendar Year)
  "America/New_York": 1,
  "America/Chicago": 1,
  "America/Denver": 1,
  "America/Los_Angeles": 1,
  // Europe - January (Calendar Year)
  "Europe/London": 4, // UK uses April
  "Europe/Paris": 1,
  "Europe/Berlin": 1,
  // Middle East - January (Calendar Year)
  "Asia/Dubai": 1,
  "Asia/Riyadh": 1,
  // Asia
  "Asia/Kolkata": 4, // India: April
  "Asia/Tokyo": 4, // Japan: April
  "Asia/Singapore": 1,
  "Asia/Shanghai": 1,
  // Australia - July
  "Australia/Sydney": 7,
  // Default
  "UTC": 1,
}

// Country to fiscal year start month mapping (more specific)
export const COUNTRY_TO_FISCAL_YEAR: Record<string, number> = {
  US: 1,
  GB: 4, // UK: April 6, simplified to April
  DE: 1,
  FR: 1,
  JP: 4, // Japan: April
  CA: 4, // Canada: April (federal)
  AU: 7, // Australia: July
  CN: 1,
  IN: 4, // India: April
  SG: 1,
  CH: 1,
  AE: 1,
  SA: 1,
  QA: 1,
  KW: 1,
  BH: 1,
  OM: 1,
  EG: 7, // Egypt: July
  JO: 1,
  LB: 1,
}

export const FISCAL_YEAR_MONTHS = FISCAL_YEAR_OPTIONS.map(f => f.month)

/**
 * Get default fiscal year start month from timezone
 */
export function getFiscalYearFromTimezone(timezone: string): number {
  return TIMEZONE_TO_FISCAL_YEAR[timezone] || 1
}

/**
 * Get default fiscal year start month from country
 */
export function getFiscalYearFromCountry(country: string): number {
  return COUNTRY_TO_FISCAL_YEAR[country] || 1
}

/**
 * Get fiscal year info by month
 */
export function getFiscalYearInfo(month: number): FiscalYearInfo | undefined {
  return FISCAL_YEAR_OPTIONS.find(f => f.month === month)
}

/**
 * Check if fiscal year month is valid
 */
export function isValidFiscalYear(month: number): boolean {
  return FISCAL_YEAR_MONTHS.includes(month)
}

// ============================================
// COUNTRIES (ISO 3166-1 alpha-2)
// Subset of common countries, can be expanded
// ============================================

export interface CountryInfo {
  code: string
  name: string
}

export const SUPPORTED_COUNTRIES: readonly CountryInfo[] = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "JP", name: "Japan" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "CH", name: "Switzerland" },
  // Arab Countries
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
  { code: "EG", name: "Egypt" },
  { code: "JO", name: "Jordan" },
  { code: "LB", name: "Lebanon" },
] as const

export const COUNTRY_CODES = SUPPORTED_COUNTRIES.map(c => c.code)
export const COUNTRY_BY_CODE = Object.fromEntries(
  SUPPORTED_COUNTRIES.map(c => [c.code, c])
) as Record<string, CountryInfo>

// ============================================
// DEFAULTS
// ============================================

export const DEFAULT_CURRENCY = "USD"
export const DEFAULT_TIMEZONE = "UTC"
export const DEFAULT_LANGUAGE = "en"
export const DEFAULT_COUNTRY = "US"
export const DEFAULT_FISCAL_YEAR_START = 1 // January (Calendar Year)

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get country code from currency code
 * e.g., "AED" → "AE", "USD" → "US"
 */
export function getCountryFromCurrency(currencyCode: string): string {
  return CURRENCY_TO_COUNTRY[currencyCode] || DEFAULT_COUNTRY
}

/**
 * Get currency info by code
 */
export function getCurrencyInfo(code: string): CurrencyInfo | undefined {
  return CURRENCY_BY_CODE[code]
}

/**
 * Get timezone info by value
 */
export function getTimezoneInfo(value: string): TimezoneInfo | undefined {
  return TIMEZONE_BY_VALUE[value]
}

/**
 * Check if currency code is valid
 */
export function isValidCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code)
}

/**
 * Check if timezone is valid
 */
export function isValidTimezone(value: string): boolean {
  return TIMEZONE_VALUES.includes(value)
}

/**
 * Check if country code is valid
 */
export function isValidCountry(code: string): boolean {
  return COUNTRY_CODES.includes(code)
}

/**
 * Check if language code is valid
 */
export function isValidLanguage(code: string): boolean {
  return LANGUAGE_CODES.includes(code)
}

/**
 * Get language info by code
 */
export function getLanguageInfo(code: string): LanguageInfo | undefined {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)
}

/**
 * Get country info by code
 */
export function getCountryInfo(code: string): CountryInfo | undefined {
  return COUNTRY_BY_CODE[code]
}
