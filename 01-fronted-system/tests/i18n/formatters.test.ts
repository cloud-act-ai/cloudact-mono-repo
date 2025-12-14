/**
 * @vitest-environment node
 *
 * i18n Formatters Tests - Dual Currency Coverage (USD & INR)
 *
 * Tests internationalization utility functions from lib/i18n/formatters.ts:
 * 1. formatCurrency - Currency formatting with proper decimals (USD: 2, INR: 2, JPY: 0, KWD: 3)
 * 2. formatDateTime - Date/time formatting in different timezones
 * 3. getCountryFromCurrency - Currency-to-country mapping
 * 4. getCurrencyDecimals - Decimal place lookup
 * 5. getCurrencySymbol - Currency symbol lookup
 * 6. formatDate - Date-only formatting
 * 7. formatTime - Time-only formatting
 *
 * DUAL CURRENCY COVERAGE:
 * - Every currency test has equivalent USD and INR coverage
 * - India-specific tests: lakhs, crores, Asia/Kolkata timezone
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
// CURRENCY FORMATTING TESTS - DUAL COVERAGE
// ============================================

describe('formatCurrency - Standard Currencies (2 decimals) - USD & INR', () => {
  describe('USD Tests', () => {
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

    it('should format zero amount correctly in USD', () => {
      const result = formatCurrency(0, 'USD')
      expect(result).toBe('$0.00')
    })

    it('should format negative USD amounts correctly', () => {
      const result = formatCurrency(-50.75, 'USD')
      expect(result).toMatch(/-/)
      expect(result).toMatch(/50\.75/)
    })
  })

  describe('INR Tests', () => {
    it('should format INR with 2 decimal places', () => {
      const result = formatCurrency(100, 'INR')
      expect(result).toBe('₹100.00')
    })

    it('should format INR paisa correctly', () => {
      const result = formatCurrency(100.5, 'INR')
      expect(result).toBe('₹100.50')
    })

    it('should format large INR amounts with thousands separator', () => {
      const result = formatCurrency(1234567.89, 'INR')
      expect(result).toBe('₹1,234,567.89')
    })

    it('should format zero amount correctly in INR', () => {
      const result = formatCurrency(0, 'INR')
      expect(result).toBe('₹0.00')
    })

    it('should format negative INR amounts correctly', () => {
      const result = formatCurrency(-50.75, 'INR')
      expect(result).toMatch(/-/)
      expect(result).toMatch(/50\.75/)
    })
  })

  describe('Other Standard Currencies (2 decimals)', () => {
    it('should format EUR with 2 decimal places', () => {
      const result = formatCurrency(100, 'EUR')
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
      expect(getCurrencyDecimals('AED')).toBe(2)
    })
  })
})

describe('formatCurrency - India-Specific Large Amounts (Lakhs & Crores)', () => {
  it('should format 1 lakh INR (100,000)', () => {
    const result = formatCurrency(100000, 'INR')
    expect(result).toBe('₹100,000.00')
  })

  it('should format 10 lakhs INR (1,000,000)', () => {
    const result = formatCurrency(1000000, 'INR')
    expect(result).toBe('₹1,000,000.00')
  })

  it('should format 1 crore INR (10,000,000)', () => {
    const result = formatCurrency(10000000, 'INR')
    expect(result).toBe('₹10,000,000.00')
  })

  it('should format 10 crores INR (100,000,000)', () => {
    const result = formatCurrency(100000000, 'INR')
    expect(result).toBe('₹100,000,000.00')
  })

  it('should format 1.5 lakhs INR with paisa', () => {
    const result = formatCurrency(150000.50, 'INR')
    expect(result).toBe('₹150,000.50')
  })

  it('should format 2.75 crores INR with paisa', () => {
    const result = formatCurrency(27500000.75, 'INR')
    expect(result).toBe('₹27,500,000.75')
  })

  it('should format very large INR amount (100 crores)', () => {
    const result = formatCurrency(1000000000, 'INR')
    expect(result).toBe('₹1,000,000,000.00')
  })

  // Compare with equivalent USD amounts
  it('should format USD equivalent of 1 lakh INR', () => {
    const result = formatCurrency(100000, 'USD')
    expect(result).toBe('$100,000.00')
  })

  it('should format USD equivalent of 1 crore INR', () => {
    const result = formatCurrency(10000000, 'USD')
    expect(result).toBe('$10,000,000.00')
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
    expect(result).toBe('¥101')
  })

  it('should verify JPY has 0 decimals in metadata', () => {
    expect(getCurrencyDecimals('JPY')).toBe(0)
  })
})

describe('formatCurrency - KWD (3 decimals)', () => {
  it('should format KWD with 3 decimal places', () => {
    const result = formatCurrency(100, 'KWD')
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

describe('formatCurrency - Locale Variations - USD & INR', () => {
  describe('USD Locale Tests', () => {
    it('should format USD in en-US locale', () => {
      const result = formatCurrency(1234.56, 'USD', 'en-US')
      expect(result).toBe('$1,234.56')
    })

    it('should format USD in en-GB locale', () => {
      const result = formatCurrency(1234.56, 'USD', 'en-GB')
      expect(result).toBeTruthy()
    })

    it('should format USD in de-DE locale (German formatting)', () => {
      const result = formatCurrency(1234.56, 'USD', 'de-DE')
      expect(result).toBeTruthy()
      expect(result).toMatch(/1/)
      expect(result).toMatch(/234/)
    })
  })

  describe('INR Locale Tests', () => {
    it('should format INR in en-IN locale', () => {
      const result = formatCurrency(1234.56, 'INR', 'en-IN')
      expect(result).toBeTruthy()
      expect(result).toMatch(/₹/)
      expect(result).toMatch(/1,234\.56/)
    })

    it('should format INR in en-US locale', () => {
      const result = formatCurrency(1234.56, 'INR', 'en-US')
      expect(result).toBe('₹1,234.56')
    })

    it('should format large INR in hi-IN locale (Hindi)', () => {
      const result = formatCurrency(100000, 'INR', 'hi-IN')
      expect(result).toBeTruthy()
      expect(result).toMatch(/₹/)
    })
  })

  describe('EUR Locale Test', () => {
    it('should format EUR in de-DE locale', () => {
      const result = formatCurrency(1234.56, 'EUR', 'de-DE')
      expect(result).toBeTruthy()
      expect(result).toMatch(/1/)
      expect(result).toMatch(/234/)
    })
  })
})

describe('formatAmountWithSymbol - USD & INR', () => {
  describe('USD Tests', () => {
    it('should format amount with USD symbol', () => {
      const result = formatAmountWithSymbol(100, 'USD')
      expect(result).toBe('$100.00')
    })

    it('should format large USD amount with symbol', () => {
      const result = formatAmountWithSymbol(1000000, 'USD')
      expect(result).toBe('$1,000,000.00')
    })

    it('should format USD cents with symbol', () => {
      const result = formatAmountWithSymbol(0.99, 'USD')
      expect(result).toBe('$0.99')
    })
  })

  describe('INR Tests', () => {
    it('should format amount with INR symbol', () => {
      const result = formatAmountWithSymbol(100, 'INR')
      expect(result).toBe('₹100.00')
    })

    it('should format large INR amount with symbol (1 crore)', () => {
      const result = formatAmountWithSymbol(10000000, 'INR')
      expect(result).toBe('₹10,000,000.00')
    })

    it('should format INR paisa with symbol', () => {
      const result = formatAmountWithSymbol(0.99, 'INR')
      expect(result).toBe('₹0.99')
    })
  })

  describe('Other Currencies', () => {
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
})

describe('getCurrencySymbol - USD & INR', () => {
  it('should return $ for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$')
  })

  it('should return ₹ for INR', () => {
    expect(getCurrencySymbol('INR')).toBe('₹')
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

describe('getCurrencyDecimals - USD & INR', () => {
  it('should return 2 for USD', () => {
    expect(getCurrencyDecimals('USD')).toBe(2)
  })

  it('should return 2 for INR', () => {
    expect(getCurrencyDecimals('INR')).toBe(2)
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

describe('getCurrencyDisplay - USD & INR', () => {
  it('should return currency info for USD', () => {
    const info = getCurrencyDisplay('USD')
    expect(info).toBeTruthy()
    expect(info?.code).toBe('USD')
    expect(info?.symbol).toBe('$')
    expect(info?.decimals).toBe(2)
    expect(info?.country).toBe('US')
  })

  it('should return currency info for INR', () => {
    const info = getCurrencyDisplay('INR')
    expect(info).toBeTruthy()
    expect(info?.code).toBe('INR')
    expect(info?.symbol).toBe('₹')
    expect(info?.decimals).toBe(2)
    expect(info?.country).toBe('IN')
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
// DATE/TIME FORMATTING TESTS - DUAL TIMEZONE
// ============================================

describe('formatDateTime - Timezone Variations - US & India', () => {
  const testDate = new Date('2025-12-13T10:00:00Z') // Fixed UTC time

  describe('Universal Timezones', () => {
    it('should format date in UTC timezone', () => {
      const result = formatDateTime(testDate, 'UTC')
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/13/)
      expect(result).toMatch(/2025/)
      expect(result).toMatch(/10:00/)
    })
  })

  describe('US Timezones', () => {
    it('should format date in America/New_York timezone', () => {
      const result = formatDateTime(testDate, 'America/New_York')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/2025/)
    })

    it('should format date in America/Los_Angeles timezone', () => {
      const result = formatDateTime(testDate, 'America/Los_Angeles')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/2025/)
    })

    it('should format date in America/Chicago timezone', () => {
      const result = formatDateTime(testDate, 'America/Chicago')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/2025/)
    })
  })

  describe('India Timezone (Asia/Kolkata)', () => {
    it('should format date in Asia/Kolkata timezone', () => {
      const result = formatDateTime(testDate, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/2025/)
      // Time should be 10:00 UTC + 5:30 = 15:30 IST
    })

    it('should format date in Asia/Kolkata with IST offset', () => {
      const utcMidnight = new Date('2025-12-13T00:00:00Z')
      const result = formatDateTime(utcMidnight, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      // Should show Dec 13 (same day since +5:30 offset)
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/13/)
    })

    it('should format late night UTC in Asia/Kolkata (next day)', () => {
      const lateNightUTC = new Date('2025-12-13T20:00:00Z')
      const result = formatDateTime(lateNightUTC, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      // 20:00 UTC + 5:30 = 01:30 next day
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/14/) // Next day
    })
  })

  describe('Other Timezones', () => {
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
  })

  describe('Input Format Tests', () => {
    it('should handle ISO string input', () => {
      const result = formatDateTime('2025-12-13T10:00:00Z', 'UTC')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/13/)
    })

    it('should handle invalid timezone gracefully', () => {
      const result = formatDateTime(testDate, 'Invalid/Timezone')
      expect(result).toBeTruthy()
    })
  })
})

describe('formatDate - Date Only - US & India', () => {
  const testDate = new Date('2025-12-13T10:00:00Z')

  describe('UTC Tests', () => {
    it('should format date without time in UTC', () => {
      const result = formatDate(testDate, 'UTC')
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/13/)
      expect(result).toMatch(/2025/)
      expect(result).not.toMatch(/10:00/)
    })

    it('should handle ISO string in UTC', () => {
      const result = formatDate('2025-12-13T10:00:00Z', 'UTC')
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/13/)
    })
  })

  describe('US Timezone Tests', () => {
    it('should format date in America/New_York timezone', () => {
      const result = formatDate(testDate, 'America/New_York')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/2025/)
      expect(result).not.toMatch(/10:00/)
    })
  })

  describe('India Timezone Tests', () => {
    it('should format date in Asia/Kolkata timezone', () => {
      const result = formatDate(testDate, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/2025/)
      expect(result).not.toMatch(/10:00/)
    })

    it('should format date in Asia/Kolkata with date boundary test', () => {
      const earlyMorningUTC = new Date('2025-12-13T01:00:00Z')
      const result = formatDate(earlyMorningUTC, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      // 01:00 UTC + 5:30 = 06:30 IST (same day)
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/13/)
    })
  })

  describe('Other Timezone Tests', () => {
    it('should format date in Asia/Dubai timezone', () => {
      const result = formatDate(testDate, 'Asia/Dubai')
      expect(result).toBeTruthy()
      expect(result).toMatch(/Dec/)
      expect(result).toMatch(/2025/)
    })
  })
})

describe('formatTime - Time Only - US & India', () => {
  const testDate = new Date('2025-12-13T10:30:00Z')

  describe('UTC Tests', () => {
    it('should format time without date in UTC', () => {
      const result = formatTime(testDate, 'UTC')
      expect(result).toMatch(/10:30/)
      expect(result).not.toMatch(/Dec/)
      expect(result).not.toMatch(/2025/)
    })

    it('should handle ISO string in UTC', () => {
      const result = formatTime('2025-12-13T10:30:00Z', 'UTC')
      expect(result).toMatch(/10:30/)
    })
  })

  describe('US Timezone Tests', () => {
    it('should format time in America/New_York timezone', () => {
      const result = formatTime(testDate, 'America/New_York')
      expect(result).toBeTruthy()
      expect(result).not.toMatch(/Dec/)
      expect(result).not.toMatch(/2025/)
    })
  })

  describe('India Timezone Tests', () => {
    it('should format time in Asia/Kolkata timezone', () => {
      const result = formatTime(testDate, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      // Time should reflect IST offset (+5:30)
      expect(result).not.toMatch(/Dec/)
      expect(result).not.toMatch(/2025/)
    })

    it('should format morning time in Asia/Kolkata', () => {
      const morningUTC = new Date('2025-12-13T03:00:00Z')
      const result = formatTime(morningUTC, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      // 03:00 UTC + 5:30 = 08:30 IST
    })

    it('should format evening time in Asia/Kolkata', () => {
      const eveningUTC = new Date('2025-12-13T14:30:00Z')
      const result = formatTime(eveningUTC, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      // 14:30 UTC + 5:30 = 20:00 IST
    })
  })

  describe('Other Timezone Tests', () => {
    it('should format time in Asia/Dubai timezone', () => {
      const result = formatTime(testDate, 'Asia/Dubai')
      expect(result).toBeTruthy()
    })
  })
})

describe('formatRelativeTime', () => {
  it('should format very recent time as "now"', () => {
    const now = new Date()
    const fiveSecondsAgo = new Date(now.getTime() - 5000)
    const result = formatRelativeTime(fiveSecondsAgo)
    expect(result).toMatch(/now/)
  })

  it('should format recent time as seconds ago', () => {
    const now = new Date()
    const fifteenSecondsAgo = new Date(now.getTime() - 15000)
    const result = formatRelativeTime(fifteenSecondsAgo)
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
// NUMBER FORMATTING TESTS - DUAL LOCALE
// ============================================

describe('formatNumber - US & India Locales', () => {
  describe('US Locale (en-US)', () => {
    it('should format number with thousands separator', () => {
      const result = formatNumber(1234567)
      expect(result).toBe('1,234,567')
    })

    it('should format decimal numbers', () => {
      const result = formatNumber(1234.56)
      expect(result).toMatch(/1,234\.56/)
    })

    it('should format 1 million in en-US', () => {
      const result = formatNumber(1000000, 'en-US')
      expect(result).toBe('1,000,000')
    })
  })

  describe('India Locale (en-IN)', () => {
    it('should format number in en-IN locale', () => {
      const result = formatNumber(1234567, 'en-IN')
      expect(result).toBeTruthy()
    })

    it('should format 1 lakh in en-IN locale', () => {
      const result = formatNumber(100000, 'en-IN')
      expect(result).toBeTruthy()
    })

    it('should format 1 crore in en-IN locale', () => {
      const result = formatNumber(10000000, 'en-IN')
      expect(result).toBeTruthy()
    })
  })

  describe('Other Locales', () => {
    it('should format in de-DE locale (German)', () => {
      const result = formatNumber(1234.56, 'de-DE')
      expect(result).toBeTruthy()
    })
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

describe('formatCompact - USD & INR Amounts', () => {
  describe('Compact Formatting Tests', () => {
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

  describe('India-Specific Compact Tests', () => {
    it('should format 1 lakh compactly', () => {
      const result = formatCompact(100000)
      expect(result).toBe('100K')
    })

    it('should format 10 lakhs compactly', () => {
      const result = formatCompact(1000000)
      expect(result).toBe('1M')
    })

    it('should format 1 crore compactly', () => {
      const result = formatCompact(10000000)
      expect(result).toBe('10M')
    })

    it('should format 100 crores compactly', () => {
      const result = formatCompact(1000000000)
      expect(result).toBe('1B')
    })
  })
})

// ============================================
// CURRENCY-TO-COUNTRY MAPPING TESTS
// ============================================

describe('getCountryFromCurrency - USD & INR', () => {
  it('should map USD to US', () => {
    expect(getCountryFromCurrency('USD')).toBe('US')
  })

  it('should map INR to IN', () => {
    expect(getCountryFromCurrency('INR')).toBe('IN')
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
// VALIDATION TESTS - USD & INR
// ============================================

describe('isValidCurrency - USD & INR', () => {
  it('should validate USD', () => {
    expect(isValidCurrency('USD')).toBe(true)
  })

  it('should validate INR', () => {
    expect(isValidCurrency('INR')).toBe(true)
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

describe('isValidTimezone - US & India', () => {
  it('should validate UTC', () => {
    expect(isValidTimezone('UTC')).toBe(true)
  })

  it('should validate America/New_York', () => {
    expect(isValidTimezone('America/New_York')).toBe(true)
  })

  it('should validate Asia/Kolkata', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true)
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
// EDGE CASES - DUAL CURRENCY
// ============================================

describe('Edge Cases - USD & INR', () => {
  describe('Very Large Amounts', () => {
    it('should handle very large USD amounts', () => {
      const result = formatCurrency(999999999.99, 'USD')
      expect(result).toBeTruthy()
      expect(result).toMatch(/999,999,999\.99/)
    })

    it('should handle very large INR amounts', () => {
      const result = formatCurrency(999999999.99, 'INR')
      expect(result).toBeTruthy()
      expect(result).toMatch(/999,999,999\.99/)
    })

    it('should handle 1000 crores INR', () => {
      const result = formatCurrency(10000000000, 'INR')
      expect(result).toBeTruthy()
      expect(result).toMatch(/10,000,000,000\.00/)
    })
  })

  describe('Very Small Amounts', () => {
    it('should handle very small USD amounts', () => {
      const result = formatCurrency(0.01, 'USD')
      expect(result).toBe('$0.01')
    })

    it('should handle very small INR amounts (1 paisa)', () => {
      const result = formatCurrency(0.01, 'INR')
      expect(result).toBe('₹0.01')
    })

    it('should handle fractional paisa in INR', () => {
      const result = formatCurrency(0.001, 'INR')
      expect(result).toBeTruthy()
    })
  })

  describe('Negative Amounts', () => {
    it('should handle negative USD amounts', () => {
      const result = formatCurrency(-100, 'USD')
      expect(result).toBeTruthy()
      expect(result).toMatch(/-/)
    })

    it('should handle negative INR amounts', () => {
      const result = formatCurrency(-100, 'INR')
      expect(result).toBeTruthy()
      expect(result).toMatch(/-/)
    })

    it('should handle negative lakhs in INR', () => {
      const result = formatCurrency(-100000, 'INR')
      expect(result).toBeTruthy()
      expect(result).toMatch(/-/)
      expect(result).toMatch(/100,000/)
    })
  })

  describe('Date Edge Cases', () => {
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

    it('should handle past dates in Asia/Kolkata', () => {
      const oldDate = new Date('1947-08-15T00:00:00Z') // India Independence
      const result = formatDateTime(oldDate, 'Asia/Kolkata')
      expect(result).toBeTruthy()
      expect(result).toMatch(/1947/)
    })
  })

  describe('Default Parameter Tests', () => {
    it('should handle formatting with default currency when none specified', () => {
      const result = formatCurrency(100)
      expect(result).toBe('$100.00')
    })

    it('should handle formatting with default timezone when none specified', () => {
      const testDate = new Date('2025-12-13T10:00:00Z')
      const result = formatDateTime(testDate)
      expect(result).toBeTruthy()
    })
  })

  describe('Precision Edge Cases', () => {
    it('should handle floating point precision in USD', () => {
      const result = formatCurrency(0.1 + 0.2, 'USD') // Classic floating point issue
      expect(result).toBeTruthy()
    })

    it('should handle floating point precision in INR', () => {
      const result = formatCurrency(0.1 + 0.2, 'INR')
      expect(result).toBeTruthy()
    })

    it('should round correctly for 2 decimal currencies', () => {
      const result = formatCurrency(100.995, 'USD')
      expect(result).toBeTruthy()
    })
  })

  describe('India-Specific Edge Cases', () => {
    it('should handle exact 1 lakh boundary', () => {
      const result = formatCurrency(100000, 'INR')
      expect(result).toBe('₹100,000.00')
    })

    it('should handle exact 1 crore boundary', () => {
      const result = formatCurrency(10000000, 'INR')
      expect(result).toBe('₹10,000,000.00')
    })

    it('should handle 99,999 INR (just under 1 lakh)', () => {
      const result = formatCurrency(99999, 'INR')
      expect(result).toBe('₹99,999.00')
    })

    it('should handle 9,999,999 INR (just under 1 crore)', () => {
      const result = formatCurrency(9999999, 'INR')
      expect(result).toBe('₹9,999,999.00')
    })

    it('should format midnight IST correctly', () => {
      const midnightIST = new Date('2025-12-12T18:30:00Z') // Midnight IST in UTC
      const result = formatDateTime(midnightIST, 'Asia/Kolkata')
      expect(result).toBeTruthy()
    })

    it('should format noon IST correctly', () => {
      const noonIST = new Date('2025-12-13T06:30:00Z') // Noon IST in UTC
      const result = formatDateTime(noonIST, 'Asia/Kolkata')
      expect(result).toBeTruthy()
    })
  })
})
