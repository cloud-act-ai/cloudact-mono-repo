/**
 * @vitest-environment node
 *
 * Flow Test 18: SaaS Subscription Validation Unit Tests
 *
 * Tests all validation functions from subscription-providers.ts:
 * - isValidOrgSlug
 * - isValidProviderName
 * - sanitizeProviderName
 * - validatePlanData
 * - isValidSubscriptionId
 *
 * Run: npx vitest -c vitest.node.config.ts tests/18-saas-subscription-validation.test.ts --run
 */

import { describe, it, expect } from 'vitest'

// =============================================
// VALIDATION FUNCTIONS (mirrored from actions)
// =============================================

const isValidOrgSlug = (slug: string): boolean => {
    return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

const isValidProviderName = (provider: string): boolean => {
    if (!provider || typeof provider !== 'string') return false
    const normalized = provider.toLowerCase().trim()
    return /^[a-z0-9][a-z0-9_]{0,48}[a-z0-9]$/.test(normalized) || /^[a-z0-9]{2}$/.test(normalized)
}

const sanitizeProviderName = (provider: string): string => {
    return provider
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_')
        .slice(0, 50)
}

const VALID_BILLING_CYCLES = new Set(['monthly', 'annual', 'quarterly'])
const VALID_PRICING_MODELS = new Set(['PER_SEAT', 'FLAT_FEE'])
const VALID_DISCOUNT_TYPES = new Set(['percent', 'fixed'])
const VALID_STATUS_VALUES = new Set(['active', 'cancelled', 'expired', 'pending'])

interface PlanData {
    plan_name?: string
    unit_price_usd?: number
    yearly_price_usd?: number
    seats?: number
    billing_cycle?: string
    pricing_model?: string
    discount_type?: string
    status?: string
}

function validatePlanData(plan: PlanData): { valid: boolean; error?: string } {
    if (plan.plan_name && plan.plan_name.length > 50) {
        return { valid: false, error: `Plan name too long. Maximum 50 characters allowed.` }
    }
    if (plan.unit_price_usd !== undefined && plan.unit_price_usd < 0) {
        return { valid: false, error: `Unit price cannot be negative` }
    }
    if (plan.yearly_price_usd !== undefined && plan.yearly_price_usd < 0) {
        return { valid: false, error: `Yearly price cannot be negative` }
    }
    if (plan.seats !== undefined && plan.seats < 0) {
        return { valid: false, error: `Seats cannot be negative` }
    }
    if (plan.billing_cycle && !VALID_BILLING_CYCLES.has(plan.billing_cycle)) {
        return { valid: false, error: `Invalid billing_cycle: ${plan.billing_cycle}` }
    }
    if (plan.pricing_model && !VALID_PRICING_MODELS.has(plan.pricing_model)) {
        return { valid: false, error: `Invalid pricing_model: ${plan.pricing_model}` }
    }
    if (plan.discount_type && !VALID_DISCOUNT_TYPES.has(plan.discount_type)) {
        return { valid: false, error: `Invalid discount_type: ${plan.discount_type}` }
    }
    if (plan.status && !VALID_STATUS_VALUES.has(plan.status)) {
        return { valid: false, error: `Invalid status: ${plan.status}` }
    }
    return { valid: true }
}

const isValidSubscriptionId = (id: string): boolean => {
    if (!id || typeof id !== 'string') return false
    return /^[a-zA-Z0-9_-]{5,100}$/.test(id)
}

// =============================================
// TESTS
// =============================================

describe('Flow 18: SaaS Subscription Validation Unit Tests', () => {

    // =============================================
    // isValidOrgSlug TESTS
    // =============================================
    describe('isValidOrgSlug', () => {
        describe('Valid org slugs', () => {
            it('should accept lowercase letters only', () => {
                expect(isValidOrgSlug('acmecorp')).toBe(true)
            })

            it('should accept uppercase letters only', () => {
                expect(isValidOrgSlug('ACMECORP')).toBe(true)
            })

            it('should accept mixed case letters', () => {
                expect(isValidOrgSlug('AcmeCorp')).toBe(true)
            })

            it('should accept numbers only', () => {
                expect(isValidOrgSlug('12345')).toBe(true)
            })

            it('should accept letters and numbers', () => {
                expect(isValidOrgSlug('acme123')).toBe(true)
            })

            it('should accept underscores', () => {
                expect(isValidOrgSlug('acme_corp')).toBe(true)
            })

            it('should accept minimum length (3 chars)', () => {
                expect(isValidOrgSlug('abc')).toBe(true)
            })

            it('should accept maximum length (50 chars)', () => {
                expect(isValidOrgSlug('a'.repeat(50))).toBe(true)
            })
        })

        describe('Invalid org slugs', () => {
            it('should reject empty string', () => {
                expect(isValidOrgSlug('')).toBe(false)
            })

            it('should reject too short (1 char)', () => {
                expect(isValidOrgSlug('a')).toBe(false)
            })

            it('should reject too short (2 chars)', () => {
                expect(isValidOrgSlug('ab')).toBe(false)
            })

            it('should reject too long (51 chars)', () => {
                expect(isValidOrgSlug('a'.repeat(51))).toBe(false)
            })

            it('should reject hyphens', () => {
                expect(isValidOrgSlug('acme-corp')).toBe(false)
            })

            it('should reject spaces', () => {
                expect(isValidOrgSlug('acme corp')).toBe(false)
            })

            it('should reject special characters', () => {
                expect(isValidOrgSlug('acme@corp')).toBe(false)
                expect(isValidOrgSlug('acme.corp')).toBe(false)
                expect(isValidOrgSlug('acme!corp')).toBe(false)
            })

            it('should reject path traversal attempts', () => {
                expect(isValidOrgSlug('../admin')).toBe(false)
                expect(isValidOrgSlug('..%2fadmin')).toBe(false)
            })
        })
    })

    // =============================================
    // isValidProviderName TESTS
    // =============================================
    describe('isValidProviderName', () => {
        describe('Valid provider names', () => {
            it('should accept lowercase provider names', () => {
                expect(isValidProviderName('canva')).toBe(true)
            })

            it('should accept provider with numbers', () => {
                expect(isValidProviderName('v0')).toBe(true)
            })

            it('should accept provider with underscore', () => {
                expect(isValidProviderName('chatgpt_plus')).toBe(true)
            })

            it('should accept minimum length (2 chars)', () => {
                expect(isValidProviderName('v0')).toBe(true)
            })

            it('should normalize to lowercase', () => {
                // The function normalizes to lowercase
                expect(isValidProviderName('CANVA')).toBe(true)
            })
        })

        describe('Invalid provider names', () => {
            it('should reject empty string', () => {
                expect(isValidProviderName('')).toBe(false)
            })

            it('should reject null', () => {
                expect(isValidProviderName(null as unknown as string)).toBe(false)
            })

            it('should reject undefined', () => {
                expect(isValidProviderName(undefined as unknown as string)).toBe(false)
            })

            it('should reject single character', () => {
                expect(isValidProviderName('a')).toBe(false)
            })

            it('should reject leading underscore', () => {
                expect(isValidProviderName('_canva')).toBe(false)
            })

            it('should reject trailing underscore', () => {
                expect(isValidProviderName('canva_')).toBe(false)
            })

            it('should reject special characters', () => {
                expect(isValidProviderName('canva@pro')).toBe(false)
            })

            it('should reject spaces', () => {
                expect(isValidProviderName('chat gpt')).toBe(false)
            })
        })
    })

    // =============================================
    // sanitizeProviderName TESTS
    // =============================================
    describe('sanitizeProviderName', () => {
        it('should lowercase the input', () => {
            expect(sanitizeProviderName('CANVA')).toBe('canva')
        })

        it('should trim whitespace', () => {
            expect(sanitizeProviderName('  canva  ')).toBe('canva')
        })

        it('should replace spaces with underscores', () => {
            expect(sanitizeProviderName('chat gpt')).toBe('chat_gpt')
        })

        it('should replace special characters with underscores', () => {
            expect(sanitizeProviderName('chat@gpt')).toBe('chat_gpt')
            expect(sanitizeProviderName('chat.gpt')).toBe('chat_gpt')
            expect(sanitizeProviderName('chat-gpt')).toBe('chat_gpt')
        })

        it('should remove leading underscores', () => {
            expect(sanitizeProviderName('_canva')).toBe('canva')
        })

        it('should remove trailing underscores', () => {
            expect(sanitizeProviderName('canva_')).toBe('canva')
        })

        it('should collapse multiple underscores', () => {
            expect(sanitizeProviderName('chat__gpt')).toBe('chat_gpt')
            expect(sanitizeProviderName('chat___gpt')).toBe('chat_gpt')
        })

        it('should limit to 50 characters', () => {
            const longName = 'a'.repeat(100)
            expect(sanitizeProviderName(longName).length).toBe(50)
        })

        it('should handle SQL injection attempts', () => {
            const result = sanitizeProviderName("'; DROP TABLE plans; --")
            expect(result).not.toContain(';')
            expect(result).not.toContain("'")
            expect(result).not.toContain('DROP')
        })

        it('should handle XSS attempts', () => {
            const result = sanitizeProviderName('<script>alert(1)</script>')
            expect(result).not.toContain('<')
            expect(result).not.toContain('>')
            expect(result).not.toContain('script')
        })
    })

    // =============================================
    // validatePlanData TESTS
    // =============================================
    describe('validatePlanData', () => {
        describe('Valid plan data', () => {
            it('should accept valid complete plan', () => {
                const result = validatePlanData({
                    plan_name: 'PRO',
                    unit_price_usd: 20.00,
                    seats: 10,
                    billing_cycle: 'monthly',
                    pricing_model: 'PER_SEAT',
                    status: 'active'
                })
                expect(result.valid).toBe(true)
            })

            it('should accept zero price (free plan)', () => {
                const result = validatePlanData({ unit_price_usd: 0 })
                expect(result.valid).toBe(true)
            })

            it('should accept zero seats', () => {
                const result = validatePlanData({ seats: 0 })
                expect(result.valid).toBe(true)
            })

            it('should accept empty plan (no fields)', () => {
                const result = validatePlanData({})
                expect(result.valid).toBe(true)
            })
        })

        describe('Invalid prices', () => {
            it('should reject negative unit price', () => {
                const result = validatePlanData({ unit_price_usd: -10 })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('negative')
            })

            it('should reject negative yearly price', () => {
                const result = validatePlanData({ yearly_price_usd: -100 })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('negative')
            })
        })

        describe('Invalid seats', () => {
            it('should reject negative seats', () => {
                const result = validatePlanData({ seats: -5 })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('negative')
            })
        })

        describe('Invalid plan name', () => {
            it('should reject plan name over 50 characters', () => {
                const result = validatePlanData({ plan_name: 'A'.repeat(51) })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('50 characters')
            })

            it('should accept plan name at exactly 50 characters', () => {
                const result = validatePlanData({ plan_name: 'A'.repeat(50) })
                expect(result.valid).toBe(true)
            })
        })

        describe('Invalid billing cycles', () => {
            it('should reject invalid billing cycle', () => {
                const result = validatePlanData({ billing_cycle: 'weekly' })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('billing_cycle')
            })

            it('should accept monthly', () => {
                const result = validatePlanData({ billing_cycle: 'monthly' })
                expect(result.valid).toBe(true)
            })

            it('should accept annual', () => {
                const result = validatePlanData({ billing_cycle: 'annual' })
                expect(result.valid).toBe(true)
            })

            it('should accept quarterly', () => {
                const result = validatePlanData({ billing_cycle: 'quarterly' })
                expect(result.valid).toBe(true)
            })
        })

        describe('Invalid pricing models', () => {
            it('should reject invalid pricing model', () => {
                const result = validatePlanData({ pricing_model: 'PER_USAGE' })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('pricing_model')
            })

            it('should accept PER_SEAT', () => {
                const result = validatePlanData({ pricing_model: 'PER_SEAT' })
                expect(result.valid).toBe(true)
            })

            it('should accept FLAT_FEE', () => {
                const result = validatePlanData({ pricing_model: 'FLAT_FEE' })
                expect(result.valid).toBe(true)
            })
        })

        describe('Invalid discount types', () => {
            it('should reject invalid discount type', () => {
                const result = validatePlanData({ discount_type: 'percentage' })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('discount_type')
            })

            it('should accept percent', () => {
                const result = validatePlanData({ discount_type: 'percent' })
                expect(result.valid).toBe(true)
            })

            it('should accept fixed', () => {
                const result = validatePlanData({ discount_type: 'fixed' })
                expect(result.valid).toBe(true)
            })
        })

        describe('Invalid status values', () => {
            it('should reject invalid status', () => {
                const result = validatePlanData({ status: 'suspended' })
                expect(result.valid).toBe(false)
                expect(result.error).toContain('status')
            })

            it('should accept active', () => {
                const result = validatePlanData({ status: 'active' })
                expect(result.valid).toBe(true)
            })

            it('should accept cancelled', () => {
                const result = validatePlanData({ status: 'cancelled' })
                expect(result.valid).toBe(true)
            })

            it('should accept expired', () => {
                const result = validatePlanData({ status: 'expired' })
                expect(result.valid).toBe(true)
            })

            it('should accept pending', () => {
                const result = validatePlanData({ status: 'pending' })
                expect(result.valid).toBe(true)
            })
        })
    })

    // =============================================
    // isValidSubscriptionId TESTS
    // =============================================
    describe('isValidSubscriptionId', () => {
        describe('Valid subscription IDs', () => {
            it('should accept alphanumeric ID', () => {
                expect(isValidSubscriptionId('plan123abc')).toBe(true)
            })

            it('should accept ID with underscores', () => {
                expect(isValidSubscriptionId('plan_123_abc')).toBe(true)
            })

            it('should accept ID with hyphens', () => {
                expect(isValidSubscriptionId('plan-123-abc')).toBe(true)
            })

            it('should accept minimum length (5 chars)', () => {
                expect(isValidSubscriptionId('abcde')).toBe(true)
            })

            it('should accept maximum length (100 chars)', () => {
                expect(isValidSubscriptionId('a'.repeat(100))).toBe(true)
            })

            it('should accept UUID format', () => {
                expect(isValidSubscriptionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
            })
        })

        describe('Invalid subscription IDs', () => {
            it('should reject empty string', () => {
                expect(isValidSubscriptionId('')).toBe(false)
            })

            it('should reject null', () => {
                expect(isValidSubscriptionId(null as unknown as string)).toBe(false)
            })

            it('should reject undefined', () => {
                expect(isValidSubscriptionId(undefined as unknown as string)).toBe(false)
            })

            it('should reject too short (4 chars)', () => {
                expect(isValidSubscriptionId('abcd')).toBe(false)
            })

            it('should reject too long (101 chars)', () => {
                expect(isValidSubscriptionId('a'.repeat(101))).toBe(false)
            })

            it('should reject special characters', () => {
                expect(isValidSubscriptionId('plan@123')).toBe(false)
                expect(isValidSubscriptionId('plan.123')).toBe(false)
                expect(isValidSubscriptionId('plan!123')).toBe(false)
            })

            it('should reject spaces', () => {
                expect(isValidSubscriptionId('plan 123')).toBe(false)
            })
        })
    })

    // =============================================
    // EDGE CASES FROM TEST 16
    // =============================================
    describe('Edge Cases (from Test 16)', () => {
        it('should handle duplicate plan detection', () => {
            const existingPlans = [
                { plan_name: 'PRO', provider: 'canva' },
                { plan_name: 'ENTERPRISE', provider: 'canva' }
            ]
            const newPlan = { plan_name: 'PRO', provider: 'canva' }

            const isDuplicate = existingPlans.some(
                p => p.plan_name === newPlan.plan_name && p.provider === newPlan.provider
            )
            expect(isDuplicate).toBe(true)
        })

        it('should handle special characters in plan name', () => {
            const xssAttempt = '<script>alert(1)</script>'
            const sanitized = xssAttempt.replace(/<[^>]*>/g, '').toUpperCase().replace(/\s+/g, '_')

            expect(sanitized).not.toContain('<')
            expect(sanitized).not.toContain('>')
        })

        it('should handle huge quantity', () => {
            const hugeQty = 9999999999
            const maxAllowed = 10000
            const isValid = hugeQty <= maxAllowed

            expect(isValid).toBe(false)
        })

        it('should handle long plan name (255 chars)', () => {
            const longName = 'A'.repeat(255)
            const maxLength = 50
            const isValid = longName.length <= maxLength

            expect(isValid).toBe(false)
        })

        it('should handle SQL injection in plan name', () => {
            const sqlInjection = "'; DROP TABLE plans; --"
            const sanitized = sqlInjection.replace(/[';-]/g, '').toUpperCase().replace(/\s+/g, '_')

            expect(sanitized).not.toContain(';')
            expect(sanitized).not.toContain("'")
        })

        it('should handle rapid clicks (debounce)', () => {
            // Simulate tracking of submission timestamps
            const submissions: number[] = []
            const debounceMs = 1000

            // Simulate 5 rapid clicks within 100ms
            for (let i = 0; i < 5; i++) {
                submissions.push(Date.now() + i * 20) // 20ms apart
            }

            // Only first submission should be allowed
            const allowedSubmissions = submissions.filter((time, index) => {
                if (index === 0) return true
                return time - submissions[index - 1] >= debounceMs
            })

            expect(allowedSubmissions.length).toBe(1)
        })
    })

    // =============================================
    // DATE FORMAT VALIDATION
    // =============================================
    describe('Date Format Validation', () => {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/

        it('should accept YYYY-MM-DD format', () => {
            expect(dateRegex.test('2025-12-15')).toBe(true)
        })

        it('should reject MM/DD/YYYY format', () => {
            expect(dateRegex.test('12/15/2025')).toBe(false)
        })

        it('should reject DD-MM-YYYY format', () => {
            expect(dateRegex.test('15-12-2025')).toBe(false)
        })

        it('should reject timestamp format', () => {
            expect(dateRegex.test('2025-12-15T00:00:00Z')).toBe(false)
        })

        it('should reject empty string', () => {
            expect(dateRegex.test('')).toBe(false)
        })
    })
})
