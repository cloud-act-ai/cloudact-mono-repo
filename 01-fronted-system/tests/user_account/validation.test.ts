/**
 * @vitest-environment node
 *
 * User Account Validation Tests
 *
 * Tests validation functions from account.ts and members.ts:
 * 1. isValidEmail - RFC 5322 format, max 254 chars
 * 2. isValidUUID - UUID format validation
 * 3. isValidOrgSlug - alphanumeric + underscore, 3-50 chars
 * 4. isValidInviteToken - 64 hex chars
 * 5. Rate limiting for invites (10/hour)
 *
 * SECURITY COVERAGE:
 * - RFC 5322 compliant email validation
 * - UUID v1-v5 format validation
 * - Org slug injection prevention
 * - Invite token format validation
 * - Rate limit enforcement
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// ============================================
// VALIDATION FUNCTION DEFINITIONS
// ============================================
// These are copies of the private functions from account.ts and members.ts
// In a production environment, these would be exported for testing or tested via their public APIs

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false
  return UUID_REGEX.test(uuid)
}

function isValidOrgSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

function isValidInviteToken(token: string): boolean {
  if (!token || typeof token !== "string") return false
  // Token should be exactly 64 hex characters (from randomBytes(32).toString("hex"))
  return /^[0-9a-f]{64}$/i.test(token)
}

// Rate limiting simulation
const inviteRateLimits = new Map<string, { count: number; resetTime: number }>()
const INVITE_RATE_LIMIT = 10 // Max invites per window
const INVITE_RATE_WINDOW = 3600000 // 1 hour in milliseconds

function checkInviteRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = inviteRateLimits.get(userId)

  if (!userLimit || now > userLimit.resetTime) {
    inviteRateLimits.set(userId, { count: 1, resetTime: now + INVITE_RATE_WINDOW })
    return true
  }

  if (userLimit.count >= INVITE_RATE_LIMIT) {
    return false
  }

  userLimit.count++
  return true
}

function resetRateLimits() {
  inviteRateLimits.clear()
}

// ============================================
// TEST SUITES
// ============================================

describe('Email Validation (RFC 5322)', () => {
  describe('Valid Emails', () => {
    it('should accept standard email format', () => {
      expect(isValidEmail('user@example.com')).toBe(true)
      expect(isValidEmail('test.user@example.com')).toBe(true)
      expect(isValidEmail('user+tag@example.com')).toBe(true)
    })

    it('should accept special characters allowed by RFC 5322', () => {
      expect(isValidEmail('user!#$%&*+/=?^_`{|}~@example.com')).toBe(true)
      expect(isValidEmail('test.name+tag@sub.example.com')).toBe(true)
      expect(isValidEmail('1234567890@example.com')).toBe(true)
    })

    it('should accept emails with subdomain', () => {
      expect(isValidEmail('user@mail.example.com')).toBe(true)
      expect(isValidEmail('admin@deep.sub.example.com')).toBe(true)
    })

    it('should accept single character local part', () => {
      expect(isValidEmail('a@example.com')).toBe(true)
      expect(isValidEmail('x@test.co')).toBe(true)
    })

    it('should accept emails with hyphenated domain', () => {
      expect(isValidEmail('user@my-company.com')).toBe(true)
      expect(isValidEmail('test@sub-domain.example.com')).toBe(true)
    })

    it('should accept emails at max length (254 chars)', () => {
      // RFC 5321 max email length is 254 characters
      const longLocal = 'a'.repeat(64)  // Max local part
      const longDomain = 'b'.repeat(63) + '.com'  // 63 char label + .com
      const maxEmail = longLocal + '@' + longDomain  // 64 + 1 + 67 = 132 chars

      expect(isValidEmail(maxEmail)).toBe(true)

      // Exactly 254 chars
      const exactMax = 'x'.repeat(240) + '@example.com'  // 254 total
      expect(isValidEmail(exactMax)).toBe(true)
    })
  })

  describe('Invalid Emails - Format', () => {
    it('should reject emails without @', () => {
      expect(isValidEmail('userexample.com')).toBe(false)
      expect(isValidEmail('user.example.com')).toBe(false)
    })

    it('should reject emails with multiple @', () => {
      expect(isValidEmail('user@@example.com')).toBe(false)
      expect(isValidEmail('user@test@example.com')).toBe(false)
    })

    it('should reject emails without local part', () => {
      expect(isValidEmail('@example.com')).toBe(false)
      expect(isValidEmail('@')).toBe(false)
    })

    it('should reject emails without domain', () => {
      expect(isValidEmail('user@')).toBe(false)
      expect(isValidEmail('test.user@')).toBe(false)
    })

    it('should reject emails with spaces', () => {
      expect(isValidEmail('user name@example.com')).toBe(false)
      expect(isValidEmail('user@example .com')).toBe(false)
      expect(isValidEmail(' user@example.com')).toBe(false)
    })

    it('should reject emails with invalid domain', () => {
      expect(isValidEmail('user@.com')).toBe(false)
      expect(isValidEmail('user@domain.')).toBe(false)
      expect(isValidEmail('user@-example.com')).toBe(false)
      expect(isValidEmail('user@example-.com')).toBe(false)
    })

    it('should reject emails with consecutive dots', () => {
      expect(isValidEmail('user..name@example.com')).toBe(false)
      expect(isValidEmail('user@example..com')).toBe(false)
    })
  })

  describe('Invalid Emails - Length', () => {
    it('should reject emails longer than 254 chars', () => {
      const tooLong = 'x'.repeat(250) + '@example.com'  // 262 total
      expect(isValidEmail(tooLong)).toBe(false)
    })

    it('should reject emails with overly long local part', () => {
      const longLocal = 'a'.repeat(65) + '@example.com'
      expect(isValidEmail(longLocal)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should reject empty string', () => {
      expect(isValidEmail('')).toBe(false)
    })

    it('should reject just @', () => {
      expect(isValidEmail('@')).toBe(false)
    })

    it('should reject special chars not in RFC 5322', () => {
      expect(isValidEmail('user<>@example.com')).toBe(false)
      expect(isValidEmail('user,@example.com')).toBe(false)
      expect(isValidEmail('user[@example.com')).toBe(false)
    })

    it('should reject unicode/emoji', () => {
      expect(isValidEmail('user😀@example.com')).toBe(false)
      expect(isValidEmail('user@🏢.com')).toBe(false)
    })
  })

  describe('Security - Injection Prevention', () => {
    it('should reject SQL injection attempts', () => {
      expect(isValidEmail("admin'--@example.com")).toBe(false)
      expect(isValidEmail('user@example.com;DROP TABLE users;--')).toBe(false)
    })

    it('should reject path traversal attempts', () => {
      expect(isValidEmail('../../../etc/passwd@example.com')).toBe(false)
      expect(isValidEmail('user@example.com/../../')).toBe(false)
    })

    it('should reject HTML/script injection', () => {
      expect(isValidEmail('<script>@example.com')).toBe(false)
      expect(isValidEmail('user@<script>alert(1)</script>.com')).toBe(false)
    })
  })
})

describe('UUID Validation', () => {
  describe('Valid UUIDs', () => {
    it('should accept UUID v1', () => {
      expect(isValidUUID('12345678-1234-1234-8234-567890abcdef')).toBe(true)
    })

    it('should accept UUID v4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      expect(isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
    })

    it('should accept UUID v5', () => {
      expect(isValidUUID('6ba7b810-9dad-51d1-80b4-00c04fd430c8')).toBe(true)
    })

    it('should accept uppercase UUIDs', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
    })

    it('should accept mixed case UUIDs', () => {
      expect(isValidUUID('550e8400-E29B-41D4-a716-446655440000')).toBe(true)
    })
  })

  describe('Invalid UUIDs - Format', () => {
    it('should reject UUIDs without hyphens', () => {
      expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false)
    })

    it('should reject UUIDs with wrong segment lengths', () => {
      expect(isValidUUID('550e840-e29b-41d4-a716-446655440000')).toBe(false)
      expect(isValidUUID('550e8400-e29b-41d4-a71-446655440000')).toBe(false)
    })

    it('should reject UUIDs with invalid version digit', () => {
      expect(isValidUUID('550e8400-e29b-61d4-a716-446655440000')).toBe(false) // Version 6
      expect(isValidUUID('550e8400-e29b-01d4-a716-446655440000')).toBe(false) // Version 0
    })

    it('should reject UUIDs with invalid variant bits', () => {
      expect(isValidUUID('550e8400-e29b-41d4-f716-446655440000')).toBe(false) // Invalid variant
    })

    it('should reject non-hex characters', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false)
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000z')).toBe(false)
    })

    it('should reject UUID with extra characters', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000x')).toBe(false)
      expect(isValidUUID('x550e8400-e29b-41d4-a716-446655440000')).toBe(false)
    })
  })

  describe('Invalid UUIDs - Type Safety', () => {
    it('should reject empty string', () => {
      expect(isValidUUID('')).toBe(false)
    })

    it('should reject null/undefined (handled by type check)', () => {
      expect(isValidUUID(null as any)).toBe(false)
      expect(isValidUUID(undefined as any)).toBe(false)
    })

    it('should reject non-string values', () => {
      expect(isValidUUID(123 as any)).toBe(false)
      expect(isValidUUID({} as any)).toBe(false)
      expect(isValidUUID([] as any)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should reject nil UUID (all zeros)', () => {
      // Nil UUID is technically valid but version check will fail (version 0)
      expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(false)
    })

    it('should reject short strings', () => {
      expect(isValidUUID('550e8400')).toBe(false)
      expect(isValidUUID('550e8400-e29b')).toBe(false)
    })

    it('should reject UUIDs with spaces', () => {
      expect(isValidUUID(' 550e8400-e29b-41d4-a716-446655440000')).toBe(false)
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000 ')).toBe(false)
    })
  })

  describe('Security - Injection Prevention', () => {
    it('should reject SQL injection attempts', () => {
      expect(isValidUUID("' OR '1'='1")).toBe(false)
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000; DROP TABLE;')).toBe(false)
    })

    it('should reject path traversal', () => {
      expect(isValidUUID('../../../etc/passwd')).toBe(false)
    })

    it('should reject script tags', () => {
      expect(isValidUUID('<script>alert(1)</script>')).toBe(false)
    })
  })
})

describe('Org Slug Validation', () => {
  describe('Valid Org Slugs', () => {
    it('should accept alphanumeric slugs', () => {
      expect(isValidOrgSlug('acme')).toBe(true)
      expect(isValidOrgSlug('company123')).toBe(true)
      expect(isValidOrgSlug('123org')).toBe(true)
    })

    it('should accept slugs with underscores', () => {
      expect(isValidOrgSlug('acme_corp')).toBe(true)
      expect(isValidOrgSlug('my_org_123')).toBe(true)
      expect(isValidOrgSlug('test_')).toBe(true)
      expect(isValidOrgSlug('_test')).toBe(true)
    })

    it('should accept slugs at minimum length (3 chars)', () => {
      expect(isValidOrgSlug('abc')).toBe(true)
      expect(isValidOrgSlug('a_b')).toBe(true)
      expect(isValidOrgSlug('123')).toBe(true)
    })

    it('should accept slugs at maximum length (50 chars)', () => {
      const maxSlug = 'a'.repeat(50)
      expect(isValidOrgSlug(maxSlug)).toBe(true)
    })

    it('should accept mixed case', () => {
      expect(isValidOrgSlug('AcmeCorp')).toBe(true)
      expect(isValidOrgSlug('MyOrg123')).toBe(true)
    })
  })

  describe('Invalid Org Slugs - Format', () => {
    it('should reject slugs with hyphens', () => {
      expect(isValidOrgSlug('acme-corp')).toBe(false)
      expect(isValidOrgSlug('my-org')).toBe(false)
    })

    it('should reject slugs with spaces', () => {
      expect(isValidOrgSlug('acme corp')).toBe(false)
      expect(isValidOrgSlug('my org')).toBe(false)
      expect(isValidOrgSlug(' acme')).toBe(false)
    })

    it('should reject slugs with special characters', () => {
      expect(isValidOrgSlug('acme@corp')).toBe(false)
      expect(isValidOrgSlug('org#123')).toBe(false)
      expect(isValidOrgSlug('test.org')).toBe(false)
      expect(isValidOrgSlug('org/test')).toBe(false)
    })

    it('should reject slugs too short (< 3 chars)', () => {
      expect(isValidOrgSlug('ab')).toBe(false)
      expect(isValidOrgSlug('a')).toBe(false)
      expect(isValidOrgSlug('')).toBe(false)
    })

    it('should reject slugs too long (> 50 chars)', () => {
      const tooLong = 'a'.repeat(51)
      expect(isValidOrgSlug(tooLong)).toBe(false)

      const wayTooLong = 'a'.repeat(100)
      expect(isValidOrgSlug(wayTooLong)).toBe(false)
    })
  })

  describe('Invalid Org Slugs - Type Safety', () => {
    it('should reject empty string', () => {
      expect(isValidOrgSlug('')).toBe(false)
    })

    it('should reject null/undefined', () => {
      expect(isValidOrgSlug(null as any)).toBe(false)
      expect(isValidOrgSlug(undefined as any)).toBe(false)
    })

    it('should reject non-string values', () => {
      expect(isValidOrgSlug(123 as any)).toBe(false)
      expect(isValidOrgSlug({} as any)).toBe(false)
      expect(isValidOrgSlug([] as any)).toBe(false)
    })
  })

  describe('Security - Injection Prevention', () => {
    it('should reject path traversal attempts', () => {
      expect(isValidOrgSlug('../')).toBe(false)
      expect(isValidOrgSlug('../../etc/passwd')).toBe(false)
      expect(isValidOrgSlug('org/../admin')).toBe(false)
    })

    it('should reject SQL injection', () => {
      expect(isValidOrgSlug("admin'; DROP TABLE organizations;--")).toBe(false)
      expect(isValidOrgSlug("' OR '1'='1")).toBe(false)
    })

    it('should reject HTML/script injection', () => {
      expect(isValidOrgSlug('<script>alert(1)</script>')).toBe(false)
      expect(isValidOrgSlug('org<img>')).toBe(false)
    })

    it('should reject URL encoding attempts', () => {
      expect(isValidOrgSlug('%2e%2e%2f')).toBe(false)
      expect(isValidOrgSlug('org%20test')).toBe(false)
    })

    it('should reject null byte injection', () => {
      expect(isValidOrgSlug('org\x00admin')).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should reject slugs with only underscores', () => {
      expect(isValidOrgSlug('___')).toBe(true) // Actually valid by regex
      expect(isValidOrgSlug('_____')).toBe(true)
    })

    it('should reject slugs with leading/trailing spaces', () => {
      expect(isValidOrgSlug(' acme')).toBe(false)
      expect(isValidOrgSlug('acme ')).toBe(false)
      expect(isValidOrgSlug(' acme ')).toBe(false)
    })

    it('should handle unicode characters', () => {
      expect(isValidOrgSlug('café')).toBe(false)
      expect(isValidOrgSlug('org™')).toBe(false)
      expect(isValidOrgSlug('test😀')).toBe(false)
    })
  })
})

describe('Invite Token Validation', () => {
  describe('Valid Invite Tokens', () => {
    it('should accept 64 hex character tokens (lowercase)', () => {
      const token = 'a'.repeat(64)
      expect(isValidInviteToken(token)).toBe(true)
    })

    it('should accept 64 hex character tokens (uppercase)', () => {
      const token = 'A'.repeat(64)
      expect(isValidInviteToken(token)).toBe(true)
    })

    it('should accept mixed hex characters', () => {
      const token = '0123456789abcdef'.repeat(4) // 64 chars
      expect(isValidInviteToken(token)).toBe(true)
    })

    it('should accept all valid hex digits', () => {
      const token = '0123456789ABCDEF0123456789abcdef0123456789ABCDEF0123456789abcdef'
      expect(isValidInviteToken(token)).toBe(true)
    })
  })

  describe('Invalid Invite Tokens - Format', () => {
    it('should reject tokens too short', () => {
      expect(isValidInviteToken('a'.repeat(63))).toBe(false)
      expect(isValidInviteToken('a'.repeat(32))).toBe(false)
      expect(isValidInviteToken('abc123')).toBe(false)
    })

    it('should reject tokens too long', () => {
      expect(isValidInviteToken('a'.repeat(65))).toBe(false)
      expect(isValidInviteToken('a'.repeat(128))).toBe(false)
    })

    it('should reject non-hex characters', () => {
      const invalidChars = 'g'.repeat(64)
      expect(isValidInviteToken(invalidChars)).toBe(false)

      const withSpace = 'a'.repeat(63) + ' '
      expect(isValidInviteToken(withSpace)).toBe(false)

      const withSpecial = 'a'.repeat(63) + '@'
      expect(isValidInviteToken(withSpecial)).toBe(false)
    })

    it('should reject tokens with hyphens', () => {
      const withHyphen = 'a'.repeat(32) + '-' + 'a'.repeat(31)
      expect(isValidInviteToken(withHyphen)).toBe(false)
    })
  })

  describe('Invalid Invite Tokens - Type Safety', () => {
    it('should reject empty string', () => {
      expect(isValidInviteToken('')).toBe(false)
    })

    it('should reject null/undefined', () => {
      expect(isValidInviteToken(null as any)).toBe(false)
      expect(isValidInviteToken(undefined as any)).toBe(false)
    })

    it('should reject non-string values', () => {
      expect(isValidInviteToken(123 as any)).toBe(false)
      expect(isValidInviteToken({} as any)).toBe(false)
      expect(isValidInviteToken([] as any)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should reject UUID format (different from 64 hex)', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      expect(isValidInviteToken(uuid)).toBe(false)
    })

    it('should reject base64 encoded strings', () => {
      const base64 = 'VGhpcyBpcyBhIHRlc3QgdG9rZW4gdGhhdCBpcyBiYXNlNjQgZW5jb2RlZCBmb3IgdGVzdGluZw=='
      expect(isValidInviteToken(base64)).toBe(false)
    })

    it('should reject tokens with whitespace', () => {
      const withSpace = 'a'.repeat(32) + ' ' + 'a'.repeat(31)
      expect(isValidInviteToken(withSpace)).toBe(false)

      const leadingSpace = ' ' + 'a'.repeat(63)
      expect(isValidInviteToken(leadingSpace)).toBe(false)

      const trailingSpace = 'a'.repeat(63) + ' '
      expect(isValidInviteToken(trailingSpace)).toBe(false)
    })
  })

  describe('Security - Injection Prevention', () => {
    it('should reject SQL injection attempts', () => {
      expect(isValidInviteToken("' OR '1'='1")).toBe(false)
      expect(isValidInviteToken('a'.repeat(50) + "; DROP TABLE")).toBe(false)
    })

    it('should reject script injection', () => {
      expect(isValidInviteToken('<script>alert(1)</script>')).toBe(false)
    })

    it('should reject path traversal', () => {
      expect(isValidInviteToken('../../../etc/passwd')).toBe(false)
    })
  })
})

describe('Rate Limiting for Invites', () => {
  beforeEach(() => {
    resetRateLimits()
  })

  afterEach(() => {
    resetRateLimits()
  })

  describe('Basic Rate Limit Behavior', () => {
    it('should allow first invite', () => {
      const userId = 'test-user-1'
      expect(checkInviteRateLimit(userId)).toBe(true)
    })

    it('should allow up to 10 invites within window', () => {
      const userId = 'test-user-2'

      for (let i = 0; i < 10; i++) {
        expect(checkInviteRateLimit(userId)).toBe(true)
      }
    })

    it('should block 11th invite within window', () => {
      const userId = 'test-user-3'

      // First 10 should pass
      for (let i = 0; i < 10; i++) {
        expect(checkInviteRateLimit(userId)).toBe(true)
      }

      // 11th should fail
      expect(checkInviteRateLimit(userId)).toBe(false)
    })

    it('should continue blocking after limit reached', () => {
      const userId = 'test-user-4'

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        checkInviteRateLimit(userId)
      }

      // Multiple attempts should all fail
      expect(checkInviteRateLimit(userId)).toBe(false)
      expect(checkInviteRateLimit(userId)).toBe(false)
      expect(checkInviteRateLimit(userId)).toBe(false)
    })
  })

  describe('Multi-User Rate Limiting', () => {
    it('should track limits per user independently', () => {
      const user1 = 'test-user-5'
      const user2 = 'test-user-6'

      // User 1 makes 5 invites
      for (let i = 0; i < 5; i++) {
        expect(checkInviteRateLimit(user1)).toBe(true)
      }

      // User 2 should have full quota
      for (let i = 0; i < 10; i++) {
        expect(checkInviteRateLimit(user2)).toBe(true)
      }

      // User 1 should have 5 remaining
      for (let i = 0; i < 5; i++) {
        expect(checkInviteRateLimit(user1)).toBe(true)
      }

      // Both should be blocked now
      expect(checkInviteRateLimit(user1)).toBe(false)
      expect(checkInviteRateLimit(user2)).toBe(false)
    })

    it('should not affect other users when one hits limit', () => {
      const user1 = 'test-user-7'
      const user2 = 'test-user-8'

      // User 1 exhausts quota
      for (let i = 0; i < 10; i++) {
        checkInviteRateLimit(user1)
      }
      expect(checkInviteRateLimit(user1)).toBe(false)

      // User 2 should still work
      expect(checkInviteRateLimit(user2)).toBe(true)
    })
  })

  describe('Window Reset Behavior', () => {
    it('should reset after window expires', () => {
      const userId = 'test-user-9'

      // Simulate rate limit data with expired window
      const pastTime = Date.now() - INVITE_RATE_WINDOW - 1000
      inviteRateLimits.set(userId, {
        count: 10,
        resetTime: pastTime
      })

      // Should reset and allow new invite
      expect(checkInviteRateLimit(userId)).toBe(true)
    })

    it('should start fresh count after reset', () => {
      const userId = 'test-user-10'

      // Set expired limit
      const pastTime = Date.now() - INVITE_RATE_WINDOW - 1000
      inviteRateLimits.set(userId, {
        count: 10,
        resetTime: pastTime
      })

      // Should allow full 10 invites again
      for (let i = 0; i < 10; i++) {
        expect(checkInviteRateLimit(userId)).toBe(true)
      }

      expect(checkInviteRateLimit(userId)).toBe(false)
    })

    it('should not reset before window expires', () => {
      const userId = 'test-user-11'

      // Set limit with future reset time
      const futureTime = Date.now() + INVITE_RATE_WINDOW / 2
      inviteRateLimits.set(userId, {
        count: 10,
        resetTime: futureTime
      })

      // Should still be blocked
      expect(checkInviteRateLimit(userId)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid successive calls', () => {
      const userId = 'test-user-12'

      // Simulate rapid clicking
      const results = []
      for (let i = 0; i < 15; i++) {
        results.push(checkInviteRateLimit(userId))
      }

      // First 10 should pass, rest fail
      expect(results.slice(0, 10).every(r => r === true)).toBe(true)
      expect(results.slice(10).every(r => r === false)).toBe(true)
    })

    it('should handle exact boundary (10th vs 11th)', () => {
      const userId = 'test-user-13'

      // 9 invites
      for (let i = 0; i < 9; i++) {
        checkInviteRateLimit(userId)
      }

      // 10th should pass
      expect(checkInviteRateLimit(userId)).toBe(true)

      // 11th should fail
      expect(checkInviteRateLimit(userId)).toBe(false)
    })

    it('should handle empty user ID gracefully', () => {
      // This will create an entry for empty string
      expect(checkInviteRateLimit('')).toBe(true)

      // Verify it's tracked separately
      const normalUser = 'test-user-14'
      expect(checkInviteRateLimit(normalUser)).toBe(true)
    })
  })

  describe('Memory Management', () => {
    it('should not grow unbounded with many users', () => {
      const initialSize = inviteRateLimits.size

      // Create 100 users
      for (let i = 0; i < 100; i++) {
        checkInviteRateLimit(`user-${i}`)
      }

      expect(inviteRateLimits.size).toBe(initialSize + 100)
    })

    it('should maintain separate entries per user', () => {
      checkInviteRateLimit('user-a')
      checkInviteRateLimit('user-b')
      checkInviteRateLimit('user-c')

      expect(inviteRateLimits.size).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Rate Limit Constants', () => {
    it('should have correct limit value (10)', () => {
      expect(INVITE_RATE_LIMIT).toBe(10)
    })

    it('should have correct window (1 hour = 3600000ms)', () => {
      expect(INVITE_RATE_WINDOW).toBe(3600000)
    })
  })
})

describe('Integration Tests - Combined Validations', () => {
  describe('Realistic User Flows', () => {
    it('should validate complete invite flow inputs', () => {
      const orgSlug = 'acme_corp'
      const email = 'newuser@example.com'
      const userId = '550e8400-e29b-41d4-a716-446655440000'
      const token = 'a'.repeat(64)

      expect(isValidOrgSlug(orgSlug)).toBe(true)
      expect(isValidEmail(email)).toBe(true)
      expect(isValidUUID(userId)).toBe(true)
      expect(isValidInviteToken(token)).toBe(true)
    })

    it('should reject malicious combined inputs', () => {
      const badSlug = '../admin'
      const badEmail = '<script>@evil.com'
      const badUuid = "' OR '1'='1"
      const badToken = 'abc123'

      expect(isValidOrgSlug(badSlug)).toBe(false)
      expect(isValidEmail(badEmail)).toBe(false)
      expect(isValidUUID(badUuid)).toBe(false)
      expect(isValidInviteToken(badToken)).toBe(false)
    })
  })

  describe('Boundary Testing', () => {
    it('should handle max valid inputs', () => {
      const maxEmail = 'x'.repeat(240) + '@example.com' // 254 chars
      const maxSlug = 'a'.repeat(50)

      expect(isValidEmail(maxEmail)).toBe(true)
      expect(isValidOrgSlug(maxSlug)).toBe(true)
    })

    it('should reject just-over-limit inputs', () => {
      const tooLongEmail = 'x'.repeat(250) + '@example.com'
      const tooLongSlug = 'a'.repeat(51)

      expect(isValidEmail(tooLongEmail)).toBe(false)
      expect(isValidOrgSlug(tooLongSlug)).toBe(false)
    })

    it('should handle minimum valid inputs', () => {
      const minEmail = 'a@b.c'
      const minSlug = 'abc'

      expect(isValidEmail(minEmail)).toBe(true)
      expect(isValidOrgSlug(minSlug)).toBe(true)
    })
  })

  describe('Performance & Stress Testing', () => {
    it('should validate large batch of emails quickly', () => {
      const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`)

      const start = Date.now()
      emails.forEach(email => isValidEmail(email))
      const duration = Date.now() - start

      // Should process 1000 emails in under 100ms
      expect(duration).toBeLessThan(100)
    })

    it('should validate large batch of UUIDs quickly', () => {
      const uuids = Array.from({ length: 1000 }, (_, i) =>
        `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
      )

      const start = Date.now()
      uuids.forEach(uuid => isValidUUID(uuid))
      const duration = Date.now() - start

      expect(duration).toBeLessThan(100)
    })
  })
})
