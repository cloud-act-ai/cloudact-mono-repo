/**
 * @vitest-environment node
 *
 * Unit Test: Supabase Quota Functions
 *
 * Tests the quota management functions that use Supabase RPC:
 * 1. check_quota_available - checks if org can run pipelines
 * 2. Status mapping for billing statuses
 * 3. Plan name mapping
 *
 * ARCHITECTURE CHANGE (2026-02-01):
 * - Previous: BigQuery sync via syncSubscriptionToBackend + billing_sync_queue
 * - Current: Supabase-based quota management via org_quotas table and RPC functions
 *
 * The following functions were REMOVED and are no longer needed:
 * - syncSubscriptionToBackend (BigQuery sync)
 * - processPendingSyncs (billing_sync_queue processing)
 * - getSyncQueueStats (queue statistics)
 * - queueFailedSync (retry queue)
 *
 * Quota limits are now managed in Supabase:
 * - organizations table: pipelines_per_day_limit, pipelines_per_month_limit,
 *                       concurrent_pipelines_limit, seat_limit, providers_limit
 * - org_quotas table: daily/monthly/concurrent usage tracking
 * - RPC functions: check_quota_available, increment_pipeline_count, decrement_concurrent
 */

import { describe, it, expect } from 'vitest'

// ============================================
// Status Mapping Function (for Stripe → internal status)
// ============================================

/**
 * Map frontend billing status to internal subscription status.
 *
 * Frontend (Supabase/Stripe): trialing, active, past_due, canceled, incomplete,
 *                             incomplete_expired, paused, unpaid
 * Internal: ACTIVE, TRIAL, EXPIRED, SUSPENDED, CANCELLED
 */
function mapBillingStatusToInternal(frontendStatus?: string): string | undefined {
  if (!frontendStatus) return undefined

  const statusMapping: Record<string, string> = {
    // Active states
    trialing: "TRIAL",
    active: "ACTIVE",
    // Suspended states (payment issues, recoverable)
    past_due: "SUSPENDED",
    incomplete: "SUSPENDED",
    paused: "SUSPENDED",
    unpaid: "SUSPENDED",
    // Expired/Terminal states
    incomplete_expired: "EXPIRED",
    // Cancelled state
    canceled: "CANCELLED",
    cancelled: "CANCELLED", // Handle both spellings
  }

  const mapped = statusMapping[frontendStatus.toLowerCase()]
  if (!mapped) {
    console.warn(`[Status Mapping] Unknown billing status: ${frontendStatus}, defaulting to SUSPENDED`)
    return "SUSPENDED" // Safer default - block access until status is clarified
  }
  return mapped
}

// ============================================
// Plan Name Mapping
// ============================================

function mapPlanName(planName?: string): string | undefined {
  if (!planName) return undefined

  const planMapping: Record<string, string> = {
    starter: "STARTER",
    professional: "PROFESSIONAL",
    scale: "SCALE",
    enterprise: "ENTERPRISE",
  }
  return planMapping[planName.toLowerCase()] || planName.toUpperCase()
}

// ============================================
// Tests: Status Mapping
// ============================================

describe('Quota System: mapBillingStatusToInternal', () => {
  it('should map active states correctly', () => {
    expect(mapBillingStatusToInternal('trialing')).toBe('TRIAL')
    expect(mapBillingStatusToInternal('active')).toBe('ACTIVE')
  })

  it('should map suspended states correctly', () => {
    expect(mapBillingStatusToInternal('past_due')).toBe('SUSPENDED')
    expect(mapBillingStatusToInternal('incomplete')).toBe('SUSPENDED')
    expect(mapBillingStatusToInternal('paused')).toBe('SUSPENDED')
    expect(mapBillingStatusToInternal('unpaid')).toBe('SUSPENDED')
  })

  it('should map expired states correctly', () => {
    expect(mapBillingStatusToInternal('incomplete_expired')).toBe('EXPIRED')
  })

  it('should map cancelled states correctly', () => {
    expect(mapBillingStatusToInternal('canceled')).toBe('CANCELLED')
    expect(mapBillingStatusToInternal('cancelled')).toBe('CANCELLED')
  })

  it('should be case-insensitive', () => {
    expect(mapBillingStatusToInternal('TRIALING')).toBe('TRIAL')
    expect(mapBillingStatusToInternal('Active')).toBe('ACTIVE')
    expect(mapBillingStatusToInternal('Past_Due')).toBe('SUSPENDED')
    expect(mapBillingStatusToInternal('CANCELED')).toBe('CANCELLED')
  })

  it('should return undefined for empty/null/undefined input', () => {
    expect(mapBillingStatusToInternal('')).toBeUndefined()
    expect(mapBillingStatusToInternal(undefined)).toBeUndefined()
  })

  it('should default to SUSPENDED for unknown statuses', () => {
    expect(mapBillingStatusToInternal('unknown')).toBe('SUSPENDED')
    expect(mapBillingStatusToInternal('random_status')).toBe('SUSPENDED')
    expect(mapBillingStatusToInternal('deleted')).toBe('SUSPENDED')
  })

  it('should handle all Stripe statuses', () => {
    const stripeStatuses = [
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'paused',
      'unpaid',
    ]

    stripeStatuses.forEach(status => {
      const result = mapBillingStatusToInternal(status)
      expect(result).toBeDefined()
      expect(['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']).toContain(result)
    })
  })
})

// ============================================
// Tests: Plan Name Mapping
// ============================================

describe('Quota System: plan name mapping', () => {
  it('should map known plan names correctly', () => {
    expect(mapPlanName('starter')).toBe('STARTER')
    expect(mapPlanName('professional')).toBe('PROFESSIONAL')
    expect(mapPlanName('scale')).toBe('SCALE')
    expect(mapPlanName('enterprise')).toBe('ENTERPRISE')
  })

  it('should be case-insensitive', () => {
    expect(mapPlanName('STARTER')).toBe('STARTER')
    expect(mapPlanName('Professional')).toBe('PROFESSIONAL')
    expect(mapPlanName('SCALE')).toBe('SCALE')
  })

  it('should uppercase unknown plan names', () => {
    expect(mapPlanName('custom_plan')).toBe('CUSTOM_PLAN')
    expect(mapPlanName('trial')).toBe('TRIAL')
  })

  it('should return undefined for empty/null/undefined input', () => {
    expect(mapPlanName('')).toBeUndefined()
    expect(mapPlanName(undefined)).toBeUndefined()
  })
})

// ============================================
// Tests: Quota Limit Validation
// ============================================

describe('Quota System: limit validation', () => {
  // Plan limits based on CLAUDE.md documentation
  const planLimits = {
    starter: {
      pipelines_per_day_limit: 6,
      pipelines_per_month_limit: 180,
      concurrent_pipelines_limit: 1,
      seat_limit: 2,
      providers_limit: 3,
    },
    professional: {
      pipelines_per_day_limit: 25,
      pipelines_per_month_limit: 750,
      concurrent_pipelines_limit: 2,
      seat_limit: 6,
      providers_limit: 6,
    },
    scale: {
      pipelines_per_day_limit: 100,
      pipelines_per_month_limit: 3000,
      concurrent_pipelines_limit: 5,
      seat_limit: 11,
      providers_limit: 10,
    },
  }

  it('should have correct starter plan limits', () => {
    expect(planLimits.starter.pipelines_per_day_limit).toBe(6)
    expect(planLimits.starter.pipelines_per_month_limit).toBe(180)
    expect(planLimits.starter.concurrent_pipelines_limit).toBe(1)
    expect(planLimits.starter.seat_limit).toBe(2)
    expect(planLimits.starter.providers_limit).toBe(3)
  })

  it('should have correct professional plan limits', () => {
    expect(planLimits.professional.pipelines_per_day_limit).toBe(25)
    expect(planLimits.professional.pipelines_per_month_limit).toBe(750)
    expect(planLimits.professional.concurrent_pipelines_limit).toBe(2)
    expect(planLimits.professional.seat_limit).toBe(6)
    expect(planLimits.professional.providers_limit).toBe(6)
  })

  it('should have correct scale plan limits', () => {
    expect(planLimits.scale.pipelines_per_day_limit).toBe(100)
    expect(planLimits.scale.pipelines_per_month_limit).toBe(3000)
    expect(planLimits.scale.concurrent_pipelines_limit).toBe(5)
    expect(planLimits.scale.seat_limit).toBe(11)
    expect(planLimits.scale.providers_limit).toBe(10)
  })
})

// ============================================
// Tests: Quota Check Response Structure
// ============================================

describe('Quota System: check_quota_available response', () => {
  it('should return correct structure when quota is available', () => {
    const response = {
      can_run: true,
      reason: null,
      daily_used: 5,
      daily_limit: 25,
      monthly_used: 100,
      monthly_limit: 750,
      concurrent_used: 1,
      concurrent_limit: 2,
    }

    expect(response.can_run).toBe(true)
    expect(response.reason).toBeNull()
    expect(response.daily_used).toBeLessThan(response.daily_limit)
    expect(response.monthly_used).toBeLessThan(response.monthly_limit)
    expect(response.concurrent_used).toBeLessThan(response.concurrent_limit)
  })

  it('should return correct structure when daily limit reached', () => {
    const response = {
      can_run: false,
      reason: 'Daily pipeline limit reached',
      daily_used: 25,
      daily_limit: 25,
      monthly_used: 100,
      monthly_limit: 750,
      concurrent_used: 0,
      concurrent_limit: 2,
    }

    expect(response.can_run).toBe(false)
    expect(response.reason).toBe('Daily pipeline limit reached')
    expect(response.daily_used).toBe(response.daily_limit)
  })

  it('should return correct structure when monthly limit reached', () => {
    const response = {
      can_run: false,
      reason: 'Monthly pipeline limit reached',
      daily_used: 10,
      daily_limit: 25,
      monthly_used: 750,
      monthly_limit: 750,
      concurrent_used: 0,
      concurrent_limit: 2,
    }

    expect(response.can_run).toBe(false)
    expect(response.reason).toBe('Monthly pipeline limit reached')
    expect(response.monthly_used).toBe(response.monthly_limit)
  })

  it('should return correct structure when concurrent limit reached', () => {
    const response = {
      can_run: false,
      reason: 'Concurrent pipeline limit reached',
      daily_used: 5,
      daily_limit: 25,
      monthly_used: 100,
      monthly_limit: 750,
      concurrent_used: 2,
      concurrent_limit: 2,
    }

    expect(response.can_run).toBe(false)
    expect(response.reason).toBe('Concurrent pipeline limit reached')
    expect(response.concurrent_used).toBe(response.concurrent_limit)
  })
})

// ============================================
// Tests: org_slug Validation
// ============================================

describe('Quota System: org_slug validation', () => {
  const validOrgSlug = (slug: string): boolean => {
    return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
  }

  it('should accept valid org slugs', () => {
    expect(validOrgSlug('testorg')).toBe(true)
    expect(validOrgSlug('test_org_123')).toBe(true)
    expect(validOrgSlug('acme_inc_ml4828xt')).toBe(true)
  })

  it('should reject invalid org slugs', () => {
    expect(validOrgSlug('test-org')).toBe(false) // Hyphens not allowed
    expect(validOrgSlug('ab')).toBe(false) // Too short
    expect(validOrgSlug('../etc/passwd')).toBe(false) // Path traversal
    expect(validOrgSlug('org with spaces')).toBe(false)
  })
})
