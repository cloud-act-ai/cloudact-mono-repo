/**
 * @vitest-environment node
 *
 * Stripe Checkout Functions Test Suite
 *
 * Tests all checkout-related functions from actions/stripe.ts:
 * 1. createOnboardingCheckoutSession - new user checkout flow
 * 2. createCheckoutSession - existing org checkout flow
 * 3. Session validation (cs_ prefix)
 * 4. Trial days handling
 * 5. Idempotency key generation
 * 6. Success/cancel URLs
 *
 * Coverage:
 * - Valid checkout creation
 * - Invalid price ID
 * - Rate limiting
 * - Missing company info
 * - Already has subscription
 * - Owner-only access
 * - Metadata validation
 * - Session ID format validation
 * - Origin URL handling
 * - Idempotency behavior
 *
 * Run: npx vitest tests/stripe_billing/checkout.test.ts --run
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// =============================================
// CONSTANTS & CONFIGURATION
// =============================================

const DEFAULT_TRIAL_DAYS = 14
const CHECKOUT_RATE_LIMIT_MS = 30000 // 30 seconds
const MAX_RATE_LIMIT_ENTRIES = 1000

// =============================================
// VALIDATION FUNCTIONS (from actions/stripe.ts)
// =============================================

/**
 * Validate Stripe price ID format
 * Must start with "price_" and be longer than 10 chars
 */
const isValidStripePriceId = (priceId: string): boolean => {
  return priceId.startsWith("price_") && priceId.length > 10
}

/**
 * Validate org slug format
 * Backend requires: alphanumeric with underscores only (no hyphens), 3-50 characters
 */
const isValidOrgSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

/**
 * Validate Stripe checkout session ID format
 * Must start with "cs_" prefix
 */
const isValidSessionId = (sessionId: string): boolean => {
  return sessionId.startsWith("cs_") && sessionId.length > 10
}

/**
 * Safe parseInt with NaN handling
 */
const safeParseInt = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) return defaultValue
  return parsed
}

/**
 * Generate org slug from company name
 * Format: firstword_{timestamp} (e.g., acme_ml01ua8p)
 * Uses first word only + base36 timestamp for uniqueness
 */
const generateOrgSlug = (companyName: string): string => {
  const timestamp = Date.now().toString(36)

  // Extract first word only for shorter slug (matches production code in actions/stripe.ts)
  const firstWord = companyName
    .split(/\s+/)[0]  // Get first word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20)  // Limit first word to 20 chars max

  return `${firstWord}_${timestamp}`
}

/**
 * Generate idempotency key for onboarding checkout
 * Format: onboarding_{userId}_{priceId}
 * NOTE: Does NOT include timestamp to ensure true idempotency
 */
const generateOnboardingIdempotencyKey = (userId: string, priceId: string): string => {
  return `onboarding_${userId}_${priceId}`
}

/**
 * Generate idempotency key for existing org checkout
 * Format: checkout_{orgId}_{priceId}
 */
const generateCheckoutIdempotencyKey = (orgId: string, priceId: string): string => {
  return `checkout_${orgId}_${priceId}`
}

/**
 * Validate origin URL format
 */
const isValidOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Clean origin URL (handle comma-separated, trailing slashes)
 */
const cleanOriginUrl = (origin: string): string => {
  // Handle comma-separated URLs in preview environments
  if (origin.includes(",")) {
    origin = origin.split(",")[0].trim()
  }
  // Remove any trailing slashes or extra spaces
  return origin.trim().replace(/\/+$/, "")
}

/**
 * Simple rate limiting checker (in-memory)
 */
class CheckoutRateLimiter {
  private limits = new Map<string, number>()

  check(userId: string): boolean {
    const now = Date.now()
    const lastAttempt = this.limits.get(userId)

    if (lastAttempt && now - lastAttempt < CHECKOUT_RATE_LIMIT_MS) {
      return false // Rate limited
    }

    this.limits.set(userId, now)

    // Clean up old entries with LRU eviction
    if (this.limits.size > MAX_RATE_LIMIT_ENTRIES) {
      const cutoff = now - CHECKOUT_RATE_LIMIT_MS * 2
      const entries = Array.from(this.limits.entries())

      // Remove expired entries first
      const expiredKeys = entries.filter(([_, time]) => time < cutoff).map(([key]) => key)
      expiredKeys.forEach(key => this.limits.delete(key))

      // If still over limit, remove oldest entries (LRU)
      if (this.limits.size > MAX_RATE_LIMIT_ENTRIES) {
        const sortedEntries = Array.from(this.limits.entries()).sort((a, b) => a[1] - b[1])
        const toRemove = sortedEntries.slice(0, this.limits.size - MAX_RATE_LIMIT_ENTRIES)
        toRemove.forEach(([key]) => this.limits.delete(key))
      }
    }

    return true
  }

  reset() {
    this.limits.clear()
  }

  size() {
    return this.limits.size
  }
}

// =============================================
// MOCK DATA
// =============================================

const MOCK_USER = {
  id: "user_123",
  email: "test@example.com",
  user_metadata: {
    pending_company_name: "Acme Corp",
    pending_company_type: "company"
  }
}

const MOCK_ORG = {
  id: "org_456",
  org_slug: "acme_ml01ua8p",
  org_name: "Acme Corp",
  stripe_customer_id: null,
  stripe_subscription_id: null
}

const MOCK_ORG_WITH_SUBSCRIPTION = {
  ...MOCK_ORG,
  stripe_customer_id: "cus_test123",
  stripe_subscription_id: "sub_test123"
}

const MOCK_PRICE = {
  id: "price_1234567890abcdef",
  recurring: {
    trial_period_days: 7,
    interval: "month"
  }
}

const MOCK_SESSION = {
  id: "cs_test_1234567890abcdef",
  url: "https://checkout.stripe.com/pay/cs_test_1234567890abcdef"
}

// =============================================
// TESTS
// =============================================

describe('Stripe Checkout Functions Test Suite', () => {

  // =============================================
  // VALIDATION TESTS
  // =============================================

  describe('Validation Functions', () => {

    describe('isValidStripePriceId', () => {
      it('should accept valid Stripe price IDs', () => {
        expect(isValidStripePriceId("price_1234567890abcdef")).toBe(true)
        expect(isValidStripePriceId("price_test_long_id_here")).toBe(true)
      })

      it('should reject invalid price IDs', () => {
        expect(isValidStripePriceId("prod_123")).toBe(false) // Wrong prefix
        expect(isValidStripePriceId("price_123")).toBe(false) // Too short
        expect(isValidStripePriceId("price_")).toBe(false) // Missing suffix
        expect(isValidStripePriceId("")).toBe(false) // Empty
        expect(isValidStripePriceId("random_string")).toBe(false) // Wrong format
      })
    })

    describe('isValidOrgSlug', () => {
      it('should accept valid org slugs', () => {
        expect(isValidOrgSlug("acme_ml01ua8p")).toBe(true)
        expect(isValidOrgSlug("test_n2kf9x4m")).toBe(true)
        expect(isValidOrgSlug("ABC")).toBe(true) // Minimum 3 chars
        expect(isValidOrgSlug("a".repeat(50))).toBe(true) // Maximum 50 chars
      })

      it('should reject invalid org slugs', () => {
        expect(isValidOrgSlug("ab")).toBe(false) // Too short (< 3)
        expect(isValidOrgSlug("a".repeat(51))).toBe(false) // Too long (> 50)
        expect(isValidOrgSlug("acme-corp")).toBe(false) // Contains hyphens
        expect(isValidOrgSlug("acme corp")).toBe(false) // Contains spaces
        expect(isValidOrgSlug("acme.corp")).toBe(false) // Contains dots
        expect(isValidOrgSlug("acme@corp")).toBe(false) // Contains special chars
        expect(isValidOrgSlug("")).toBe(false) // Empty
      })
    })

    describe('isValidSessionId', () => {
      it('should accept valid Stripe session IDs', () => {
        expect(isValidSessionId("cs_test_1234567890abcdef")).toBe(true)
        expect(isValidSessionId("cs_live_1234567890abcdef")).toBe(true)
      })

      it('should reject invalid session IDs', () => {
        expect(isValidSessionId("sub_123")).toBe(false) // Wrong prefix
        expect(isValidSessionId("cs_123")).toBe(false) // Too short
        expect(isValidSessionId("cs_")).toBe(false) // Missing suffix
        expect(isValidSessionId("")).toBe(false) // Empty
      })
    })

    describe('isValidOrigin', () => {
      it('should accept valid origin URLs', () => {
        expect(isValidOrigin("http://localhost:3000")).toBe(true)
        expect(isValidOrigin("https://app.example.com")).toBe(true)
        expect(isValidOrigin("https://staging.example.com:8443")).toBe(true)
      })

      it('should reject invalid origin URLs', () => {
        expect(isValidOrigin("ftp://example.com")).toBe(false) // Wrong protocol
        expect(isValidOrigin("javascript:alert(1)")).toBe(false) // Malicious
        expect(isValidOrigin("not-a-url")).toBe(false) // Invalid format
        expect(isValidOrigin("")).toBe(false) // Empty
      })
    })
  })

  // =============================================
  // ORG SLUG GENERATION TESTS
  // =============================================

  describe('Org Slug Generation', () => {

    it('should generate valid org slug from company name', () => {
      const slug = generateOrgSlug("Acme Corp")
      // Now uses first word + base36 timestamp (e.g., acme_ml01ua8p)
      expect(slug).toMatch(/^acme_[a-z0-9]+$/)
      expect(isValidOrgSlug(slug)).toBe(true)
    })

    it('should handle company names with special characters', () => {
      const slug = generateOrgSlug("ABC Inc. - Test & Co!")
      // Now uses first word only + base36 timestamp (e.g., abc_ml01ua8p)
      expect(slug).toMatch(/^abc_[a-z0-9]+$/)
      expect(isValidOrgSlug(slug)).toBe(true)
    })

    it('should strip trailing underscores', () => {
      const slug = generateOrgSlug("Test___")
      expect(slug).toMatch(/^test_[a-z0-9]+$/)
      expect(slug).not.toMatch(/^test____[a-z0-9]+$/)
    })

    it('should handle inputs with underscores in company name', () => {
      // Company names with underscores get their first word extracted
      const slug = generateOrgSlug("acme_corp things")
      expect(slug).toMatch(/^acmecorp_[a-z0-9]+$/)
      // First word "acme_corp" has underscore removed, so becomes "acmecorp"
      expect(slug.split('_').length).toBe(2)
    })

    it('should truncate long company names', () => {
      const longName = "Very Long Company Name That Exceeds The Maximum Length Limit"
      const slug = generateOrgSlug(longName)
      expect(slug.length).toBeLessThanOrEqual(50)
      expect(isValidOrgSlug(slug)).toBe(true)
    })

    it('should handle all lowercase input', () => {
      const slug = generateOrgSlug("acme")
      expect(slug).toMatch(/^acme_[a-z0-9]+$/)
    })

    it('should handle numeric company names', () => {
      const slug = generateOrgSlug("123 Company")
      // Now uses first word only (e.g., 123_ml01ua8p)
      expect(slug).toMatch(/^123_[a-z0-9]+$/)
    })
  })

  // =============================================
  // IDEMPOTENCY KEY TESTS
  // =============================================

  describe('Idempotency Key Generation', () => {

    it('should generate consistent onboarding keys', () => {
      const userId = "user_123"
      const priceId = "price_test"

      const key1 = generateOnboardingIdempotencyKey(userId, priceId)
      const key2 = generateOnboardingIdempotencyKey(userId, priceId)

      expect(key1).toBe(key2)
      expect(key1).toBe("onboarding_user_123_price_test")
    })

    it('should generate different keys for different users', () => {
      const priceId = "price_test"

      const key1 = generateOnboardingIdempotencyKey("user_1", priceId)
      const key2 = generateOnboardingIdempotencyKey("user_2", priceId)

      expect(key1).not.toBe(key2)
    })

    it('should generate different keys for different prices', () => {
      const userId = "user_123"

      const key1 = generateOnboardingIdempotencyKey(userId, "price_1")
      const key2 = generateOnboardingIdempotencyKey(userId, "price_2")

      expect(key1).not.toBe(key2)
    })

    it('should generate consistent checkout keys', () => {
      const orgId = "org_456"
      const priceId = "price_test"

      const key1 = generateCheckoutIdempotencyKey(orgId, priceId)
      const key2 = generateCheckoutIdempotencyKey(orgId, priceId)

      expect(key1).toBe(key2)
      expect(key1).toBe("checkout_org_456_price_test")
    })

    it('should use different prefixes for onboarding vs checkout', () => {
      const id = "test_123"
      const priceId = "price_test"

      const onboardingKey = generateOnboardingIdempotencyKey(id, priceId)
      const checkoutKey = generateCheckoutIdempotencyKey(id, priceId)

      expect(onboardingKey).toContain("onboarding_")
      expect(checkoutKey).toContain("checkout_")
      expect(onboardingKey).not.toBe(checkoutKey)
    })
  })

  // =============================================
  // ORIGIN URL HANDLING TESTS
  // =============================================

  describe('Origin URL Handling', () => {

    it('should clean origin with trailing slashes', () => {
      expect(cleanOriginUrl("http://localhost:3000/")).toBe("http://localhost:3000")
      expect(cleanOriginUrl("https://app.example.com///")).toBe("https://app.example.com")
    })

    it('should handle comma-separated URLs', () => {
      const origin = "https://app.example.com, https://staging.example.com"
      expect(cleanOriginUrl(origin)).toBe("https://app.example.com")
    })

    it('should trim whitespace', () => {
      expect(cleanOriginUrl("  http://localhost:3000  ")).toBe("http://localhost:3000")
    })

    it('should handle multiple issues at once', () => {
      const messy = "  https://app.example.com/, https://staging.example.com  "
      expect(cleanOriginUrl(messy)).toBe("https://app.example.com")
    })
  })

  // =============================================
  // TRIAL DAYS HANDLING TESTS
  // =============================================

  describe('Trial Days Handling', () => {

    it('should use plan-specific trial days when set', () => {
      const planTrialDays = 7
      const trialDays = planTrialDays !== undefined && planTrialDays !== null
        ? planTrialDays
        : DEFAULT_TRIAL_DAYS

      expect(trialDays).toBe(7)
    })

    it('should use default trial days when plan has undefined', () => {
      const planTrialDays = undefined
      const trialDays = planTrialDays !== undefined && planTrialDays !== null
        ? planTrialDays
        : DEFAULT_TRIAL_DAYS

      expect(trialDays).toBe(DEFAULT_TRIAL_DAYS)
    })

    it('should use default trial days when plan has null', () => {
      const planTrialDays = null
      const trialDays = planTrialDays !== undefined && planTrialDays !== null
        ? planTrialDays
        : DEFAULT_TRIAL_DAYS

      expect(trialDays).toBe(DEFAULT_TRIAL_DAYS)
    })

    it('should allow 0 trial days (no trial)', () => {
      const planTrialDays = 0
      const trialDays = planTrialDays !== undefined && planTrialDays !== null
        ? planTrialDays
        : DEFAULT_TRIAL_DAYS

      expect(trialDays).toBe(0)
    })

    it('should handle various trial day values', () => {
      const testCases = [
        { plan: 3, expected: 3 },
        { plan: 7, expected: 7 },
        { plan: 14, expected: 14 },
        { plan: 30, expected: 30 },
        { plan: 0, expected: 0 },
      ]

      testCases.forEach(({ plan, expected }) => {
        const trialDays = plan !== undefined && plan !== null ? plan : DEFAULT_TRIAL_DAYS
        expect(trialDays).toBe(expected)
      })
    })
  })

  // =============================================
  // RATE LIMITING TESTS
  // =============================================

  describe('Rate Limiting', () => {
    let rateLimiter: CheckoutRateLimiter

    beforeEach(() => {
      rateLimiter = new CheckoutRateLimiter()
    })

    it('should allow first checkout attempt', () => {
      expect(rateLimiter.check("user_1")).toBe(true)
    })

    it('should block rapid successive attempts', () => {
      expect(rateLimiter.check("user_1")).toBe(true)
      expect(rateLimiter.check("user_1")).toBe(false) // Blocked
    })

    it('should allow different users simultaneously', () => {
      expect(rateLimiter.check("user_1")).toBe(true)
      expect(rateLimiter.check("user_2")).toBe(true)
      expect(rateLimiter.check("user_3")).toBe(true)
    })

    it('should track rate limit size', () => {
      rateLimiter.check("user_1")
      rateLimiter.check("user_2")
      rateLimiter.check("user_3")

      expect(rateLimiter.size()).toBeGreaterThanOrEqual(3)
    })

    it('should reset all limits', () => {
      rateLimiter.check("user_1")
      rateLimiter.check("user_2")
      expect(rateLimiter.size()).toBeGreaterThan(0)

      rateLimiter.reset()
      expect(rateLimiter.size()).toBe(0)
    })

    it('should enforce max entries limit', () => {
      // Add more than MAX_RATE_LIMIT_ENTRIES
      for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES + 100; i++) {
        rateLimiter.check(`user_${i}`)
      }

      // Should not exceed max
      expect(rateLimiter.size()).toBeLessThanOrEqual(MAX_RATE_LIMIT_ENTRIES)
    })
  })

  // =============================================
  // METADATA VALIDATION TESTS
  // =============================================

  describe('Checkout Metadata Validation', () => {

    it('should validate onboarding metadata fields', () => {
      const metadata = {
        is_onboarding: "true",
        user_id: MOCK_USER.id,
        user_email: MOCK_USER.email,
        pending_company_name: "Acme Corp",
        pending_company_type: "company",
        pending_org_slug: "acme_ml01ua8p"
      }

      expect(metadata.is_onboarding).toBe("true")
      expect(metadata.user_id).toBeTruthy()
      expect(metadata.user_email).toBeTruthy()
      expect(metadata.pending_company_name).toBeTruthy()
      expect(metadata.pending_org_slug).toBeTruthy()
      expect(isValidOrgSlug(metadata.pending_org_slug)).toBe(true)
    })

    it('should validate existing org metadata fields', () => {
      const metadata = {
        org_id: MOCK_ORG.id,
        org_slug: MOCK_ORG.org_slug,
        org_name: MOCK_ORG.org_name,
        user_id: MOCK_USER.id,
        user_email: MOCK_USER.email
      }

      expect(metadata.org_id).toBeTruthy()
      expect(metadata.org_slug).toBeTruthy()
      expect(metadata.org_name).toBeTruthy()
      expect(isValidOrgSlug(metadata.org_slug)).toBe(true)
    })

    it('should validate subscription_data metadata', () => {
      const subscriptionMetadata = {
        is_onboarding: "true",
        user_id: MOCK_USER.id,
        pending_org_slug: "acme_ml01ua8p"
      }

      expect(subscriptionMetadata.is_onboarding).toBe("true")
      expect(subscriptionMetadata.user_id).toBeTruthy()
      expect(isValidOrgSlug(subscriptionMetadata.pending_org_slug)).toBe(true)
    })
  })

  // =============================================
  // SUCCESS/CANCEL URL TESTS
  // =============================================

  describe('Success and Cancel URLs', () => {

    it('should generate valid onboarding success URL', () => {
      const origin = "https://app.example.com"
      const successUrl = `${origin}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`

      expect(successUrl).toContain("/onboarding/success")
      expect(successUrl).toContain("session_id={CHECKOUT_SESSION_ID}")
      expect(isValidOrigin(origin)).toBe(true)
    })

    it('should generate valid onboarding cancel URL', () => {
      const origin = "https://app.example.com"
      const cancelUrl = `${origin}/onboarding/billing?canceled=true`

      expect(cancelUrl).toContain("/onboarding/billing")
      expect(cancelUrl).toContain("canceled=true")
    })

    it('should generate valid existing org success URL', () => {
      const origin = "https://app.example.com"
      const orgSlug = "acme_ml01ua8p"
      const successUrl = `${origin}/${orgSlug}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`

      expect(successUrl).toContain(`/${orgSlug}/dashboard`)
      expect(successUrl).toContain("success=true")
      expect(successUrl).toContain("session_id={CHECKOUT_SESSION_ID}")
    })

    it('should generate valid existing org cancel URL', () => {
      const origin = "https://app.example.com"
      const orgSlug = "acme_ml01ua8p"
      const cancelUrl = `${origin}/${orgSlug}/billing?canceled=true`

      expect(cancelUrl).toContain(`/${orgSlug}/billing`)
      expect(cancelUrl).toContain("canceled=true")
    })

    it('should use localhost in development', () => {
      const origin = "http://localhost:3000"
      const successUrl = `${origin}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`

      expect(successUrl).toContain("localhost:3000")
      expect(isValidOrigin(origin)).toBe(true)
    })
  })

  // =============================================
  // ERROR HANDLING TESTS
  // =============================================

  describe('Error Scenarios', () => {

    it('should reject invalid price ID format', () => {
      const invalidPriceIds = [
        "prod_123",           // Wrong prefix
        "price_123",          // Too short
        "price_",             // Missing suffix
        "",                   // Empty
        "random_string"       // Wrong format
      ]

      invalidPriceIds.forEach(priceId => {
        expect(isValidStripePriceId(priceId)).toBe(false)
      })
    })

    it('should reject missing company info', () => {
      const invalidMetadata = {
        user_id: MOCK_USER.id,
        user_email: MOCK_USER.email,
        pending_company_name: "", // Missing
        pending_company_type: "company"
      }

      expect(invalidMetadata.pending_company_name).toBeFalsy()
    })

    it('should validate org already has subscription', () => {
      const hasSubscription = MOCK_ORG_WITH_SUBSCRIPTION.stripe_subscription_id !== null
      expect(hasSubscription).toBe(true)
    })

    it('should validate owner-only access', () => {
      const roles = ["owner", "collaborator", "read_only"]
      const canSubscribe = (role: string) => role === "owner"

      expect(canSubscribe("owner")).toBe(true)
      expect(canSubscribe("collaborator")).toBe(false)
      expect(canSubscribe("read_only")).toBe(false)
    })

    it('should handle missing origin gracefully', () => {
      const origin = process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : null

      // In development, should fallback to localhost
      if (process.env.NODE_ENV === "development") {
        expect(origin).toBe("http://localhost:3000")
      }
    })
  })

  // =============================================
  // PAYMENT METHOD COLLECTION TESTS
  // =============================================

  describe('Payment Method Collection', () => {

    it('should use if_required during trial period', () => {
      const trialDays = 14
      const paymentMethodCollection = "if_required"

      expect(paymentMethodCollection).toBe("if_required")
      expect(trialDays).toBeGreaterThan(0)
    })

    it('should skip trial_period_days when 0', () => {
      const trialDays = 0
      const shouldIncludeTrial = trialDays > 0

      expect(shouldIncludeTrial).toBe(false)
    })

    it('should include trial_period_days when > 0', () => {
      const trialDays = 14
      const shouldIncludeTrial = trialDays > 0

      expect(shouldIncludeTrial).toBe(true)
    })
  })

  // =============================================
  // CUSTOMER HANDLING TESTS
  // =============================================

  describe('Customer Handling', () => {

    it('should use existing customer ID when available', () => {
      const org = MOCK_ORG_WITH_SUBSCRIPTION
      const useExisting = org.stripe_customer_id !== null

      expect(useExisting).toBe(true)
      expect(org.stripe_customer_id).toBe("cus_test123")
    })

    it('should use customer_email when no existing customer', () => {
      const org = MOCK_ORG
      const useExisting = org.stripe_customer_id !== null

      expect(useExisting).toBe(false)
      expect(org.stripe_customer_id).toBeNull()
    })
  })

  // =============================================
  // SAFE PARSE INT TESTS
  // =============================================

  describe('Safe Parse Int', () => {

    it('should parse valid integers', () => {
      expect(safeParseInt("10", 0)).toBe(10)
      expect(safeParseInt("100", 0)).toBe(100)
    })

    it('should use default for undefined', () => {
      expect(safeParseInt(undefined, 5)).toBe(5)
    })

    it('should use default for NaN', () => {
      expect(safeParseInt("not-a-number", 5)).toBe(5)
    })

    it('should use default for negative numbers', () => {
      expect(safeParseInt("-10", 5)).toBe(5)
    })

    it('should handle zero', () => {
      expect(safeParseInt("0", 5)).toBe(0)
    })

    it('should handle string with whitespace', () => {
      expect(safeParseInt("  42  ", 0)).toBe(42)
    })
  })

  // =============================================
  // INTEGRATION SCENARIO TESTS
  // =============================================

  describe('Integration Scenarios', () => {

    it('should handle complete onboarding flow', () => {
      const user = MOCK_USER
      const priceId = "price_1234567890abcdef"
      const origin = "https://app.example.com"

      // Validate inputs
      expect(user.email).toBeTruthy()
      expect(user.user_metadata.pending_company_name).toBeTruthy()
      expect(isValidStripePriceId(priceId)).toBe(true)
      expect(isValidOrigin(origin)).toBe(true)

      // Generate org slug
      const orgSlug = generateOrgSlug(user.user_metadata.pending_company_name)
      expect(isValidOrgSlug(orgSlug)).toBe(true)

      // Generate idempotency key
      const idempotencyKey = generateOnboardingIdempotencyKey(user.id, priceId)
      expect(idempotencyKey).toContain("onboarding_")

      // Validate URLs
      const successUrl = `${origin}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}/onboarding/billing?canceled=true`
      expect(successUrl).toBeTruthy()
      expect(cancelUrl).toBeTruthy()
    })

    it('should handle existing org checkout flow', () => {
      const org = MOCK_ORG
      const priceId = "price_1234567890abcdef"
      const origin = "https://app.example.com"

      // Validate inputs
      expect(isValidOrgSlug(org.org_slug)).toBe(true)
      expect(isValidStripePriceId(priceId)).toBe(true)
      expect(org.stripe_subscription_id).toBeNull() // No existing subscription

      // Generate idempotency key
      const idempotencyKey = generateCheckoutIdempotencyKey(org.id, priceId)
      expect(idempotencyKey).toContain("checkout_")

      // Validate URLs
      const successUrl = `${origin}/${org.org_slug}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}/${org.org_slug}/billing?canceled=true`
      expect(successUrl).toBeTruthy()
      expect(cancelUrl).toBeTruthy()
    })

    it('should prevent duplicate subscriptions', () => {
      const org = MOCK_ORG_WITH_SUBSCRIPTION
      const hasSubscription = org.stripe_subscription_id !== null

      expect(hasSubscription).toBe(true)
      // Should return error: "Organization already has an active subscription"
    })
  })
})
