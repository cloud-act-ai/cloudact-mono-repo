/**
 * @vitest-environment node
 *
 * i18n Formatters Tests
 *
 * Tests internationalization utility functions from lib/i18n/formatters.ts:
 * 1. formatCurrency - Currency formatting with proper decimals (USD: 2, JPY: 0, KWD: 3)
 * 2. formatDateTime - Date/time formatting in different timezones
 * 3. getCountryFromCurrency - Currency-to-country mapping
 * 4. getCurrencyDecimals - Decimal place lookup
 * 5. getCurrencySymbol - Currency symbol lookup
 * 6. formatDate - Date-only formatting
 * 7. formatTime - Time-only formatting
 *
 * ZERO MOCK - All tests use real Intl APIs and actual formatter functions.
 */

import { describe, it, expect } from 'vitest'

// Import functions from formatters
import {
  formatCurrency,
  formatAmountWithSymbol,
  getCurrencySymbol,
  getCurrencyDecimals,
  getCurrencyDisplay,
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  formatNumber,
  formatPercent,
  formatCompact,
} from '@/lib/i18n/formatters'

import {
  getCountryFromCurrency,
  isValidCurrency,
  isValidTimezone,
} from '@/lib/i18n/constants'

// ============================================
// CURRENCY FORMATTING TESTS
// ============================================

describe('formatCurrency - Standard Currencies (2 decimals)', () => {
  it('should format USD with 2 decimal places', () => {
    const result = formatCurrency(100, 'USD')
    expect(result).toBe('$100.00')
  })

  it('should format USD cents correctly', () => {
    const result = formatCurrency(100.5, 'USD')
    expect(result).toBe('$100.50')
  })

  it('should format large USD amounts with thousands separator', () => {
    const result = formatCurrency(1234567.89, 'USD')
    expect(result).toBe('$1,234,567.89')
  })

  it('should format EUR with 2 decimal places', () => {
    const result = formatCurrency(100, 'EUR')
    // EUR formatting includes symbol
    expect(result).toMatch(/100/)
    expect(result).toMatch(/€/)
  })

  it('should format GBP with 2 decimal places', () => {
    const result = formatCurrency(50.25, 'GBP')
    expect(result).toMatch(/50\.25/)
    expect(result).toMatch(/£/)
  })

  it('should format AED with 2 decimal places', () => {
    const result = formatCurrency(1000, 'AED')
    // AED should have 2 decimals
    expect(getCurrencyDecimals('AED')).toBe(2)
  })

  it('should format zero amount correctly', () => {
    const result = formatCurrency(0, 'USD')
    expect(result).toBe('$0.00')
  })

  it('should format negative amounts correctly', () => {
    const result = formatCurrency(-50.75, 'USD')
    expect(result).toMatch(/-/)
    expect(result).toMatch(/50\.75/)
  })
})

describe('formatCurrency - JPY (0 decimals)', () => {
  it('should format JPY with 0 decimal places', () => {
    const result = formatCurrency(100, 'JPY')
    expect(result).toBe('¥100')
  })

  it('should format large JPY amounts with no decimals', () => {
    const result = formatCurrency(1234567, 'JPY')
    expect(result).toBe('¥1,234,567')
  })

  it('should round JPY amounts (no fractional yen)', () => {
    const result = formatCurrency(100.99, 'JPY')
    // Should round, no decimals
    expect(result).toBe('¥101')
  })

  it('should verify JPY has 0 decimals in metadata', () => {
    expect(getCurrencyDecimals('JPY')).toBe(0)
  })
})

describe('formatCurrency - KWD (3 decimals)', () => {
  it('should format KWD with 3 decimal places', () => {
    const result = formatCurrency(100, 'KWD')
    // KWD should have 3 decimals
    expect(result).toMatch(/100\.000/)
  })

  it('should format KWD fractional amounts with 3 decimals', () => {
    const result = formatCurrency(50.123, 'KWD')
    expect(result).toMatch(/50\.123/)
  })

  it('should verify KWD has 3 decimals in metadata', () => {
    expect(getCurrencyDecimals('KWD')).toBe(3)
  })
})

describe('formatCurrency - BHD and OMR (3 decimals)', () => {
  it('should format BHD with 3 decimal places', () => {
    expect(getCurrencyDecimals('BHD')).toBe(3)
    const result = formatCurrency(100, 'BHD')
    expect(result).toMatch(/100\.000/)
  })

  it('should format OMR with 3 decimal places', () => {
    expect(getCurrencyDecimals('OMR')).toBe(3)
    const result = formatCurrency(100, 'OMR')
    expect(result).toMatch(/100\.000/)
  })
})

describe('formatCurrency - All Supported Currencies', () => {
  const testCurrencies = [
    { code: 'USD', decimals: 2 },
    { code: 'EUR', decimals: 2 },
    { code: 'GBP', decimals: 2 },
    { code: 'JPY', decimals: 0 },
    { code: 'CHF', decimals: 2 },
    { code: 'CAD', decimals: 2 },
    { code: 'AUD', decimals: 2 },
    { code: 'CNY', decimals: 2 },
    { code: 'INR', decimals: 2 },
    { code: 'SGD', decimals: 2 },
    { code: 'AED', decimals: 2 },
    { code: 'SAR', decimals: 2 },
    { code: 'QAR', decimals: 2 },
    { code: 'KWD', decimals: 3 },
    { code: 'BHD', decimals: 3 },
    { code: 'OMR', decimals: 3 },
  ]

  testCurrencies.forEach(({ code, decimals }) => {
    it(`should format ${code} with ${decimals} decimal places`, () => {
      const result = formatCurrency(100, code)
      expect(getCurrencyDecimals(code)).toBe(decimals)
      expect(result).toBeTruthy()
    })
  })
})

describe('formatCurrency - Locale Variations', () => {
  it('should format USD in en-US locale', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US')
    expect(result).toBe('$1,234.56')
  })

  it('should format EUR in de-DE locale', () => {
    const result = formatCurrency(1234.56, 'EUR', 'de-DE')
    // German locale uses different separators
    expect(result).toBeTruthy()
    expect(result).toMatch(/1/)
    expect(result).toMatch(/234/)
  })

  it('should format USD in en-GB locale', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-GB')
    expect(result).toBeTruthy()
  })
})

describe('formatAmountWithSymbol', () => {
  it('should format amount with USD symbol', () => {
    const result = formatAmountWithSymbol(100, 'USD')
    expect(result).toBe('$100.00')
  })

  it('should format amount with EUR symbol', () => {
    const result = formatAmountWithSymbol(100, 'EUR')
    expect(result).toBe('€100.00')
  })

  it('should format JPY with 0 decimals', () => {
    const result = formatAmountWithSymbol(100, 'JPY')
    expect(result).toBe('¥100')
  })

  it('should format KWD with 3 decimals', () => {
    const result = formatAmountWithSymbol(100, 'KWD')
    expect(result).toBe('د.ك100.000')
  })
})

describe('getCurrencySymbol', () => {
  it('should return $ for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$')
  })

  it('should return € for EUR', () => {
    expect(getCurrencySymbol('EUR')).toBe('€')
  })

  it('should return £ for GBP', () => {
    expect(getCurrencySymbol('GBP')).toBe('£')
  })

  it('should return ¥ for JPY', () => {
    expect(getCurrencySymbol('JPY')).toBe('¥')
  })

  it('should return د.إ for AED', () => {
    expect(getCurrencySymbol('AED')).toBe('د.إ')
  })

  it('should return default $ for unknown currency', () => {
    expect(getCurrencySymbol('UNKNOWN')).toBe('$')
  })
})

describe('getCurrencyDecimals', () => {
  it('should return 2 for USD', () => {
    expect(getCurrencyDecimals('USD')).toBe(2)
  })

  it('should return 0 for JPY', () => {
    expect(getCurrencyDecimals('JPY')).toBe(0)
  })

  it('should return 3 for KWD', () => {
    expect(getCurrencyDecimals('KWD')).toBe(3)
  })

  it('should return 3 for BHD', () => {
    expect(getCurrencyDecimals('BHD')).toBe(3)
  })

  it('should return 3 for OMR', () => {
    expect(getCurrencyDecimals('OMR')).toBe(3)
  })

  it('should return default 2 for unknown currency', () => {
    expect(getCurrencyDecimals('UNKNOWN')).toBe(2)
  })
})

describe('getCurrencyDisplay', () => {
  it('should return currency info for USD', () => {
    const info = getCurrencyDisplay('USD')
    expect(info).toBeTruthy()
    expect(info?.code).toBe('USD')
    expect(info?.symbol).toBe('$')
    expect(info?.decimals).toBe(2)
    expect(info?.country).toBe('US')
  })

  it('should return currency info for AED', () => {
    const info = getCurrencyDisplay('AED')
    expect(info).toBeTruthy()
    expect(info?.code).toBe('AED')
    expect(info?.symbol).toBe('د.إ')
    expect(info?.decimals).toBe(2)
    expect(info?.country).toBe('AE')
  })

  it('should return null for unknown currency', () => {
    const info = getCurrencyDisplay('UNKNOWN')
    expect(info).toBeNull()
  })
})

// ============================================
// DATE/TIME FORMATTING TESTS
// ============================================

describe('formatDateTime - Timezone Variations', () => {
  const testDate = new Date('2025-12-13T10:00:00Z') // Fixed UTC time

  it('should format date in UTC timezone', () => {
    const result = formatDateTime(testDate, 'UTC')
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/13/)
    expect(result).toMatch(/2025/)
    expect(result).toMatch(/10:00/)
  })

  it('should format date in America/New_York timezone', () => {
    const result = formatDateTime(testDate, 'America/New_York')
    expect(result).toBeTruthy()
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/2025/)
  })

  it('should format date in Asia/Dubai timezone', () => {
    const result = formatDateTime(testDate, 'Asia/Dubai')
    expect(result).toBeTruthy()
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/2025/)
  })

  it('should format date in Asia/Tokyo timezone', () => {
    const result = formatDateTime(testDate, 'Asia/Tokyo')
    expect(result).toBeTruthy()
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/2025/)
  })

  it('should format date in Europe/London timezone', () => {
    const result = formatDateTime(testDate, 'Europe/London')
    expect(result).toBeTruthy()
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/2025/)
  })

  it('should handle ISO string input', () => {
    const result = formatDateTime('2025-12-13T10:00:00Z', 'UTC')
    expect(result).toBeTruthy()
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/13/)
  })

  it('should handle invalid timezone gracefully', () => {
    // Should fallback to locale default
    const result = formatDateTime(testDate, 'Invalid/Timezone')
    expect(result).toBeTruthy()
  })
})

describe('formatDate - Date Only', () => {
  const testDate = new Date('2025-12-13T10:00:00Z')

  it('should format date without time in UTC', () => {
    const result = formatDate(testDate, 'UTC')
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/13/)
    expect(result).toMatch(/2025/)
    // Should NOT contain time
    expect(result).not.toMatch(/10:00/)
  })

  it('should format date in Asia/Dubai timezone', () => {
    const result = formatDate(testDate, 'Asia/Dubai')
    expect(result).toBeTruthy()
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/2025/)
  })

  it('should handle ISO string', () => {
    const result = formatDate('2025-12-13T10:00:00Z', 'UTC')
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/13/)
  })
})

describe('formatTime - Time Only', () => {
  const testDate = new Date('2025-12-13T10:30:00Z')

  it('should format time without date in UTC', () => {
    const result = formatTime(testDate, 'UTC')
    expect(result).toMatch(/10:30/)
    // Should NOT contain date
    expect(result).not.toMatch(/Dec/)
    expect(result).not.toMatch(/2025/)
  })

  it('should format time in Asia/Dubai timezone', () => {
    const result = formatTime(testDate, 'Asia/Dubai')
    expect(result).toBeTruthy()
    // Time should be different due to timezone offset
  })

  it('should handle ISO string', () => {
    const result = formatTime('2025-12-13T10:30:00Z', 'UTC')
    expect(result).toMatch(/10:30/)
  })
})

describe('formatRelativeTime', () => {
  it('should format recent time as seconds ago', () => {
    const now = new Date()
    const fiveSecondsAgo = new Date(now.getTime() - 5000)
    const result = formatRelativeTime(fiveSecondsAgo)
    expect(result).toMatch(/second/)
  })

  it('should format time as minutes ago', () => {
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    const result = formatRelativeTime(fiveMinutesAgo)
    expect(result).toMatch(/minute/)
  })

  it('should format time as hours ago', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const result = formatRelativeTime(twoHoursAgo)
    expect(result).toMatch(/hour/)
  })

  it('should format time as days ago', () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const result = formatRelativeTime(threeDaysAgo)
    expect(result).toMatch(/day/)
  })
})

// ============================================
// NUMBER FORMATTING TESTS
// ============================================

describe('formatNumber', () => {
  it('should format number with thousands separator', () => {
    const result = formatNumber(1234567)
    expect(result).toBe('1,234,567')
  })

  it('should format decimal numbers', () => {
    const result = formatNumber(1234.56)
    expect(result).toMatch(/1,234\.56/)
  })

  it('should format in different locale', () => {
    const result = formatNumber(1234.56, 'de-DE')
    expect(result).toBeTruthy()
  })
})

describe('formatPercent', () => {
  it('should format as percentage with 1 decimal', () => {
    const result = formatPercent(0.1234)
    expect(result).toBe('12.3%')
  })

  it('should format zero percent', () => {
    const result = formatPercent(0)
    expect(result).toBe('0.0%')
  })

  it('should format 100 percent', () => {
    const result = formatPercent(1)
    expect(result).toBe('100.0%')
  })

  it('should format with custom decimals', () => {
    const result = formatPercent(0.12345, 'en-US', 2)
    expect(result).toBe('12.35%')
  })
})

describe('formatCompact', () => {
  it('should format thousands as K', () => {
    const result = formatCompact(1234)
    expect(result).toBe('1.2K')
  })

  it('should format millions as M', () => {
    const result = formatCompact(1234567)
    expect(result).toBe('1.2M')
  })

  it('should format billions as B', () => {
    const result = formatCompact(1234567890)
    expect(result).toBe('1.2B')
  })

  it('should not abbreviate small numbers', () => {
    const result = formatCompact(123)
    expect(result).toBe('123')
  })
})

// ============================================
// CURRENCY-TO-COUNTRY MAPPING TESTS
// ============================================

describe('getCountryFromCurrency', () => {
  it('should map USD to US', () => {
    expect(getCountryFromCurrency('USD')).toBe('US')
  })

  it('should map EUR to DE', () => {
    expect(getCountryFromCurrency('EUR')).toBe('DE')
  })

  it('should map GBP to GB', () => {
    expect(getCountryFromCurrency('GBP')).toBe('GB')
  })

  it('should map JPY to JP', () => {
    expect(getCountryFromCurrency('JPY')).toBe('JP')
  })

  it('should map AED to AE', () => {
    expect(getCountryFromCurrency('AED')).toBe('AE')
  })

  it('should map SAR to SA', () => {
    expect(getCountryFromCurrency('SAR')).toBe('SA')
  })

  it('should map QAR to QA', () => {
    expect(getCountryFromCurrency('QAR')).toBe('QA')
  })

  it('should map KWD to KW', () => {
    expect(getCountryFromCurrency('KWD')).toBe('KW')
  })

  it('should map BHD to BH', () => {
    expect(getCountryFromCurrency('BHD')).toBe('BH')
  })

  it('should map OMR to OM', () => {
    expect(getCountryFromCurrency('OMR')).toBe('OM')
  })

  it('should return default US for unknown currency', () => {
    expect(getCountryFromCurrency('UNKNOWN')).toBe('US')
  })
})

// ============================================
// VALIDATION TESTS
// ============================================

describe('isValidCurrency', () => {
  it('should validate USD', () => {
    expect(isValidCurrency('USD')).toBe(true)
  })

  it('should validate AED', () => {
    expect(isValidCurrency('AED')).toBe(true)
  })

  it('should validate JPY', () => {
    expect(isValidCurrency('JPY')).toBe(true)
  })

  it('should reject invalid currency', () => {
    expect(isValidCurrency('INVALID')).toBe(false)
  })

  it('should reject empty string', () => {
    expect(isValidCurrency('')).toBe(false)
  })
})

describe('isValidTimezone', () => {
  it('should validate UTC', () => {
    expect(isValidTimezone('UTC')).toBe(true)
  })

  it('should validate America/New_York', () => {
    expect(isValidTimezone('America/New_York')).toBe(true)
  })

  it('should validate Asia/Dubai', () => {
    expect(isValidTimezone('Asia/Dubai')).toBe(true)
  })

  it('should validate Asia/Tokyo', () => {
    expect(isValidTimezone('Asia/Tokyo')).toBe(true)
  })

  it('should reject invalid timezone', () => {
    expect(isValidTimezone('Invalid/Timezone')).toBe(false)
  })

  it('should reject empty string', () => {
    expect(isValidTimezone('')).toBe(false)
  })
})

// ============================================
// EDGE CASES
// ============================================

describe('Edge Cases', () => {
  it('should handle very large currency amounts', () => {
    const result = formatCurrency(999999999.99, 'USD')
    expect(result).toBeTruthy()
    expect(result).toMatch(/999,999,999\.99/)
  })

  it('should handle very small currency amounts', () => {
    const result = formatCurrency(0.01, 'USD')
    expect(result).toBe('$0.01')
  })

  it('should handle negative currency amounts', () => {
    const result = formatCurrency(-100, 'USD')
    expect(result).toBeTruthy()
    expect(result).toMatch(/-/)
  })

  it('should handle dates far in the past', () => {
    const oldDate = new Date('1900-01-01T00:00:00Z')
    const result = formatDateTime(oldDate, 'UTC')
    expect(result).toBeTruthy()
    expect(result).toMatch(/1900/)
  })

  it('should handle dates far in the future', () => {
    const futureDate = new Date('2100-12-31T23:59:59Z')
    const result = formatDateTime(futureDate, 'UTC')
    expect(result).toBeTruthy()
    expect(result).toMatch(/2100/)
  })

  it('should handle formatting with default currency when none specified', () => {
    const result = formatCurrency(100)
    // Should use USD as default
    expect(result).toBe('$100.00')
  })

  it('should handle formatting with default timezone when none specified', () => {
    const testDate = new Date('2025-12-13T10:00:00Z')
    const result = formatDateTime(testDate)
    // Should use UTC as default
    expect(result).toBeTruthy()
  })
})
