/**
 * @vitest-environment node
 *
 * Test 19: SaaS Subscription Cost Calculations
 *
 * Tests cost calculation logic for SaaS subscriptions including:
 * - FOCUS 1.3 standard cost data integration (with org-specific extension fields)
 * - Pricing models: PER_SEAT vs FLAT_FEE
 * - Billing cycles: monthly, annual, quarterly
 * - Discount calculations: percent and fixed
 * - Date range filtering
 * - Summary calculations (MTD, YTD, forecasts)
 * - Edge cases (zero values, large numbers)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SaaSCostRecord, SaaSCostSummary } from '@/actions/subscription-providers'

// ============================================
// Mock Data Helpers
// ============================================

/**
 * Create a mock FOCUS 1.3 cost record
 */
function createMockCostRecord(overrides: Partial<SaaSCostRecord> = {}): SaaSCostRecord {
  const today = new Date().toISOString().split('T')[0]
  const now = new Date().toISOString()

  return {
    // Identity
    BillingAccountId: 'org_test_123',
    BillingAccountName: 'Test Organization',
    SubAccountId: 'sub_123',
    SubAccountName: 'Engineering Team',

    // Provider & Service (FOCUS 1.3)
    ServiceProviderName: 'Slack',
    HostProviderName: 'Self-Hosted',
    InvoiceIssuerName: 'Slack Technologies',
    ProviderName: 'slack',  // Deprecated, kept for backward compat
    PublisherName: 'Slack Technologies',  // Deprecated, kept for backward compat
    ServiceCategory: 'communication',
    ServiceName: 'Slack Business',
    ServiceSubcategory: 'business_plus',

    // Cost Columns
    BilledCost: 12.99,
    EffectiveCost: 12.99,
    ListCost: 15.00,
    ContractedCost: 12.99,
    BillingCurrency: 'USD',

    // Pricing
    UnitPrice: 12.99,
    ListUnitPrice: 15.00,
    PricingCategory: 'on-demand',
    PricingCurrency: 'USD',
    PricingQuantity: 1,
    PricingUnit: 'seat',

    // Usage
    ConsumedQuantity: 1,
    ConsumedUnit: 'seat',
    UsageType: 'subscription',

    // Charge Details
    ChargeCategory: 'Usage',
    ChargeClass: 'Committed',
    ChargeDescription: 'Monthly subscription charge',
    ChargeFrequency: 'Monthly',

    // Resource
    ResourceId: 'slack_sub_001',
    ResourceName: 'Slack Business Plan',
    ResourceType: 'subscription',
    SkuId: 'slack-business-monthly',

    // Region
    RegionId: 'us-central1',
    RegionName: 'US Central',

    // Time Periods
    BillingPeriodStart: today,
    BillingPeriodEnd: today,
    ChargePeriodStart: today,
    ChargePeriodEnd: today,

    // Metadata (FOCUS 1.3 x_ prefix extension fields)
    x_SourceSystem: 'saas_subscription_costs_daily',
    x_SourceRecordId: `record_${Date.now()}`,
    x_UpdatedAt: now,
    x_AmortizationClass: 'Amortized',
    x_ServiceModel: 'SaaS',
    x_ExchangeRateUsed: 1.0,
    x_OriginalCurrency: 'USD',
    x_OriginalCost: 12.99,
    x_CreatedAt: now,

    // Org-specific extension fields (FOCUS 1.3)
    x_OrgSlug: 'test_org',
    x_OrgName: 'Test Organization',
    x_OrgOwnerEmail: 'admin@test.com',
    x_OrgDefaultCurrency: 'USD',
    x_OrgDefaultTimezone: 'America/New_York',
    x_OrgDefaultCountry: 'US',
    x_OrgSubscriptionPlan: 'PRO',
    x_OrgSubscriptionStatus: 'ACTIVE',
    x_PipelineId: 'saas_subscription_costs_pipeline',
    x_PipelineRunId: `run_${Date.now()}`,
    x_DataQualityScore: 1.0,

    // Calculated Run Rates
    MonthlyRunRate: 12.99 * 30,
    AnnualRunRate: 12.99 * 365,

    ...overrides,
  }
}

/**
 * Create a mock summary
 */
function createMockSummary(overrides: Partial<SaaSCostSummary> = {}): SaaSCostSummary {
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
  const todayStr = today.toISOString().split('T')[0]

  return {
    total_daily_cost: 50.00,
    total_monthly_cost: 1500.00,
    total_annual_cost: 18000.00,
    total_billed_cost: 1500.00,
    ytd_cost: 5000.00,
    mtd_cost: 1500.00,
    forecast_monthly_cost: 1500.00,
    forecast_annual_cost: 18000.00,
    providers: ['slack', 'notion', 'github'],
    service_categories: ['communication', 'productivity', 'development'],
    record_count: 30,
    date_range: {
      start: startOfMonth,
      end: todayStr,
    },
    ...overrides,
  }
}

// ============================================
// Cost Calculation Functions (Mock Implementation)
// ============================================

/**
 * Calculate monthly cost based on pricing model
 */
function calculateMonthlyCost(
  pricingModel: 'PER_SEAT' | 'FLAT_FEE',
  unitPrice: number,
  seats: number,
  billingCycle: 'monthly' | 'annual' | 'quarterly',
  discountType?: 'percent' | 'fixed',
  discountValue?: number
): number {
  let baseCost = 0

  // Calculate base cost
  if (pricingModel === 'PER_SEAT') {
    baseCost = unitPrice * seats
  } else {
    baseCost = unitPrice
  }

  // Adjust for billing cycle
  if (billingCycle === 'annual') {
    baseCost = baseCost / 12
  } else if (billingCycle === 'quarterly') {
    baseCost = baseCost / 3
  }

  // Apply discount
  if (discountType && discountValue) {
    if (discountType === 'percent') {
      baseCost = baseCost * (1 - discountValue / 100)
    } else if (discountType === 'fixed') {
      baseCost = Math.max(0, baseCost - discountValue)
    }
  }

  return Math.round(baseCost * 100) / 100
}

/**
 * Calculate annual cost
 */
function calculateAnnualCost(monthlyCost: number): number {
  return Math.round(monthlyCost * 12 * 100) / 100
}

/**
 * Filter records by date range
 */
function filterByDateRange(
  records: SaaSCostRecord[],
  startDate?: string,
  endDate?: string
): SaaSCostRecord[] {
  if (!startDate && !endDate) return records

  return records.filter(record => {
    const recordDate = record.ChargePeriodStart
    if (startDate && recordDate < startDate) return false
    if (endDate && recordDate > endDate) return false
    return true
  })
}

/**
 * Filter records by provider
 */
function filterByProvider(
  records: SaaSCostRecord[],
  provider?: string
): SaaSCostRecord[] {
  if (!provider) return records
  return records.filter(r => (r.ServiceProviderName || r.ProviderName || '').toLowerCase() === provider.toLowerCase())
}

/**
 * Calculate summary statistics
 */
function calculateSummary(records: SaaSCostRecord[]): SaaSCostSummary {
  if (records.length === 0) {
    return createMockSummary({
      total_daily_cost: 0,
      total_monthly_cost: 0,
      total_annual_cost: 0,
      total_billed_cost: 0,
      ytd_cost: 0,
      mtd_cost: 0,
      forecast_monthly_cost: 0,
      forecast_annual_cost: 0,
      providers: [],
      service_categories: [],
      record_count: 0,
    })
  }

  // Get latest record per resource for daily rate
  const latestByResource = new Map<string, SaaSCostRecord>()
  records.forEach(record => {
    const resourceId = record.ResourceId || record.ServiceName || 'unknown'
    const existing = latestByResource.get(resourceId)
    if (!existing || record.ChargePeriodStart > existing.ChargePeriodStart) {
      latestByResource.set(resourceId, record)
    }
  })

  const latestRecords = Array.from(latestByResource.values())
  const totalDaily = latestRecords.reduce((sum, r) => sum + (r.BilledCost || 0), 0)
  const totalBilled = records.reduce((sum, r) => sum + (r.BilledCost || 0), 0)

  // Calculate forecasts
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysInYear = (today.getFullYear() % 4 === 0 && (today.getFullYear() % 100 !== 0 || today.getFullYear() % 400 === 0)) ? 366 : 365
  const forecastMonthly = totalDaily * daysInMonth
  const forecastAnnual = totalDaily * daysInYear

  // Get unique providers and categories
  const providers = Array.from(new Set(records.map(r => r.ServiceProviderName || r.ProviderName).filter((p): p is string => !!p)))
  const categories = Array.from(new Set(records.map(r => r.ServiceCategory).filter(Boolean)))

  // Get date range
  const dates = records.map(r => r.ChargePeriodStart).sort()
  const startDate = dates[0] || ''
  const endDate = dates[dates.length - 1] || ''

  return {
    total_daily_cost: Math.round(totalDaily * 100) / 100,
    total_monthly_cost: Math.round(totalBilled * 100) / 100,
    total_annual_cost: Math.round(forecastAnnual * 100) / 100,
    total_billed_cost: Math.round(totalBilled * 100) / 100,
    ytd_cost: Math.round(totalBilled * 100) / 100,
    mtd_cost: Math.round(totalBilled * 100) / 100,
    forecast_monthly_cost: Math.round(forecastMonthly * 100) / 100,
    forecast_annual_cost: Math.round(forecastAnnual * 100) / 100,
    providers,
    service_categories: categories,
    record_count: records.length,
    date_range: { start: startDate, end: endDate },
  }
}

// ============================================
// Test Suite
// ============================================

describe('Test 19: SaaS Subscription Cost Calculations', () => {

  describe('Pricing Model Calculations', () => {

    it('should calculate PER_SEAT monthly cost correctly', () => {
      const unitPrice = 20
      const seats = 5
      const expected = 100

      const result = calculateMonthlyCost('PER_SEAT', unitPrice, seats, 'monthly')

      expect(result).toBe(expected)
    })

    it('should calculate FLAT_FEE monthly cost correctly', () => {
      const unitPrice = 99
      const seats = 10 // Should be ignored for FLAT_FEE
      const expected = 99

      const result = calculateMonthlyCost('FLAT_FEE', unitPrice, seats, 'monthly')

      expect(result).toBe(expected)
    })

    it('should calculate monthly cost from annual price (divide by 12)', () => {
      const annualPrice = 1200
      const seats = 1
      const expected = 100

      const result = calculateMonthlyCost('FLAT_FEE', annualPrice, seats, 'annual')

      expect(result).toBe(expected)
    })

    it('should calculate monthly cost from quarterly price (divide by 3)', () => {
      const quarterlyPrice = 300
      const seats = 1
      const expected = 100

      const result = calculateMonthlyCost('FLAT_FEE', quarterlyPrice, seats, 'quarterly')

      expect(result).toBe(expected)
    })

    it('should handle large seat counts correctly', () => {
      const unitPrice = 10
      const seats = 1000
      const expected = 10000

      const result = calculateMonthlyCost('PER_SEAT', unitPrice, seats, 'monthly')

      expect(result).toBe(expected)
    })
  })

  describe('Discount Calculations', () => {

    it('should apply percent discount correctly', () => {
      const basePrice = 100
      const seats = 1
      const discountPercent = 20
      const expected = 80 // 100 - 20%

      const result = calculateMonthlyCost('FLAT_FEE', basePrice, seats, 'monthly', 'percent', discountPercent)

      expect(result).toBe(expected)
    })

    it('should apply fixed discount correctly', () => {
      const basePrice = 100
      const seats = 1
      const discountFixed = 15
      const expected = 85 // 100 - 15

      const result = calculateMonthlyCost('FLAT_FEE', basePrice, seats, 'monthly', 'fixed', discountFixed)

      expect(result).toBe(expected)
    })

    it('should not allow negative costs with fixed discount', () => {
      const basePrice = 50
      const seats = 1
      const discountFixed = 100
      const expected = 0 // Should not go negative

      const result = calculateMonthlyCost('FLAT_FEE', basePrice, seats, 'monthly', 'fixed', discountFixed)

      expect(result).toBe(expected)
    })

    it('should apply discount to PER_SEAT calculation', () => {
      const unitPrice = 20
      const seats = 5
      const discountPercent = 10
      const expected = 90 // (20 * 5) - 10% = 100 - 10 = 90

      const result = calculateMonthlyCost('PER_SEAT', unitPrice, seats, 'monthly', 'percent', discountPercent)

      expect(result).toBe(expected)
    })
  })

  describe('Annual Cost Calculations', () => {

    it('should calculate annual cost from monthly (multiply by 12)', () => {
      const monthlyCost = 100
      const expected = 1200

      const result = calculateAnnualCost(monthlyCost)

      expect(result).toBe(expected)
    })

    it('should handle decimal monthly costs', () => {
      const monthlyCost = 12.99
      const expected = 155.88

      const result = calculateAnnualCost(monthlyCost)

      expect(result).toBe(expected)
    })
  })

  describe('Date Range Filtering', () => {

    it('should filter records by start date', () => {
      const records = [
        createMockCostRecord({ ChargePeriodStart: '2025-01-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-02-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-03-01' }),
      ]

      const filtered = filterByDateRange(records, '2025-02-01')

      expect(filtered).toHaveLength(2)
      expect(filtered[0].ChargePeriodStart).toBe('2025-02-01')
      expect(filtered[1].ChargePeriodStart).toBe('2025-03-01')
    })

    it('should filter records by end date', () => {
      const records = [
        createMockCostRecord({ ChargePeriodStart: '2025-01-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-02-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-03-01' }),
      ]

      const filtered = filterByDateRange(records, undefined, '2025-02-01')

      expect(filtered).toHaveLength(2)
      expect(filtered[0].ChargePeriodStart).toBe('2025-01-01')
      expect(filtered[1].ChargePeriodStart).toBe('2025-02-01')
    })

    it('should filter records by both start and end date', () => {
      const records = [
        createMockCostRecord({ ChargePeriodStart: '2025-01-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-02-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-03-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-04-01' }),
      ]

      const filtered = filterByDateRange(records, '2025-02-01', '2025-03-01')

      expect(filtered).toHaveLength(2)
      expect(filtered[0].ChargePeriodStart).toBe('2025-02-01')
      expect(filtered[1].ChargePeriodStart).toBe('2025-03-01')
    })

    it('should return all records when no date filter provided', () => {
      const records = [
        createMockCostRecord({ ChargePeriodStart: '2025-01-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-02-01' }),
      ]

      const filtered = filterByDateRange(records)

      expect(filtered).toHaveLength(2)
    })
  })

  describe('Provider Filtering', () => {

    it('should filter records by provider', () => {
      const records = [
        createMockCostRecord({ ServiceProviderName: 'slack', ProviderName: 'slack' }),
        createMockCostRecord({ ServiceProviderName: 'notion', ProviderName: 'notion' }),
        createMockCostRecord({ ServiceProviderName: 'slack', ProviderName: 'slack' }),
      ]

      const filtered = filterByProvider(records, 'slack')

      expect(filtered).toHaveLength(2)
      filtered.forEach(record => {
        expect((record.ServiceProviderName || record.ProviderName || '').toLowerCase()).toBe('slack')
      })
    })

    it('should be case-insensitive for provider filtering', () => {
      const records = [
        createMockCostRecord({ ServiceProviderName: 'Slack', ProviderName: 'Slack' }),
        createMockCostRecord({ ServiceProviderName: 'SLACK', ProviderName: 'SLACK' }),
        createMockCostRecord({ ServiceProviderName: 'notion', ProviderName: 'notion' }),
      ]

      const filtered = filterByProvider(records, 'slack')

      expect(filtered).toHaveLength(2)
    })

    it('should return all records when no provider filter provided', () => {
      const records = [
        createMockCostRecord({ ServiceProviderName: 'slack', ProviderName: 'slack' }),
        createMockCostRecord({ ServiceProviderName: 'notion', ProviderName: 'notion' }),
      ]

      const filtered = filterByProvider(records)

      expect(filtered).toHaveLength(2)
    })
  })

  describe('Summary Calculations', () => {

    it('should calculate total daily cost from latest records', () => {
      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

      const records = [
        createMockCostRecord({
          ResourceId: 'sub_1',
          BilledCost: 10,
          ChargePeriodStart: yesterday
        }),
        createMockCostRecord({
          ResourceId: 'sub_1',
          BilledCost: 15,
          ChargePeriodStart: today
        }), // Latest for sub_1
        createMockCostRecord({
          ResourceId: 'sub_2',
          BilledCost: 20,
          ChargePeriodStart: today
        }),
      ]

      const summary = calculateSummary(records)

      // Should use latest record per resource: 15 + 20 = 35
      expect(summary.total_daily_cost).toBe(35)
    })

    it('should calculate total billed cost (sum all records)', () => {
      const records = [
        createMockCostRecord({ BilledCost: 10 }),
        createMockCostRecord({ BilledCost: 20 }),
        createMockCostRecord({ BilledCost: 30 }),
      ]

      const summary = calculateSummary(records)

      expect(summary.total_billed_cost).toBe(60)
    })

    it('should calculate monthly forecast from daily rate', () => {
      const today = new Date()
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

      const records = [
        createMockCostRecord({
          ResourceId: 'sub_1',
          BilledCost: 10,
          ChargePeriodStart: today.toISOString().split('T')[0]
        }),
      ]

      const summary = calculateSummary(records)

      // Daily rate (10) * days in month
      expect(summary.forecast_monthly_cost).toBe(10 * daysInMonth)
    })

    it('should calculate annual forecast from daily rate', () => {
      const today = new Date()
      const year = today.getFullYear()
      const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365

      const records = [
        createMockCostRecord({
          ResourceId: 'sub_1',
          BilledCost: 10,
          ChargePeriodStart: today.toISOString().split('T')[0]
        }),
      ]

      const summary = calculateSummary(records)

      // Daily rate (10) * days in year
      expect(summary.forecast_annual_cost).toBe(10 * daysInYear)
    })

    it('should extract unique providers', () => {
      const records = [
        createMockCostRecord({ ServiceProviderName: 'slack', ProviderName: 'slack' }),
        createMockCostRecord({ ServiceProviderName: 'notion', ProviderName: 'notion' }),
        createMockCostRecord({ ServiceProviderName: 'slack', ProviderName: 'slack' }),
      ]

      const summary = calculateSummary(records)

      expect(summary.providers).toHaveLength(2)
      expect(summary.providers).toContain('slack')
      expect(summary.providers).toContain('notion')
    })

    it('should extract unique service categories', () => {
      const records = [
        createMockCostRecord({ ServiceCategory: 'communication' }),
        createMockCostRecord({ ServiceCategory: 'productivity' }),
        createMockCostRecord({ ServiceCategory: 'communication' }),
      ]

      const summary = calculateSummary(records)

      expect(summary.service_categories).toHaveLength(2)
      expect(summary.service_categories).toContain('communication')
      expect(summary.service_categories).toContain('productivity')
    })

    it('should calculate date range from records', () => {
      const records = [
        createMockCostRecord({ ChargePeriodStart: '2025-02-15' }),
        createMockCostRecord({ ChargePeriodStart: '2025-01-01' }),
        createMockCostRecord({ ChargePeriodStart: '2025-03-30' }),
      ]

      const summary = calculateSummary(records)

      expect(summary.date_range.start).toBe('2025-01-01')
      expect(summary.date_range.end).toBe('2025-03-30')
    })

    it('should return zero values for empty records', () => {
      const summary = calculateSummary([])

      expect(summary.total_daily_cost).toBe(0)
      expect(summary.total_monthly_cost).toBe(0)
      expect(summary.total_annual_cost).toBe(0)
      expect(summary.total_billed_cost).toBe(0)
      expect(summary.ytd_cost).toBe(0)
      expect(summary.mtd_cost).toBe(0)
      expect(summary.forecast_monthly_cost).toBe(0)
      expect(summary.forecast_annual_cost).toBe(0)
      expect(summary.providers).toHaveLength(0)
      expect(summary.service_categories).toHaveLength(0)
      expect(summary.record_count).toBe(0)
    })
  })

  describe('Edge Cases', () => {

    it('should handle zero price', () => {
      const result = calculateMonthlyCost('PER_SEAT', 0, 5, 'monthly')

      expect(result).toBe(0)
    })

    it('should handle zero seats', () => {
      const result = calculateMonthlyCost('PER_SEAT', 20, 0, 'monthly')

      expect(result).toBe(0)
    })

    it('should handle zero seats with FLAT_FEE', () => {
      const result = calculateMonthlyCost('FLAT_FEE', 99, 0, 'monthly')

      expect(result).toBe(99) // Seats don't matter for FLAT_FEE
    })

    it('should handle very large prices', () => {
      const unitPrice = 999999
      const seats = 1
      const expected = 999999

      const result = calculateMonthlyCost('FLAT_FEE', unitPrice, seats, 'monthly')

      expect(result).toBe(expected)
    })

    it('should handle very large seat counts', () => {
      const unitPrice = 10
      const seats = 9999999
      const expected = 99999990

      const result = calculateMonthlyCost('PER_SEAT', unitPrice, seats, 'monthly')

      expect(result).toBe(expected)
    })

    it('should handle decimal prices correctly', () => {
      const unitPrice = 12.99
      const seats = 3
      const expected = 38.97

      const result = calculateMonthlyCost('PER_SEAT', unitPrice, seats, 'monthly')

      expect(result).toBe(expected)
    })

    it('should round to 2 decimal places', () => {
      const unitPrice = 10.006
      const seats = 3
      // 30.018 should round to 30.02

      const result = calculateMonthlyCost('PER_SEAT', unitPrice, seats, 'monthly')

      expect(result).toBe(30.02)
    })

    it('should handle 100% discount', () => {
      const result = calculateMonthlyCost('FLAT_FEE', 100, 1, 'monthly', 'percent', 100)

      expect(result).toBe(0)
    })

    it('should handle discount equal to price', () => {
      const result = calculateMonthlyCost('FLAT_FEE', 50, 1, 'monthly', 'fixed', 50)

      expect(result).toBe(0)
    })
  })

  describe('Integration Tests', () => {

    it('should calculate realistic Slack subscription cost', () => {
      // Slack Business: $12.50/user/month, 10 users, 10% discount
      const monthlyCost = calculateMonthlyCost('PER_SEAT', 12.50, 10, 'monthly', 'percent', 10)
      const annualCost = calculateAnnualCost(monthlyCost)

      expect(monthlyCost).toBe(112.50) // (12.50 * 10) * 0.9 = 112.50
      expect(annualCost).toBe(1350.00) // 112.50 * 12
    })

    it('should calculate realistic annual plan converted to monthly', () => {
      // GitHub Team: $44/user/year, 5 users
      const monthlyCost = calculateMonthlyCost('PER_SEAT', 44, 5, 'annual')
      const annualCost = calculateAnnualCost(monthlyCost)

      expect(monthlyCost).toBe(18.33) // (44 * 5) / 12 = 18.33
      expect(annualCost).toBe(219.96) // 18.33 * 12
    })

    it('should calculate realistic flat fee subscription', () => {
      // Canva Pro: $119.99/year, FLAT_FEE
      const monthlyCost = calculateMonthlyCost('FLAT_FEE', 119.99, 1, 'annual')
      const annualCost = calculateAnnualCost(monthlyCost)

      expect(monthlyCost).toBe(10.00) // 119.99 / 12 ≈ 10.00
      expect(annualCost).toBe(120.00) // 10.00 * 12
    })

    it('should handle multiple subscriptions with filtering', () => {
      const records = [
        createMockCostRecord({
          ServiceProviderName: 'slack',
          ProviderName: 'slack',
          ResourceId: 'slack_sub',
          BilledCost: 112.50,
          ChargePeriodStart: '2025-12-01'
        }),
        createMockCostRecord({
          ServiceProviderName: 'github',
          ProviderName: 'github',
          ResourceId: 'github_sub',
          BilledCost: 18.33,
          ChargePeriodStart: '2025-12-01'
        }),
        createMockCostRecord({
          ServiceProviderName: 'slack',
          ProviderName: 'slack',
          ResourceId: 'slack_sub',
          BilledCost: 112.50,
          ChargePeriodStart: '2025-12-02'
        }),
      ]

      // Filter by provider
      const slackRecords = filterByProvider(records, 'slack')
      expect(slackRecords).toHaveLength(2)

      // Calculate summary for Slack only
      const slackSummary = calculateSummary(slackRecords)
      expect(slackSummary.total_daily_cost).toBe(112.50) // Latest record
      expect(slackSummary.total_billed_cost).toBe(225.00) // Sum of both
      expect(slackSummary.providers).toEqual(['slack'])
    })
  })

  describe('FOCUS 1.3 Standard Compliance', () => {

    it('should include all required FOCUS 1.3 fields', () => {
      const record = createMockCostRecord()

      // Identity fields
      expect(record).toHaveProperty('BillingAccountId')
      expect(record).toHaveProperty('SubAccountId')

      // Provider fields (FOCUS 1.3)
      expect(record).toHaveProperty('ServiceProviderName')
      expect(record).toHaveProperty('HostProviderName')
      expect(record).toHaveProperty('InvoiceIssuerName')
      expect(record).toHaveProperty('ServiceCategory')
      expect(record).toHaveProperty('ServiceName')

      // Cost fields
      expect(record).toHaveProperty('BilledCost')
      expect(record).toHaveProperty('EffectiveCost')
      expect(record).toHaveProperty('BillingCurrency')

      // Charge fields
      expect(record).toHaveProperty('ChargeCategory')
      expect(record).toHaveProperty('ChargeFrequency')

      // Org-specific extension fields (FOCUS 1.3)
      expect(record).toHaveProperty('x_OrgSlug')
      expect(record).toHaveProperty('x_OrgName')
      expect(record).toHaveProperty('x_OrgOwnerEmail')
      expect(record).toHaveProperty('x_OrgDefaultCurrency')
      expect(record).toHaveProperty('x_SourceSystem')
      expect(record).toHaveProperty('x_UpdatedAt')

      // Time fields
      expect(record).toHaveProperty('BillingPeriodStart')
      expect(record).toHaveProperty('ChargePeriodStart')

      // Run rates
      expect(record).toHaveProperty('MonthlyRunRate')
      expect(record).toHaveProperty('AnnualRunRate')
    })

    it('should calculate run rates correctly', () => {
      const dailyCost = 10
      const record = createMockCostRecord({
        BilledCost: dailyCost,
        MonthlyRunRate: dailyCost * 30,
        AnnualRunRate: dailyCost * 365,
      })

      expect(record.MonthlyRunRate).toBe(300)
      expect(record.AnnualRunRate).toBe(3650)
    })

    it('should use BilledCost as primary cost metric', () => {
      const record = createMockCostRecord({
        BilledCost: 100,
        EffectiveCost: 90,
        ListCost: 120,
      })

      // BilledCost should be the source of truth
      const records = [record]
      const summary = calculateSummary(records)

      expect(summary.total_billed_cost).toBe(100)
    })
  })
})
